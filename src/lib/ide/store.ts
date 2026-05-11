import { create } from "zustand";
import {
  DEFAULT_PROJECT,
  type FileNode,
  deleteNode,
  joinPath,
  loadAll,
  parentOf,
  renameNode,
  saveNode,
} from "./fs";

export type PanelId = "explorer" | "search" | "ai" | "extensions" | "settings";

interface IDEState {
  files: Record<string, FileNode>;
  openTabs: string[];
  activeTab: string | null;
  expandedFolders: Record<string, boolean>;
  activePanel: PanelId;
  showTerminal: boolean;
  showPreview: boolean;
  theme: "dark" | "light";
  fontSize: number;
  ready: boolean;

  // actions
  init: () => Promise<void>;
  openFile: (id: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateFileContent: (id: string, content: string) => void;
  createFile: (parentId: string, name: string, type: "file" | "folder") => Promise<string | null>;
  deleteFile: (id: string) => Promise<void>;
  renameFile: (id: string, newName: string) => Promise<void>;
  toggleFolder: (id: string) => void;
  setActivePanel: (p: PanelId) => void;
  toggleTerminal: () => void;
  togglePreview: () => void;
  toggleTheme: () => void;
  setFontSize: (n: number) => void;
  resetProject: () => Promise<void>;
}

const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
function scheduleSave(node: FileNode) {
  clearTimeout(saveTimers[node.id]);
  saveTimers[node.id] = setTimeout(() => {
    void saveNode(node);
  }, 250);
}

export const useIDE = create<IDEState>((set, get) => ({
  files: {},
  openTabs: [],
  activeTab: null,
  expandedFolders: { "/": true },
  activePanel: "explorer",
  showTerminal: true,
  showPreview: true,
  theme: "dark",
  fontSize: 13,
  ready: false,

  init: async () => {
    try {
      let nodes = await loadAll();
      if (nodes.length === 0) {
        nodes = DEFAULT_PROJECT;
        await Promise.all(nodes.map(saveNode));
      }
      const files: Record<string, FileNode> = {};
      for (const n of nodes) files[n.id] = n;
      set({
        files,
        ready: true,
        openTabs: files["/index.html"] ? ["/index.html"] : [],
        activeTab: files["/index.html"] ? "/index.html" : null,
      });
    } catch (e) {
      console.error("[CodeForge] init failed", e);
      // Fallback in-memory project
      const files: Record<string, FileNode> = {};
      for (const n of DEFAULT_PROJECT) files[n.id] = n;
      set({ files, ready: true, openTabs: ["/index.html"], activeTab: "/index.html" });
    }
  },

  openFile: (id) => {
    const f = get().files[id];
    if (!f || f.type !== "file") return;
    set((s) => ({
      openTabs: s.openTabs.includes(id) ? s.openTabs : [...s.openTabs, id],
      activeTab: id,
    }));
  },

  closeTab: (id) => {
    set((s) => {
      const idx = s.openTabs.indexOf(id);
      if (idx === -1) return s;
      const next = s.openTabs.filter((t) => t !== id);
      let active = s.activeTab;
      if (active === id) active = next[idx] ?? next[idx - 1] ?? null;
      return { openTabs: next, activeTab: active };
    });
  },

  setActiveTab: (id) => set({ activeTab: id }),

  updateFileContent: (id, content) => {
    set((s) => {
      const f = s.files[id];
      if (!f) return s;
      const updated: FileNode = { ...f, content, updatedAt: Date.now() };
      scheduleSave(updated);
      return { files: { ...s.files, [id]: updated } };
    });
  },

  createFile: async (parentId, name, type) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const id = joinPath(parentId, trimmed);
    if (get().files[id]) return null;
    const node: FileNode = {
      id,
      parentId,
      name: trimmed,
      type,
      content: type === "file" ? "" : undefined,
      updatedAt: Date.now(),
    };
    await saveNode(node);
    set((s) => ({
      files: { ...s.files, [id]: node },
      expandedFolders: type === "folder" ? { ...s.expandedFolders, [id]: true } : s.expandedFolders,
    }));
    if (type === "file") get().openFile(id);
    return id;
  },

  deleteFile: async (id) => {
    await deleteNode(id);
    set((s) => {
      const files = { ...s.files };
      for (const k of Object.keys(files)) {
        if (k === id || k.startsWith(id + "/")) delete files[k];
      }
      const openTabs = s.openTabs.filter((t) => files[t]);
      const activeTab = openTabs.includes(s.activeTab ?? "") ? s.activeTab : openTabs[0] ?? null;
      return { files, openTabs, activeTab };
    });
  },

  renameFile: async (id, newName) => {
    const node = get().files[id];
    if (!node) return;
    const newId = joinPath(parentOf(id), newName);
    if (get().files[newId]) return;
    await renameNode(id, newId);
    const nodes = await loadAll();
    const files: Record<string, FileNode> = {};
    for (const n of nodes) files[n.id] = n;
    set((s) => ({
      files,
      openTabs: s.openTabs.map((t) => (t === id ? newId : t.startsWith(id + "/") ? t.replace(id, newId) : t)),
      activeTab: s.activeTab === id ? newId : s.activeTab,
    }));
  },

  toggleFolder: (id) =>
    set((s) => ({ expandedFolders: { ...s.expandedFolders, [id]: !s.expandedFolders[id] } })),

  setActivePanel: (p) => set({ activePanel: p }),
  toggleTerminal: () => set((s) => ({ showTerminal: !s.showTerminal })),
  togglePreview: () => set((s) => ({ showPreview: !s.showPreview })),
  toggleTheme: () =>
    set((s) => {
      const theme = s.theme === "dark" ? "light" : "dark";
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("light", theme === "light");
        document.documentElement.classList.toggle("dark", theme === "dark");
      }
      return { theme };
    }),
  setFontSize: (n) => set({ fontSize: Math.max(10, Math.min(24, n)) }),

  resetProject: async () => {
    const all = await loadAll();
    await Promise.all(all.map((n) => deleteNode(n.id)));
    await Promise.all(DEFAULT_PROJECT.map(saveNode));
    const files: Record<string, FileNode> = {};
    for (const n of DEFAULT_PROJECT) files[n.id] = n;
    set({ files, openTabs: ["/index.html"], activeTab: "/index.html" });
  },
}));
