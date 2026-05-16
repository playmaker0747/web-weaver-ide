import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { loadPublicProject } from "@/lib/projects.functions";
import Editor, { loader } from "@monaco-editor/react";
import { languageFromFilename } from "@/lib/ide/language";

loader.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs" } });

export const Route = createFileRoute("/s/$token")({
  component: SharePage,
  head: () => ({ meta: [{ title: "Shared project — CodeForge" }] }),
});

type FileRow = { path: string; name: string; type: string; content: string | null };

function SharePage() {
  const { token } = Route.useParams();
  const load = useServerFn(loadPublicProject);
  const [data, setData] = useState<{ project: any; files: FileRow[] } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    load({ data: { token } })
      .then((res) => {
        setData(res as any);
        const first = (res as any).files.find((f: FileRow) => f.type === "file");
        setActive(first?.path ?? null);
      })
      .catch((e) => setErr(e.message ?? "Failed to load"));
  }, [load, token]);

  if (err) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-foreground">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Link unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{err}</p>
          <Link to="/" className="mt-4 inline-block text-sm text-primary underline">Open CodeForge</Link>
        </div>
      </div>
    );
  }
  if (!data) return <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">Loading…</div>;

  const file = data.files.find((f) => f.path === active);

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="flex h-10 items-center justify-between border-b border-border bg-titlebar px-3 text-xs">
        <div className="flex items-center gap-2 truncate">
          <span className="grid h-5 w-5 place-items-center rounded bg-primary text-primary-foreground text-[10px]">⚒</span>
          <span className="font-semibold">{data.project.name}</span>
          <span className="text-muted-foreground">— read-only share</span>
        </div>
        <Link to="/" className="rounded border border-border px-2 py-1 text-[11px] hover:bg-accent">Open CodeForge</Link>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 overflow-auto border-r border-border p-2 text-xs">
          {data.files.filter((f) => f.type === "file").map((f) => (
            <button
              key={f.path}
              onClick={() => setActive(f.path)}
              className={`block w-full truncate rounded px-2 py-1 text-left hover:bg-accent ${active === f.path ? "bg-accent text-foreground" : "text-muted-foreground"}`}
            >
              {f.path}
            </button>
          ))}
        </aside>
        <main className="min-w-0 flex-1">
          {file ? (
            <Editor
              height="100%"
              path={file.path}
              value={file.content ?? ""}
              language={languageFromFilename(file.name)}
              theme="vs-dark"
              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, automaticLayout: true }}
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">No file selected</div>
          )}
        </main>
      </div>
    </div>
  );
}
