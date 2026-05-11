export type LanguageId =
  | "html"
  | "css"
  | "javascript"
  | "typescript"
  | "json"
  | "markdown"
  | "python"
  | "lua"
  | "yaml"
  | "xml"
  | "plaintext";

const EXT_MAP: Record<string, LanguageId> = {
  html: "html",
  htm: "html",
  css: "css",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  py: "python",
  lua: "lua",
  yml: "yaml",
  yaml: "yaml",
  xml: "xml",
  svg: "xml",
};

export function languageFromFilename(name: string): LanguageId {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? "plaintext";
}

export function iconForFilename(name: string): string {
  const lang = languageFromFilename(name);
  switch (lang) {
    case "html":
      return "🟧";
    case "css":
      return "🟦";
    case "javascript":
      return "🟨";
    case "typescript":
      return "🟦";
    case "json":
      return "🟫";
    case "markdown":
      return "📘";
    case "python":
      return "🐍";
    case "lua":
      return "🌙";
    case "yaml":
      return "📄";
    case "xml":
      return "🟪";
    default:
      return "📄";
  }
}
