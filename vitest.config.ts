import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests unitaires des fonctions PURES à fort enjeu (répartition d'argent Tricount,
// soldes, crypto d'auth, garde-fous sécurité, cœur de la couche d'effets src/fx).
// Ils n'ont besoin ni de DB ni de réseau. Lancés par `npm test` et par la CI ;
// hors périmètre tsc (dossier test/). Les tests NAVIGATEUR (test/e2e) ont leur
// propre configuration (vitest.e2e.config.ts, `npm run test:e2e`) : jamais ici.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "test/e2e/**"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
});
