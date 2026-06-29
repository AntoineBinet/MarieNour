// Adaptateur Web Push pour Node (VM Oracle) — implémente le contrat `Pusher`
// (server/push.ts) au-dessus de la lib `web-push`.
//
// Clés VAPID : auto-générées au premier démarrage et PERSISTÉES dans
// data/vapid.json (gitignoré, conservé entre MAJ). Aucune configuration manuelle
// requise : le push « marche tout seul » dès cette mise à jour. Si la génération
// échoue, on renvoie un pusher inerte (publicKey = null → push désactivé).
//
// Fichier non typé par tsc (API Node + lib non incluse dans workers-types) :
// importé uniquement par server/node.ts, exclu de tsconfig.server.json, bundlé
// par esbuild.
import webpush from "web-push";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Pusher, PushPayload, WebPushSub } from "../push";

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

function loadOrCreateKeys(dataDir: string): VapidKeys | null {
  const file = join(dataDir, "vapid.json");
  try {
    const keys = JSON.parse(readFileSync(file, "utf8")) as VapidKeys;
    if (keys.publicKey && keys.privateKey) return keys;
  } catch {
    /* pas encore de clés : on en génère */
  }
  try {
    const keys = webpush.generateVAPIDKeys();
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(file, JSON.stringify(keys));
    return keys;
  } catch (e) {
    console.error("[push] génération/persistance des clés VAPID échouée:", e);
    return null;
  }
}

export function createWebPushPusher(opts: { dataDir: string; subject: string }): Pusher {
  const keys = loadOrCreateKeys(opts.dataDir);
  if (!keys) return { publicKey: null, async send() { return { ok: false, gone: false }; } };

  const raw = (opts.subject || "").trim();
  const subject = raw.startsWith("mailto:") || raw.startsWith("http")
    ? raw
    : `mailto:${raw || "admin@marienour.work"}`;
  try {
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  } catch (e) {
    console.error("[push] setVapidDetails a échoué (push désactivé):", e);
    return { publicKey: null, async send() { return { ok: false, gone: false }; } };
  }
  console.log("[push] Web Push prêt (clés VAPID chargées)");

  return {
    publicKey: keys.publicKey,
    async send(sub: WebPushSub, payload: PushPayload) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 }, // garde la notif jusqu'à 24 h si l'appareil est hors-ligne
        );
        return { ok: true, gone: false };
      } catch (e: any) {
        const code = e?.statusCode;
        // 404/410 = abonnement révoqué/expiré côté navigateur → à purger.
        return { ok: false, gone: code === 404 || code === 410 };
      }
    },
  };
}
