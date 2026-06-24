import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { canView, canViewMemory, friendIds } from "../access";
import { cleanVisibility, now, str, uid } from "../util";
import type { Comment, FeedItem, PublicUser, Visibility } from "@shared/types";

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

const ENTITY_TYPES = ["note", "recipe", "trip", "board", "inspiration", "list", "media", "event", "memory"];

interface EntityMeta {
  owner_id: string;
  visibility: Visibility;
  title: string | null;
  preview: string | null;
  image_url: string | null;
}

async function entityMeta(db: AppEnv["Bindings"]["DB"], type: string, id: string): Promise<EntityMeta | null> {
  switch (type) {
    case "note": {
      const r = await db.prepare("SELECT user_id, visibility, title, body FROM notes WHERE id = ?").bind(id).first<Record<string, unknown>>();
      return r ? { owner_id: r.user_id as string, visibility: cleanVisibility(r.visibility), title: (r.title as string) ?? "Note", preview: ((r.body as string) ?? "").slice(0, 160), image_url: null } : null;
    }
    case "recipe": {
      const r = await db.prepare("SELECT user_id, visibility, title, description, image_url FROM recipes WHERE id = ?").bind(id).first<Record<string, unknown>>();
      return r ? { owner_id: r.user_id as string, visibility: cleanVisibility(r.visibility), title: r.title as string, preview: ((r.description as string) ?? "").slice(0, 160), image_url: (r.image_url as string) ?? null } : null;
    }
    case "trip": {
      const r = await db.prepare("SELECT user_id, visibility, title, destination, cover_url FROM trips WHERE id = ?").bind(id).first<Record<string, unknown>>();
      return r ? { owner_id: r.user_id as string, visibility: cleanVisibility(r.visibility), title: r.title as string, preview: (r.destination as string) ?? null, image_url: (r.cover_url as string) ?? null } : null;
    }
    case "board": {
      const r = await db.prepare("SELECT user_id, visibility, title, description, cover_url FROM boards WHERE id = ?").bind(id).first<Record<string, unknown>>();
      return r ? { owner_id: r.user_id as string, visibility: cleanVisibility(r.visibility), title: r.title as string, preview: (r.description as string) ?? null, image_url: (r.cover_url as string) ?? null } : null;
    }
    case "inspiration": {
      const r = await db.prepare("SELECT user_id, visibility, title, note, image_url FROM inspirations WHERE id = ?").bind(id).first<Record<string, unknown>>();
      return r ? { owner_id: r.user_id as string, visibility: cleanVisibility(r.visibility), title: (r.title as string) ?? "Inspiration", preview: (r.note as string) ?? null, image_url: (r.image_url as string) ?? null } : null;
    }
    case "list": {
      const r = await db.prepare("SELECT user_id, visibility, title FROM lists WHERE id = ?").bind(id).first<Record<string, unknown>>();
      return r ? { owner_id: r.user_id as string, visibility: cleanVisibility(r.visibility), title: r.title as string, preview: null, image_url: null } : null;
    }
    case "media": {
      const r = await db.prepare("SELECT user_id, visibility, caption FROM media WHERE id = ?").bind(id).first<Record<string, unknown>>();
      return r ? { owner_id: r.user_id as string, visibility: cleanVisibility(r.visibility), title: (r.caption as string) ?? "Photo", preview: null, image_url: `/api/media/${id}/raw` } : null;
    }
    case "event": {
      const r = await db.prepare("SELECT user_id, visibility, title, description, cover_url FROM events WHERE id = ?").bind(id).first<Record<string, unknown>>();
      return r ? { owner_id: r.user_id as string, visibility: cleanVisibility(r.visibility), title: r.title as string, preview: (r.description as string) ?? null, image_url: (r.cover_url as string) ?? null } : null;
    }
    case "memory": {
      // L'accès réel passe par la collection (cf. canAccessEntity) ; la visibilité
      // renvoyée ici est seulement indicative (les collections 'custom' ne sont
      // pas une Visibility standard).
      const r = await db.prepare("SELECT user_id, kind, caption FROM memories WHERE id = ?").bind(id).first<Record<string, unknown>>();
      return r ? { owner_id: r.user_id as string, visibility: "private", title: (r.caption as string) ?? "Souvenir", preview: null, image_url: null } : null;
    }
    default:
      return null;
  }
}

/** Le viewer peut-il interagir (voir/aimer/commenter) avec cette entité ?
 *  Cas général : visibilité (privé/amis/public). Cas « event » : un invité de
 *  l'événement y a aussi accès, même si l'événement est privé. */
async function canAccessEntity(
  db: AppEnv["Bindings"]["DB"],
  me: string,
  type: string,
  entityId: string,
  meta: EntityMeta,
): Promise<boolean> {
  // Un souvenir : l'accès est entièrement porté par sa collection (privé / amis /
  // amis précis / public), y compris la visibilité 'custom'.
  if (type === "memory") return canViewMemory(db, me, entityId);
  if (await canView(db, me, meta.owner_id, meta.visibility)) return true;
  if (type === "event") {
    const g = await db.prepare("SELECT 1 FROM event_guests WHERE event_id = ? AND user_id = ?").bind(entityId, me).first();
    return !!g;
  }
  return false;
}

const PUB = "id, display_name, handle, role, avatar_url, bio, accent, created_at";
const PUB_U = PUB.split(", ")
  .map((c) => `u.${c}`)
  .join(", ");
function toPub(r: Record<string, unknown>): PublicUser {
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

// ── Feed des amis ──────────────────────────────────────────────────────────
app.get("/feed", async (c) => {
  const me = c.var.user!.id;
  const fids = await friendIds(c.env.DB, me);
  if (!fids.length) return c.json({ feed: [] });
  const placeholders = fids.map(() => "?").join(",");

  // Récupère les utilisateurs (auteurs) une fois.
  const authorsRes = await c.env.DB.prepare(`SELECT ${PUB} FROM users WHERE id IN (${placeholders})`)
    .bind(...fids)
    .all<Record<string, unknown>>();
  const authors = new Map<string, PublicUser>();
  for (const a of authorsRes.results ?? []) authors.set(a.id as string, toPub(a));

  const queries: { type: string; sql: string }[] = [
    { type: "note", sql: "SELECT id, user_id, title, body AS preview, NULL AS image_url, visibility, updated_at FROM notes" },
    { type: "recipe", sql: "SELECT id, user_id, title, description AS preview, image_url, visibility, updated_at FROM recipes" },
    { type: "trip", sql: "SELECT id, user_id, title, destination AS preview, cover_url AS image_url, visibility, updated_at FROM trips" },
    { type: "board", sql: "SELECT id, user_id, title, description AS preview, cover_url AS image_url, visibility, updated_at FROM boards" },
    { type: "inspiration", sql: "SELECT id, user_id, title, note AS preview, image_url, visibility, updated_at FROM inspirations" },
  ];

  const raw: (FeedItem & { _ts: number })[] = [];
  for (const q of queries) {
    const res = await c.env.DB.prepare(
      `${q.sql} WHERE user_id IN (${placeholders}) AND visibility IN ('friends','public') ORDER BY updated_at DESC LIMIT 30`,
    )
      .bind(...fids)
      .all<Record<string, unknown>>();
    for (const r of res.results ?? []) {
      const author = authors.get(r.user_id as string);
      if (!author) continue;
      let img = (r.image_url as string) ?? null;
      if (q.type === "inspiration" && img && img.startsWith("/")) img = img; // déjà relatif
      raw.push({
        entity_type: q.type,
        entity_id: r.id as string,
        author,
        title: (r.title as string) ?? null,
        preview: r.preview ? String(r.preview).slice(0, 160) : null,
        image_url: img,
        visibility: cleanVisibility(r.visibility),
        created_at: r.updated_at as number,
        like_count: 0,
        comment_count: 0,
        liked_by_me: false,
        _ts: r.updated_at as number,
      });
    }
  }

  raw.sort((a, b) => b._ts - a._ts);
  const feed = raw.slice(0, 60);

  // Compteurs likes/commentaires + liked_by_me.
  for (const item of feed) {
    const likeCount = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM likes WHERE entity_type = ? AND entity_id = ?")
      .bind(item.entity_type, item.entity_id)
      .first<{ n: number }>();
    const commentCount = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE entity_type = ? AND entity_id = ?")
      .bind(item.entity_type, item.entity_id)
      .first<{ n: number }>();
    const mine = await c.env.DB.prepare("SELECT 1 FROM likes WHERE user_id = ? AND entity_type = ? AND entity_id = ?")
      .bind(me, item.entity_type, item.entity_id)
      .first();
    item.like_count = likeCount?.n ?? 0;
    item.comment_count = commentCount?.n ?? 0;
    item.liked_by_me = !!mine;
  }

  return c.json({ feed: feed.map(({ _ts, ...rest }) => rest) });
});

// ── Likes (toggle) ─────────────────────────────────────────────────────────
app.post("/like", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const type = str(body.entity_type, 20);
  const entityId = str(body.entity_id, 60);
  if (!ENTITY_TYPES.includes(type) || !entityId) return c.json({ error: "Cible invalide" }, 400);

  const meta = await entityMeta(c.env.DB, type, entityId);
  if (!meta) return c.json({ error: "Contenu introuvable" }, 404);
  if (!(await canAccessEntity(c.env.DB, me, type, entityId, meta))) return c.json({ error: "Accès refusé" }, 403);

  const existing = await c.env.DB.prepare("SELECT id FROM likes WHERE user_id = ? AND entity_type = ? AND entity_id = ?")
    .bind(me, type, entityId)
    .first<{ id: string }>();
  if (existing) {
    await c.env.DB.prepare("DELETE FROM likes WHERE id = ?").bind(existing.id).run();
    return c.json({ liked: false });
  }
  await c.env.DB.prepare("INSERT INTO likes (id, user_id, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(uid(), me, type, entityId, now())
    .run();
  return c.json({ liked: true });
});

// ── Commentaires ───────────────────────────────────────────────────────────
app.get("/comments", async (c) => {
  const me = c.var.user!.id;
  const type = str(c.req.query("entity_type"), 20);
  const entityId = str(c.req.query("entity_id"), 60);
  if (!ENTITY_TYPES.includes(type) || !entityId) return c.json({ error: "Cible invalide" }, 400);
  const meta = await entityMeta(c.env.DB, type, entityId);
  if (!meta || !(await canAccessEntity(c.env.DB, me, type, entityId, meta))) return c.json({ error: "Accès refusé" }, 403);

  const res = await c.env.DB.prepare(
    `SELECT cm.id AS comment_id, cm.body, cm.created_at AS comment_created_at, ${PUB_U}
     FROM comments cm JOIN users u ON u.id = cm.user_id
     WHERE cm.entity_type = ? AND cm.entity_id = ? ORDER BY cm.created_at ASC`,
  )
    .bind(type, entityId)
    .all<Record<string, unknown>>();
  const comments: Comment[] = (res.results ?? []).map((r) => ({
    id: r.comment_id as string,
    body: r.body as string,
    created_at: r.comment_created_at as number,
    author: toPub(r),
  }));
  return c.json({ comments });
});

app.post("/comments", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const type = str(body.entity_type, 20);
  const entityId = str(body.entity_id, 60);
  const text = str(body.body, 2000).trim();
  if (!ENTITY_TYPES.includes(type) || !entityId || !text) return c.json({ error: "Données invalides" }, 400);
  const meta = await entityMeta(c.env.DB, type, entityId);
  if (!meta || !(await canAccessEntity(c.env.DB, me, type, entityId, meta))) return c.json({ error: "Accès refusé" }, 403);

  const id = uid();
  await c.env.DB.prepare("INSERT INTO comments (id, user_id, entity_type, entity_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, me, type, entityId, text, now())
    .run();
  return c.json({ id });
});

app.delete("/comments/:id", async (c) => {
  const me = c.var.user!.id;
  await c.env.DB.prepare("DELETE FROM comments WHERE id = ? AND user_id = ?").bind(c.req.param("id"), me).run();
  return c.json({ ok: true });
});

// ── Profil public d'un utilisateur (par handle) ────────────────────────────
app.get("/profile/:handle", async (c) => {
  const me = c.var.user!.id;
  const handle = str(c.req.param("handle"), 40);
  const user = await c.env.DB.prepare(`SELECT ${PUB} FROM users WHERE handle = ?`).bind(handle).first<Record<string, unknown>>();
  if (!user) return c.json({ error: "Profil introuvable" }, 404);
  const uId = user.id as string;

  // Visibilités accessibles au viewer.
  const friend = me === uId || (await canView(c.env.DB, me, uId, "friends"));
  const vis = friend ? ["friends", "public"] : ["public"];
  if (me === uId) vis.push("private");
  const vph = vis.map(() => "?").join(",");

  const recipes = await c.env.DB.prepare(`SELECT id, title, image_url, visibility FROM recipes WHERE user_id = ? AND visibility IN (${vph}) ORDER BY updated_at DESC LIMIT 12`).bind(uId, ...vis).all();
  const trips = await c.env.DB.prepare(`SELECT id, title, destination, cover_url, visibility FROM trips WHERE user_id = ? AND visibility IN (${vph}) ORDER BY updated_at DESC LIMIT 12`).bind(uId, ...vis).all();
  const boards = await c.env.DB.prepare(`SELECT id, title, cover_url, visibility FROM boards WHERE user_id = ? AND visibility IN (${vph}) ORDER BY updated_at DESC LIMIT 12`).bind(uId, ...vis).all();

  return c.json({
    user: toPub(user),
    is_self: me === uId,
    is_friend: friend && me !== uId,
    recipes: recipes.results ?? [],
    trips: trips.results ?? [],
    boards: boards.results ?? [],
  });
});

export default app;
