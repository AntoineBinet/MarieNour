// Mapper « PublicUser lite » partagé — centralise le bloc PUB / PUB_U / toPub qui
// était dupliqué à l'identique dans 8 routes (audit). C'est la version PUBLIQUE
// d'un utilisateur (sans email/prefs/gender) renvoyée dans les listes (amis, fil,
// dépenses, feed, invitations, sondages…). Pour soi-même, voir toPublicUser()
// (server/auth.ts), qui expose en plus l'email et les préférences.
import type { PublicUser } from "@shared/types";

/** Colonnes SQL d'un PublicUser lite (table users). */
export const PUB = "id, display_name, handle, role, avatar_url, bio, accent, created_at";

/** Idem, préfixées `u.` pour les JOIN sur `users u`. */
export const PUB_U = PUB.split(", ")
  .map((c) => `u.${c}`)
  .join(", ");

/** Mappe une ligne SQL (colonnes PUB) en PublicUser public (préférences vides). */
export function toPub(r: Record<string, unknown>): PublicUser {
  return {
    id: r.id as string,
    display_name: r.display_name as string,
    handle: (r.handle as string) ?? null,
    role: r.role as PublicUser["role"],
    avatar_url: (r.avatar_url as string) ?? null,
    bio: (r.bio as string) ?? null,
    accent: (r.accent as string) ?? "terracotta",
    prefs: {},
    created_at: r.created_at as number,
  };
}
