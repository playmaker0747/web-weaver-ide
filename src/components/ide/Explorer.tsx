import { useMemo, useState } from "react";
import { ChevronRight, FilePlus, FolderPlus, Trash2, Download, RotateCcw } from "lucide-react";
import { useIDE } from "@/lib/ide/store";
import { iconForFilename } from "@/lib/ide/language";
import type { FileNode } from "@/lib/ide/fs";
import { cn } from "@/lib/utils";
import JSZip from "jszip";

function NodeRow({
  node,
  depth,
  childrenByParent,
}: {
  node: FileNode;
  depth: number;
  childrenByParent: Record<string, FileNode[]>;
}) {
  const expanded = useIDE((s) => !!s.expandedFolders[node.id]);
  const toggleFolder = useIDE((s) => s.toggleFolder);
  const openFile = useIDE((s) => s.openFile);
  const activeTab = useIDE((s) => s.activeTab);
  const renameFile = useIDE((s) => s.renameFile);
  const deleteFile = useIDE((s) => s.deleteFile);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.name);

  const isActive = activeTab === node.id;

  const onClick = () => {
    if (node.type === "folder") toggleFolder(node.id);
    else openFile(node.id);
  };

  const submit = () => {
    setEditing(false);
    if (name && name !== node.name) void renameFile(node.id, name);
    else setName(node.name);
  };

  return (
    <div>
      <div
        onClick={onClick}
        onDoubleClick={() => setEditing(true)}
        className={cn(
          "group flex cursor-pointer items-center gap-1 px-2 py-0.5 text-sm hover:bg-accent/40",
          isActive && "bg-accent text-foreground",
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {node.type === "folder" ? (
          <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", expanded && "rotate-90")} />
        ) : (
          <span className="w-3.5 text-center text-xs">{iconForFilename(node.name)}</span>
        )}
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") { setEditing(false); setName(node.name); }
            }}
            className="h-5 flex-1 rounded border border-primary bg-background px-1 text-xs outline-none"
          />
        ) : (
          <span className="flex-1 truncate">{node.name}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${node.name}?`)) void deleteFile(node.id); }}
          className="invisible h-5 w-5 place-items-center rounded text-muted-foreground hover:text-destructive group-hover:grid"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {node.type === "folder" && expanded && (
        <div>
          {(childrenByParent[node.id] ?? []).map((c) => (
            <NodeRow key={c.id} node={c} depth={depth + 1} childrenByParent={childrenByParent} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Explorer() {
  const files = useIDE((s) => s.files);
  const createFile = useIDE((s) => s.createFile);
  const resetProject = useIDE((s) => s.resetProject);

  const childrenByParent = useMemo(() => {
    const map: Record<string, FileNode[]> = {};
    for (const f of Object.values(files)) {
      (map[f.parentId] ??= []).push(f);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    return map;
  }, [files]);

  const roots = childrenByParent["/"] ?? [];

  const newFile = async () => {
    const name = prompt("New file name (e.g. app.js)");
    if (name) await createFile("/", name, "file");
  };
  const newFolder = async () => {
    const name = prompt("New folder name");
    if (name) await createFile("/", name, "folder");
  };

  const exportZip = async () => {
    const zip = new JSZip();
    for (const f of Object.values(files)) {
      const path = f.id.replace(/^\//, "");
      if (!path) continue;
      if (f.type === "folder") zip.folder(path);
      else zip.file(path, f.content ?? "");
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "codeforge-project.zip";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Explorer</span>
        <div className="flex items-center gap-1">
          <button onClick={newFile} title="New file" className="grid h-6 w-6 place-items-center rounded hover:bg-accent">
            <FilePlus className="h-4 w-4" />
          </button>
          <button onClick={newFolder} title="New folder" className="grid h-6 w-6 place-items-center rounded hover:bg-accent">
            <FolderPlus className="h-4 w-4" />
          </button>
          <button onClick={exportZip} title="Export as ZIP" className="grid h-6 w-6 place-items-center rounded hover:bg-accent">
            <Download className="h-4 w-4" />
          </button>
          <button onClick={() => { if (confirm("Reset project to defaults?")) void resetProject(); }} title="Reset project" className="grid h-6 w-6 place-items-center rounded hover:bg-accent">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {roots.map((n) => (
          <NodeRow key={n.id} node={n} depth={0} childrenByParent={childrenByParent} />
        ))}
        {roots.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground">No files yet. Click the + icon to create one.</div>
        )}
      </div>
    </div>
  );
}
