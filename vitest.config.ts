import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests unitaires des fonctions PURES à fort enjeu (répartition d'argent Tricount,
// soldes, crypto d'auth, garde-fous sécurité). Ils n'ont besoin ni de DB ni de
// réseau. Lancés par `npm test` et par la CI ; hors périmètre tsc (dossier test/).
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
});
