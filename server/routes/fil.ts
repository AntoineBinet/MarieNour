import { Hono } from "hono";
import type { AppEnv } from "../types";
import { attachUser, requireAuth } from "../auth";
import { canViewCollection, canViewMemory, friendIds, areFriends } from "../access";
import { PUB_U, toPub } from "../pub";
import { now, str, uid, intOrNull, isImageOrVideoUpload, safeServedContentType, isBlockedPreviewHost, PatchSet } from "../util";
import type {
  CollectionVisibility,
  LinkPreview,
  Memory,
  MemoryCollection,
  MemoryKind,
  MemoryReel,
  PublicUser,
  TripOwner,
} from "@shared/types";

// « Mon fil » — souvenirs (photos, vidéos, liens réseaux sociaux) rangés en
// collections au partage choisi (privé / amis / amis précis / public), avec
// récap hebdomadaire en mode « stories ».

const app = new Hono<AppEnv>();

const MAX_BYTES = 60 * 1024 * 1024; // 60 Mo (autorise de courtes vidéos)
const COLL_VIS: CollectionVisibility[] = ["private", "friends", "custom", "public"];
const cleanCollVis = (v: unknown): CollectionVisibility =>
  COLL_VIS.includes(v as never) ? (v as CollectionVisibility) : "private";

// NB : sur une ligne `SELECT c.*, u.…` (collection + propriétaire), l'id du
// propriétaire est `c.user_id` (et NON `id`, qui appartient à la collection).
function toOwner(r: Record<string, unknown>): TripOwner {
  return {
    id: r.user_id as string,
    display_name: r.display_name as string,
    handle: (r.handle as string) ?? null,
    avatar_url: (r.avatar_url as string) ?? null,
  };
}

/** Vignette d'aperçu d'un souvenir (pour cartes & stories), ou null. */
function previewUrl(row: Record<string, unknown>): string | null {
  const kind = row.kind as string;
  if ((kind === "photo" || kind === "video") && row.r2_key) return `/api/fil/memories/${row.id as string}/raw`;
  if (row.link_image) return row.link_image as string;
  return null;
}

function toMemory(row: Record<string, unknown>, author: PublicUser, me: string): Memory {
  const kind = row.kind as MemoryKind;
  const id = row.memory_id as string;
  const hasMedia = (kind === "photo" || kind === "video") && row.r2_key;
  return {
    id,
    collection_id: row.collection_id as string,
    collection_title: (row.collection_title as string) ?? null,
    collection_accent: (row.collection_accent as string) ?? "terracotta",
    kind,
    caption: (row.caption as string) ?? null,
    media_url: hasMedia ? `/api/fil/memories/${id}/raw` : null,
    content_type: (row.content_type as string) ?? null,
    url: (row.url as string) ?? null,
    link_title: (row.link_title as string) ?? null,
    link_image: (row.link_image as string) ?? null,
    link_provider: (row.link_provider as string) ?? null,
    taken_at: row.taken_at as number,
    created_at: row.memory_created_at as number,
    updated_at: row.updated_at as number,
    author,
    is_mine: author.id === me,
    like_count: 0,
    comment_count: 0,
    liked_by_me: false,
  };
}

/** Remplit like_count / comment_count / liked_by_me pour une liste de souvenirs.
 *  Groupé en 3 requêtes (au lieu de 3 PAR souvenir) — cf. audit N+1. */
async function attachSocial(db: AppEnv["Bindings"]["DB"], me: string, items: Memory[]): Promise<void> {
  if (!items.length) return;
  const ids = items.map((it) => it.id);
  const ph = ids.map(() => "?").join(",");

  const likeRows = await db
    .prepare(`SELECT entity_id, COUNT(*) AS n FROM likes WHERE entity_type = 'memory' AND entity_id IN (${ph}) GROUP BY entity_id`)
    .bind(...ids)
    .all<{ entity_id: string; n: number }>();
  const commentRows = await db
    .prepare(`SELECT entity_id, COUNT(*) AS n FROM comments WHERE entity_type = 'memory' AND entity_id IN (${ph}) GROUP BY entity_id`)
    .bind(...ids)
    .all<{ entity_id: string; n: number }>();
  const mineRows = await db
    .prepare(`SELECT entity_id FROM likes WHERE user_id = ? AND entity_type = 'memory' AND entity_id IN (${ph})`)
    .bind(me, ...ids)
    .all<{ entity_id: string }>();

  const likeMap = new Map((likeRows.results ?? []).map((r) => [r.entity_id, r.n]));
  const commentMap = new Map((commentRows.results ?? []).map((r) => [r.entity_id, r.n]));
  const mineSet = new Set((mineRows.results ?? []).map((r) => r.entity_id));
  for (const it of items) {
    it.like_count = likeMap.get(it.id) ?? 0;
    it.comment_count = commentMap.get(it.id) ?? 0;
    it.liked_by_me = mineSet.has(it.id);
  }
}

/** Construit la clause SQL (+ binds) sélectionnant les souvenirs visibles par moi.
 *  Ordre des binds : user_id (moi), puis les ids d'amis, puis moi (membre custom). */
function visibleWhere(me: string, fids: string[]): { sql: string; binds: unknown[] } {
  let friendClause = "";
  if (fids.length) {
    const ph = fids.map(() => "?").join(",");
    friendClause = ` OR (c.visibility = 'friends' AND c.user_id IN (${ph}))`;
  }
  const sql =
    `(c.user_id = ?` +
    ` OR c.visibility = 'public'` +
    friendClause +
    ` OR (c.visibility = 'custom' AND c.id IN (SELECT collection_id FROM memory_collection_members WHERE user_id = ?)))`;
  return { sql, binds: [me, ...fids, me] };
}

// NB : on aliase m.id / m.created_at car ils entrent en collision avec u.id /
// u.created_at quand on joint la table users (sinon la valeur de l'auteur écrase
// celle du souvenir).
const MEM_COLS =
  `m.id AS memory_id, m.collection_id, m.kind, m.caption, m.r2_key, m.content_type, m.url, ` +
  `m.link_title, m.link_image, m.link_provider, m.taken_at, m.created_at AS memory_created_at, m.updated_at, ` +
  `c.title AS collection_title, c.accent AS collection_accent`;

// ════════════════════════════════════════════════════════════════════════════
//  Collections
// ════════════════════════════════════════════════════════════════════════════

app.use("*", requireAuth);

// Mes collections + collections partagées avec moi.
app.get("/collections", async (c) => {
  const me = c.var.user!.id;

  const mineRes = await c.env.DB.prepare(
    "SELECT * FROM memory_collections WHERE user_id = ? ORDER BY position ASC, updated_at DESC",
  )
    .bind(me)
    .all<Record<string, unknown>>();
  const mineRows = mineRes.results ?? [];

  // Collections d'autres personnes auxquelles j'ai accès (avec ≥1 souvenir).
  const fids = await friendIds(c.env.DB, me);
  const { sql, binds } = visibleWhere(me, fids);
  const sharedRes = await c.env.DB.prepare(
    // On ne sélectionne QUE les colonnes propriétaire non-conflictuelles (sinon
    // u.id/u.accent/u.created_at écraseraient c.id/c.accent/c.created_at).
    `SELECT c.*, u.display_name, u.handle, u.avatar_url FROM memory_collections c
     JOIN users u ON u.id = c.user_id
     WHERE c.user_id != ? AND ${sql}
       AND EXISTS (SELECT 1 FROM memories mm WHERE mm.collection_id = c.id)
     ORDER BY c.updated_at DESC`,
  )
    .bind(me, ...binds)
    .all<Record<string, unknown>>();
  const sharedRows = sharedRes.results ?? [];

  // ── Agrégats GROUPÉS (au lieu de 2-3 requêtes PAR collection, cf. audit N+1) ──
  const ids = [...mineRows, ...sharedRows].map((r) => r.id as string);
  const counts = new Map<string, number>();
  const previews = new Map<string, string[]>();
  const membersMap = new Map<string, PublicUser[]>();

  if (ids.length) {
    const ph = ids.map(() => "?").join(",");
    const countRows = await c.env.DB.prepare(
      `SELECT collection_id, COUNT(*) AS n FROM memories WHERE collection_id IN (${ph}) GROUP BY collection_id`,
    )
      .bind(...ids)
      .all<{ collection_id: string; n: number }>();
    for (const r of countRows.results ?? []) counts.set(r.collection_id, r.n);

    // 4 vignettes les plus récentes par collection, en une requête (window function).
    const previewRows = await c.env.DB.prepare(
      `SELECT id, collection_id, kind, r2_key, link_image, rn FROM (
         SELECT id, collection_id, kind, r2_key, link_image,
                ROW_NUMBER() OVER (PARTITION BY collection_id ORDER BY taken_at DESC) AS rn
         FROM memories WHERE collection_id IN (${ph})
       ) WHERE rn <= 4 ORDER BY collection_id, rn`,
    )
      .bind(...ids)
      .all<Record<string, unknown>>();
    for (const r of previewRows.results ?? []) {
      const url = previewUrl(r);
      if (!url) continue;
      const cid = r.collection_id as string;
      const arr = previews.get(cid);
      if (arr) arr.push(url);
      else previews.set(cid, [url]);
    }

    // Membres des collections « custom » QUE JE POSSÈDE (les seules à exposer les membres).
    const customMineIds = mineRows
      .filter((r) => (r.visibility as string) === "custom")
      .map((r) => r.id as string);
    if (customMineIds.length) {
      const cph = customMineIds.map(() => "?").join(",");
      const memRows = await c.env.DB.prepare(
        `SELECT mcm.collection_id, ${PUB_U} FROM memory_collection_members mcm
         JOIN users u ON u.id = mcm.user_id WHERE mcm.collection_id IN (${cph})`,
      )
        .bind(...customMineIds)
        .all<Record<string, unknown>>();
      for (const r of memRows.results ?? []) {
        const cid = r.collection_id as string;
        const arr = membersMap.get(cid);
        if (arr) arr.push(toPub(r));
        else membersMap.set(cid, [toPub(r)]);
      }
    }
  }

  const mine = mineRows.map((r) => buildCollectionSummary(r, true, null, counts, previews, membersMap));
  const shared = sharedRows.map((r) => buildCollectionSummary(r, false, toOwner(r), counts, previews, membersMap));
  return c.json({ collections: mine, shared });
});

/** Assemble un résumé de collection à partir des agrégats déjà chargés (groupés). */
function buildCollectionSummary(
  r: Record<string, unknown>,
  isOwner: boolean,
  owner: TripOwner | null,
  counts: Map<string, number>,
  previews: Map<string, string[]>,
  membersMap: Map<string, PublicUser[]>,
): MemoryCollection {
  const id = r.id as string;
  let members: PublicUser[] | undefined;
  if (isOwner && (r.visibility as string) === "custom") members = membersMap.get(id) ?? [];
  return {
    id,
    title: r.title as string,
    description: (r.description as string) ?? null,
    cover_url: (r.cover_url as string) ?? null,
    accent: (r.accent as string) ?? "terracotta",
    visibility: cleanCollVis(r.visibility),
    position: (r.position as number) ?? 0,
    created_at: r.created_at as number,
    updated_at: r.updated_at as number,
    memory_count: counts.get(id) ?? 0,
    preview_urls: previews.get(id) ?? [],
    is_owner: isOwner,
    owner,
    members,
  };
}

/** Résumé d'UNE collection (page de détail) : agrégats chargés à la demande. */
async function loadCollectionSummary(
  db: AppEnv["Bindings"]["DB"],
  r: Record<string, unknown>,
  isOwner: boolean,
  owner: TripOwner | null,
): Promise<MemoryCollection> {
  const id = r.id as string;
  const counts = new Map<string, number>();
  const previews = new Map<string, string[]>();
  const membersMap = new Map<string, PublicUser[]>();

  const countRow = await db
    .prepare("SELECT COUNT(*) AS n FROM memories WHERE collection_id = ?")
    .bind(id)
    .first<{ n: number }>();
  counts.set(id, countRow?.n ?? 0);

  const recent = await db
    .prepare("SELECT id, kind, r2_key, link_image FROM memories WHERE collection_id = ? ORDER BY taken_at DESC LIMIT 4")
    .bind(id)
    .all<Record<string, unknown>>();
  previews.set(id, (recent.results ?? []).map(previewUrl).filter((x): x is string => !!x));

  if (isOwner && (r.visibility as string) === "custom") {
    const mres = await db
      .prepare(
        `SELECT ${PUB_U} FROM memory_collection_members mcm JOIN users u ON u.id = mcm.user_id WHERE mcm.collection_id = ?`,
      )
      .bind(id)
      .all<Record<string, unknown>>();
    membersMap.set(id, (mres.results ?? []).map(toPub));
  }

  return buildCollectionSummary(r, isOwner, owner, counts, previews, membersMap);
}

// Crée une collection.
app.post("/collections", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const title = str(body.title, 120).trim();
  if (!title) return c.json({ error: "Titre requis" }, 400);
  const visibility = cleanCollVis(body.visibility);
  const id = uid();
  const ts = now();
  const posRow = await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM memory_collections WHERE user_id = ?")
    .bind(me)
    .first<{ p: number }>();
  await c.env.DB.prepare(
    `INSERT INTO memory_collections (id, user_id, title, description, accent, visibility, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, me, title, str(body.description, 500) || null, str(body.accent, 24) || "terracotta", visibility, posRow?.p ?? 0, ts, ts)
    .run();
  if (visibility === "custom" && Array.isArray(body.member_ids)) {
    await setMembers(c.env.DB, me, id, body.member_ids);
  }
  return c.json({ id });
});

/** Remplace l'ensemble des amis autorisés d'une collection 'custom'. */
async function setMembers(db: AppEnv["Bindings"]["DB"], me: string, collectionId: string, ids: unknown[]): Promise<void> {
  await db.prepare("DELETE FROM memory_collection_members WHERE collection_id = ?").bind(collectionId).run();
  const ts = now();
  const seen = new Set<string>();
  for (const raw of ids) {
    const uidStr = str(raw, 60);
    if (!uidStr || uidStr === me || seen.has(uidStr)) continue;
    if (!(await areFriends(db, me, uidStr))) continue; // n'autorise que des amis acceptés
    seen.add(uidStr);
    await db
      .prepare("INSERT OR IGNORE INTO memory_collection_members (collection_id, user_id, created_at) VALUES (?, ?, ?)")
      .bind(collectionId, uidStr, ts)
      .run();
  }
}

// Détail d'une collection (souvenirs + membres), si j'y ai accès.
app.get("/collections/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const col = await c.env.DB.prepare(
    `SELECT c.*, u.display_name, u.handle, u.avatar_url FROM memory_collections c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
  )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!col) return c.json({ error: "Collection introuvable" }, 404);
  const isOwner = col.user_id === me;
  if (!(await canViewCollection(c.env.DB, me, col.user_id as string, col.visibility as string, id)))
    return c.json({ error: "Accès refusé" }, 403);

  const summary = await loadCollectionSummary(c.env.DB, col, isOwner, isOwner ? null : toOwner(col));

  const memsRes = await c.env.DB.prepare(
    `SELECT ${MEM_COLS}, ${PUB_U} FROM memories m
     JOIN memory_collections c ON c.id = m.collection_id
     JOIN users u ON u.id = m.user_id
     WHERE m.collection_id = ? ORDER BY m.taken_at DESC`,
  )
    .bind(id)
    .all<Record<string, unknown>>();
  const memories = (memsRes.results ?? []).map((r) => toMemory(r, toPub(r), me));
  await attachSocial(c.env.DB, me, memories);

  return c.json({ collection: { ...summary, can_edit: isOwner }, memories });
});

// Met à jour une collection (propriétaire).
app.patch("/collections/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const col = await c.env.DB.prepare("SELECT id, visibility FROM memory_collections WHERE id = ? AND user_id = ?")
    .bind(id, me)
    .first<{ id: string; visibility: string }>();
  if (!col) return c.json({ error: "Collection introuvable" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const p = new PatchSet();
  if (body.title !== undefined) {
    const t = str(body.title, 120).trim();
    if (!t) return c.json({ error: "Titre requis" }, 400);
    p.set("title", t);
  }
  if (body.description !== undefined) p.set("description", str(body.description, 500) || null);
  if (body.accent !== undefined) p.set("accent", str(body.accent, 24) || "terracotta");
  if (body.cover_url !== undefined) p.set("cover_url", str(body.cover_url, 400) || null);
  let nextVis = col.visibility;
  if (body.visibility !== undefined) {
    nextVis = cleanCollVis(body.visibility);
    p.set("visibility", nextVis);
  }
  if (!p.empty) {
    p.set("updated_at", now());
    await c.env.DB.prepare(`UPDATE memory_collections SET ${p.clause()} WHERE id = ? AND user_id = ?`)
      .bind(...p.values(), id, me)
      .run();
  }
  // Membres : pris en compte si fournis et visibilité finale 'custom'.
  if (Array.isArray(body.member_ids)) {
    if (nextVis === "custom") await setMembers(c.env.DB, me, id, body.member_ids);
    else await c.env.DB.prepare("DELETE FROM memory_collection_members WHERE collection_id = ?").bind(id).run();
  } else if (nextVis !== "custom") {
    await c.env.DB.prepare("DELETE FROM memory_collection_members WHERE collection_id = ?").bind(id).run();
  }
  return c.json({ ok: true });
});

// Supprime une collection (et ses souvenirs + médias R2).
app.delete("/collections/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const col = await c.env.DB.prepare("SELECT id FROM memory_collections WHERE id = ? AND user_id = ?")
    .bind(id, me)
    .first();
  if (!col) return c.json({ error: "Collection introuvable" }, 404);
  const keys = await c.env.DB.prepare("SELECT r2_key FROM memories WHERE collection_id = ? AND r2_key IS NOT NULL")
    .bind(id)
    .all<{ r2_key: string }>();
  for (const k of keys.results ?? []) {
    if (k.r2_key) await c.env.MEDIA.delete(k.r2_key);
  }
  await c.env.DB.prepare("DELETE FROM memory_collections WHERE id = ? AND user_id = ?").bind(id, me).run();
  return c.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
//  Souvenirs
// ════════════════════════════════════════════════════════════════════════════

// Fil des souvenirs (les miens + ceux qu'on m'a partagés).
app.get("/memories", async (c) => {
  const me = c.var.user!.id;
  const scope = str(c.req.query("scope"), 10);
  const collectionId = str(c.req.query("collection_id"), 60);
  const fids = await friendIds(c.env.DB, me);

  let where: string;
  let binds: unknown[];
  if (scope === "mine") {
    where = "m.user_id = ?";
    binds = [me];
  } else {
    const v = visibleWhere(me, fids);
    where = v.sql;
    binds = v.binds;
  }
  if (collectionId) {
    where = `(${where}) AND m.collection_id = ?`;
    binds = [...binds, collectionId];
  }

  const res = await c.env.DB.prepare(
    `SELECT ${MEM_COLS}, ${PUB_U} FROM memories m
     JOIN memory_collections c ON c.id = m.collection_id
     JOIN users u ON u.id = m.user_id
     WHERE ${where}
     ORDER BY m.taken_at DESC LIMIT 100`,
  )
    .bind(...binds)
    .all<Record<string, unknown>>();
  const memories = (res.results ?? []).map((r) => toMemory(r, toPub(r), me));
  await attachSocial(c.env.DB, me, memories);
  return c.json({ memories });
});

// Récap « stories » : souvenirs récents groupés par auteur (reels).
app.get("/recap", async (c) => {
  const me = c.var.user!.id;
  const days = Math.min(60, Math.max(1, intOrNull(c.req.query("days")) ?? 7));
  const cutoff = now() - days * 24 * 60 * 60 * 1000;
  const fids = await friendIds(c.env.DB, me);
  const v = visibleWhere(me, fids);

  const res = await c.env.DB.prepare(
    `SELECT ${MEM_COLS}, ${PUB_U} FROM memories m
     JOIN memory_collections c ON c.id = m.collection_id
     JOIN users u ON u.id = m.user_id
     WHERE ${v.sql} AND m.taken_at >= ?
     ORDER BY m.taken_at ASC LIMIT 300`,
  )
    .bind(...v.binds, cutoff)
    .all<Record<string, unknown>>();

  const memories = (res.results ?? []).map((r) => toMemory(r, toPub(r), me));
  await attachSocial(c.env.DB, me, memories);

  // Groupe par auteur.
  const byAuthor = new Map<string, MemoryReel>();
  for (const m of memories) {
    let reel = byAuthor.get(m.author.id);
    if (!reel) {
      reel = { author: m.author, is_mine: m.author.id === me, count: 0, latest_at: 0, cover_url: null, memories: [] };
      byAuthor.set(m.author.id, reel);
    }
    reel.memories.push(m);
    reel.count++;
    if (m.taken_at > reel.latest_at) reel.latest_at = m.taken_at;
    if (!reel.cover_url) reel.cover_url = m.media_url ?? m.link_image ?? null;
  }
  // Moi d'abord, puis les plus récents.
  const reels = [...byAuthor.values()].sort((a, b) => {
    if (a.is_mine !== b.is_mine) return a.is_mine ? -1 : 1;
    return b.latest_at - a.latest_at;
  });
  return c.json({ reels, days });
});

// Crée un souvenir. Deux modes :
//   • multipart/form-data → import d'une photo/vidéo (champ "file")
//   • application/json     → lien externe ('link') ou note ('text')
app.post("/memories", async (c) => {
  const me = c.var.user!.id;
  const ct = c.req.header("content-type") ?? "";

  if (ct.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const raw = form.get("file");
    if (!raw || typeof raw === "string") return c.json({ error: "Fichier manquant" }, 400);
    const file = raw as unknown as { size: number; name: string; type: string; arrayBuffer(): Promise<ArrayBuffer> };
    if (file.size > MAX_BYTES) return c.json({ error: "Fichier trop volumineux (max 60 Mo)" }, 413);
    // Souvenirs = photos ou vidéos uniquement (cf. XSS stocké via fichier piégé).
    if (!isImageOrVideoUpload(file.type)) return c.json({ error: "Choisis une photo ou une vidéo" }, 400);

    const collectionId = await resolveCollection(c.env.DB, me, str(form.get("collection_id"), 60));
    if (!collectionId) return c.json({ error: "Collection invalide" }, 400);

    const id = uid();
    const isVideo = (file.type || "").startsWith("video/");
    const kind: MemoryKind = isVideo ? "video" : "photo";
    const safeName = str(file.name || "souvenir", 120).replace(/[^\w.\-]+/g, "_");
    const key = `fil/${me}/${id}-${safeName}`;
    await c.env.MEDIA.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
    const takenAt = intOrNull(form.get("taken_at")) ?? now();
    const ts = now();
    await c.env.DB.prepare(
      `INSERT INTO memories (id, user_id, collection_id, kind, caption, r2_key, content_type, size, taken_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, me, collectionId, kind, str(form.get("caption"), 1000) || null, key, file.type || null, file.size, takenAt, ts, ts)
      .run();
    await touchCollection(c.env.DB, collectionId);
    return c.json({ id });
  }

  const body = await c.req.json().catch(() => ({}));
  const collectionId = await resolveCollection(c.env.DB, me, str(body.collection_id, 60));
  if (!collectionId) return c.json({ error: "Collection invalide" }, 400);
  const caption = str(body.caption, 1000) || null;
  const rawUrl = str(body.url, 600).trim();

  let kind: MemoryKind = "text";
  let url: string | null = null;
  let linkTitle: string | null = null;
  let linkImage: string | null = null;
  let linkProvider: string | null = null;

  if (rawUrl) {
    const preview = await fetchLinkPreview(rawUrl, {
      title: str(body.link_title, 300) || null,
      image: str(body.link_image, 600) || null,
      provider: str(body.link_provider, 40) || null,
    });
    kind = preview.kind;
    url = preview.url;
    linkTitle = preview.title;
    linkImage = preview.image;
    linkProvider = preview.provider;
  } else if (!caption) {
    return c.json({ error: "Ajoute un lien ou un texte" }, 400);
  }

  const id = uid();
  const takenAt = intOrNull(body.taken_at) ?? now();
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO memories (id, user_id, collection_id, kind, caption, url, link_title, link_image, link_provider, taken_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, me, collectionId, kind, caption, url, linkTitle, linkImage, linkProvider, takenAt, ts, ts)
    .run();
  await touchCollection(c.env.DB, collectionId);
  return c.json({ id });
});

/** Valide la collection cible (doit m'appartenir) ; crée une collection par
 *  défaut « Mes souvenirs » si aucune n'est fournie. Renvoie null si invalide. */
async function resolveCollection(db: AppEnv["Bindings"]["DB"], me: string, collectionId: string): Promise<string | null> {
  if (collectionId) {
    const ok = await db.prepare("SELECT 1 FROM memory_collections WHERE id = ? AND user_id = ?").bind(collectionId, me).first();
    return ok ? collectionId : null;
  }
  const existing = await db
    .prepare("SELECT id FROM memory_collections WHERE user_id = ? ORDER BY position ASC, created_at ASC LIMIT 1")
    .bind(me)
    .first<{ id: string }>();
  if (existing) return existing.id;
  const id = uid();
  const ts = now();
  await db
    .prepare(
      `INSERT INTO memory_collections (id, user_id, title, description, accent, visibility, position, created_at, updated_at)
       VALUES (?, ?, 'Mes souvenirs', NULL, 'terracotta', 'private', 0, ?, ?)`,
    )
    .bind(id, me, ts, ts)
    .run();
  return id;
}

async function touchCollection(db: AppEnv["Bindings"]["DB"], collectionId: string): Promise<void> {
  await db.prepare("UPDATE memory_collections SET updated_at = ? WHERE id = ?").bind(now(), collectionId).run();
}

// Sert le binaire (photo/vidéo) depuis R2, en vérifiant l'accès à la collection.
app.get("/memories/:id/raw", attachUser, async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT r2_key, content_type FROM memories WHERE id = ?")
    .bind(id)
    .first<{ r2_key: string | null; content_type: string | null }>();
  if (!row || !row.r2_key) return c.json({ error: "Introuvable" }, 404);
  if (!(await canViewMemory(c.env.DB, c.var.user?.id ?? null, id!))) return c.json({ error: "Accès refusé" }, 403);
  const obj = await c.env.MEDIA.get(row.r2_key);
  if (!obj) return c.json({ error: "Fichier absent" }, 404);
  const headers = new Headers();
  // Content-Type assaini + nosniff (cf. media.ts) : pas d'exécution d'un fichier piégé.
  headers.set("Content-Type", safeServedContentType(row.content_type));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", "private, max-age=86400");
  return new Response(obj.body, { headers });
});

// Modifie un souvenir (légende / collection / date).
app.patch("/memories/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const own = await c.env.DB.prepare("SELECT id FROM memories WHERE id = ? AND user_id = ?").bind(id, me).first();
  if (!own) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const p = new PatchSet();
  if (body.caption !== undefined) p.set("caption", str(body.caption, 1000) || null);
  if (body.taken_at !== undefined) p.set("taken_at", intOrNull(body.taken_at) ?? now());
  if (body.collection_id !== undefined) {
    const target = await c.env.DB.prepare("SELECT id FROM memory_collections WHERE id = ? AND user_id = ?")
      .bind(str(body.collection_id, 60), me)
      .first();
    if (!target) return c.json({ error: "Collection invalide" }, 400);
    p.set("collection_id", str(body.collection_id, 60));
  }
  if (p.empty) return c.json({ error: "Rien à mettre à jour" }, 400);
  p.set("updated_at", now());
  await c.env.DB.prepare(`UPDATE memories SET ${p.clause()} WHERE id = ? AND user_id = ?`).bind(...p.values(), id, me).run();
  return c.json({ ok: true });
});

// Supprime un souvenir (+ média R2).
app.delete("/memories/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT r2_key FROM memories WHERE id = ? AND user_id = ?")
    .bind(id, me)
    .first<{ r2_key: string | null }>();
  if (!row) return c.json({ error: "Introuvable" }, 404);
  if (row.r2_key) await c.env.MEDIA.delete(row.r2_key);
  await c.env.DB.prepare("DELETE FROM memories WHERE id = ? AND user_id = ?").bind(id, me).run();
  return c.json({ ok: true });
});

// Aperçu d'un lien (métadonnées) — utilisé par le compositeur avant l'ajout.
app.post("/preview", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const rawUrl = str(body.url, 600).trim();
  if (!rawUrl) return c.json({ error: "Lien requis" }, 400);
  const preview = await fetchLinkPreview(rawUrl, { title: null, image: null, provider: null });
  return c.json({ preview });
});

// ── Aperçu de lien (OpenGraph, best-effort) ─────────────────────────────────
const VIDEO_PROVIDERS = new Set(["youtube", "vimeo", "tiktok", "dailymotion"]);

function detectProvider(host: string): string {
  const h = host.replace(/^www\./, "");
  if (h.includes("youtube.com") || h.includes("youtu.be")) return "youtube";
  if (h.includes("tiktok.com")) return "tiktok";
  if (h.includes("instagram.com")) return "instagram";
  if (h.includes("pinterest.")) return "pinterest";
  if (h.includes("vimeo.com")) return "vimeo";
  if (h.includes("dailymotion.com")) return "dailymotion";
  if (h.includes("spotify.com")) return "spotify";
  if (h.includes("twitter.com") || h.includes("x.com")) return "twitter";
  if (h.includes("facebook.com")) return "facebook";
  if (h.includes("snapchat.com")) return "snapchat";
  return "web";
}

function youtubeId(u: URL): string | null {
  if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
  if (u.searchParams.get("v")) return u.searchParams.get("v");
  const m = u.pathname.match(/\/(shorts|embed)\/([\w-]+)/);
  return m ? m[2] : null;
}

function metaFromHtml(html: string, prop: string): string | null {
  // <meta property="og:image" content="..."> ou name="twitter:image"
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`,
    "i",
  );
  const m = html.match(re) || html.match(re2);
  return m ? decodeEntities(m[1]) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchLinkPreview(
  rawUrl: string,
  hint: { title: string | null; image: string | null; provider: string | null },
): Promise<LinkPreview> {
  let normalized = rawUrl.trim();
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return { url: rawUrl, title: hint.title, image: hint.image, provider: hint.provider, kind: "link" };
  }

  const provider = hint.provider || detectProvider(url.hostname);
  let title = hint.title;
  let image = hint.image;

  // YouTube : vignette déterministe sans requête réseau.
  if (provider === "youtube" && !image) {
    const id = youtubeId(url);
    if (id) image = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }

  // Sinon, tentative best-effort de récupération des métadonnées OpenGraph.
  // Garde SSRF : on ne va PAS chercher une URL pointant vers le réseau interne /
  // l'endpoint de métadonnées cloud (Oracle 169.254.169.254, localhost, IP privée).
  if ((!image || !title) && !isBlockedPreviewHost(url.hostname)) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      const res = await fetch(url.toString(), {
        signal: ctrl.signal,
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; marienourbot/1.0)", Accept: "text/html" },
      });
      clearTimeout(timer);
      const ctype = res.headers.get("content-type") ?? "";
      if (res.ok && ctype.includes("text/html")) {
        const html = (await res.text()).slice(0, 200_000);
        title = title || metaFromHtml(html, "og:title") || metaFromHtml(html, "twitter:title");
        image = image || metaFromHtml(html, "og:image") || metaFromHtml(html, "twitter:image");
        if (!title) {
          const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (t) title = decodeEntities(t[1].trim());
        }
      }
    } catch {
      // best-effort : on garde ce qu'on a (provider + éventuelle vignette).
    }
  }

  // Image relative → absolue.
  if (image && image.startsWith("/")) {
    try {
      image = new URL(image, url.origin).toString();
    } catch {
      /* ignore */
    }
  }

  const kind: MemoryKind = VIDEO_PROVIDERS.has(provider) ? "video" : "link";
  return { url: url.toString(), title: title?.slice(0, 300) ?? null, image: image ?? null, provider, kind };
}

export default app;
