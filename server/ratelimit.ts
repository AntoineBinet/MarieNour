// Limiteur de débit minimaliste, en mémoire (sliding window). Suffisant pour
// freiner le brute-force sur /login & /register d'un hub perso. Sur la VM Node
// (process unique persistant) c'est efficace ; sur le repli serverless Cloudflare
// l'état est par-isolat/éphémère (protection partielle, mais Cloudflare protège
// déjà en amont). Aucune API runtime spécifique → vaut pour les deux cibles.
import { now } from "./util";

const store = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  retryAfter: number; // secondes avant la prochaine tentative autorisée
}

/** Enregistre une tentative pour `key` et indique si elle est autorisée. */
export function rateLimit(key: string, opts: { limit: number; windowMs: number }): RateLimitResult {
  const t = now();
  const since = t - opts.windowMs;
  const hits = (store.get(key) ?? []).filter((ts) => ts > since);

  if (hits.length >= opts.limit) {
    store.set(key, hits);
    const retryAfter = Math.ceil((hits[0] + opts.windowMs - t) / 1000);
    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }

  hits.push(t);
  store.set(key, hits);

  // Garde-fou mémoire : purge occasionnelle des clés devenues vides.
  if (store.size > 5000) {
    for (const [k, v] of store) if (!v.some((ts) => ts > since)) store.delete(k);
  }
  return { ok: true, retryAfter: 0 };
}

/** Meilleure estimation de l'IP cliente (derrière Cloudflare/tunnel). */
export function clientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  return (
    c.req.header("cf-connecting-ip") ||
    (c.req.header("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}
