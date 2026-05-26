import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        registerType: "autoUpdate",
        injectRegister: null,
        devOptions: { enabled: false },
        manifest: false,
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}"],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        },
      }),
    ],
  },
});
