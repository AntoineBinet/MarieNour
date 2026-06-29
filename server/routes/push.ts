import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { pushPublicKey } from "../push";
import { now, str, uid } from "../util";

// Abonnement aux notifications Web Push (un appareil/navigateur par abonnement).
const app = new Hono<AppEnv>();

/** Clé publique VAPID à passer à PushManager.subscribe (ou null si push off). */
app.get("/key", (c) => c.json({ key: pushPublicKey(c.env) }));

/** Enregistre (ou met à jour) l'abonnement du navigateur courant. */
app.post("/subscribe", requireAuth, async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const endpoint = str(body?.endpoint, 1000).trim();
  const p256dh = str(body?.keys?.p256dh, 400).trim();
  const auth = str(body?.keys?.auth, 400).trim();
  if (!endpoint || !p256dh || !auth) return c.json({ error: "Abonnement invalide" }, 400);

  // Upsert sur endpoint : un même appareil ré-abonné met à jour ses clés et son
  // propriétaire (ré-affecte l'abonnement si un autre compte se connecte dessus).
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
       user_agent = excluded.user_agent`,
  )
    .bind(uid(), me, endpoint, p256dh, auth, str(c.req.header("user-agent"), 300) || null, now())
    .run();
  return c.json({ ok: true });
});

/** Supprime l'abonnement du navigateur courant. */
app.post("/unsubscribe", requireAuth, async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const endpoint = str(body?.endpoint, 1000).trim();
  if (!endpoint) return c.json({ error: "Endpoint requis" }, 400);
  await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
    .bind(endpoint, me)
    .run();
  return c.json({ ok: true });
});

export default app;
