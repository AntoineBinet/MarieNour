import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { areFriends, canViewAlbum, friendIds } from "../access";
import { PUB, toPub } from "../pub";
import { cleanVisibility, now, PatchSet, str, uid } from "../util";
import type { Album, AlbumDetail, MediaItem, PublicUser, Visibility } from "@shared/types";

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

function toMedia(r: Record<string, unknown>): MediaItem {
  return {
    id: r.id as string,
    url: `/api/media/${r.id as string}/raw`,
    filename: (r.filename as string) ?? null,
    content_type: (r.content_type as string) ?? null,
    size: (r.size as number) ?? null,
    caption: (r.caption as string) ?? null,
    visibility: cleanVisibility(r.visibility),
    created_at: r.created_at as number,
  };
}

/** Couverture d'un album : la photo choisie, sinon la première du album. */
async function coverUrl(db: AppEnv["Bindings"]["DB"], row: Record<string, unknown>): Promise<string | null> {
  if (row.cover_media_id) return `/api/media/${row.cover_media_id as string}/raw`;
  const first = await db
    .prepare("SELECT media_id FROM album_media WHERE album_id = ? ORDER BY position, added_at LIMIT 1")
    .bind(row.id as string)
    .first<{ media_id: string }>();
  return first ? `/api/media/${first.media_id}/raw` : null;
}

async function photoCount(db: AppEnv["Bindings"]["DB"], albumId: string): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM album_media WHERE album_id = ?").bind(albumId).first<{ n: number }>();
  return r?.n ?? 0;
}

async function toAlbum(
  db: AppEnv["Bindings"]["DB"],
  row: Record<string, unknown>,
  me: string,
  owner?: PublicUser | null,
): Promise<Album> {
  const isOwner = (row.user_id as string) === me;
  const id = row.id as string;
  const album: Album = {
    id,
    title: row.title as string,
    description: (row.description as string) ?? null,
    cover_url: await coverUrl(db, row),
    visibility: cleanVisibility(row.visibility),
    position: (row.position as number) ?? 0,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
    photo_count: await photoCount(db, id),
    is_owner: isOwner,
    owner: isOwner ? undefined : owner ?? null,
  };
  if (isOwner) {
    const s = await db.prepare("SELECT COUNT(*) AS n FROM shares WHERE entity_type = 'album' AND entity_id = ?").bind(id).first<{ n: number }>();
    album.shared_count = s?.n ?? 0;
  }
  return album;
}

/** Charge un album et vérifie l'accès. Renvoie null si introuvable/refusé. */
async function loadViewable(db: AppEnv["Bindings"]["DB"], me: string, id: string): Promise<Record<string, unknown> | null> {
  const row = await db.prepare("SELECT * FROM albums WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!row) return null;
  const ok = await canViewAlbum(db, me, row.user_id as string, cleanVisibility(row.visibility), id);
  return ok ? row : null;
}

/** Exige que l'album existe et que `me` en soit le propriétaire. */
async function loadOwned(db: AppEnv["Bindings"]["DB"], me: string, id: string): Promise<Record<string, unknown> | null> {
  const row = await db.prepare("SELECT * FROM albums WHERE id = ? AND user_id = ?").bind(id, me).first<Record<string, unknown>>();
  return row ?? null;
}

// ── Liste : mes albums (défaut) ou ceux partagés avec moi (?scope=shared) ────
app.get("/", async (c) => {
  const me = c.var.user!.id;
  const scope = c.req.query("scope") === "shared" ? "shared" : "mine";

  if (scope === "mine") {
    const res = await c.env.DB.prepare("SELECT * FROM albums WHERE user_id = ? ORDER BY position, created_at DESC")
      .bind(me)
      .all<Record<string, unknown>>();
    const albums = [];
    for (const r of res.results ?? []) albums.push(await toAlbum(c.env.DB, r, me));
    return c.json({ albums });
  }

  // « Partagé avec moi » : partage explicite OU album d'un ami visible (friends/public).
  const fids = await friendIds(c.env.DB, me);
  const rows = new Map<string, Record<string, unknown>>();

  const shared = await c.env.DB.prepare(
    `SELECT a.* FROM albums a
     JOIN shares s ON s.entity_type = 'album' AND s.entity_id = a.id
     WHERE s.shared_with_id = ?`,
  )
    .bind(me)
    .all<Record<string, unknown>>();
  for (const r of shared.results ?? []) rows.set(r.id as string, r);

  if (fids.length) {
    const ph = fids.map(() => "?").join(",");
    const fres = await c.env.DB.prepare(
      `SELECT * FROM albums WHERE user_id IN (${ph}) AND visibility IN ('friends','public')`,
    )
      .bind(...fids)
      .all<Record<string, unknown>>();
    for (const r of fres.results ?? []) rows.set(r.id as string, r);
  }

  // Auteurs (pour l'avatar / le nom).
  const ownerIds = [...new Set([...rows.values()].map((r) => r.user_id as string))];
  const owners = new Map<string, PublicUser>();
  if (ownerIds.length) {
    const ph = ownerIds.map(() => "?").join(",");
    const ores = await c.env.DB.prepare(`SELECT ${PUB} FROM users WHERE id IN (${ph})`)
      .bind(...ownerIds)
      .all<Record<string, unknown>>();
    for (const o of ores.results ?? []) owners.set(o.id as string, toPub(o));
  }

  const albums = [];
  for (const r of rows.values()) albums.push(await toAlbum(c.env.DB, r, me, owners.get(r.user_id as string) ?? null));
  albums.sort((a, b) => b.updated_at - a.updated_at);
  return c.json({ albums });
});

// ── Détail (photos + destinataires si propriétaire) ─────────────────────────
app.get("/:id", async (c) => {
  const me = c.var.user!.id;
  const row = await loadViewable(c.env.DB, me, c.req.param("id"));
  if (!row) return c.json({ error: "Album introuvable" }, 404);
  const id = row.id as string;
  const isOwner = (row.user_id as string) === me;

  const owner = isOwner
    ? null
    : await c.env.DB.prepare(`SELECT ${PUB} FROM users WHERE id = ?`).bind(row.user_id as string).first<Record<string, unknown>>();

  const base = await toAlbum(c.env.DB, row, me, owner ? toPub(owner) : null);

  const photosRes = await c.env.DB.prepare(
    `SELECT m.* FROM album_media am JOIN media m ON m.id = am.media_id
     WHERE am.album_id = ? ORDER BY am.position, am.added_at DESC`,
  )
    .bind(id)
    .all<Record<string, unknown>>();

  let shared_with: PublicUser[] = [];
  if (isOwner) {
    const sres = await c.env.DB.prepare(
      `SELECT ${PUB.split(", ").map((c2) => `u.${c2}`).join(", ")}
       FROM shares s JOIN users u ON u.id = s.shared_with_id
       WHERE s.entity_type = 'album' AND s.entity_id = ?`,
    )
      .bind(id)
      .all<Record<string, unknown>>();
    shared_with = (sres.results ?? []).map(toPub);
  }

  const detail: AlbumDetail = {
    ...base,
    photos: (photosRes.results ?? []).map(toMedia),
    shared_with,
  };
  return c.json({ album: detail });
});

// ── Créer ───────────────────────────────────────────────────────────────────
app.post("/", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const title = str(body.title, 120).trim();
  if (!title) return c.json({ error: "Donne un titre à ton album" }, 400);
  const id = uid();
  const ts = now();
  await c.env.DB.prepare(
    "INSERT INTO albums (id, user_id, title, description, cover_media_id, visibility, position, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, 0, ?, ?)",
  )
    .bind(id, me, title, str(body.description, 1000) || null, cleanVisibility(body.visibility), ts, ts)
    .run();
  // Photos initiales optionnelles.
  if (Array.isArray(body.media_ids) && body.media_ids.length) {
    await addPhotos(c.env.DB, me, id, body.media_ids);
  }
  const row = await c.env.DB.prepare("SELECT * FROM albums WHERE id = ?").bind(id).first<Record<string, unknown>>();
  return c.json({ album: await toAlbum(c.env.DB, row!, me) });
});

// ── Modifier ─────────────────────────────────────────────────────────────────
app.patch("/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const row = await loadOwned(c.env.DB, me, id);
  if (!row) return c.json({ error: "Album introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const p = new PatchSet();
  if (typeof body.title === "string" && body.title.trim()) {
    p.set("title", str(body.title, 120).trim());
  }
  if (body.description !== undefined) {
    p.set("description", str(body.description, 1000) || null);
  }
  if (body.visibility !== undefined) {
    p.set("visibility", cleanVisibility(body.visibility));
  }
  if (body.cover_media_id !== undefined) {
    const cover = str(body.cover_media_id, 60) || null;
    if (cover) {
      // La couverture doit être une photo de l'album.
      const inAlbum = await c.env.DB.prepare("SELECT 1 FROM album_media WHERE album_id = ? AND media_id = ?").bind(id, cover).first();
      if (!inAlbum) return c.json({ error: "Cette photo n'est pas dans l'album" }, 400);
    }
    p.set("cover_media_id", cover);
  }
  if (p.empty) return c.json({ error: "Rien à mettre à jour" }, 400);
  p.set("updated_at", now());
  await c.env.DB.prepare(`UPDATE albums SET ${p.clause()} WHERE id = ? AND user_id = ?`).bind(...p.values(), id, me).run();
  return c.json({ ok: true });
});

// ── Supprimer (les liaisons album_media partent en cascade) ──────────────────
app.delete("/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM albums WHERE id = ? AND user_id = ?").bind(id, me).run();
  await c.env.DB.prepare("DELETE FROM shares WHERE entity_type = 'album' AND entity_id = ?").bind(id).run();
  return c.json({ ok: true });
});

/** Ajoute des photos (m'appartenant) à un album (m'appartenant), sans doublon. */
async function addPhotos(db: AppEnv["Bindings"]["DB"], me: string, albumId: string, mediaIds: unknown[]): Promise<number> {
  const ts = now();
  let added = 0;
  let pos = (await db.prepare("SELECT COALESCE(MAX(position), -1) AS p FROM album_media WHERE album_id = ?").bind(albumId).first<{ p: number }>())?.p ?? -1;
  for (const raw of mediaIds.slice(0, 500)) {
    const mid = str(raw, 60);
    if (!mid) continue;
    const mine = await db.prepare("SELECT 1 FROM media WHERE id = ? AND user_id = ?").bind(mid, me).first();
    if (!mine) continue; // on n'ajoute que ses propres photos
    const already = await db.prepare("SELECT 1 FROM album_media WHERE album_id = ? AND media_id = ?").bind(albumId, mid).first();
    if (already) continue;
    pos++;
    await db
      .prepare("INSERT OR IGNORE INTO album_media (album_id, media_id, position, added_at) VALUES (?, ?, ?, ?)")
      .bind(albumId, mid, pos, ts)
      .run();
    added++;
  }
  if (added) await db.prepare("UPDATE albums SET updated_at = ? WHERE id = ?").bind(ts, albumId).run();
  return added;
}

// ── Ajouter des photos ───────────────────────────────────────────────────────
app.post("/:id/photos", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const row = await loadOwned(c.env.DB, me, id);
  if (!row) return c.json({ error: "Album introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const ids = Array.isArray(body.media_ids) ? body.media_ids : [];
  if (!ids.length) return c.json({ error: "Aucune photo" }, 400);
  const added = await addPhotos(c.env.DB, me, id, ids);
  return c.json({ ok: true, added });
});

// ── Retirer une photo de l'album (ne supprime pas la photo elle-même) ────────
app.delete("/:id/photos/:mediaId", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const row = await loadOwned(c.env.DB, me, id);
  if (!row) return c.json({ error: "Album introuvable" }, 404);
  const mediaId = c.req.param("mediaId");
  await c.env.DB.prepare("DELETE FROM album_media WHERE album_id = ? AND media_id = ?").bind(id, mediaId).run();
  // Si c'était la couverture, on la retire.
  if (row.cover_media_id === mediaId) {
    await c.env.DB.prepare("UPDATE albums SET cover_media_id = NULL WHERE id = ?").bind(id).run();
  }
  await c.env.DB.prepare("UPDATE albums SET updated_at = ? WHERE id = ?").bind(now(), id).run();
  return c.json({ ok: true });
});

// ── Partager l'album à un ami précis ─────────────────────────────────────────
app.post("/:id/shares", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const row = await loadOwned(c.env.DB, me, id);
  if (!row) return c.json({ error: "Album introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const userId = str(body.user_id, 60);
  if (!userId || userId === me) return c.json({ error: "Destinataire invalide" }, 400);
  if (!(await areFriends(c.env.DB, me, userId))) return c.json({ error: "Tu ne peux partager qu'avec un ami" }, 403);
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO shares (id, owner_id, entity_type, entity_id, shared_with_id, can_edit, created_at) VALUES (?, ?, 'album', ?, ?, 0, ?)",
  )
    .bind(uid(), me, id, userId, now())
    .run();
  return c.json({ ok: true });
});

app.delete("/:id/shares/:userId", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const row = await loadOwned(c.env.DB, me, id);
  if (!row) return c.json({ error: "Album introuvable" }, 404);
  await c.env.DB.prepare("DELETE FROM shares WHERE entity_type = 'album' AND entity_id = ? AND shared_with_id = ? AND owner_id = ?")
    .bind(id, c.req.param("userId"), me)
    .run();
  return c.json({ ok: true });
});

export default app;
