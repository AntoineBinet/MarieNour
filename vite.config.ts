import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Le front (Vite/React) tourne sur :5173 et proxy les appels /api vers
// l'API Cloudflare (Pages Functions servies par `wrangler pages dev` sur :8788).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8788",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
