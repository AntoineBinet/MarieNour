import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests NAVIGATEUR de MarieNour (`npm run test:e2e`), à part des tests unitaires.
//
// - Un globalSetup (test/e2e/globalSetup.ts) démarre le VRAI serveur bâti
//   (`node dist-server/server.mjs`, il faut donc `npm run build:all` avant) sur
//   un port libre et un dossier de données temporaire, crée le compte admin et
//   sème un minimum de contenu, puis l'arrête à la fin.
// - Chromium n'est PAS téléchargé : `playwright-core` pilote le binaire désigné
//   par MN_CHROMIUM. Sans cette variable, chaque test se saute proprement
//   (c'est le cas de la CI).
// - Un seul fichier à la fois (forks, sans parallélisme) : le serveur est
//   partagé et les mesures de mouvement n'aiment pas la charge.
export default defineConfig({
  test: {
    include: ["test/e2e/**/*.e2e.ts"],
    environment: "node",
    globalSetup: ["test/e2e/globalSetup.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    teardownTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
});
