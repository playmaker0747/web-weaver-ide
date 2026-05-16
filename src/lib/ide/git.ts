// Browser-side git using isomorphic-git + LightningFS.
// Provides local snapshots (init/commit/log/checkout) and optional GitHub sync
// (clone/push/pull) via a CORS proxy. Working tree is mirrored from the IDE's
// IndexedDB file store before each operation.
import FS from "@isomorphic-git/lightning-fs";
import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import type { FileNode } from "./fs";

const DIR = "/repo";
const CORS_PROXY = "https://cors.isomorphic-git.org";
const TOKEN_KEY = "codeforge.git.token";
const NAME_KEY = "codeforge.git.name";
const EMAIL_KEY = "codeforge.git.email";

const fs = new FS("codeforge-git");
// isomorphic-git expects a node-like fs interface
const pfs: any = fs.promises;

async function ensureRepo() {
  try {
    await pfs.mkdir(DIR);
  } catch {/* exists */}
  try {
    await pfs.stat(`${DIR}/.git`);
  } catch {
    await git.init({ fs, dir: DIR, defaultBranch: "main" });
  }
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

// Mirror the in-memory IDE file map into the LightningFS working tree.
export async function syncToWorkingTree(files: Record<string, FileNode>) {
  await ensureRepo();
  await rmRecursive(DIR);
  const entries = Object.values(files)
    .filter((f) => f.type === "file")
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const f of entries) {
    await writeFileDeep(f.id, f.content ?? "");
  }
}

export interface GitStatusEntry {
  path: string;
  status: "added" | "modified" | "deleted" | "untracked";
}

export async function status(files: Record<string, FileNode>): Promise<GitStatusEntry[]> {
  await syncToWorkingTree(files);
  const matrix = await git.statusMatrix({ fs, dir: DIR });
  const out: GitStatusEntry[] = [];
  for (const [filepath, head, workdir] of matrix) {
    if (head === 0 && workdir === 2) out.push({ path: "/" + filepath, status: "untracked" });
    else if (head === 1 && workdir === 0) out.push({ path: "/" + filepath, status: "deleted" });
    else if (head === 1 && workdir === 2) out.push({ path: "/" + filepath, status: "modified" });
    else if (head === 0 && workdir === 0) { /* skip */ }
  }
  return out;
}

function author() {
  return {
    name: localStorage.getItem(NAME_KEY) || "CodeForge User",
    email: localStorage.getItem(EMAIL_KEY) || "user@codeforge.local",
  };
}

export async function commit(message: string, files: Record<string, FileNode>) {
  await syncToWorkingTree(files);
  // stage everything (including deletions)
  const matrix = await git.statusMatrix({ fs, dir: DIR });
  for (const [filepath, , workdir] of matrix) {
    if (workdir === 0) await git.remove({ fs, dir: DIR, filepath });
    else await git.add({ fs, dir: DIR, filepath });
  }
  return git.commit({ fs, dir: DIR, message, author: author() });
}

export interface CommitEntry {
  oid: string;
  message: string;
  author: string;
  timestamp: number;
}

export async function log(depth = 50): Promise<CommitEntry[]> {
  await ensureRepo();
  try {
    const entries = await git.log({ fs, dir: DIR, depth });
    return entries.map((e) => ({
      oid: e.oid,
      message: e.commit.message.trim(),
      author: e.commit.author.name,
      timestamp: e.commit.author.timestamp * 1000,
    }));
  } catch {
    return [];
  }
}

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

export async function currentBranch() {
  await ensureRepo();
  return (await git.currentBranch({ fs, dir: DIR, fullname: false })) || "main";
}

// ----- Remote (GitHub) -----

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

function onAuth() {
  const token = getToken();
  if (!token) throw new Error("No GitHub token. Set one in Source Control.");
  return { username: token, password: "x-oauth-basic" };
}

export async function setRemote(url: string) {
  await ensureRepo();
  await git.addRemote({ fs, dir: DIR, remote: "origin", url, force: true });
}

export async function getRemote(): Promise<string | null> {
  await ensureRepo();
  const remotes = await git.listRemotes({ fs, dir: DIR });
  return remotes.find((r) => r.remote === "origin")?.url ?? null;
}

export async function push(branch?: string) {
  const b = branch || (await currentBranch());
  return git.push({
    fs, http, dir: DIR, remote: "origin", ref: b,
    corsProxy: CORS_PROXY,
    onAuth,
  });
}

export async function pull(branch?: string) {
  const b = branch || (await currentBranch());
  const { name, email } = author();
  return git.pull({
    fs, http, dir: DIR, ref: b, singleBranch: true,
    corsProxy: CORS_PROXY,
    author: { name, email },
    onAuth,
  });
}

export async function clone(url: string): Promise<Record<string, string>> {
  await ensureRepo();
  // wipe working tree and .git
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
    fs, http, dir: DIR, url,
    corsProxy: CORS_PROXY,
    singleBranch: true,
    depth: 1,
    onAuth: () => (getToken() ? onAuth() : {}),
  });
  // Read working tree back to plain object
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
