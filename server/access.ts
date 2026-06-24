import type { Bindings } from "./types";
import type { Visibility } from "@shared/types";
import { now, uid } from "./util";

/** Référence générique vers un contenu partageable (clé de la table `shares`). */
export interface EntityRef {
  type: string;
  id: string;
}

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

/** Le viewer fait-il partie des amis explicitement choisis pour cette entité ? */
export async function isSharedWith(
  db: Bindings["DB"],
  viewerId: string | null,
  ref: EntityRef,
): Promise<boolean> {
  if (!viewerId) return false;
  const row = await db
    .prepare(
      "SELECT 1 FROM shares WHERE entity_type = ? AND entity_id = ? AND shared_with_id = ? LIMIT 1",
    )
    .bind(ref.type, ref.id, viewerId)
    .first();
  return !!row;
}

/** Le viewer peut-il voir un contenu d'owner avec cette visibilité ?
 *  Pour la visibilité 'shared', passe `ref` (type+id de l'entité) afin de
 *  vérifier la liste d'amis choisis dans la table `shares`. */
export async function canView(
  db: Bindings["DB"],
  viewerId: string | null,
  ownerId: string,
  visibility: Visibility,
  ref?: EntityRef,
): Promise<boolean> {
  if (viewerId === ownerId) return true;
  if (visibility === "public") return true;
  if (visibility === "friends" && viewerId) return areFriends(db, viewerId, ownerId);
  if (visibility === "shared" && viewerId && ref) return isSharedWith(db, viewerId, ref);
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

/** Le viewer peut-il voir une collection de souvenirs ? Étend `canView` avec la
 *  visibilité 'custom' (amis explicitement listés dans memory_collection_members). */
export async function canViewCollection(
  db: Bindings["DB"],
  viewerId: string | null,
  ownerId: string,
  visibility: string,
  collectionId: string,
): Promise<boolean> {
  if (viewerId === ownerId) return true;
  if (visibility === "public") return true;
  if (!viewerId) return false;
  if (visibility === "friends") return areFriends(db, viewerId, ownerId);
  if (visibility === "custom") {
    const m = await db
      .prepare("SELECT 1 FROM memory_collection_members WHERE collection_id = ? AND user_id = ?")
      .bind(collectionId, viewerId)
      .first();
    return !!m;
  }
  return false; // private
}

/** Le viewer peut-il voir un souvenir précis (via la collection qui le porte) ? */
export async function canViewMemory(
  db: Bindings["DB"],
  viewerId: string | null,
  memoryId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT m.collection_id AS cid, c.user_id AS owner_id, c.visibility AS visibility
       FROM memories m JOIN memory_collections c ON c.id = m.collection_id
       WHERE m.id = ?`,
    )
    .bind(memoryId)
    .first<{ cid: string; owner_id: string; visibility: string }>();
  if (!row) return false;
  return canViewCollection(db, viewerId, row.owner_id, row.visibility, row.cid);
}

/** Remplace la liste des amis avec qui une entité est partagée. Seuls les amis
 *  réellement acceptés de l'owner sont conservés (validation anti-triche). */
export async function setEntityShares(
  db: Bindings["DB"],
  ownerId: string,
  ref: EntityRef,
  ids: string[],
): Promise<void> {
  await db
    .prepare("DELETE FROM shares WHERE entity_type = ? AND entity_id = ?")
    .bind(ref.type, ref.id)
    .run();
  if (!ids.length) return;
  const friends = new Set(await friendIds(db, ownerId));
  const ts = now();
  const stmts = [];
  for (const fid of new Set(ids)) {
    if (fid === ownerId || !friends.has(fid)) continue;
    stmts.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO shares (id, owner_id, entity_type, entity_id, shared_with_id, can_edit, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
        )
        .bind(uid(), ownerId, ref.type, ref.id, fid, ts),
    );
  }
  if (stmts.length) await db.batch(stmts);
}

/** Supprime toutes les lignes de partage d'une entité (à appeler à sa suppression). */
export async function deleteEntityShares(db: Bindings["DB"], ref: EntityRef): Promise<void> {
  await db
    .prepare("DELETE FROM shares WHERE entity_type = ? AND entity_id = ?")
    .bind(ref.type, ref.id)
    .run();
}

/** Ids des amis avec qui une entité est partagée. */
export async function getEntityShares(db: Bindings["DB"], ref: EntityRef): Promise<string[]> {
  const res = await db
    .prepare("SELECT shared_with_id FROM shares WHERE entity_type = ? AND entity_id = ?")
    .bind(ref.type, ref.id)
    .all<{ shared_with_id: string }>();
  return (res.results ?? []).map((r) => r.shared_with_id);
}

/** Partages groupés pour plusieurs entités du même type (évite le N+1 sur les
 *  listes). Renvoie une Map id d'entité → ids d'amis. */
export async function getEntitySharesBulk(
  db: Bindings["DB"],
  type: string,
  ids: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!ids.length) return map;
  const placeholders = ids.map(() => "?").join(",");
  const res = await db
    .prepare(
      `SELECT entity_id, shared_with_id FROM shares WHERE entity_type = ? AND entity_id IN (${placeholders})`,
    )
    .bind(type, ...ids)
    .all<{ entity_id: string; shared_with_id: string }>();
  for (const r of res.results ?? []) {
    const list = map.get(r.entity_id) ?? [];
    list.push(r.shared_with_id);
    map.set(r.entity_id, list);
  }
  return map;
}
