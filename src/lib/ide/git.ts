// Browser-side Git via isomorphic-git + LightningFS.
// Full feature surface: snapshots, branches, tags, merge, diff, fetch, push,
// pull, clone, reset, restore, stash-lite, ignore. Working tree mirrors the
// IDE's IndexedDB file store before each operation.
import FS from "@isomorphic-git/lightning-fs";
import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import type { FileNode } from "./fs";

const DIR = "/repo";
const CORS_PROXY = "https://cors.isomorphic-git.org";
const TOKEN_KEY = "codeforge.git.token";
const NAME_KEY = "codeforge.git.name";
const EMAIL_KEY = "codeforge.git.email";
const STASH_KEY = "codeforge.git.stash";

let _fs: any = null;
let _pfs: any = null;
function getFs() {
  if (!_fs) {
    _fs = new FS("codeforge-git");
    _pfs = _fs.promises;
  }
  return _fs;
}
const fs = new Proxy({}, { get: (_t, p) => (getFs() as any)[p] }) as any;
const pfs: any = new Proxy({}, { get: (_t, p) => { getFs(); return _pfs[p]; } });

async function ensureRepo() {
  try { await pfs.mkdir(DIR); } catch {/* exists */}
  try { await pfs.stat(`${DIR}/.git`); }
  catch { await git.init({ fs, dir: DIR, defaultBranch: "main" }); }
}

async function rmRecursive(path: string) {
  let entries: string[] = [];
  try { entries = await pfs.readdir(path); } catch { return; }
  for (const name of entries) {
    if (name === ".git") continue;
    const full = `${path}/${name}`;
    const st = await pfs.stat(full);
    if (st.isDirectory()) {
      await rmRecursive(full);
      try { await pfs.rmdir(full); } catch {/* ignore */}
    } else {
      await pfs.unlink(full);
    }
  }
}

async function writeFileDeep(filePath: string, content: string) {
  const parts = filePath.split("/").filter(Boolean);
  let acc = DIR;
  for (let i = 0; i < parts.length - 1; i++) {
    acc += "/" + parts[i];
    try { await pfs.mkdir(acc); } catch {/* exists */}
  }
  await pfs.writeFile(`${DIR}/${parts.join("/")}`, content, "utf8");
}

export async function syncToWorkingTree(files: Record<string, FileNode>) {
  await ensureRepo();
  await rmRecursive(DIR);
  const entries = Object.values(files)
    .filter((f) => f.type === "file")
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const f of entries) await writeFileDeep(f.id, f.content ?? "");
}

// ---- Identity / credentials ----
export function setToken(token: string) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
export function setIdentity(name: string, email: string) {
  localStorage.setItem(NAME_KEY, name);
  localStorage.setItem(EMAIL_KEY, email);
}
export function getIdentity() {
  return {
    name: localStorage.getItem(NAME_KEY) || "",
    email: localStorage.getItem(EMAIL_KEY) || "",
  };
}
function author() {
  return {
    name: localStorage.getItem(NAME_KEY) || "CodeForge User",
    email: localStorage.getItem(EMAIL_KEY) || "user@codeforge.local",
  };
}
function onAuth() {
  const token = getToken();
  if (!token) throw new Error("No GitHub token. Set one in Source Control.");
  return { username: token, password: "x-oauth-basic" };
}

// ---- Status / staging ----
export interface GitStatusEntry {
  path: string;
  status: "added" | "modified" | "deleted" | "untracked" | "staged";
  staged: boolean;
}

export async function status(files: Record<string, FileNode>): Promise<GitStatusEntry[]> {
  await syncToWorkingTree(files);
  const matrix = await git.statusMatrix({ fs, dir: DIR });
  const out: GitStatusEntry[] = [];
  for (const [filepath, head, workdir, stage] of matrix) {
    const path = "/" + filepath;
    const staged = stage === 2 || stage === 3;
    if (head === 0 && workdir === 0) continue;
    if (head === 0 && workdir === 2) out.push({ path, status: staged ? "added" : "untracked", staged });
    else if (head === 1 && workdir === 0) out.push({ path, status: "deleted", staged });
    else if (head === 1 && workdir === 2) out.push({ path, status: "modified", staged });
    else if (head === 1 && workdir === 1 && stage !== 1) out.push({ path, status: "staged", staged: true });
  }
  return out;
}

export async function stage(path: string, files: Record<string, FileNode>) {
  await syncToWorkingTree(files);
  const filepath = path.replace(/^\//, "");
  const node = files[path];
  if (!node) await git.remove({ fs, dir: DIR, filepath });
  else await git.add({ fs, dir: DIR, filepath });
}

export async function unstage(path: string) {
  await ensureRepo();
  const filepath = path.replace(/^\//, "");
  await git.resetIndex({ fs, dir: DIR, filepath });
}

export async function stageAll(files: Record<string, FileNode>) {
  await syncToWorkingTree(files);
  const matrix = await git.statusMatrix({ fs, dir: DIR });
  for (const [filepath, , workdir] of matrix) {
    if (workdir === 0) await git.remove({ fs, dir: DIR, filepath });
    else await git.add({ fs, dir: DIR, filepath });
  }
}

// ---- Commit / log ----
export async function commit(message: string, files: Record<string, FileNode>) {
  await stageAll(files);
  return git.commit({ fs, dir: DIR, message, author: author() });
}

export interface CommitEntry {
  oid: string;
  message: string;
  author: string;
  email: string;
  timestamp: number;
  parents: string[];
}

export async function log(depth = 100, ref?: string): Promise<CommitEntry[]> {
  await ensureRepo();
  try {
    const entries = await git.log({ fs, dir: DIR, depth, ref });
    return entries.map((e) => ({
      oid: e.oid,
      message: e.commit.message.trim(),
      author: e.commit.author.name,
      email: e.commit.author.email,
      timestamp: e.commit.author.timestamp * 1000,
      parents: e.commit.parent,
    }));
  } catch { return []; }
}

// ---- Read content at refs ----
export async function readAtCommit(oid: string): Promise<Record<string, string>> {
  await ensureRepo();
  const out: Record<string, string> = {};
  const walk = async (prefix: string, tree: string) => {
    const { tree: entries } = await git.readTree({ fs, dir: DIR, oid: tree });
    for (const entry of entries) {
      const p = prefix + "/" + entry.path;
      if (entry.type === "tree") await walk(p, entry.oid);
      else if (entry.type === "blob") {
        const { blob } = await git.readBlob({ fs, dir: DIR, oid: entry.oid });
        out[p] = new TextDecoder().decode(blob);
      }
    }
  };
  const { commit } = await git.readCommit({ fs, dir: DIR, oid });
  await walk("", commit.tree);
  return out;
}

export async function readFileAtRef(ref: string, path: string): Promise<string | null> {
  await ensureRepo();
  try {
    const { blob } = await git.readBlob({
      fs, dir: DIR, oid: ref, filepath: path.replace(/^\//, ""),
    });
    return new TextDecoder().decode(blob);
  } catch { return null; }
}

// ---- Diff ----
export interface DiffHunk { kind: "add" | "del" | "ctx"; text: string; }
export function computeDiff(a: string, b: string): DiffHunk[] {
  const A = a.split("\n"), B = b.split("\n");
  // simple LCS diff
  const m = A.length, n = B.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffHunk[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) { out.push({ kind: "ctx", text: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: "del", text: A[i++] }); }
    else { out.push({ kind: "add", text: B[j++] }); }
  }
  while (i < m) out.push({ kind: "del", text: A[i++] });
  while (j < n) out.push({ kind: "add", text: B[j++] });
  return out;
}

export async function diffWorkingVsHead(path: string, files: Record<string, FileNode>): Promise<DiffHunk[]> {
  const head = (await readFileAtRef("HEAD", path)) ?? "";
  const wd = files[path]?.content ?? "";
  return computeDiff(head, wd);
}

// ---- Branches ----
export async function currentBranch() {
  await ensureRepo();
  return (await git.currentBranch({ fs, dir: DIR, fullname: false })) || "main";
}
export async function listBranches(): Promise<string[]> {
  await ensureRepo();
  return git.listBranches({ fs, dir: DIR });
}
export async function listRemoteBranches(): Promise<string[]> {
  await ensureRepo();
  try { return await git.listBranches({ fs, dir: DIR, remote: "origin" }); }
  catch { return []; }
}
export async function createBranch(name: string, checkout = true) {
  await ensureRepo();
  await git.branch({ fs, dir: DIR, ref: name, checkout });
}
export async function deleteBranch(name: string) {
  await ensureRepo();
  await git.deleteBranch({ fs, dir: DIR, ref: name });
}
export async function renameBranch(oldName: string, newName: string) {
  await ensureRepo();
  await git.renameBranch({ fs, dir: DIR, ref: newName, oldref: oldName });
}
export async function checkoutBranch(ref: string, force = false): Promise<Record<string, string>> {
  await ensureRepo();
  await git.checkout({ fs, dir: DIR, ref, force });
  return readWorkingTree();
}

// ---- Merge ----
export async function merge(theirs: string): Promise<{ oid?: string; alreadyMerged?: boolean; fastForward?: boolean; mergeCommit?: boolean; }> {
  await ensureRepo();
  const res = await git.merge({
    fs, dir: DIR, theirs, author: author(), abortOnConflict: true,
  });
  return res as any;
}

// ---- Tags ----
export async function listTags(): Promise<string[]> {
  await ensureRepo();
  return git.listTags({ fs, dir: DIR });
}
export async function tag(name: string, message?: string) {
  await ensureRepo();
  if (message) {
    await git.annotatedTag({ fs, dir: DIR, ref: name, message, tagger: author() });
  } else {
    await git.tag({ fs, dir: DIR, ref: name });
  }
}
export async function deleteTag(name: string) {
  await ensureRepo();
  await git.deleteTag({ fs, dir: DIR, ref: name });
}

// ---- Reset / restore / discard ----
export async function resetHard(ref: string): Promise<Record<string, string>> {
  await ensureRepo();
  // move branch ref then force-checkout
  const branch = await currentBranch();
  const oid = await git.resolveRef({ fs, dir: DIR, ref });
  await git.writeRef({ fs, dir: DIR, ref: `refs/heads/${branch}`, value: oid, force: true });
  await git.checkout({ fs, dir: DIR, ref: branch, force: true });
  return readWorkingTree();
}

export async function restoreFile(path: string, ref = "HEAD"): Promise<string | null> {
  return readFileAtRef(ref, path);
}

export async function discardChanges(path: string): Promise<string | null> {
  return readFileAtRef("HEAD", path);
}

// ---- Stash (lightweight: snapshot files in localStorage) ----
export interface StashEntry { id: string; message: string; timestamp: number; files: Record<string, string>; }

function readStashes(): StashEntry[] {
  try { return JSON.parse(localStorage.getItem(STASH_KEY) || "[]"); } catch { return []; }
}
function writeStashes(entries: StashEntry[]) {
  localStorage.setItem(STASH_KEY, JSON.stringify(entries));
}

export function listStashes(): StashEntry[] { return readStashes(); }

export function stashPush(message: string, files: Record<string, FileNode>): StashEntry {
  const snap: Record<string, string> = {};
  for (const f of Object.values(files)) if (f.type === "file") snap[f.id] = f.content ?? "";
  const entry: StashEntry = {
    id: crypto.randomUUID(), message: message || "WIP", timestamp: Date.now(), files: snap,
  };
  writeStashes([entry, ...readStashes()]);
  return entry;
}

export function stashPop(id: string): StashEntry | null {
  const list = readStashes();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const [entry] = list.splice(idx, 1);
  writeStashes(list);
  return entry;
}

export function stashDrop(id: string) {
  writeStashes(readStashes().filter((s) => s.id !== id));
}

// ---- Remote ----
export async function setRemote(url: string) {
  await ensureRepo();
  await git.addRemote({ fs, dir: DIR, remote: "origin", url, force: true });
}
export async function getRemote(): Promise<string | null> {
  await ensureRepo();
  const remotes = await git.listRemotes({ fs, dir: DIR });
  return remotes.find((r) => r.remote === "origin")?.url ?? null;
}

export async function fetch(branch?: string) {
  await ensureRepo();
  const b = branch || (await currentBranch());
  return git.fetch({
    fs, http, dir: DIR, remote: "origin", ref: b,
    corsProxy: CORS_PROXY, singleBranch: true, tags: true,
    onAuth: () => (getToken() ? onAuth() : {}),
  });
}

export async function push(branch?: string, force = false) {
  const b = branch || (await currentBranch());
  return git.push({
    fs, http, dir: DIR, remote: "origin", ref: b, force,
    corsProxy: CORS_PROXY, onAuth,
  });
}

export async function pull(branch?: string) {
  const b = branch || (await currentBranch());
  const { name, email } = author();
  return git.pull({
    fs, http, dir: DIR, ref: b, singleBranch: true,
    corsProxy: CORS_PROXY, author: { name, email }, onAuth,
  });
}

export async function clone(url: string, ref?: string): Promise<Record<string, string>> {
  await ensureRepo();
  try { await rmRecursive(DIR); } catch {/* ignore */}
  try {
    const gitDir = `${DIR}/.git`;
    const wipe = async (p: string) => {
      const items = await pfs.readdir(p);
      for (const i of items) {
        const f = `${p}/${i}`;
        const st = await pfs.stat(f);
        if (st.isDirectory()) { await wipe(f); await pfs.rmdir(f); }
        else await pfs.unlink(f);
      }
    };
    await wipe(gitDir);
    await pfs.rmdir(gitDir);
  } catch {/* ignore */}
  await git.clone({
    fs, http, dir: DIR, url, ref,
    corsProxy: CORS_PROXY, singleBranch: true, depth: 1,
    onAuth: () => (getToken() ? onAuth() : {}),
  });
  return readWorkingTree();
}

async function readWorkingTree(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (p: string, rel: string) => {
    const items = await pfs.readdir(p);
    for (const i of items) {
      if (i === ".git") continue;
      const full = `${p}/${i}`;
      const st = await pfs.stat(full);
      if (st.isDirectory()) await walk(full, `${rel}/${i}`);
      else {
        const content = await pfs.readFile(full, "utf8");
        out[`${rel}/${i}`] = content as string;
      }
    }
  };
  await walk(DIR, "");
  return out;
}

// Expose for use by panel when checking out / resetting refreshes the IDE
export async function readCurrentTree() { return readWorkingTree(); }
