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
    // Pas de sourcemaps en production : payload servi plus léger sur le tunnel
    // Cloudflare (les sourcemaps n'apportent rien à l'utilisateur final).
    sourcemap: false,
    rollupOptions: {
      output: {
        // Sépare les grosses dépendances dans des chunks stables et mis en cache
        // longue durée (elles changent rarement vs le code applicatif).
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "query-vendor": ["@tanstack/react-query"],
          "dnd-vendor": ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
        },
      },
    },
  },
});
