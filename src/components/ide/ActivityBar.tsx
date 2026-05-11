import { Files, Search, Puzzle, Settings, Sun, Moon, Terminal as TerminalIcon, Eye } from "lucide-react";
import { useIDE, type PanelId } from "@/lib/ide/store";
import { cn } from "@/lib/utils";

const items: { id: PanelId; icon: typeof Files; label: string }[] = [
  { id: "explorer", icon: Files, label: "Explorer" },
  { id: "search", icon: Search, label: "Search" },
  { id: "extensions", icon: Puzzle, label: "Extensions" },
  { id: "settings", icon: Settings, label: "Settings" },
];

export function ActivityBar() {
  const activePanel = useIDE((s) => s.activePanel);
  const setActivePanel = useIDE((s) => s.setActivePanel);
  const theme = useIDE((s) => s.theme);
  const toggleTheme = useIDE((s) => s.toggleTheme);
  const toggleTerminal = useIDE((s) => s.toggleTerminal);
  const togglePreview = useIDE((s) => s.togglePreview);

  return (
    <div className="flex w-12 flex-col items-center justify-between bg-activitybar py-2 border-r border-border">
      <div className="flex flex-col gap-1">
        {items.map((it) => {
          const Icon = it.icon;
          const active = activePanel === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setActivePanel(it.id)}
              title={it.label}
              className={cn(
                "relative grid h-10 w-10 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground",
                active && "text-foreground",
              )}
            >
              {active && <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-primary" />}
              <Icon className="h-5 w-5" strokeWidth={1.5} />
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1">
        <button
          onClick={togglePreview}
          title="Toggle preview"
          className="grid h-10 w-10 place-items-center rounded text-muted-foreground hover:text-foreground"
        >
          <Eye className="h-5 w-5" strokeWidth={1.5} />
        </button>
        <button
          onClick={toggleTerminal}
          title="Toggle terminal"
          className="grid h-10 w-10 place-items-center rounded text-muted-foreground hover:text-foreground"
        >
          <TerminalIcon className="h-5 w-5" strokeWidth={1.5} />
        </button>
        <button
          onClick={toggleTheme}
          title="Toggle theme"
          className="grid h-10 w-10 place-items-center rounded text-muted-foreground hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-5 w-5" strokeWidth={1.5} /> : <Moon className="h-5 w-5" strokeWidth={1.5} />}
        </button>
      </div>
    </div>
  );
}
