import { Command } from "lucide-react";

export function TitleBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between bg-titlebar px-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded bg-primary text-primary-foreground text-[10px]">⚒</span>
        <span className="font-semibold tracking-tight">CodeForge</span>
        <span className="text-muted-foreground">— Browser IDE</span>
      </div>
      <button
        onClick={onOpenPalette}
        className="flex items-center gap-2 rounded border border-border bg-background/40 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <Command className="h-3 w-3" />
        <span>Search files & commands</span>
        <span className="ml-2 rounded border border-border px-1 py-px text-[10px]">⌘K</span>
      </button>
      <div className="w-[100px]" />
    </div>
  );
}
