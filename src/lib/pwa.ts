// Service worker registration with strict guards for Lovable preview/iframe.
// Only registers in production builds, on the published origin, outside iframes.

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const inIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const host = window.location.hostname;
  const isPreviewHost =
    host.includes("id-preview--") ||
    host.includes("preview--") ||
    host.includes("lovableproject.com") ||
    host.includes("lovableproject-dev.com") ||
    host === "localhost" ||
    host === "127.0.0.1";

  if (inIframe || isPreviewHost) {
    // Cleanup any stale SWs registered in preview contexts.
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    return;
  }

  import("workbox-window")
    .then(({ Workbox }) => {
      const wb = new Workbox("/sw.js");
      wb.addEventListener("waiting", () => {
        wb.messageSkipWaiting();
      });
      wb.addEventListener("controlling", () => {
        window.location.reload();
      });
      wb.register().catch((e) => console.warn("[SW] register failed", e));
    })
    .catch(() => {});
}
