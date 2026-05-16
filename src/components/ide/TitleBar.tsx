import { useEffect, useState } from "react";
import { Command, User as UserIcon, Cloud, LogOut, Share2, FolderOpen, Save, Plus, Copy, Check, Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth, signOut } from "@/hooks/use-auth";
import { useIDE } from "@/lib/ide/store";
import {
  listProjects, saveProject, loadProject, deleteProject,
  setProjectVisibility, rotateProjectTokens,
} from "@/lib/projects.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const STORAGE_KEY = "codeforge_current_project_id";

export function TitleBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );

  const files = useIDE((s) => s.files);

  // Auto-open pending invite project after login
  useEffect(() => {
    const pid = typeof window !== "undefined" ? sessionStorage.getItem("codeforge_open_project") : null;
    if (pid && user) {
      sessionStorage.removeItem("codeforge_open_project");
      setCurrentProjectId(pid);
      localStorage.setItem(STORAGE_KEY, pid);
      void handleLoadProject(pid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const _save = useServerFn(saveProject);
  const _load = useServerFn(loadProject);

  const handleSave = async () => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    const name = currentProjectId ? "Workspace" : prompt("Name this project:", "My CodeForge Project") ?? "Untitled";
    const payload = Object.values(files).map((f) => ({
      path: f.id,
      parent_path: f.parentId,
      name: f.name,
      type: f.type,
      content: f.content ?? null,
    }));
    try {
      toast.loading("Saving to cloud…", { id: "save" });
      const res = await _save({ data: { projectId: currentProjectId, name, files: payload } });
      setCurrentProjectId(res.projectId);
      localStorage.setItem(STORAGE_KEY, res.projectId);
      toast.success("Saved to cloud", { id: "save" });
    } catch (e: any) {
      toast.error(e.message ?? "Save failed", { id: "save" });
    }
  };

  const handleLoadProject = async (projectId: string) => {
    try {
      toast.loading("Loading…", { id: "load" });
      const res = await _load({ data: { projectId } });
      const store = useIDE.getState();
      // clear current files locally then reseed from cloud
      const all = Object.keys(store.files);
      for (const id of all) await store.deleteFile(id);
      for (const f of res.files) {
        await store.createFile(f.parent_path, f.name, f.type as "file" | "folder");
        if (f.type === "file" && f.content != null) {
          store.updateFileContent(f.path, f.content);
        }
      }
      setCurrentProjectId(projectId);
      localStorage.setItem(STORAGE_KEY, projectId);
      setProjectsOpen(false);
      toast.success("Project loaded", { id: "load" });
    } catch (e: any) {
      toast.error(e.message ?? "Load failed", { id: "load" });
    }
  };

  return (
    <>
      <div className="flex h-9 shrink-0 items-center justify-between bg-titlebar px-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded bg-primary text-primary-foreground text-[10px]">⚒</span>
          <span className="font-semibold tracking-tight">CodeForge</span>
        </div>
        <button
          onClick={onOpenPalette}
          className="hidden items-center gap-2 rounded border border-border bg-background/40 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground sm:flex"
        >
          <Command className="h-3 w-3" />
          <span>Search files & commands</span>
          <span className="ml-2 rounded border border-border px-1 py-px text-[10px]">⌘K</span>
        </button>
        <div className="flex items-center gap-1">
          {user && (
            <>
              <button onClick={handleSave} title="Save to cloud"
                className="flex items-center gap-1 rounded px-2 py-1 hover:bg-accent">
                <Save className="h-3.5 w-3.5" /><span className="hidden md:inline">Save</span>
              </button>
              <button onClick={() => setProjectsOpen(true)} title="My projects"
                className="flex items-center gap-1 rounded px-2 py-1 hover:bg-accent">
                <FolderOpen className="h-3.5 w-3.5" /><span className="hidden md:inline">Projects</span>
              </button>
              <button
                onClick={() => currentProjectId ? setShareOpen(true) : toast.info("Save the project first")}
                title="Share"
                className="flex items-center gap-1 rounded px-2 py-1 hover:bg-accent">
                <Share2 className="h-3.5 w-3.5" /><span className="hidden md:inline">Share</span>
              </button>
            </>
          )}
          <button
            onClick={() => user ? setAccountOpen((v) => !v) : navigate({ to: "/login" })}
            className="ml-1 flex items-center gap-1.5 rounded px-2 py-1 hover:bg-accent"
          >
            {user ? (
              <>
                <div className="grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {(user.email ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <span className="hidden max-w-[140px] truncate sm:inline">{user.email}</span>
              </>
            ) : (
              <>
                <Cloud className="h-3.5 w-3.5" />
                <span>{loading ? "…" : "Sign in"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {accountOpen && user && (
        <div className="absolute right-3 top-10 z-50 w-56 rounded-md border border-border bg-popover p-1 text-xs shadow-xl">
          <div className="px-2 py-1.5 text-muted-foreground">{user.email}</div>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={async () => { setAccountOpen(false); await signOut(); localStorage.removeItem(STORAGE_KEY); setCurrentProjectId(null); toast.success("Signed out"); }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      )}

      <ProjectsDialog
        open={projectsOpen}
        onClose={() => setProjectsOpen(false)}
        currentProjectId={currentProjectId}
        onLoad={handleLoadProject}
        onNew={() => {
          setCurrentProjectId(null);
          localStorage.removeItem(STORAGE_KEY);
          setProjectsOpen(false);
          toast.success("Switched to new workspace — Save to upload");
        }}
      />
      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        projectId={currentProjectId}
      />
    </>
  );
}

function ProjectsDialog({
  open, onClose, currentProjectId, onLoad, onNew,
}: { open: boolean; onClose: () => void; currentProjectId: string | null; onLoad: (id: string) => void; onNew: () => void; }) {
  const _list = useServerFn(listProjects);
  const _del = useServerFn(deleteProject);
  const [data, setData] = useState<{ owned: any[]; shared: any[] }>({ owned: [], shared: [] });
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await _list({});
      setData(r as any);
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
    setLoading(false);
  };

  useEffect(() => { if (open) void refresh(); /* eslint-disable-next-line */ }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Your projects</DialogTitle>
          <DialogDescription>Open a saved project or start fresh.</DialogDescription>
        </DialogHeader>
        <button onClick={onNew} className="flex w-full items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm hover:bg-accent">
          <Plus className="h-4 w-4" /> New empty workspace
        </button>
        <div className="max-h-80 space-y-1 overflow-auto">
          {loading && <p className="p-2 text-xs text-muted-foreground">Loading…</p>}
          {data.owned.map((p) => (
            <div key={p.id} className={`flex items-center justify-between rounded p-2 text-sm hover:bg-accent ${currentProjectId === p.id ? "bg-accent" : ""}`}>
              <button onClick={() => onLoad(p.id)} className="min-w-0 flex-1 truncate text-left">
                <div className="truncate font-medium">{p.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">Updated {new Date(p.updated_at).toLocaleString()}</div>
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Delete "${p.name}"?`)) return;
                  await _del({ data: { projectId: p.id } });
                  toast.success("Deleted");
                  void refresh();
                }}
                className="ml-2 rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
              ><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {data.shared.length > 0 && (
            <>
              <div className="px-2 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">Shared with you</div>
              {data.shared.map((p) => (
                <button key={p.id} onClick={() => onLoad(p.id)} className="block w-full truncate rounded p-2 text-left text-sm hover:bg-accent">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="truncate text-[10px] text-muted-foreground">Collaborator</div>
                </button>
              ))}
            </>
          )}
          {!loading && data.owned.length === 0 && data.shared.length === 0 && (
            <p className="p-3 text-center text-xs text-muted-foreground">No projects yet — click Save to create one.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string | null }) {
  const _load = useServerFn(loadProject);
  const _vis = useServerFn(setProjectVisibility);
  const _rot = useServerFn(rotateProjectTokens);
  const [project, setProject] = useState<any>(null);

  const refresh = async () => {
    if (!projectId) return;
    const r = await _load({ data: { projectId } });
    setProject(r.project);
  };
  useEffect(() => { if (open && projectId) void refresh(); /* eslint-disable-next-line */ }, [open, projectId]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = project?.share_token ? `${origin}/s/${project.share_token}` : "";
  const collabUrl = project?.collab_token ? `${origin}/join/${project.collab_token}` : "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>Send a read-only link or invite collaborators to edit live.</DialogDescription>
        </DialogHeader>
        {!project ? <p className="text-xs text-muted-foreground">Loading…</p> : (
          <div className="space-y-5">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Public read-only link</h3>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox" checked={!!project.is_public}
                    onChange={async (e) => {
                      await _vis({ data: { projectId: project.id, isPublic: e.target.checked } });
                      void refresh();
                    }}
                  /> Public
                </label>
              </div>
              <CopyRow url={shareUrl} disabled={!project.is_public} />
              <button
                onClick={async () => { await _rot({ data: { projectId: project.id, rotateShare: true, rotateCollab: false } }); void refresh(); toast.success("New share link generated"); }}
                className="mt-2 text-[11px] text-muted-foreground hover:text-foreground"
              >Regenerate link</button>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Live collaboration invite</h3>
              <p className="mb-2 text-[11px] text-muted-foreground">Anyone with this link must sign in and will become an editor.</p>
              <CopyRow url={collabUrl} />
              <button
                onClick={async () => { await _rot({ data: { projectId: project.id, rotateShare: false, rotateCollab: true } }); void refresh(); toast.success("New invite link generated"); }}
                className="mt-2 text-[11px] text-muted-foreground hover:text-foreground"
              >Regenerate invite</button>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CopyRow({ url, disabled }: { url: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`flex items-center gap-1 rounded-md border border-border bg-background p-1 ${disabled ? "opacity-50" : ""}`}>
      <input readOnly value={url} className="min-w-0 flex-1 bg-transparent px-2 py-1 font-mono text-[11px] outline-none" />
      <button
        disabled={disabled || !url}
        onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
