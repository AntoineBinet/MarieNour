import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { cleanSharedWith, cleanVisibility, now, parseJson, str, uid } from "../util";
import { setEntityShares, getEntitySharesBulk, deleteEntityShares } from "../access";
import type { Board, Inspiration } from "@shared/types";

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

const STATUSES = ["inbox", "kept", "done"];

function toBoard(r: Record<string, unknown>): Board {
  return {
    id: r.id as string,
    title: r.title as string,
    description: (r.description as string) ?? null,
    cover_url: (r.cover_url as string) ?? null,
    visibility: cleanVisibility(r.visibility),
    position: r.position as number,
    created_at: r.created_at as number,
    updated_at: r.updated_at as number,
    item_count: r.item_count as number | undefined,
  };
}

function toInsp(r: Record<string, unknown>): Inspiration {
  return {
    id: r.id as string,
    board_id: (r.board_id as string) ?? null,
    title: (r.title as string) ?? null,
    url: (r.url as string) ?? null,
    image_url: (r.image_url as string) ?? null,
    note: (r.note as string) ?? null,
    source: (r.source as string) ?? "web",
    tags: parseJson<string[]>(r.tags, []),
    status: (STATUSES.includes(r.status as string) ? r.status : "inbox") as Inspiration["status"],
    visibility: cleanVisibility(r.visibility),
    created_at: r.created_at as number,
    updated_at: r.updated_at as number,
  };
}

// ── Boards (moodboards / collections) ──────────────────────────────────────
app.get("/boards", async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT b.*, (SELECT COUNT(*) FROM inspirations i WHERE i.board_id = b.id) AS item_count
     FROM boards b WHERE b.user_id = ? ORDER BY b.position ASC, b.updated_at DESC`,
  )
    .bind(c.var.user!.id)
    .all<Record<string, unknown>>();
  const boards = (res.results ?? []).map(toBoard);
  const shareMap = await getEntitySharesBulk(c.env.DB, "board", boards.map((b) => b.id));
  for (const b of boards) {
    const s = shareMap.get(b.id);
    if (s && s.length) b.shared_with = s;
  }
  return c.json({ boards });
});

app.post("/boards", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const id = uid();
  const ts = now();
  const max = await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM boards WHERE user_id = ?")
    .bind(me)
    .first<{ m: number }>();
  await c.env.DB.prepare(
    `INSERT INTO boards (id, user_id, title, description, cover_url, visibility, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      me,
      str(body.title, 120).trim() || "Nouveau tableau",
      str(body.description, 1000) || null,
      str(body.cover_url, 1000) || null,
      cleanVisibility(body.visibility),
      (max?.m ?? -1) + 1,
      ts,
      ts,
    )
    .run();
  const _sw = cleanSharedWith(body.shared_with);
  if (_sw) await setEntityShares(c.env.DB, me, { type: "board", id }, _sw);
  return c.json({ id });
});

app.patch("/boards/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  const setIf = (key: string, col: string, t: (v: unknown) => unknown) => {
    if (body[key] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(t(body[key]));
    }
  };
  setIf("title", "title", (v) => str(v, 120));
  setIf("description", "description", (v) => str(v, 1000) || null);
  setIf("cover_url", "cover_url", (v) => str(v, 1000) || null);
  setIf("visibility", "visibility", (v) => cleanVisibility(v));
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  fields.push("updated_at = ?");
  values.push(now(), id, me);
  await c.env.DB.prepare(`UPDATE boards SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...values).run();
  const _sw = cleanSharedWith(body.shared_with);
  if (_sw) await setEntityShares(c.env.DB, me, { type: "board", id }, _sw);
  return c.json({ ok: true });
});

app.delete("/boards/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM boards WHERE id = ? AND user_id = ?")
    .bind(id, c.var.user!.id)
    .run();
  await deleteEntityShares(c.env.DB, { type: "board", id });
  return c.json({ ok: true });
});

// ── Items d'inspiration (la "boîte à enregistrés") ─────────────────────────
app.get("/items", async (c) => {
  const me = c.var.user!.id;
  const status = c.req.query("status");
  const board = c.req.query("board");
  const clauses = ["user_id = ?"];
  const binds: unknown[] = [me];
  if (status && STATUSES.includes(status)) {
    clauses.push("status = ?");
    binds.push(status);
  }
  if (board) {
    clauses.push("board_id = ?");
    binds.push(board);
  }
  const res = await c.env.DB.prepare(
    `SELECT * FROM inspirations WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`,
  )
    .bind(...binds)
    .all<Record<string, unknown>>();
  const items = (res.results ?? []).map(toInsp);
  const shareMap = await getEntitySharesBulk(c.env.DB, "inspiration", items.map((i) => i.id));
  for (const it of items) {
    const s = shareMap.get(it.id);
    if (s && s.length) it.shared_with = s;
  }
  return c.json({ items });
});

app.post("/items", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const id = uid();
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO inspirations (id, user_id, board_id, title, url, image_url, note, source, tags, status, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      me,
      str(body.board_id, 60) || null,
      str(body.title, 300) || null,
      str(body.url, 1000) || null,
      str(body.image_url, 1000) || null,
      str(body.note, 2000) || null,
      str(body.source, 40) || "web",
      JSON.stringify(Array.isArray(body.tags) ? body.tags.slice(0, 20).map((t: unknown) => str(t, 40)) : []),
      STATUSES.includes(body.status) ? body.status : "inbox",
      cleanVisibility(body.visibility),
      ts,
      ts,
    )
    .run();
  const _sw = cleanSharedWith(body.shared_with);
  if (_sw) await setEntityShares(c.env.DB, me, { type: "inspiration", id }, _sw);
  return c.json({ id });
});

app.patch("/items/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  const setIf = (key: string, col: string, t: (v: unknown) => unknown) => {
    if (body[key] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(t(body[key]));
    }
  };
  setIf("board_id", "board_id", (v) => str(v, 60) || null);
  setIf("title", "title", (v) => str(v, 300) || null);
  setIf("url", "url", (v) => str(v, 1000) || null);
  setIf("image_url", "image_url", (v) => str(v, 1000) || null);
  setIf("note", "note", (v) => str(v, 2000) || null);
  setIf("source", "source", (v) => str(v, 40));
  setIf("status", "status", (v) => (STATUSES.includes(v as string) ? v : "inbox"));
  setIf("visibility", "visibility", (v) => cleanVisibility(v));
  setIf("tags", "tags", (v) =>
    JSON.stringify(Array.isArray(v) ? v.slice(0, 20).map((t: unknown) => str(t, 40)) : []),
  );
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  fields.push("updated_at = ?");
  values.push(now(), id, me);
  await c.env.DB.prepare(`UPDATE inspirations SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();
  const _sw = cleanSharedWith(body.shared_with);
  if (_sw) await setEntityShares(c.env.DB, me, { type: "inspiration", id }, _sw);
  return c.json({ ok: true });
});

app.delete("/items/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM inspirations WHERE id = ? AND user_id = ?")
    .bind(id, c.var.user!.id)
    .run();
  await deleteEntityShares(c.env.DB, { type: "inspiration", id });
  return c.json({ ok: true });
});

export default app;
