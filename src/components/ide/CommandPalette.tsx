import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useIDE } from "@/lib/ide/store";
import { iconForFilename } from "@/lib/ide/language";

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const files = useIDE((s) => s.files);
  const openFile = useIDE((s) => s.openFile);
  const toggleTerminal = useIDE((s) => s.toggleTerminal);
  const togglePreview = useIDE((s) => s.togglePreview);
  const toggleTheme = useIDE((s) => s.toggleTheme);
  const createFile = useIDE((s) => s.createFile);
  const resetProject = useIDE((s) => s.resetProject);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => { if (open) { setQ(""); setIdx(0); } }, [open]);

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [
      { id: "cmd:terminal", label: "View: Toggle Terminal", hint: "⌘J", run: () => { toggleTerminal(); onClose(); } },
      { id: "cmd:preview", label: "View: Toggle Preview", run: () => { togglePreview(); onClose(); } },
      { id: "cmd:theme", label: "Preferences: Toggle Theme", run: () => { toggleTheme(); onClose(); } },
      { id: "cmd:new", label: "File: New File…", run: async () => { const n = prompt("File name"); if (n) await createFile("/", n, "file"); onClose(); } },
      { id: "cmd:reset", label: "Workspace: Reset to defaults", run: async () => { if (confirm("Reset project?")) await resetProject(); onClose(); } },
    ];
    const fileCmds: Command[] = Object.values(files)
      .filter((f) => f.type === "file")
      .map((f) => ({
        id: `open:${f.id}`,
        label: f.name,
        hint: f.id,
        run: () => { openFile(f.id); onClose(); },
      }));
    return [...cmds, ...fileCmds];
  }, [files, openFile, toggleTerminal, togglePreview, toggleTheme, createFile, resetProject, onClose]);

  const filtered = useMemo(() => {
    if (!q.trim()) return commands;
    const needle = q.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(needle) || c.hint?.toLowerCase().includes(needle));
  }, [commands, q]);

  useEffect(() => { setIdx(0); }, [q]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]"
        >
          <motion.div
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[640px] max-w-[90vw] overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"
          >
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(filtered.length - 1, i + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
                else if (e.key === "Enter") { filtered[idx]?.run(); }
                else if (e.key === "Escape") { onClose(); }
              }}
              placeholder="Type a command or file name…"
              className="block w-full bg-transparent px-4 py-3 text-sm outline-none"
            />
            <div className="max-h-[50vh] overflow-y-auto border-t border-border">
              {filtered.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">No matches</div>
              )}
              {filtered.map((c, i) => {
                const isFile = c.id.startsWith("open:");
                const fname = isFile ? c.label : "";
                return (
                  <button
                    key={c.id}
                    onMouseEnter={() => setIdx(i)}
                    onClick={() => c.run()}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${i === idx ? "bg-accent text-accent-foreground" : "hover:bg-accent/40"}`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {isFile && <span className="text-xs">{iconForFilename(fname)}</span>}
                      <span className="truncate">{c.label}</span>
                    </span>
                    {c.hint && <span className="shrink-0 text-[10px] text-muted-foreground">{c.hint}</span>}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
