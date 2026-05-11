import { X } from "lucide-react";
import { useIDE } from "@/lib/ide/store";
import { iconForFilename } from "@/lib/ide/language";
import { cn } from "@/lib/utils";

export function Tabs() {
  const openTabs = useIDE((s) => s.openTabs);
  const activeTab = useIDE((s) => s.activeTab);
  const files = useIDE((s) => s.files);
  const setActiveTab = useIDE((s) => s.setActiveTab);
  const closeTab = useIDE((s) => s.closeTab);

  if (openTabs.length === 0) return <div className="h-9 border-b border-border bg-titlebar" />;

  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-titlebar">
      {openTabs.map((id) => {
        const f = files[id];
        if (!f) return null;
        const active = activeTab === id;
        return (
          <div
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "group flex cursor-pointer items-center gap-2 border-r border-border px-3 text-xs",
              active ? "bg-background text-foreground" : "bg-titlebar text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="text-[11px]">{iconForFilename(f.name)}</span>
            <span className="max-w-[160px] truncate">{f.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); closeTab(id); }}
              className="grid h-4 w-4 place-items-center rounded text-muted-foreground opacity-60 hover:bg-accent hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
