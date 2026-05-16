import { useCallback, useEffect, useState } from "react";
import { GitBranch, GitCommit, RefreshCw, Upload, Download, Cloud, Key, FileDiff, Plus, Minus, FilePen } from "lucide-react";
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
  const [busy, setBusy] = useState(false);
  const [remote, setRemoteUrl] = useState("");
  const [token, setTokenState] = useState(gitlib.getToken());
  const [identity, setIdent] = useState(gitlib.getIdentity());
  const [showRemote, setShowRemote] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setBusy(true);
      const [s, l, b, r] = await Promise.all([
        gitlib.status(files), gitlib.log(50), gitlib.currentBranch(), gitlib.getRemote(),
      ]);
      setStatusList(s);
      setHistory(l);
      setBranch(b);
      setRemoteUrl(r ?? "");
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }, [files]);

  useEffect(() => { void refresh(); }, [refresh]);

  const onCommit = async () => {
    if (!message.trim()) { toast.error("Commit message required"); return; }
    try {
      setBusy(true);
      const oid = await gitlib.commit(message.trim(), files);
      toast.success(`Committed ${oid.slice(0, 7)}`);
      setMessage("");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Commit failed");
    } finally { setBusy(false); }
  };

  const onPush = async () => {
    try { setBusy(true); await gitlib.push(); toast.success("Pushed to origin"); }
    catch (e: any) { toast.error(e?.message ?? "Push failed"); }
    finally { setBusy(false); }
  };

  const onPull = async () => {
    try { setBusy(true); await gitlib.pull(); toast.success("Pulled from origin"); await refresh(); }
    catch (e: any) { toast.error(e?.message ?? "Pull failed"); }
    finally { setBusy(false); }
  };

  const onClone = async () => {
    if (!remote) { toast.error("Enter a repo URL"); return; }
    if (!confirm("Cloning replaces all current files. Continue?")) return;
    try {
      setBusy(true);
      const tree = await gitlib.clone(remote);
      // load tree into IDE store
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
      // clear default then save clone
      const { files: cur } = useIDE.getState();
      for (const id of Object.keys(cur)) await useIDE.getState().deleteFile(id);
      await Promise.all(nodes.map(saveNode));
      const map: Record<string, FileNode> = {};
      for (const n of nodes) map[n.id] = n;
      useIDE.setState({ files: map, openTabs: [], activeTab: null });
      toast.success("Repository cloned");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Clone failed");
    } finally { setBusy(false); }
  };

  const onSetRemote = async () => {
    if (!remote) return;
    try { await gitlib.setRemote(remote); toast.success("Remote saved"); }
    catch (e: any) { toast.error(e?.message ?? "Failed to set remote"); }
  };

  const onSaveToken = () => {
    gitlib.setToken(token);
    gitlib.setIdentity(identity.name, identity.email);
    toast.success("Credentials saved locally");
  };

  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Source Control</div>
        <button onClick={refresh} title="Refresh" className="text-muted-foreground hover:text-foreground">
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex items-center gap-1 px-3 pb-2 text-[11px] text-muted-foreground">
        <GitBranch className="h-3 w-3" /> {branch}
        {remote && <span className="ml-auto truncate max-w-[60%]" title={remote}>{new URL(remote.replace(/\.git$/, ""), "https://x/").pathname.replace(/^\//, "")}</span>}
      </div>

      <div className="px-2 pb-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Commit message"
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
          <button onClick={onPush} disabled={busy || !remote} title="Push" className="rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" />
          </button>
          <button onClick={onPull} disabled={busy || !remote} title="Pull" className="rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-50">
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section title={`Changes (${statusList.length})`}>
          {statusList.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">Working tree clean</div>
          ) : statusList.map((s) => (
            <div key={s.path} className="flex items-center gap-2 px-3 py-1 text-xs hover:bg-muted/30">
              <StatusIcon kind={s.status} />
              <span className="truncate flex-1" title={s.path}>{s.path}</span>
              <span className="text-[10px] uppercase text-muted-foreground">{s.status[0]}</span>
            </div>
          ))}
        </Section>

        <Section title={`History (${history.length})`}>
          {history.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">No commits yet</div>
          ) : history.map((c) => (
            <div key={c.oid} className="px-3 py-1.5 text-xs hover:bg-muted/30">
              <div className="flex items-center gap-2">
                <FileDiff className="h-3 w-3 text-muted-foreground" />
                <span className="truncate flex-1" title={c.message}>{c.message}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{c.oid.slice(0, 7)}</span>
              </div>
              <div className="pl-5 text-[10px] text-muted-foreground">
                {c.author} · {new Date(c.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </Section>

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
            <button onClick={() => setShowRemote((v) => !v)} className="flex w-full items-center gap-1 pt-2 text-[10px] uppercase text-muted-foreground hover:text-foreground">
              <Key className="h-3 w-3" /> Credentials {showRemote ? "▾" : "▸"}
            </button>
            {showRemote && (
              <div className="space-y-2 rounded border border-border bg-background/40 p-2">
                <label className="block">
                  <div className="mb-1 text-[10px] uppercase text-muted-foreground">GitHub personal access token</div>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setTokenState(e.target.value)}
                    placeholder="ghp_…"
                    className="w-full rounded border border-border bg-background px-2 py-1 outline-none focus:border-primary"
                  />
                </label>
                <div className="grid grid-cols-2 gap-1">
                  <input
                    value={identity.name}
                    onChange={(e) => setIdent({ ...identity, name: e.target.value })}
                    placeholder="Name"
                    className="rounded border border-border bg-background px-2 py-1 outline-none focus:border-primary"
                  />
                  <input
                    value={identity.email}
                    onChange={(e) => setIdent({ ...identity, email: e.target.value })}
                    placeholder="email"
                    className="rounded border border-border bg-background px-2 py-1 outline-none focus:border-primary"
                  />
                </div>
                <button onClick={onSaveToken} className="w-full rounded bg-primary px-2 py-1 text-primary-foreground">Save</button>
                <p className="text-[10px] text-muted-foreground">
                  Token stored locally in your browser. Needs <code>repo</code> scope. Push/pull go through a public CORS proxy.
                </p>
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
        <span>{open ? "▾" : "▸"}</span> {title}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

function StatusIcon({ kind }: { kind: gitlib.GitStatusEntry["status"] }) {
  if (kind === "untracked") return <Plus className="h-3 w-3 text-green-500" />;
  if (kind === "deleted") return <Minus className="h-3 w-3 text-red-500" />;
  if (kind === "added") return <Plus className="h-3 w-3 text-green-500" />;
  return <FilePen className="h-3 w-3 text-yellow-500" />;
}
