import Editor, { type OnMount, loader } from "@monaco-editor/react";
import { useIDE } from "@/lib/ide/store";
import { languageFromFilename } from "@/lib/ide/language";
import { useEffect, useRef, useState } from "react";
import type { editor as MonacoEditor } from "monaco-editor";
import { useFileCollab, useTrackActiveFile } from "@/lib/ide/collab";

// Use CDN-hosted monaco workers to avoid bundling issues
loader.config({
  paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs" },
});

export function EditorPane() {
  const activeTab = useIDE((s) => s.activeTab);
  const files = useIDE((s) => s.files);
  const update = useIDE((s) => s.updateFileContent);
  const fontSize = useIDE((s) => s.fontSize);
  const theme = useIDE((s) => s.theme);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const [editorInstance, setEditorInstance] = useState<MonacoEditor.IStandaloneCodeEditor | null>(null);

  const file = activeTab ? files[activeTab] : null;

  useEffect(() => {
    editorRef.current?.layout();
  }, [activeTab]);

  // Real-time collaboration (cursors + presence) for the active file
  useTrackActiveFile(file?.id ?? null);
  const peers = useFileCollab(file?.id ?? null, editorInstance);

  if (!file) {
    return (
      <div className="grid flex-1 place-items-center bg-background">
        <div className="text-center">
          <div className="text-4xl">⚒️</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">CodeForge</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a file from the explorer or press <kbd className="rounded border border-border px-1 py-0.5 text-[10px]">⌘K</kbd> to start.
          </p>
        </div>
      </div>
    );
  }

  const language = languageFromFilename(file.name);

  return (
    <div className="relative flex-1 overflow-hidden bg-background">
      {peers.length > 0 && (
        <div className="pointer-events-none absolute right-3 top-2 z-10 flex items-center gap-1">
          {peers.slice(0, 5).map((p) => (
            <div
              key={p.id}
              title={p.name}
              className="grid h-6 w-6 place-items-center rounded-full border border-background text-[10px] font-semibold text-white shadow-md"
              style={{ backgroundColor: p.color }}
            >
              {p.name.slice(0, 1).toUpperCase()}
            </div>
          ))}
          {peers.length > 5 && (
            <div className="grid h-6 min-w-6 place-items-center rounded-full bg-muted px-1 text-[10px] text-muted-foreground">
              +{peers.length - 5}
            </div>
          )}
        </div>
      )}
      <Editor
        height="100%"
        path={file.id}
        language={language === "plaintext" ? "plaintext" : language}
        value={file.content ?? ""}
        theme={theme === "dark" ? "vs-dark" : "vs"}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          setEditorInstance(editor);
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            editor.getAction("editor.action.formatDocument")?.run();
          });
          editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
            editor.getAction("editor.action.formatDocument")?.run();
          });
        }}
        onChange={(v) => update(file.id, v ?? "")}
        options={{
          fontSize,
          fontFamily: 'ui-monospace, "JetBrains Mono", "Fira Code", Menlo, Consolas, monospace',
          fontLigatures: true,
          minimap: { enabled: true, renderCharacters: false },
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          renderLineHighlight: "all",
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: "on",
          formatOnPaste: true,
          padding: { top: 12 },
        }}
      />
    </div>
  );
}
