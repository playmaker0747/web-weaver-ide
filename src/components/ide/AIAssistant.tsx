import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Send, Square, Trash2, Bot, User } from "lucide-react";
import { marked } from "marked";
import { useIDE } from "@/lib/ide/store";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
const STORAGE_KEY = "codeforge.ai.history";

function loadHistory(): Msg[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.slice(-40);
  } catch {}
  return [];
}

marked.setOptions({ breaks: true, gfm: true });

function MessageBubble({ m }: { m: Msg }) {
  const html = useMemo(() => marked.parse(m.content || ""), [m.content]);
  const isUser = m.role === "user";
  return (
    <div className="flex gap-2 px-3 py-2">
      <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded bg-accent text-foreground">
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5 text-primary" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {isUser ? "You" : "CodeForge AI"}
        </div>
        <div
          className="prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground [&_code]:rounded [&_code]:bg-accent [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[color-mix(in_oklab,var(--color-background)_50%,black_50%)] [&_pre]:p-2 [&_pre]:text-[12px] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_a]:text-primary [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1"
          dangerouslySetInnerHTML={{ __html: html as string }}
        />
      </div>
    </div>
  );
}

export function AIAssistant() {
  const files = useIDE((s) => s.files);
  const activeTab = useIDE((s) => s.activeTab);
  const openTabs = useIDE((s) => s.openTabs);
  const [messages, setMessages] = useState<Msg[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40))); } catch {}
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  const buildContext = () => {
    const ids = Array.from(new Set([activeTab, ...openTabs].filter(Boolean))) as string[];
    const parts: string[] = [];
    let budget = 10000;
    for (const id of ids) {
      const f = files[id];
      if (!f || f.type !== "file") continue;
      const body = (f.content ?? "").slice(0, 4000);
      const chunk = `\n--- ${f.id} ---\n${body}\n`;
      if (budget - chunk.length < 0) break;
      budget -= chunk.length;
      parts.push(chunk);
    }
    return parts.join("\n");
  };

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || streaming) return;
    const userMsg: Msg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let assistant = "";

    const upsert = (chunk: string) => {
      assistant += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistant } : m));
        }
        return [...prev, { role: "assistant", content: assistant }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: next, context: buildContext() }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        upsert(`\n\n**Error:** ${err.error ?? "Request failed"}`);
        setStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const piece = parsed.choices?.[0]?.delta?.content;
            if (piece) upsert(piece);
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        upsert(`\n\n**Error:** ${(e as Error).message}`);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();
  const clear = () => { setMessages([]); try { localStorage.removeItem(STORAGE_KEY); } catch {} };

  const quickActions = [
    { label: "Explain this file", prompt: "Explain what the currently open file does, step by step." },
    { label: "Find bugs", prompt: "Review the open files for bugs, edge cases, or anti-patterns. Be specific." },
    { label: "Refactor", prompt: "Refactor the currently open file for clarity and modern best practices. Return the full updated file." },
    { label: "Add comments", prompt: "Add helpful inline comments to the currently open file. Return the full updated file." },
  ];

  return (
    <div className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" /> AI Assistant</span>
        <button onClick={clear} title="Clear chat" className="rounded p-1 hover:bg-accent">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            <p className="mb-3">Ask anything about your code. The assistant can see your open files.</p>
            <div className="grid grid-cols-2 gap-1.5">
              {quickActions.map((q) => (
                <button
                  key={q.label}
                  onClick={() => send(q.prompt)}
                  className="rounded border border-border bg-background/40 px-2 py-1.5 text-left text-[11px] hover:border-primary hover:text-foreground"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <MessageBubble key={i} m={m} />)
        )}
        {streaming && (
          <div className="px-5 py-1 text-[11px] text-muted-foreground">
            <span className="inline-block animate-pulse">▍ thinking…</span>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="shrink-0 border-t border-border p-2"
      >
        <div className="flex items-end gap-1.5 rounded border border-border bg-background/60 p-1.5 focus-within:border-primary">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask CodeForge AI…"
            rows={2}
            className="flex-1 resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
          {streaming ? (
            <button type="button" onClick={stop} title="Stop" className="grid h-7 w-7 place-items-center rounded bg-destructive text-destructive-foreground">
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button type="submit" title="Send" disabled={!input.trim()} className="grid h-7 w-7 place-items-center rounded bg-primary text-primary-foreground disabled:opacity-40">
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p className="mt-1 px-1 text-[10px] text-muted-foreground">Enter to send • Shift+Enter for newline</p>
      </form>
    </div>
  );
}
