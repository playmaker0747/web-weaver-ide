import { openDB, type IDBPDatabase } from "idb";

export interface FileNode {
  id: string;          // full path, e.g. "/index.html"
  parentId: string;    // parent dir path, "/" for root children
  name: string;
  type: "file" | "folder";
  content?: string;    // for files
  updatedAt: number;
}

const DB_NAME = "codeforge";
const STORE = "files";

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDB() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("parentId", "parentId");
        }
      },
    });
  }
  return dbPromise;
}

export async function loadAll(): Promise<FileNode[]> {
  const db = await getDB();
  return (await db.getAll(STORE)) as FileNode[];
}

export async function saveNode(node: FileNode): Promise<void> {
  const db = await getDB();
  await db.put(STORE, node);
}

export async function deleteNode(id: string): Promise<void> {
  const db = await getDB();
  const all = (await db.getAll(STORE)) as FileNode[];
  const toDelete = all.filter((n) => n.id === id || n.id.startsWith(id + "/"));
  const tx = db.transaction(STORE, "readwrite");
  await Promise.all(toDelete.map((n) => tx.store.delete(n.id)));
  await tx.done;
}

export async function renameNode(oldId: string, newId: string): Promise<void> {
  const db = await getDB();
  const all = (await db.getAll(STORE)) as FileNode[];
  const tx = db.transaction(STORE, "readwrite");
  for (const n of all) {
    if (n.id === oldId || n.id.startsWith(oldId + "/")) {
      await tx.store.delete(n.id);
      const updated: FileNode = {
        ...n,
        id: n.id.replace(oldId, newId),
        parentId: n.parentId === oldId ? newId : n.parentId.replace(oldId, newId),
        name: n.id === oldId ? newId.split("/").pop()! : n.name,
        updatedAt: Date.now(),
      };
      await tx.store.put(updated);
    }
  }
  await tx.done;
}

export function joinPath(parent: string, name: string) {
  return parent === "/" ? `/${name}` : `${parent}/${name}`;
}

export function parentOf(path: string): string {
  if (path === "/") return "/";
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

export const DEFAULT_PROJECT: FileNode[] = [
  {
    id: "/index.html",
    parentId: "/",
    name: "index.html",
    type: "file",
    updatedAt: Date.now(),
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>CodeForge</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main>
    <h1>Hello, CodeForge ⚒️</h1>
    <p id="msg">Edit files and watch the preview update live.</p>
    <button id="btn">Click me</button>
  </main>
  <script src="script.js"></script>
</body>
</html>
`,
  },
  {
    id: "/styles.css",
    parentId: "/",
    name: "styles.css",
    type: "file",
    updatedAt: Date.now(),
    content: `:root { color-scheme: dark; }
body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, sans-serif;
  background: #0f1115;
  color: #e6e6e6;
  display: grid;
  place-items: center;
  min-height: 100vh;
}
main { text-align: center; }
h1 { font-size: 2.5rem; background: linear-gradient(90deg,#7dd3fc,#a78bfa); -webkit-background-clip: text; color: transparent; }
button {
  margin-top: 1rem;
  padding: .6rem 1.2rem;
  border-radius: 8px;
  border: 1px solid #2d2d2d;
  background: #1e1e1e;
  color: inherit;
  cursor: pointer;
}
button:hover { background: #2a2a2a; }
`,
  },
  {
    id: "/script.js",
    parentId: "/",
    name: "script.js",
    type: "file",
    updatedAt: Date.now(),
    content: `const btn = document.getElementById("btn");
const msg = document.getElementById("msg");
let count = 0;
btn.addEventListener("click", () => {
  count++;
  msg.textContent = \`You clicked \${count} time\${count === 1 ? "" : "s"}.\`;
});
console.log("CodeForge ready");
`,
  },
  {
    id: "/README.md",
    parentId: "/",
    name: "README.md",
    type: "file",
    updatedAt: Date.now(),
    content: `# CodeForge

A browser-based IDE for lightweight web languages.

- Edit HTML / CSS / JS / TS / JSON / Markdown / Python / Lua / YAML / XML
- Live preview with hot reload
- JavaScript & Python (Pyodide) execution in the terminal
- Local persistence via IndexedDB
- ZIP export

Press \`Ctrl/Cmd + K\` for the command palette.
`,
  },
];
