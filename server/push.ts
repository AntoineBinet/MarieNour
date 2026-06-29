// Notifications Web Push — couche PARTAGÉE (runtime-agnostique).
//
// Comme le Mailer, l'ENVOI réel est délégué au runtime via un contrat `Pusher`
// injecté dans l'env (env.PUSHER). Sur la VM Node, il est implémenté par
// server/adapters/web-push.ts (lib `web-push` + clés VAPID auto-générées). Sur le
// repli serverless Cloudflare, aucun pusher n'est injecté → push désactivé
// (dégradation gracieuse, exactement comme les e-mails sans SMTP).
import type { Bindings } from "./types";

/** Contenu d'une notification poussée (sérialisé en JSON côté SW). */
export interface PushPayload {
  title: string;
  body?: string | null;
  url?: string | null;
  tag?: string | null;
}

/** Abonnement d'un navigateur (issu de PushManager.subscribe). */
export interface WebPushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface Pusher {
  /** Clé publique VAPID (à exposer au front), ou null si push indisponible. */
  publicKey: string | null;
  /** Envoie une notif à un abonnement. `gone` = abonnement à purger (404/410). */
  send(sub: WebPushSub, payload: PushPayload): Promise<{ ok: boolean; gone: boolean }>;
}

/** Le push est-il configuré/disponible sur ce runtime ? */
export function pushAvailable(env: Bindings): boolean {
  return !!env.PUSHER && !!env.PUSHER.publicKey;
}

export function pushPublicKey(env: Bindings): string | null {
  return env.PUSHER?.publicKey ?? null;
}

/**
 * Pousse une notification à TOUS les abonnements d'un utilisateur. No-op si le
 * push n'est pas configuré. Best-effort : ne lève jamais (l'action métier qui
 * l'appelle ne doit pas échouer si l'envoi push échoue). Purge les abonnements
 * expirés (410/404) au passage.
 */
export async function sendPushToUser(env: Bindings, userId: string, payload: PushPayload): Promise<void> {
  const pusher = env.PUSHER;
  if (!pusher || !pusher.publicKey || !userId) return;
  try {
    const subs = await env.DB.prepare(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
    )
      .bind(userId)
      .all<WebPushSub>();
    for (const s of subs.results ?? []) {
      const res = await pusher.send(s, payload).catch(() => ({ ok: false, gone: false }));
      if (res.gone) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
          .bind(s.endpoint)
          .run()
          .catch(() => {});
      }
    }
  } catch (e) {
    console.error("[push] envoi à l'utilisateur échoué:", e);
  }
}
