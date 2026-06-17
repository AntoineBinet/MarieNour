// Point d'entrée Node (VM Oracle Cloud) — sert l'app marienour SANS Cloudflare.
//
// Chaîne de prod : Navigateur → Cloudflare edge → tunnel `marienour-oracle` →
// cloudflared → http://127.0.0.1:8002 (ce process Node) → SQLite + fichiers locaux.
//
// Ce fichier réutilise EXACTEMENT la même app Hono que la version serverless
// (server/app.ts) ; seuls les « bindings » changent : D1 → SQLite local, R2 →
// fichiers locaux (cf. server/adapters/). Il sert aussi le front buildé (dist/).
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "./app";
import { createD1 } from "./adapters/d1";
import { createR2 } from "./adapters/r2";
import { attachUser, requireAdmin } from "./auth";
import { getCurrentCommit, getStatus, startUpdate } from "./node-update";

const ROOT = process.cwd();
const PORT = Number(process.env.MARIENOUR_PORT || process.env.PORT || 8002);
// Bind 127.0.0.1 : le port n'est JAMAIS exposé à Internet, seul cloudflared (même
// VM) s'y connecte. Surchargeable (ex. 0.0.0.0) en dev via MARIENOUR_HOST.
const HOST = process.env.MARIENOUR_HOST || "127.0.0.1";
const DATA_DIR = process.env.MARIENOUR_DATA_DIR || join(ROOT, "data");
const MIGRATIONS_DIR = process.env.MARIENOUR_MIGRATIONS_DIR || join(ROOT, "migrations");
const STATIC_DIR = process.env.MARIENOUR_STATIC_DIR || join(ROOT, "dist");

mkdirSync(DATA_DIR, { recursive: true });

// Bindings (équivalents des bindings Cloudflare, mais locaux).
const env = {
  DB: createD1(join(DATA_DIR, "marienour.db"), MIGRATIONS_DIR),
  MEDIA: createR2(join(DATA_DIR, "media")),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
  SESSION_SECRET: process.env.SESSION_SECRET || "",
  APP_NAME: process.env.APP_NAME || "MarieNour",
};

const indexHtmlPath = join(STATIC_DIR, "index.html");
const hasBuild = existsSync(indexHtmlPath);
const indexHtml = hasBuild
  ? readFileSync(indexHtmlPath, "utf8")
  : "<!doctype html><meta charset=utf-8><title>marienour</title><p>Front non buildé : lance <code>npm run build</code>.</p>";

const root = new Hono();

// 0) Mise à jour in-app — routes SPÉCIFIQUES au runtime Node (git pull + build +
//    restart via exit 42). Enregistrées AVANT l'app partagée pour avoir la
//    priorité, et protégées par session admin (attachUser → requireAdmin).
//    Elles n'existent pas sur le repli serverless (Cloudflare Pages).
root.post("/api/admin/update", attachUser, requireAdmin, (c) => {
  const r = startUpdate();
  if (!r.started) return c.json({ ok: false, error: r.reason, status: getStatus() }, 409);
  return c.json({ ok: true, status: getStatus() });
});
root.get("/api/admin/update/status", attachUser, requireAdmin, async (c) =>
  c.json({ status: getStatus(), current_commit: await getCurrentCommit() }),
);

// 1) API Hono (montée avec son basePath /api).
root.route("/", createApp());
// 2) 404 JSON pour toute route /api inconnue (sinon le repli SPA renverrait du HTML).
root.all("/api/*", (c) => c.json({ error: "Route introuvable" }, 404));
// 3) Fichiers statiques du build Vite (dist/) — JS, CSS, favicon, manifest…
if (hasBuild) root.use("/*", serveStatic({ root: "./dist" }));
// 4) Repli SPA : toute autre route renvoie index.html (routage React côté client).
root.get("*", (c) => c.html(indexHtml));

serve(
  {
    // Injecte nos bindings dans c.env pour toutes les requêtes (en gardant
    // incoming/outgoing fournis par @hono/node-server).
    fetch: (request: Request, nodeEnv?: Record<string, unknown>) =>
      root.fetch(request, { ...(nodeEnv ?? {}), ...env }),
    port: PORT,
    hostname: HOST,
  },
  (info) => {
    console.log(`[marienour] en écoute sur http://${HOST}:${info.port}`);
    console.log(`[marienour] données: ${DATA_DIR}  ·  statiques: ${hasBuild ? STATIC_DIR : "(non buildé)"}`);
  },
);
