import { useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useIDE } from "@/lib/ide/store";
import { ActivityBar } from "./ActivityBar";
import { Explorer } from "./Explorer";
import { SearchPanel } from "./SearchPanel";
import { ExtensionsPanel, SettingsPanel } from "./SidebarPanels";
import { AIAssistant } from "./AIAssistant";
import { Tabs } from "./Tabs";
import { EditorPane } from "./EditorPane";
import { PreviewPane } from "./PreviewPane";
import { TerminalPane } from "./TerminalPane";
import { StatusBar } from "./StatusBar";
import { TitleBar } from "./TitleBar";
import { CommandPalette } from "./CommandPalette";

function SidebarBody() {
  const panel = useIDE((s) => s.activePanel);
  if (panel === "explorer") return <Explorer />;
  if (panel === "search") return <SearchPanel />;
  if (panel === "ai") return <AIAssistant />;
  if (panel === "extensions") return <ExtensionsPanel />;
  return <SettingsPanel />;
}

const HANDLE = "codeforge-resizer relative bg-border hover:bg-primary transition-colors data-[resize-handle-state=drag]:bg-primary";

export function IDELayout() {
  const init = useIDE((s) => s.init);
  const ready = useIDE((s) => s.ready);
  const showPreview = useIDE((s) => s.showPreview);
  const showTerminal = useIDE((s) => s.showTerminal);
  const toggleTerminal = useIDE((s) => s.toggleTerminal);
  const [showSidebar, setShowSidebar] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => { void init(); }, [init]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); }
      else if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); setShowSidebar((v) => !v); }
      else if (mod && e.key.toLowerCase() === "j") { e.preventDefault(); toggleTerminal(); }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); /* auto-saved */ }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTerminal]);

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

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar onOpenPalette={() => setPaletteOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        <PanelGroup direction="horizontal" className="flex-1">
          {showSidebar && (
            <>
              <Panel defaultSize={18} minSize={12} maxSize={40} className="min-w-0">
                <SidebarBody />
              </Panel>
              <PanelResizeHandle className={`w-px ${HANDLE}`} />
            </>
          )}
          <Panel minSize={20} className="min-w-0">
            <PanelGroup direction="vertical">
              <Panel minSize={20} className="min-h-0">
                <PanelGroup direction="horizontal">
                  <Panel minSize={20} className="min-w-0">
                    <div className="flex h-full flex-col">
                      <Tabs />
                      <EditorPane />
                    </div>
                  </Panel>
                  {showPreview && (
                    <>
                      <PanelResizeHandle className={`w-px ${HANDLE}`} />
                      <Panel defaultSize={40} minSize={20} className="min-w-0">
                        <PreviewPane />
                      </Panel>
                    </>
                  )}
                </PanelGroup>
              </Panel>
              {showTerminal && (
                <>
                  <PanelResizeHandle className={`h-px ${HANDLE}`} />
                  <Panel defaultSize={28} minSize={10} className="min-h-0">
                    <TerminalPane />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
      <StatusBar />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
