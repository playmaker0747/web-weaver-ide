import React from "react";
import { AlertTriangle, RefreshCw, Bug } from "lucide-react";

interface State {
  error: Error | null;
  info: React.ErrorInfo | null;
}

export class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[GlobalErrorBoundary]", error, info);
    this.setState({ error, info });
  }

  private reload = () => {
    // Reload the workspace shell. Local IDE state lives in IndexedDB / localStorage
    // and will rehydrate on boot.
    if (typeof window !== "undefined") window.location.reload();
  };

  private report = () => {
    const { error, info } = this.state;
    const body = [
      "## What happened",
      "",
      "_Describe what you were doing when this crashed._",
      "",
      "## Error",
      "```",
      `${error?.name ?? "Error"}: ${error?.message ?? "(no message)"}`,
      "",
      error?.stack ?? "(no stack)",
      "```",
      "",
      "## Component stack",
      "```",
      info?.componentStack ?? "(unavailable)",
      "```",
      "",
      "## Environment",
      `- URL: ${typeof window !== "undefined" ? window.location.href : "n/a"}`,
      `- UA: ${typeof navigator !== "undefined" ? navigator.userAgent : "n/a"}`,
      `- Time: ${new Date().toISOString()}`,
    ].join("\n");

    const url = `https://github.com/lovable-dev/codeforge/issues/new?title=${encodeURIComponent(
      `Crash: ${error?.message?.slice(0, 80) ?? "unknown"}`,
    )}&body=${encodeURIComponent(body)}`;

    if (typeof window !== "undefined") {
      try { window.open(url, "_blank", "noopener"); } catch { /* ignore */ }
      // Also copy details to clipboard as a fallback.
      navigator.clipboard?.writeText(body).catch(() => {});
    }
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-6 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold tracking-tight">CodeForge crashed</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                The workspace hit an unrecoverable error. Your files are saved locally — reloading
                should bring everything back.
              </p>

              <div className="mt-4 rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
                <div className="font-semibold text-destructive">
                  {error.name}: {error.message}
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Stack trace
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-muted-foreground">
{error.stack ?? "(no stack)"}
                  </pre>
                </details>
                {info?.componentStack && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Component stack
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-muted-foreground">
{info.componentStack}
                    </pre>
                  </details>
                )}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={this.reload}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload workspace
                </button>
                <button
                  onClick={this.report}
                  className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <Bug className="h-4 w-4" />
                  Report issue
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
