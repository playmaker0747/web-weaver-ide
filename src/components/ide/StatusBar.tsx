import { useIDE } from "@/lib/ide/store";
import { languageFromFilename } from "@/lib/ide/language";
import { GitBranch, Bell, Check, Users, Bug, Wifi, WifiOff, Loader2 } from "lucide-react";
import {
  useWorkspacePresence,
  useWorkspaceStatus,
  getIdentity,
  isDebugEnabled,
  setDebugEnabled,
  type RealtimeStatus,
} from "@/lib/ide/collab";
import { useMemo, useState } from "react";
import { useOnlineStatus } from "@/hooks/use-online-status";

const STATUS_META: Record<RealtimeStatus, { label: string; color: string; Icon: typeof Wifi }> = {
  idle:        { label: "Realtime: idle",        color: "bg-muted-foreground", Icon: WifiOff },
  connecting:  { label: "Realtime: connecting…", color: "bg-amber-400",        Icon: Loader2 },
  subscribed:  { label: "Realtime: connected",   color: "bg-green-400",        Icon: Wifi },
  closed:      { label: "Realtime: closed",      color: "bg-muted-foreground", Icon: WifiOff },
  error:       { label: "Realtime: error",       color: "bg-red-500",          Icon: WifiOff },
  timed_out:   { label: "Realtime: timed out",   color: "bg-red-500",          Icon: WifiOff },
};

export function StatusBar() {
  const activeTab = useIDE((s) => s.activeTab);
  const files = useIDE((s) => s.files);
  const f = activeTab ? files[activeTab] : null;
  const lang = f ? languageFromFilename(f.name) : "—";
  const lines = f?.content?.split("\n").length ?? 0;
  const presence = useWorkspacePresence([]);
  const status = useWorkspaceStatus();
  const me = useMemo(() => (typeof window !== "undefined" ? getIdentity() : null), []);
  const [debug, setDebug] = useState(() => isDebugEnabled());
  const online = useOnlineStatus();
  const totalPeers = useMemo(() => {
    const seen = new Set<string>();
    for (const arr of Object.values(presence)) for (const p of arr) seen.add(p.id);
    return seen.size;
  }, [presence]);

  const meta = STATUS_META[status];
  const StatusIcon = meta.Icon;

  return (
    <div className="flex h-6 shrink-0 items-center justify-between bg-statusbar px-3 text-[11px] text-statusbar-foreground">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" /> main</span>
        <span className="flex items-center gap-1" title={online ? "Online" : "Offline — your work is saved locally"}>
          {online ? <Wifi className="h-3 w-3 text-green-400" /> : <WifiOff className="h-3 w-3 text-amber-400" />}
          {online ? "online" : "offline"}
        </span>
        <span className="flex items-center gap-1"><Check className="h-3 w-3" /> 0 errors, 0 warnings</span>
        <span className="flex items-center gap-1" title={meta.label}>
          <StatusIcon className={`h-3 w-3 ${status === "connecting" ? "animate-spin" : ""}`} />
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.color}`} />
          <span className="capitalize">{status === "subscribed" ? "live" : status.replace("_", " ")}</span>
        </span>
        <span className="flex items-center gap-1" title="Live collaborators online">
          <Users className="h-3 w-3" />
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
        <button
          onClick={() => { const next = !debug; setDebugEnabled(next); setDebug(next); }}
          className={`flex items-center gap-1 rounded px-1.5 py-px transition-colors ${
            debug ? "bg-amber-400/20 text-amber-300" : "hover:bg-accent"
          }`}
          title="Toggle realtime debug logging (writes to browser console)"
        >
          <Bug className="h-3 w-3" />
          {debug ? "DEBUG ON" : "DEBUG"}
        </button>
        <span>{f ? `${lines} lines` : ""}</span>
        <span>UTF-8</span>
        <span>LF</span>
        <span className="uppercase">{lang}</span>
        <span className="flex items-center gap-1"><Bell className="h-3 w-3" /></span>
      </div>
    </div>
  );
}
