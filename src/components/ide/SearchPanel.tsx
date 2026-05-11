import { useState, useMemo } from "react";
import { useIDE } from "@/lib/ide/store";
import { Search } from "lucide-react";

export function SearchPanel() {
  const files = useIDE((s) => s.files);
  const openFile = useIDE((s) => s.openFile);
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    if (!q.trim()) return [];
    const needle = q.toLowerCase();
    const out: { id: string; line: number; text: string }[] = [];
    for (const f of Object.values(files)) {
      if (f.type !== "file" || !f.content) continue;
      const lines = f.content.split("\n");
      lines.forEach((ln, i) => {
        if (ln.toLowerCase().includes(needle)) {
          out.push({ id: f.id, line: i + 1, text: ln.trim().slice(0, 120) });
        }
      });
    }
    return out.slice(0, 200);
  }, [files, q]);

  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Search</div>
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded border border-border bg-background px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search across files…"
            className="h-7 flex-1 bg-transparent text-xs outline-none"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto text-xs">
        {results.map((r, i) => (
          <button
            key={i}
            onClick={() => openFile(r.id)}
            className="block w-full px-3 py-1 text-left hover:bg-accent/40"
          >
            <div className="truncate text-muted-foreground">{r.id}:{r.line}</div>
            <div className="truncate font-mono">{r.text}</div>
          </button>
        ))}
        {q && results.length === 0 && (
          <div className="px-3 py-2 text-muted-foreground">No matches.</div>
        )}
      </div>
    </div>
  );
}
