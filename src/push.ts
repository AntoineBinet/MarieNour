// Notifications Web Push côté navigateur : abonnement/désabonnement via le
// service worker (cf. public/sw.js) et la clé VAPID exposée par /api/push/key.
// Tout est best-effort : si le navigateur ne supporte pas le push, si la
// permission est refusée, ou si le serveur n'a pas de clé, on échoue proprement.
import { api } from "./api";

/** Le navigateur supporte-t-il le Web Push (SW + PushManager + Notification) ? */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Convertit une clé VAPID base64url en ArrayBuffer (applicationServerKey). */
function vapidKeyToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return buf;
}

/** L'appareil est-il actuellement abonné ? */
export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return !!(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export type EnableResult = { ok: true } | { ok: false; reason: string };

/** Active les notifications push sur cet appareil. */
export async function enablePush(): Promise<EnableResult> {
  if (!pushSupported()) return { ok: false, reason: "Notifications non supportées par ce navigateur." };

  let key: string | null = null;
  try {
    key = (await api.pushKey()).key;
  } catch {
    return { ok: false, reason: "Serveur injoignable." };
  }
  if (!key) return { ok: false, reason: "Notifications non configurées côté serveur." };

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Autorisation refusée." };

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyToBuffer(key),
      });
    }
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "Abonnement invalide." };
    }
    await api.pushSubscribe({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
    return { ok: true };
  } catch {
    return { ok: false, reason: "Abonnement impossible." };
  }
}

/** Désactive les notifications push sur cet appareil. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api.pushUnsubscribe({ endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch {
    /* best-effort */
  }
}
