import { useState, useEffect } from "react";
import { useIDE } from "@/lib/ide/store";
import { useIsMobile } from "@/hooks/use-mobile";
import { Files, Code2, Eye, Terminal as TerminalIcon, Command, Sun, Moon } from "lucide-react";

import { Explorer } from "./Explorer";
import { Tabs } from "./Tabs";
import { EditorPane } from "./EditorPane";
import { PreviewPane } from "./PreviewPane";
import { TerminalPane } from "./TerminalPane";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";
import { cn } from "@/lib/utils";

type View = "files" | "editor" | "preview" | "terminal";

export function MobileLayout() {
  const init = useIDE((s) => s.init);
  const ready = useIDE((s) => s.ready);
  const theme = useIDE((s) => s.theme);
  const toggleTheme = useIDE((s) => s.toggleTheme);
  const activeTab = useIDE((s) => s.activeTab);
  const [view, setView] = useState<View>("files");
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => { void init(); }, [init]);

  // Auto-switch to editor when a file is opened on mobile
  useEffect(() => {
    if (activeTab && view === "files") setView("editor");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  if (!ready) {
    return (
      <div className="grid h-screen w-screen place-items-center bg-background text-muted-foreground">
        <div className="text-center">
          <div className="text-3xl">⚒️</div>
          <div className="mt-2 text-sm">Loading CodeForge…</div>
        </div>
      </div>
    );
  }

  const tabs: { id: View; label: string; icon: typeof Files }[] = [
    { id: "files", label: "Files", icon: Files },
    { id: "editor", label: "Editor", icon: Code2 },
    { id: "preview", label: "Preview", icon: Eye },
    { id: "terminal", label: "Run", icon: TerminalIcon },
  ];

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="flex h-10 shrink-0 items-center justify-between bg-titlebar px-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded bg-primary text-primary-foreground text-[10px]">⚒</span>
          <span className="font-semibold">CodeForge</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setPaletteOpen(true)} className="grid h-7 w-7 place-items-center rounded hover:bg-accent">
            <Command className="h-4 w-4" />
          </button>
          <button onClick={toggleTheme} className="grid h-7 w-7 place-items-center rounded hover:bg-accent">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {view === "files" && <Explorer />}
        {view === "editor" && (
          <div className="flex h-full flex-col">
            <Tabs />
            <EditorPane />
          </div>
        )}
        {view === "preview" && <PreviewPane />}
        {view === "terminal" && <TerminalPane />}
      </div>

      <nav className="flex h-12 shrink-0 items-stretch border-t border-border bg-titlebar">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = view === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      <StatusBar />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

export function ResponsiveIDE({ Desktop }: { Desktop: React.ComponentType }) {
  const isMobile = useIsMobile();
  return isMobile ? <MobileLayout /> : <Desktop />;
}
