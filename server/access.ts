import type { Bindings } from "./types";
import type { Visibility } from "@shared/types";

/** Deux utilisateurs sont-ils amis (amitié acceptée, dans un sens ou l'autre) ? */
export async function areFriends(db: Bindings["DB"], a: string, b: string): Promise<boolean> {
  if (a === b) return true;
  const row = await db
    .prepare(
      `SELECT 1 FROM friendships
       WHERE status = 'accepted'
         AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
       LIMIT 1`,
    )
    .bind(a, b, b, a)
    .first();
  return !!row;
}

/** IDs des amis acceptés de l'utilisateur. */
export async function friendIds(db: Bindings["DB"], userId: string): Promise<string[]> {
  const res = await db
    .prepare(
      `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS fid
       FROM friendships
       WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`,
    )
    .bind(userId, userId, userId)
    .all<{ fid: string }>();
  return (res.results ?? []).map((r) => r.fid);
}

/** Le viewer peut-il voir un contenu d'owner avec cette visibilité ? */
export async function canView(
  db: Bindings["DB"],
  viewerId: string | null,
  ownerId: string,
  visibility: Visibility,
): Promise<boolean> {
  if (viewerId === ownerId) return true;
  if (visibility === "public") return true;
  if (visibility === "friends" && viewerId) return areFriends(db, viewerId, ownerId);
  return false;
}
