import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { useIDE } from "@/lib/ide/store";
import { RotateCw, ExternalLink, Smartphone, Monitor, Tablet, FileCode, FileText, Globe, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PreviewMode = "html" | "markdown";

function buildMarkdownHtml(body: string, dark: boolean): string {
  const html = marked.parse(body || "", { breaks: true, gfm: true }) as string;
  const bg = dark ? "#1e1e1e" : "#ffffff";
  const fg = dark ? "#d4d4d4" : "#1f2328";
  const muted = dark ? "#9ca3af" : "#57606a";
  const border = dark ? "#2d2d2d" : "#d0d7de";
  const codeBg = dark ? "#0d1117" : "#f6f8fa";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:820px;margin:0 auto;padding:32px;color:${fg};background:${bg};}
    h1,h2,h3,h4{font-weight:600;line-height:1.25;margin:24px 0 12px;}
    h1{font-size:2em;border-bottom:1px solid ${border};padding-bottom:6px;}
    h2{font-size:1.5em;border-bottom:1px solid ${border};padding-bottom:6px;}
    a{color:#3b82f6;text-decoration:none;} a:hover{text-decoration:underline;}
    code{background:${codeBg};padding:2px 6px;border-radius:4px;font-family:ui-monospace,Menlo,monospace;font-size:.9em;}
    pre{background:${codeBg};padding:12px;border-radius:6px;overflow:auto;}
    pre code{background:transparent;padding:0;}
    blockquote{border-left:3px solid ${border};color:${muted};padding:0 12px;margin:12px 0;}
    table{border-collapse:collapse;margin:12px 0;}
    th,td{border:1px solid ${border};padding:6px 12px;}
    img{max-width:100%;}
    hr{border:none;border-top:1px solid ${border};margin:24px 0;}
  </style></head><body>${html}</body></html>`;
}

function buildPreviewHtml(files: Record<string, { id: string; name: string; type: string; content?: string }>): string {
  const index = files["/index.html"];
  if (!index || index.type !== "file") {
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;color:#666">
      <h2>No <code>/index.html</code></h2>
      <p>Create an <code>index.html</code> at the root to see a live preview.</p>
    </body></html>`;
  }
  let html = index.content ?? "";

  // Inline CSS link tags pointing to project files
  html = html.replace(/<link[^>]*href=["']([^"']+)["'][^>]*>/gi, (m, href) => {
    if (/^https?:\/\//.test(href)) return m;
    const path = href.startsWith("/") ? href : `/${href}`;
    const f = files[path];
    if (f && f.type === "file") {
      return `<style>\n${f.content ?? ""}\n</style>`;
    }
    return m;
  });

  // Inline script src tags
  html = html.replace(/<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (m, src) => {
    if (/^https?:\/\//.test(src)) return m;
    const path = src.startsWith("/") ? src : `/${src}`;
    const f = files[path];
    if (f && f.type === "file") {
      return `<script>\n${f.content ?? ""}\n<\/script>`;
    }
    return m;
  });

  return html;
}

type Device = "desktop" | "tablet" | "mobile";
const sizes: Record<Device, { w: number; h: number }> = {
  desktop: { w: 0, h: 0 },
  tablet: { w: 768, h: 1024 },
  mobile: { w: 390, h: 844 },
};

export function PreviewPane() {
  const files = useIDE((s) => s.files);
  const activeTab = useIDE((s) => s.activeTab);
  const theme = useIDE((s) => s.theme);
  const [device, setDevice] = useState<Device>("desktop");
  const [nonce, setNonce] = useState(0);
  const [liveOpen, setLiveOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [swReady, setSwReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const check = () => setSwReady(!!navigator.serviceWorker.controller);
    check();
    navigator.serviceWorker.addEventListener("controllerchange", check);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", check);
  }, []);

  const active = activeTab ? files[activeTab] : null;
  const isMarkdown = !!active && active.type === "file" && /\.mdx?$/i.test(active.name);
  const [modeOverride, setModeOverride] = useState<PreviewMode | null>(null);
  const mode: PreviewMode = modeOverride ?? (isMarkdown ? "markdown" : "html");

  const srcDoc = useMemo(() => {
    if (mode === "markdown" && active && active.type === "file") {
      return buildMarkdownHtml(active.content ?? "", theme === "dark");
    }
    return buildPreviewHtml(files);
  }, [mode, files, active, theme]);

  useEffect(() => { /* hot reload via memo */ }, [srcDoc]);

  const liveUrl = typeof window !== "undefined" ? `${window.location.origin}/__live/index.html` : "";

  const openInNewTab = () => {
    if (swReady) {
      window.open(liveUrl, "_blank", "noopener");
      return;
    }
    const blob = new Blob([srcDoc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const copyLiveUrl = async () => {
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-titlebar">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold uppercase tracking-wider text-muted-foreground">{mode === "markdown" ? "Markdown" : "Preview"}</span>
          {isMarkdown && (
            <div className="flex items-center gap-0.5 rounded border border-border">
              <button
                onClick={() => setModeOverride("markdown")}
                className={cn("grid h-5 w-6 place-items-center text-muted-foreground hover:text-foreground", mode === "markdown" && "bg-accent text-foreground")}
                title="Render markdown"
              ><FileText className="h-3 w-3" /></button>
              <button
                onClick={() => setModeOverride("html")}
                className={cn("grid h-5 w-6 place-items-center text-muted-foreground hover:text-foreground", mode === "html" && "bg-accent text-foreground")}
                title="Live HTML preview"
              ><FileCode className="h-3 w-3" /></button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(["desktop", "tablet", "mobile"] as Device[]).map((d) => {
            const Icon = d === "desktop" ? Monitor : d === "tablet" ? Tablet : Smartphone;
            return (
              <button
                key={d}
                onClick={() => setDevice(d)}
                title={d}
                className={cn(
                  "grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
                  device === d && "bg-accent text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
          <div className="mx-1 h-4 w-px bg-border" />
          <button onClick={() => setNonce((n) => n + 1)} title="Reload" className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button onClick={openInNewTab} title="Open in new tab" className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="grid flex-1 place-items-center overflow-auto bg-[color-mix(in_oklab,var(--color-background)_70%,black_30%)] p-3">
        <iframe
          key={nonce}
          ref={iframeRef}
          srcDoc={srcDoc}
          title="preview"
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
          className="h-full w-full rounded border border-border bg-white shadow-lg"
          style={device === "desktop" ? undefined : { width: sizes[device].w, height: sizes[device].h, maxHeight: "100%" }}
        />
      </div>
    </div>
  );
}
