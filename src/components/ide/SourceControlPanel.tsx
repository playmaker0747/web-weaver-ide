import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GitBranch, GitCommit, GitMerge, RefreshCw, Upload, Download, Cloud, Key,
  FileDiff, Plus, Minus, FilePen, Tag, Archive, RotateCcw, X, Check,
  ChevronDown, MoreHorizontal, History, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useIDE } from "@/lib/ide/store";
import * as gitlib from "@/lib/ide/git";
import { saveNode, type FileNode, parentOf } from "@/lib/ide/fs";

export function SourceControlPanel() {
  const files = useIDE((s) => s.files);
  const [message, setMessage] = useState("");
  const [statusList, setStatusList] = useState<gitlib.GitStatusEntry[]>([]);
  const [history, setHistory] = useState<gitlib.CommitEntry[]>([]);
  const [branch, setBranch] = useState("main");
  const [branches, setBranches] = useState<string[]>([]);
  const [remoteBranches, setRemoteBranches] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [stashes, setStashes] = useState<gitlib.StashEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [remote, setRemoteUrl] = useState("");
  const [token, setTokenState] = useState(gitlib.getToken());
  const [identity, setIdent] = useState(gitlib.getIdentity());
  const [showCreds, setShowCreds] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [diffPath, setDiffPath] = useState<string | null>(null);
  const [diff, setDiff] = useState<gitlib.DiffHunk[]>([]);

  const staged = useMemo(() => statusList.filter((s) => s.staged), [statusList]);
  const unstaged = useMemo(() => statusList.filter((s) => !s.staged), [statusList]);

  const refresh = useCallback(async () => {
    try {
      setBusy(true);
      const [s, l, b, r, br, rb, tg] = await Promise.all([
        gitlib.status(files),
        gitlib.log(100),
        gitlib.currentBranch(),
        gitlib.getRemote(),
        gitlib.listBranches(),
        gitlib.listRemoteBranches(),
        gitlib.listTags(),
      ]);
      setStatusList(s); setHistory(l); setBranch(b);
      setRemoteUrl(r ?? ""); setBranches(br); setRemoteBranches(rb); setTags(tg);
      setStashes(gitlib.listStashes());
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
  }, [files]);

  useEffect(() => { void refresh(); }, [refresh]);

  // -------- Tree replacement (clone / checkout / reset / stash pop) --------
  const replaceTree = async (tree: Record<string, string>) => {
    const { resetProject } = useIDE.getState();
    await resetProject();
    const nodes: FileNode[] = [];
    const seen = new Set<string>(["/"]);
    const ensureFolders = (path: string) => {
      const parts = path.split("/").filter(Boolean);
      let acc = "";
      for (let i = 0; i < parts.length - 1; i++) {
        acc += "/" + parts[i];
        if (!seen.has(acc)) {
          seen.add(acc);
          nodes.push({ id: acc, parentId: parentOf(acc), name: parts[i], type: "folder", updatedAt: Date.now() });
        }
      }
    };
    for (const [path, content] of Object.entries(tree)) {
      ensureFolders(path);
      const name = path.split("/").pop()!;
      nodes.push({ id: path, parentId: parentOf(path), name, type: "file", content, updatedAt: Date.now() });
    }
    const { files: cur } = useIDE.getState();
    for (const id of Object.keys(cur)) await useIDE.getState().deleteFile(id);
    await Promise.all(nodes.map(saveNode));
    const map: Record<string, FileNode> = {};
    for (const n of nodes) map[n.id] = n;
    useIDE.setState({ files: map, openTabs: [], activeTab: null });
  };

  const wrap = async (label: string, fn: () => Promise<any>) => {
    try { setBusy(true); const r = await fn(); await refresh(); return r; }
    catch (e: any) { toast.error(`${label}: ${e?.message ?? "failed"}`); }
    finally { setBusy(false); }
  };

  // -------- Commit / staging --------
  const onCommit = () => wrap("Commit", async () => {
    if (!message.trim()) throw new Error("Message required");
    if (statusList.length === 0) throw new Error("Nothing to commit");
    const oid = await gitlib.commit(message.trim(), files);
    toast.success(`Committed ${oid.slice(0, 7)}`);
    setMessage("");
  });

  const onStage = (p: string) => wrap("Stage", () => gitlib.stage(p, files));
  const onUnstage = (p: string) => wrap("Unstage", () => gitlib.unstage(p));
  const onStageAll = () => wrap("Stage all", () => gitlib.stageAll(files));

  const onDiscard = (p: string) => wrap("Discard", async () => {
    const orig = await gitlib.discardChanges(p);
    if (orig == null) {
      // file was untracked → remove from IDE
      await useIDE.getState().deleteFile(p);
      return;
    }
    useIDE.getState().updateFileContent(p, orig);
  });

  // -------- Diff --------
  const onShowDiff = async (p: string) => {
    try {
      const d = await gitlib.diffWorkingVsHead(p, files);
      setDiff(d); setDiffPath(p);
    } catch (e: any) { toast.error(e?.message ?? "Diff failed"); }
  };

  // -------- Branches --------
  const onSwitchBranch = (b: string) => wrap("Checkout", async () => {
    if (b === branch) return;
    if (statusList.length > 0 && !confirm("Uncommitted changes may be lost. Continue?")) return;
    const tree = await gitlib.checkoutBranch(b, true);
    await replaceTree(tree);
    toast.success(`Switched to ${b}`);
    setShowBranchMenu(false);
  });

  const onCreateBranch = () => wrap("Create branch", async () => {
    const name = prompt("New branch name")?.trim();
    if (!name) return;
    await gitlib.createBranch(name, true);
    toast.success(`Created ${name}`);
    setShowBranchMenu(false);
  });

  const onDeleteBranch = (b: string) => wrap("Delete branch", async () => {
    if (b === branch) throw new Error("Cannot delete current branch");
    if (!confirm(`Delete branch ${b}?`)) return;
    await gitlib.deleteBranch(b);
    toast.success(`Deleted ${b}`);
  });

  const onMerge = () => wrap("Merge", async () => {
    const src = prompt(`Merge which branch into ${branch}?`)?.trim();
    if (!src) return;
    const res = await gitlib.merge(src);
    toast.success(res.fastForward ? "Fast-forwarded" : res.alreadyMerged ? "Already merged" : "Merged");
    const tree = await gitlib.readCurrentTree();
    await replaceTree(tree);
  });

  // -------- Tags --------
  const onCreateTag = () => wrap("Tag", async () => {
    const name = prompt("Tag name (e.g. v1.0.0)")?.trim();
    if (!name) return;
    const msg = prompt("Tag message (leave empty for lightweight)") ?? "";
    await gitlib.tag(name, msg || undefined);
    toast.success(`Tagged ${name}`);
  });
  const onDeleteTag = (t: string) => wrap("Delete tag", async () => {
    if (!confirm(`Delete tag ${t}?`)) return;
    await gitlib.deleteTag(t);
  });

  // -------- Reset / restore --------
  const onResetTo = (oid: string) => wrap("Reset", async () => {
    if (!confirm(`Hard-reset ${branch} to ${oid.slice(0, 7)}? Working tree will match.`)) return;
    const tree = await gitlib.resetHard(oid);
    await replaceTree(tree);
    toast.success("Reset complete");
  });

  // -------- Stash --------
  const onStash = () => wrap("Stash", async () => {
    const m = prompt("Stash message", "WIP") ?? "WIP";
    gitlib.stashPush(m, files);
    // discard working changes to HEAD
    for (const s of statusList) {
      if (s.status === "untracked") await useIDE.getState().deleteFile(s.path);
      else {
        const orig = await gitlib.readFileAtRef("HEAD", s.path);
        if (orig != null) useIDE.getState().updateFileContent(s.path, orig);
      }
    }
    toast.success("Stashed");
  });

  const onStashPop = (id: string) => wrap("Stash pop", async () => {
    const entry = gitlib.stashPop(id);
    if (!entry) return;
    for (const [path, content] of Object.entries(entry.files)) {
      const cur = useIDE.getState().files[path];
      if (cur) useIDE.getState().updateFileContent(path, content);
      else {
        await saveNode({ id: path, parentId: parentOf(path), name: path.split("/").pop()!, type: "file", content, updatedAt: Date.now() });
      }
    }
    toast.success(`Restored stash: ${entry.message}`);
  });

  // -------- Remote --------
  const onSetRemote = () => wrap("Set remote", async () => {
    if (!remote) return;
    await gitlib.setRemote(remote);
    toast.success("Remote saved");
  });
  const onFetch = () => wrap("Fetch", async () => { await gitlib.fetch(); toast.success("Fetched"); });
  const onPush = (force = false) => wrap("Push", async () => { await gitlib.push(undefined, force); toast.success(force ? "Force pushed" : "Pushed"); });
  const onPull = () => wrap("Pull", async () => {
    await gitlib.pull();
    const tree = await gitlib.readCurrentTree();
    await replaceTree(tree);
    toast.success("Pulled");
  });

  const onClone = () => wrap("Clone", async () => {
    if (!remote) throw new Error("Enter a repo URL");
    if (!confirm("Cloning replaces all current files. Continue?")) return;
    const tree = await gitlib.clone(remote);
    await replaceTree(tree);
    toast.success("Cloned");
  });

  const onSaveCreds = () => {
    gitlib.setToken(token);
    gitlib.setIdentity(identity.name, identity.email);
    toast.success("Credentials saved");
  };

  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Source Control</div>
        <div className="flex items-center gap-1">
          <button onClick={onFetch} title="Fetch" disabled={busy || !remote} className="text-muted-foreground hover:text-foreground disabled:opacity-40">
            <Download className="h-3.5 w-3.5" />
          </button>
          <button onClick={refresh} title="Refresh" className="text-muted-foreground hover:text-foreground">
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Branch selector */}
      <div className="relative px-3 pb-2">
        <button
          onClick={() => setShowBranchMenu((v) => !v)}
          className="flex w-full items-center gap-1 rounded border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted/40"
        >
          <GitBranch className="h-3 w-3" />
          <span className="font-medium">{branch}</span>
          <ChevronDown className="ml-auto h-3 w-3" />
        </button>
        {showBranchMenu && (
          <div className="absolute left-3 right-3 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded border border-border bg-popover shadow-lg">
            <button onClick={onCreateBranch} className="flex w-full items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted/40">
              <Plus className="h-3 w-3" /> Create branch…
            </button>
            <button onClick={onMerge} className="flex w-full items-center gap-2 border-t border-border px-2 py-1.5 text-xs hover:bg-muted/40">
              <GitMerge className="h-3 w-3" /> Merge into {branch}…
            </button>
            <div className="border-t border-border px-2 py-1 text-[10px] uppercase text-muted-foreground">Local</div>
            {branches.map((b) => (
              <div key={b} className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-muted/40">
                <button onClick={() => onSwitchBranch(b)} className="flex flex-1 items-center gap-2">
                  {b === branch ? <Check className="h-3 w-3 text-primary" /> : <span className="w-3" />}
                  <span className="truncate">{b}</span>
                </button>
                {b !== branch && (
                  <button onClick={() => onDeleteBranch(b)} className="opacity-0 hover:opacity-100 group-hover:opacity-100 text-muted-foreground hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {remoteBranches.length > 0 && (
              <>
                <div className="border-t border-border px-2 py-1 text-[10px] uppercase text-muted-foreground">Remote</div>
                {remoteBranches.map((b) => (
                  <button key={b} onClick={() => onSwitchBranch(b)} className="flex w-full items-center gap-2 px-2 py-1 text-xs hover:bg-muted/40">
                    <Cloud className="h-3 w-3 text-muted-foreground" /> <span className="truncate">origin/{b}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Commit box */}
      <div className="px-2 pb-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Message (commit on ${branch})`}
          rows={2}
          className="w-full resize-none rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
        />
        <div className="mt-1 flex gap-1">
          <button
            onClick={onCommit}
            disabled={busy || !message.trim() || statusList.length === 0}
            className="flex flex-1 items-center justify-center gap-1 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            <GitCommit className="h-3.5 w-3.5" /> Commit
          </button>
          <button onClick={() => onPush(false)} disabled={busy || !remote} title="Push" className="rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" />
          </button>
          <button onClick={onPull} disabled={busy || !remote} title="Pull" className="rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-50">
            <Download className="h-3.5 w-3.5" />
          </button>
          <button onClick={onStash} disabled={busy || statusList.length === 0} title="Stash" className="rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-50">
            <Archive className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Staged */}
        {staged.length > 0 && (
          <Section title={`Staged (${staged.length})`} action={
            <button onClick={() => staged.forEach((s) => onUnstage(s.path))} title="Unstage all" className="text-muted-foreground hover:text-foreground">
              <Minus className="h-3 w-3" />
            </button>
          }>
            {staged.map((s) => (
              <FileRow key={s.path} entry={s} onDiff={() => onShowDiff(s.path)}
                actions={
                  <button onClick={() => onUnstage(s.path)} title="Unstage" className="text-muted-foreground hover:text-foreground"><Minus className="h-3 w-3" /></button>
                } />
            ))}
          </Section>
        )}

        {/* Changes */}
        <Section title={`Changes (${unstaged.length})`} action={
          unstaged.length > 0 ? (
            <button onClick={onStageAll} title="Stage all" className="text-muted-foreground hover:text-foreground"><Plus className="h-3 w-3" /></button>
          ) : null
        }>
          {unstaged.length === 0 && staged.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">Working tree clean</div>
          ) : unstaged.map((s) => (
            <FileRow key={s.path} entry={s} onDiff={() => onShowDiff(s.path)}
              actions={
                <>
                  <button onClick={() => onDiscard(s.path)} title="Discard" className="text-muted-foreground hover:text-red-500"><RotateCcw className="h-3 w-3" /></button>
                  <button onClick={() => onStage(s.path)} title="Stage" className="text-muted-foreground hover:text-foreground"><Plus className="h-3 w-3" /></button>
                </>
              } />
          ))}
        </Section>

        {/* History */}
        <Section title={`History (${history.length})`} action={
          <button onClick={onCreateTag} title="Tag HEAD" className="text-muted-foreground hover:text-foreground"><Tag className="h-3 w-3" /></button>
        }>
          {history.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">No commits yet</div>
          ) : history.map((c) => (
            <div key={c.oid} className="group px-3 py-1.5 text-xs hover:bg-muted/30">
              <div className="flex items-center gap-2">
                <FileDiff className="h-3 w-3 text-muted-foreground" />
                <span className="truncate flex-1" title={c.message}>{c.message}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{c.oid.slice(0, 7)}</span>
                <button onClick={() => onResetTo(c.oid)} title="Reset to here" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground">
                  <History className="h-3 w-3" />
                </button>
              </div>
              <div className="pl-5 text-[10px] text-muted-foreground">
                {c.author} · {new Date(c.timestamp).toLocaleString()}
                {c.parents.length > 1 && <span className="ml-1 text-primary">merge</span>}
              </div>
            </div>
          ))}
        </Section>

        {/* Tags */}
        <Section title={`Tags (${tags.length})`} defaultOpen={false}>
          {tags.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">No tags</div>
          ) : tags.map((t) => (
            <div key={t} className="group flex items-center gap-2 px-3 py-1 text-xs hover:bg-muted/30">
              <Tag className="h-3 w-3 text-muted-foreground" />
              <span className="flex-1 truncate">{t}</span>
              <button onClick={() => onDeleteTag(t)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </Section>

        {/* Stash */}
        <Section title={`Stash (${stashes.length})`} defaultOpen={false}>
          {stashes.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">No stashes</div>
          ) : stashes.map((s) => (
            <div key={s.id} className="group flex items-center gap-2 px-3 py-1 text-xs hover:bg-muted/30">
              <Archive className="h-3 w-3 text-muted-foreground" />
              <div className="flex-1 truncate">
                <div className="truncate">{s.message}</div>
                <div className="text-[10px] text-muted-foreground">{new Date(s.timestamp).toLocaleString()}</div>
              </div>
              <button onClick={() => onStashPop(s.id)} title="Pop" className="text-muted-foreground hover:text-foreground"><Upload className="h-3 w-3" /></button>
              <button onClick={() => { gitlib.stashDrop(s.id); setStashes(gitlib.listStashes()); }} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
        </Section>

        {/* Remote */}
        <Section title="Remote (GitHub)" defaultOpen={false}>
          <div className="space-y-2 px-3 py-2 text-xs">
            <label className="block">
              <div className="mb-1 text-[10px] uppercase text-muted-foreground">Repository URL</div>
              <input
                value={remote}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="https://github.com/user/repo.git"
                className="w-full rounded border border-border bg-background px-2 py-1 outline-none focus:border-primary"
              />
            </label>
            <div className="flex gap-1">
              <button onClick={onSetRemote} disabled={busy} className="flex-1 rounded border border-border bg-background px-2 py-1 disabled:opacity-50">Save remote</button>
              <button onClick={onClone} disabled={busy} className="flex flex-1 items-center justify-center gap-1 rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-50">
                <Cloud className="h-3.5 w-3.5" /> Clone
              </button>
            </div>
            <div className="flex gap-1">
              <button onClick={onFetch} disabled={busy || !remote} className="flex-1 rounded border border-border bg-background px-2 py-1 disabled:opacity-50">Fetch</button>
              <button onClick={() => onPush(true)} disabled={busy || !remote} className="flex-1 rounded border border-border bg-background px-2 py-1 text-red-400 disabled:opacity-50">Force push</button>
            </div>
            <button onClick={() => setShowCreds((v) => !v)} className="flex w-full items-center gap-1 pt-2 text-[10px] uppercase text-muted-foreground hover:text-foreground">
              <Key className="h-3 w-3" /> Credentials {showCreds ? "▾" : "▸"}
            </button>
            {showCreds && (
              <div className="space-y-2 rounded border border-border bg-background/40 p-2">
                <label className="block">
                  <div className="mb-1 text-[10px] uppercase text-muted-foreground">GitHub personal access token</div>
                  <input
                    type="password" value={token}
                    onChange={(e) => setTokenState(e.target.value)}
                    placeholder="ghp_…"
                    className="w-full rounded border border-border bg-background px-2 py-1 outline-none focus:border-primary"
                  />
                </label>
                <div className="grid grid-cols-2 gap-1">
                  <input value={identity.name} onChange={(e) => setIdent({ ...identity, name: e.target.value })} placeholder="Name" className="rounded border border-border bg-background px-2 py-1 outline-none focus:border-primary" />
                  <input value={identity.email} onChange={(e) => setIdent({ ...identity, email: e.target.value })} placeholder="email" className="rounded border border-border bg-background px-2 py-1 outline-none focus:border-primary" />
                </div>
                <button onClick={onSaveCreds} className="w-full rounded bg-primary px-2 py-1 text-primary-foreground">Save</button>
                <p className="text-[10px] text-muted-foreground">
                  Token stored locally. Needs <code>repo</code> scope. Push/pull go through a public CORS proxy.
                </p>
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* Diff modal */}
      {diffPath && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={() => setDiffPath(null)}>
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded border border-border bg-popover text-popover-foreground">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-2 text-xs"><FileDiff className="h-3.5 w-3.5" /> {diffPath} <span className="text-muted-foreground">vs HEAD</span></div>
              <button onClick={() => setDiffPath(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed">
              {diff.length === 0 ? (
                <div className="p-4 text-muted-foreground">No changes</div>
              ) : diff.map((h, i) => (
                <div key={i} className={
                  h.kind === "add" ? "bg-green-500/10 text-green-400" :
                  h.kind === "del" ? "bg-red-500/10 text-red-400" :
                  "text-muted-foreground"
                }>
                  <span className="select-none px-2 opacity-60">{h.kind === "add" ? "+" : h.kind === "del" ? "-" : " "}</span>
                  <span className="whitespace-pre-wrap break-all">{h.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children, defaultOpen = true, action }: { title: string; children: React.ReactNode; defaultOpen?: boolean; action?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border">
      <div className="flex items-center pr-2">
        <button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
          <span>{open ? "▾" : "▸"}</span> {title}
        </button>
        {open && action}
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

function FileRow({ entry, onDiff, actions }: { entry: gitlib.GitStatusEntry; onDiff: () => void; actions: React.ReactNode }) {
  return (
    <div className="group flex items-center gap-2 px-3 py-1 text-xs hover:bg-muted/30">
      <StatusIcon kind={entry.status} />
      <button onClick={onDiff} className="truncate flex-1 text-left hover:underline" title={entry.path}>
        {entry.path}
      </button>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">{actions}</div>
      <span className="text-[10px] uppercase text-muted-foreground">{entry.status[0]}</span>
    </div>
  );
}

function StatusIcon({ kind }: { kind: gitlib.GitStatusEntry["status"] }) {
  if (kind === "untracked" || kind === "added") return <Plus className="h-3 w-3 text-green-500" />;
  if (kind === "deleted") return <Minus className="h-3 w-3 text-red-500" />;
  if (kind === "staged") return <Check className="h-3 w-3 text-blue-500" />;
  return <FilePen className="h-3 w-3 text-yellow-500" />;
}
