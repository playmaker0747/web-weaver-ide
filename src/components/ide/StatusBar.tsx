import { useIDE } from "@/lib/ide/store";
import { languageFromFilename } from "@/lib/ide/language";
import { GitBranch, Bell, Check, Users } from "lucide-react";
import { useWorkspacePresence, getIdentity } from "@/lib/ide/collab";
import { useMemo } from "react";

export function StatusBar() {
  const activeTab = useIDE((s) => s.activeTab);
  const files = useIDE((s) => s.files);
  const f = activeTab ? files[activeTab] : null;
  const lang = f ? languageFromFilename(f.name) : "—";
  const lines = f?.content?.split("\n").length ?? 0;
  const presence = useWorkspacePresence([]);
  const me = useMemo(() => (typeof window !== "undefined" ? getIdentity() : null), []);
  const totalPeers = useMemo(() => {
    const seen = new Set<string>();
    for (const arr of Object.values(presence)) for (const p of arr) seen.add(p.id);
    return seen.size;
  }, [presence]);
  return (
    <div className="flex h-6 shrink-0 items-center justify-between bg-statusbar px-3 text-[11px] text-statusbar-foreground">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" /> main</span>
        <span className="flex items-center gap-1"><Check className="h-3 w-3" /> 0 errors, 0 warnings</span>
        <span className="flex items-center gap-1" title="Live collaborators online">
          <Users className="h-3 w-3" />
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
          {totalPeers + 1} online
        </span>
        {me && (
          <span className="flex items-center gap-1" title="Your collab identity">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: me.color }} />
            {me.name}
          </span>
        )}
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
