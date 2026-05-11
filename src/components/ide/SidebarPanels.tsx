import { useIDE } from "@/lib/ide/store";

export function ExtensionsPanel() {
  const items = [
    { name: "Prettier", desc: "Code formatter", installed: true },
    { name: "GitLens", desc: "Git supercharged", installed: false },
    { name: "Live Share", desc: "Real-time collaboration", installed: false },
    { name: "ESLint", desc: "JavaScript linting", installed: true },
    { name: "Path Intellisense", desc: "Autocomplete filenames", installed: false },
  ];
  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Extensions</div>
      <div className="flex-1 overflow-y-auto px-2">
        {items.map((it) => (
          <div key={it.name} className="mb-2 rounded border border-border bg-background/40 p-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{it.name}</div>
              <button className="rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                {it.installed ? "Installed" : "Install"}
              </button>
            </div>
            <div className="text-xs text-muted-foreground">{it.desc}</div>
          </div>
        ))}
        <p className="px-1 pt-2 text-[10px] text-muted-foreground">Marketplace coming soon.</p>
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const fontSize = useIDE((s) => s.fontSize);
  const setFontSize = useIDE((s) => s.setFontSize);
  const theme = useIDE((s) => s.theme);
  const toggleTheme = useIDE((s) => s.toggleTheme);
  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Settings</div>
      <div className="flex-1 overflow-y-auto px-3 py-2 text-sm space-y-4">
        <label className="block">
          <div className="mb-1 text-xs text-muted-foreground">Theme</div>
          <button onClick={toggleTheme} className="w-full rounded border border-border bg-background px-2 py-1 text-left">
            {theme === "dark" ? "Dark" : "Light"}
          </button>
        </label>
        <label className="block">
          <div className="mb-1 text-xs text-muted-foreground">Editor font size ({fontSize}px)</div>
          <input
            type="range"
            min={10}
            max={22}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </label>
        <div className="rounded border border-border bg-background/40 p-2 text-xs text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">Shortcuts</div>
          <div>Cmd/Ctrl + K — Command palette</div>
          <div>Cmd/Ctrl + S — Save (auto-saved)</div>
          <div>Cmd/Ctrl + B — Toggle sidebar</div>
          <div>Cmd/Ctrl + J — Toggle terminal</div>
        </div>
      </div>
    </div>
  );
}
