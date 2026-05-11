import { useIDE } from "@/lib/ide/store";
import { languageFromFilename } from "@/lib/ide/language";
import { GitBranch, Bell, Check } from "lucide-react";

export function StatusBar() {
  const activeTab = useIDE((s) => s.activeTab);
  const files = useIDE((s) => s.files);
  const f = activeTab ? files[activeTab] : null;
  const lang = f ? languageFromFilename(f.name) : "—";
  const lines = f?.content?.split("\n").length ?? 0;
  return (
    <div className="flex h-6 shrink-0 items-center justify-between bg-statusbar px-3 text-[11px] text-statusbar-foreground">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" /> main</span>
        <span className="flex items-center gap-1"><Check className="h-3 w-3" /> 0 errors, 0 warnings</span>
      </div>
      <div className="flex items-center gap-3">
        <span>{f ? `${lines} lines` : ""}</span>
        <span>UTF-8</span>
        <span>LF</span>
        <span className="uppercase">{lang}</span>
        <span className="flex items-center gap-1"><Bell className="h-3 w-3" /></span>
      </div>
    </div>
  );
}
