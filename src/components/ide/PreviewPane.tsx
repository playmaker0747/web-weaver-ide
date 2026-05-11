import { useEffect, useMemo, useRef, useState } from "react";
import { useIDE } from "@/lib/ide/store";
import { RotateCw, ExternalLink, Smartphone, Monitor, Tablet } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [device, setDevice] = useState<Device>("desktop");
  const [nonce, setNonce] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const srcDoc = useMemo(() => buildPreviewHtml(files), [files]);

  // Hot reload: debounce already happens via React render of files map
  useEffect(() => {
    // no-op; included to satisfy hot-reload semantics
  }, [srcDoc]);

  const openInNewTab = () => {
    const blob = new Blob([srcDoc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  return (
    <div className="flex h-full w-full flex-col bg-titlebar">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-2 text-xs">
        <div className="font-semibold uppercase tracking-wider text-muted-foreground">Preview</div>
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
