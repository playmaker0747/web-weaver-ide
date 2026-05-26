/// <reference lib="webworker" />
// CodeForge Service Worker
// - Workbox precache + runtime caching (offline support)
// - Live Server: serves project files from IndexedDB at /__live/*
// - Injects live-reload script into served HTML

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { openDB } from "idb";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.addEventListener("message", (e) => {
  if ((e.data as { type?: string } | undefined)?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// App-shell navigations: NetworkFirst, exclude API + live paths
registerRoute(
  new NavigationRoute(
    new NetworkFirst({ cacheName: "html", networkTimeoutSeconds: 3 }),
    { denylist: [/^\/api\//, /^\/~/, /^\/__live(\/|$)/] },
  ),
);

// jsDelivr CDN (Monaco etc.)
registerRoute(
  ({ url }) => url.hostname === "cdn.jsdelivr.net",
  new CacheFirst({
    cacheName: "jsdelivr-cdn",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
);

// Google Fonts
registerRoute(
  ({ url }) => url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com"),
  new CacheFirst({
    cacheName: "google-fonts",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  }),
);

// Same-origin static assets
registerRoute(
  ({ request }) => ["style", "script", "worker", "image", "font"].includes(request.destination),
  new StaleWhileRevalidate({ cacheName: "assets" }),
);

// ============================================================
// Live Server: /__live/<path> -> project file from IndexedDB
// ============================================================

const MIME: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  ts: "application/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  txt: "text/plain",
  md: "text/markdown",
  xml: "application/xml",
  wasm: "application/wasm",
};

function mimeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "text/plain";
}

const LIVE_RELOAD = `
<script>
(function(){
  try {
    var bc = new BroadcastChannel('codeforge-live');
    var deb;
    bc.onmessage = function(e){
      if (e.data && e.data.type === 'reload') {
        clearTimeout(deb);
        deb = setTimeout(function(){ location.reload(); }, 80);
      }
    };
    document.addEventListener('DOMContentLoaded', function(){
      var b = document.createElement('div');
      b.textContent = 'CodeForge Live';
      b.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:2147483647;background:#0f1115;color:#7dd3fc;font:11px ui-monospace,Menlo,monospace;padding:4px 8px;border-radius:6px;opacity:.7;pointer-events:none;border:1px solid #2d2d2d';
      document.body.appendChild(b);
      setTimeout(function(){ b.style.transition='opacity .5s'; b.style.opacity='0'; }, 2000);
    });
  } catch(e){}
})();
</script>`;

async function serveLive(pathname: string): Promise<Response> {
  let rel = pathname.replace(/^\/__live/, "") || "/";
  if (rel === "" || rel === "/") rel = "/index.html";
  if (rel.endsWith("/")) rel += "index.html";
  if (!rel.startsWith("/")) rel = "/" + rel;

  try {
    const db = await openDB("codeforge", 1);
    const node = (await db.get("files", rel)) as
      | { type: string; content?: string }
      | undefined;

    if (!node || node.type !== "file") {
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>Not found</title>
         <body style="font-family:ui-sans-serif,system-ui;padding:32px;color:#444">
         <h2>404 — ${rel}</h2>
         <p>This file does not exist in your CodeForge workspace.</p></body>`,
        { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }

    const mime = mimeFor(rel);
    let body = node.content ?? "";

    if (mime === "text/html") {
      body = /<\/body>/i.test(body)
        ? body.replace(/<\/body>/i, LIVE_RELOAD + "</body>")
        : body + LIVE_RELOAD;
    }

    return new Response(body, {
      headers: {
        "content-type": mime + (mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json") ? "; charset=utf-8" : ""),
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return new Response("Live server error: " + (e as Error).message, { status: 500 });
  }
}

self.addEventListener("fetch", (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith("/__live")) {
    event.respondWith(serveLive(url.pathname));
  }
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

export {};
