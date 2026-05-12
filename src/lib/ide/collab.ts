import { useEffect, useRef, useState } from "react";
import type { editor as MonacoEditor, IDisposable } from "monaco-editor";
import { supabase } from "@/integrations/supabase/client";

const NAMES = [
  "Falcon", "Otter", "Lynx", "Heron", "Panda", "Koi", "Sable", "Wren",
  "Quokka", "Tapir", "Vireo", "Yak", "Zorro", "Marlin", "Ibex",
];
const COLORS = [
  "#f97316", "#22c55e", "#06b6d4", "#a855f7", "#ec4899",
  "#eab308", "#3b82f6", "#ef4444", "#14b8a6", "#8b5cf6",
];

function rand<T>(a: T[]) { return a[Math.floor(Math.random() * a.length)]; }

export interface CollabIdentity { id: string; name: string; color: string }

const KEY = "codeforge.collab.identity";
export function getIdentity(): CollabIdentity {
  if (typeof window === "undefined") {
    return { id: "ssr", name: "User", color: "#3b82f6" };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const id = crypto.randomUUID();
  const name = `${rand(NAMES)}-${Math.floor(Math.random() * 90 + 10)}`;
  const color = rand(COLORS);
  const identity = { id, name, color };
  localStorage.setItem(KEY, JSON.stringify(identity));
  return identity;
}

export function setIdentityName(name: string) {
  const cur = getIdentity();
  const next = { ...cur, name: name.trim() || cur.name };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export interface PresenceUser extends CollabIdentity {
  fileId?: string;
}

interface CursorMsg {
  user: CollabIdentity;
  line: number;
  column: number;
  selection?: { startLine: number; startCol: number; endLine: number; endCol: number };
}

/** Subscribe to presence across ALL files (one channel for the workspace). */
export function useWorkspacePresence(fileIds: string[]) {
  const [byFile, setByFile] = useState<Record<string, PresenceUser[]>>({});
  const me = useRef(getIdentity());
  const activeFileRef = useRef<string | null>(null);

  // We use one channel per fileId in a registry; but for tabs we need per-file counts.
  // Simpler: maintain one channel "codeforge:workspace" with presence including fileId.
  useEffect(() => {
    const channel = supabase.channel("codeforge:workspace", {
      config: { presence: { key: me.current.id } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, Array<PresenceUser>>;
        const next: Record<string, PresenceUser[]> = {};
        for (const arr of Object.values(state)) {
          for (const u of arr) {
            if (u.id === me.current.id) continue;
            const f = u.fileId ?? "__none__";
            (next[f] ||= []).push(u);
          }
        }
        setByFile(next);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ ...me.current, fileId: activeFileRef.current });
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Update tracked fileId when ids change is not needed; cursors handle live focus.
  return byFile;
}

/** Update workspace presence with the user's currently active file. */
export function useTrackActiveFile(fileId: string | null) {
  useEffect(() => {
    const me = getIdentity();
    const ch = supabase.getChannels().find((c) => c.topic === "realtime:codeforge:workspace");
    if (ch && ch.state === "joined") {
      void ch.track({ ...me, fileId });
    }
  }, [fileId]);
}

/**
 * Per-file cursor sharing. Joins a channel scoped to the file, broadcasts
 * own cursor changes, paints remote cursors as Monaco decorations.
 */
export function useFileCollab(
  fileId: string | null,
  editor: MonacoEditor.IStandaloneCodeEditor | null,
) {
  const [peers, setPeers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!fileId || !editor) return;
    const me = getIdentity();
    const cursors = new Map<string, { msg: CursorMsg; decoIds: string[] }>();

    const channel = supabase.channel(`codeforge:file:${encodeURIComponent(fileId)}`, {
      config: {
        presence: { key: me.id },
        broadcast: { self: false },
      },
    });

    const styleEl = ensureStyleSheet();

    function repaint() {
      const all: MonacoEditor.IModelDeltaDecoration[] = [];
      const orderedIds: string[] = [];
      for (const [uid, entry] of cursors) {
        const { msg } = entry;
        ensureUserStyle(styleEl, uid, msg.user.color);
        // Caret line decoration
        all.push({
          range: {
            startLineNumber: msg.line,
            startColumn: msg.column,
            endLineNumber: msg.line,
            endColumn: msg.column,
          },
          options: {
            className: `cf-remote-caret cf-caret-${uid}`,
            beforeContentClassName: `cf-remote-caret-bar cf-caret-${uid}`,
            hoverMessage: { value: `**${msg.user.name}**` },
            stickiness: 1, // NeverGrowsWhenTypingAtEdges
          },
        });
        if (msg.selection) {
          all.push({
            range: {
              startLineNumber: msg.selection.startLine,
              startColumn: msg.selection.startCol,
              endLineNumber: msg.selection.endLine,
              endColumn: msg.selection.endCol,
            },
            options: {
              className: `cf-remote-selection cf-sel-${uid}`,
              stickiness: 1,
            },
          });
        }
        orderedIds.push(uid);
      }
      // Use a single delta-decorations call per user-key to allow removal.
      // Easiest: collect prior IDs from all entries, replace with new set under sentinel key.
      const prevIds: string[] = [];
      for (const entry of cursors.values()) prevIds.push(...entry.decoIds);
      const newIds = editor!.deltaDecorations(prevIds, all);
      // Reassign newIds back roughly in batches per user (we don't really need per-user split).
      let i = 0;
      for (const uid of orderedIds) {
        const entry = cursors.get(uid)!;
        const count = 1 + (entry.msg.selection ? 1 : 0);
        entry.decoIds = newIds.slice(i, i + count);
        i += count;
      }
    }

    channel
      .on("broadcast", { event: "cursor" }, ({ payload }) => {
        const msg = payload as CursorMsg;
        if (!msg?.user || msg.user.id === me.id) return;
        const existing = cursors.get(msg.user.id);
        cursors.set(msg.user.id, { msg, decoIds: existing?.decoIds ?? [] });
        repaint();
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, PresenceUser[]>;
        const list: PresenceUser[] = [];
        for (const arr of Object.values(state)) {
          for (const u of arr) if (u.id !== me.id) list.push(u);
        }
        setPeers(list);
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        const entry = cursors.get(key);
        if (entry) {
          editor!.deltaDecorations(entry.decoIds, []);
          cursors.delete(key);
          repaint();
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ ...me, fileId });
        }
      });

    let lastSent = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const sendCursor = () => {
      const pos = editor.getPosition();
      const sel = editor.getSelection();
      if (!pos) return;
      const payload: CursorMsg = {
        user: me,
        line: pos.lineNumber,
        column: pos.column,
        selection:
          sel && !sel.isEmpty()
            ? {
                startLine: sel.startLineNumber,
                startCol: sel.startColumn,
                endLine: sel.endLineNumber,
                endCol: sel.endColumn,
              }
            : undefined,
      };
      void channel.send({ type: "broadcast", event: "cursor", payload });
      lastSent = Date.now();
    };
    const throttledSend = () => {
      const since = Date.now() - lastSent;
      if (since > 60) {
        sendCursor();
      } else if (!pending) {
        pending = setTimeout(() => { pending = null; sendCursor(); }, 60 - since);
      }
    };

    const disposables: IDisposable[] = [
      editor.onDidChangeCursorPosition(throttledSend),
      editor.onDidChangeCursorSelection(throttledSend),
    ];

    return () => {
      disposables.forEach((d) => d.dispose());
      if (pending) clearTimeout(pending);
      // Clear remote decos
      const allIds: string[] = [];
      for (const e of cursors.values()) allIds.push(...e.decoIds);
      try { editor.deltaDecorations(allIds, []); } catch {}
      supabase.removeChannel(channel);
    };
  }, [fileId, editor]);

  return peers;
}

function ensureStyleSheet(): HTMLStyleElement {
  let el = document.getElementById("cf-collab-styles") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "cf-collab-styles";
    el.textContent = `
      .cf-remote-caret-bar::before {
        content: "";
        display: inline-block;
        width: 2px;
        height: 1.1em;
        margin-right: -2px;
        vertical-align: text-bottom;
      }
    `;
    document.head.appendChild(el);
  }
  return el;
}

const injected = new Set<string>();
function ensureUserStyle(el: HTMLStyleElement, uid: string, color: string) {
  if (injected.has(uid)) return;
  injected.add(uid);
  el.textContent += `
    .cf-caret-${cssId(uid)}.cf-remote-caret-bar::before { background: ${color}; box-shadow: 0 0 6px ${color}; }
    .cf-sel-${cssId(uid)} { background: ${color}33 !important; border-radius: 2px; }
  `;
}
function cssId(s: string) { return s.replace(/[^a-zA-Z0-9_-]/g, ""); }
