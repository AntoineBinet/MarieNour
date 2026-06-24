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

/** Le viewer peut-il voir cet album ? Visibilité standard + partage explicite
 *  à un ami précis (table générique `shares`, entity_type = 'album'). */
export async function canViewAlbum(
  db: Bindings["DB"],
  viewerId: string | null,
  ownerId: string,
  visibility: Visibility,
  albumId: string,
): Promise<boolean> {
  if (await canView(db, viewerId, ownerId, visibility)) return true;
  if (!viewerId) return false;
  const shared = await db
    .prepare("SELECT 1 FROM shares WHERE entity_type = 'album' AND entity_id = ? AND shared_with_id = ? LIMIT 1")
    .bind(albumId, viewerId)
    .first();
  return !!shared;
}

/** Une photo privée reste visible si elle figure dans un album accessible au
 *  viewer (album partagé). C'est ce qui permet de partager des photos « privées »
 *  via un album sans changer leur visibilité individuelle. */
export async function mediaVisibleViaAlbum(
  db: Bindings["DB"],
  viewerId: string | null,
  mediaId: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      `SELECT a.id AS id, a.user_id AS user_id, a.visibility AS visibility
       FROM album_media am JOIN albums a ON a.id = am.album_id
       WHERE am.media_id = ?`,
    )
    .bind(mediaId)
    .all<{ id: string; user_id: string; visibility: string }>();
  for (const a of res.results ?? []) {
    if (await canViewAlbum(db, viewerId, a.user_id, (a.visibility as Visibility) ?? "private", a.id)) return true;
  }
  return false;
}
