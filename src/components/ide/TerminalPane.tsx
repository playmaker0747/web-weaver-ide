import { useEffect, useRef, useState } from "react";
import { useIDE } from "@/lib/ide/store";
import { Trash2, ChevronRight } from "lucide-react";

type Line = { kind: "in" | "out" | "err" | "sys"; text: string };

declare global {
  interface Window {
    loadPyodide?: (opts?: { indexURL: string }) => Promise<unknown>;
  }
}

let pyodidePromise: Promise<any> | null = null;
async function ensurePyodide(log: (s: string) => void) {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    log("Loading Python (Pyodide)…");
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load Pyodide"));
      document.head.appendChild(s);
    });
    if (!window.loadPyodide) throw new Error("Pyodide global missing");
    const py = await window.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" });
    log("Python ready ✓");
    return py;
  })();
  return pyodidePromise;
}

export function TerminalPane() {
  const files = useIDE((s) => s.files);
  const [lines, setLines] = useState<Line[]>([
    { kind: "sys", text: "CodeForge Terminal v1.0  —  type 'help' for commands" },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const print = (text: string, kind: Line["kind"] = "out") =>
    setLines((l) => [...l, { kind, text }]);

  const runJS = (code: string) => {
    try {
      // eslint-disable-next-line no-new-func
      const result = new Function(`return (async () => { ${code} })()`)();
      Promise.resolve(result)
        .then((v) => { if (v !== undefined) print(String(typeof v === "object" ? JSON.stringify(v, null, 2) : v)); })
        .catch((e: unknown) => print(String(e), "err"));
    } catch (e) {
      print(String(e), "err");
    }
  };

  const runPython = async (code: string) => {
    try {
      const py = await ensurePyodide((s) => print(s, "sys"));
      let buf = "";
      py.setStdout({ batched: (s: string) => { buf += s; } });
      py.setStderr({ batched: (s: string) => print(s, "err") });
      const result = await py.runPythonAsync(code);
      if (buf) print(buf.replace(/\n$/, ""));
      if (result !== undefined && result !== null) print(String(result));
    } catch (e) {
      print(String(e), "err");
    }
  };

  const exec = async (raw: string) => {
    const cmd = raw.trim();
    print(`$ ${cmd}`, "in");
    setHistory((h) => [...h, cmd]);
    setHistIdx(-1);
    if (!cmd) return;
    const [bin, ...rest] = cmd.split(/\s+/);
    const arg = rest.join(" ");
    switch (bin) {
      case "help":
        print(`Commands:
  help            Show this message
  clear           Clear terminal
  ls [path]       List files
  cat <file>      Print file contents
  echo <text>     Print text
  js <code>       Run JavaScript (also any line starting with '>')
  py <code>       Run Python (via Pyodide)
  run <file>      Execute .js or .py file
  npm <args>      Simulated npm (logs only)
  date            Current time`);
        break;
      case "clear":
        setLines([]);
        break;
      case "date":
        print(new Date().toString());
        break;
      case "echo":
        print(arg);
        break;
      case "ls": {
        const dir = arg || "/";
        const list = Object.values(files).filter((f) => f.parentId === (dir === "/" ? "/" : dir));
        if (list.length === 0) print("(empty)");
        else print(list.map((f) => (f.type === "folder" ? f.name + "/" : f.name)).join("  "));
        break;
      }
      case "cat": {
        const path = arg.startsWith("/") ? arg : `/${arg}`;
        const f = files[path];
        if (!f) print(`cat: ${arg}: no such file`, "err");
        else print(f.content ?? "");
        break;
      }
      case "js":
        runJS(arg);
        break;
      case "py":
      case "python":
        await runPython(arg);
        break;
      case "run": {
        const path = arg.startsWith("/") ? arg : `/${arg}`;
        const f = files[path];
        if (!f || !f.content) { print(`run: ${arg}: not found`, "err"); break; }
        if (f.name.endsWith(".js")) runJS(f.content);
        else if (f.name.endsWith(".py")) await runPython(f.content);
        else print(`run: cannot execute ${f.name}`, "err");
        break;
      }
      case "npm":
      case "pnpm":
      case "yarn":
        print(`(simulated) ${bin} ${arg}`, "sys");
        print("CodeForge runs entirely in the browser — package manager is simulated.", "sys");
        break;
      default:
        if (cmd.startsWith(">")) runJS(cmd.slice(1));
        else print(`command not found: ${bin}`, "err");
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const v = input;
      setInput("");
      void exec(v);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const idx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(idx);
      setInput(history[idx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < 0) return;
      const idx = histIdx + 1;
      if (idx >= history.length) { setHistIdx(-1); setInput(""); }
      else { setHistIdx(idx); setInput(history[idx]); }
    } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setLines([]);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-terminal-bg">
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-border px-2 text-[11px]">
        <div className="font-semibold uppercase tracking-wider text-muted-foreground">Terminal</div>
        <button onClick={() => setLines([])} title="Clear" className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-accent">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed">
        {lines.map((l, i) => (
          <pre
            key={i}
            className={
              l.kind === "err" ? "text-red-400 whitespace-pre-wrap" :
              l.kind === "in" ? "text-primary whitespace-pre-wrap" :
              l.kind === "sys" ? "text-muted-foreground whitespace-pre-wrap" :
              "text-foreground whitespace-pre-wrap"
            }
          >
            {l.text}
          </pre>
        ))}
        <div className="flex items-center gap-1 font-mono text-xs">
          <ChevronRight className="h-3 w-3 text-primary" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            spellCheck={false}
            autoFocus
            className="flex-1 bg-transparent outline-none"
            placeholder="type a command — 'help' for list"
          />
        </div>
      </div>
    </div>
  );
}
