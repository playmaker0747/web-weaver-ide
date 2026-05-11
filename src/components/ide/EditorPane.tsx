import Editor, { type OnMount, loader } from "@monaco-editor/react";
import { useIDE } from "@/lib/ide/store";
import { languageFromFilename } from "@/lib/ide/language";
import { useEffect, useRef } from "react";

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

  const file = activeTab ? files[activeTab] : null;

  useEffect(() => {
    editorRef.current?.layout();
  }, [activeTab]);

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
      <Editor
        height="100%"
        path={file.id}
        language={language === "plaintext" ? "plaintext" : language}
        value={file.content ?? ""}
        theme={theme === "dark" ? "vs-dark" : "vs"}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          // Format on save: Cmd/Ctrl+S
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            editor.getAction("editor.action.formatDocument")?.run();
          });
          // Quick format: Shift+Alt+F
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
