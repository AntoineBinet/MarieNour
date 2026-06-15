import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { bool, cleanVisibility, now, str, uid } from "../util";
import type { List, ListItem } from "@shared/types";

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

function toList(r: Record<string, unknown>): List {
  return {
    id: r.id as string,
    title: r.title as string,
    emoji: (r.emoji as string) ?? "📝",
    color: (r.color as string) ?? "sand",
    kind: (r.kind as List["kind"]) ?? "checklist",
    archived: bool(r.archived),
    visibility: cleanVisibility(r.visibility),
    position: r.position as number,
    created_at: r.created_at as number,
    updated_at: r.updated_at as number,
    item_count: r.item_count as number | undefined,
    done_count: r.done_count as number | undefined,
  };
}

function toItem(r: Record<string, unknown>): ListItem {
  return {
    id: r.id as string,
    list_id: r.list_id as string,
    content: r.content as string,
    note: (r.note as string) ?? null,
    done: bool(r.done),
    due_date: (r.due_date as string) ?? null,
    position: r.position as number,
  };
}

async function ownsList(c: { env: AppEnv["Bindings"]; var: AppEnv["Variables"] }, id: string): Promise<boolean> {
  const r = await c.env.DB.prepare("SELECT 1 FROM lists WHERE id = ? AND user_id = ?").bind(id, c.var.user!.id).first();
  return !!r;
}

app.get("/", async (c) => {
  const includeArchived = c.req.query("archived") === "1";
  const res = await c.env.DB.prepare(
    `SELECT l.*,
       (SELECT COUNT(*) FROM list_items i WHERE i.list_id = l.id) AS item_count,
       (SELECT COUNT(*) FROM list_items i WHERE i.list_id = l.id AND i.done = 1) AS done_count
     FROM lists l
     WHERE l.user_id = ? ${includeArchived ? "" : "AND l.archived = 0"}
     ORDER BY l.position ASC, l.updated_at DESC`,
  )
    .bind(c.var.user!.id)
    .all<Record<string, unknown>>();
  return c.json({ lists: (res.results ?? []).map(toList) });
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const list = await c.env.DB.prepare("SELECT * FROM lists WHERE id = ? AND user_id = ?")
    .bind(id, c.var.user!.id)
    .first<Record<string, unknown>>();
  if (!list) return c.json({ error: "Liste introuvable" }, 404);
  const items = await c.env.DB.prepare("SELECT * FROM list_items WHERE list_id = ? ORDER BY done ASC, position ASC")
    .bind(id)
    .all<Record<string, unknown>>();
  return c.json({ list: { ...toList(list), items: (items.results ?? []).map(toItem) } });
});

app.post("/", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const title = str(body.title, 120).trim() || "Nouvelle liste";
  const id = uid();
  const ts = now();
  const max = await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM lists WHERE user_id = ?")
    .bind(me)
    .first<{ m: number }>();
  await c.env.DB.prepare(
    `INSERT INTO lists (id, user_id, title, emoji, color, kind, visibility, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      me,
      title,
      str(body.emoji, 8) || "📝",
      str(body.color, 24) || "sand",
      body.kind === "list" ? "list" : "checklist",
      cleanVisibility(body.visibility),
      (max?.m ?? -1) + 1,
      ts,
      ts,
    )
    .run();
  return c.json({ id });
});

app.patch("/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  if (!(await ownsList(c, id))) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  const setIf = (key: string, col: string, transform: (v: unknown) => unknown) => {
    if (body[key] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(transform(body[key]));
    }
  };
  setIf("title", "title", (v) => str(v, 120));
  setIf("emoji", "emoji", (v) => str(v, 8));
  setIf("color", "color", (v) => str(v, 24));
  setIf("visibility", "visibility", (v) => cleanVisibility(v));
  setIf("archived", "archived", (v) => (bool(v) ? 1 : 0));
  setIf("kind", "kind", (v) => (v === "list" ? "list" : "checklist"));
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  fields.push("updated_at = ?");
  values.push(now(), id, me);
  await c.env.DB.prepare(`UPDATE lists SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...values).run();
  return c.json({ ok: true });
});

app.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM lists WHERE id = ? AND user_id = ?").bind(c.req.param("id"), c.var.user!.id).run();
  return c.json({ ok: true });
});

// ── Items ──────────────────────────────────────────────────────────────────
app.post("/:id/items", async (c) => {
  const id = c.req.param("id");
  if (!(await ownsList(c, id))) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const content = str(body.content, 500).trim();
  if (!content) return c.json({ error: "Contenu requis" }, 400);
  const itemId = uid();
  const ts = now();
  const max = await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM list_items WHERE list_id = ?")
    .bind(id)
    .first<{ m: number }>();
  await c.env.DB.prepare(
    "INSERT INTO list_items (id, list_id, content, note, due_date, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(itemId, id, content, str(body.note, 1000) || null, str(body.due_date, 30) || null, (max?.m ?? -1) + 1, ts, ts)
    .run();
  await c.env.DB.prepare("UPDATE lists SET updated_at = ? WHERE id = ?").bind(ts, id).run();
  return c.json({ id: itemId });
});

app.patch("/:id/items/:itemId", async (c) => {
  const id = c.req.param("id");
  if (!(await ownsList(c, id))) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.content !== undefined) {
    fields.push("content = ?");
    values.push(str(body.content, 500));
  }
  if (body.note !== undefined) {
    fields.push("note = ?");
    values.push(str(body.note, 1000) || null);
  }
  if (body.done !== undefined) {
    fields.push("done = ?");
    values.push(bool(body.done) ? 1 : 0);
  }
  if (body.due_date !== undefined) {
    fields.push("due_date = ?");
    values.push(str(body.due_date, 30) || null);
  }
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  fields.push("updated_at = ?");
  values.push(now(), c.req.param("itemId"), id);
  await c.env.DB.prepare(`UPDATE list_items SET ${fields.join(", ")} WHERE id = ? AND list_id = ?`)
    .bind(...values)
    .run();
  return c.json({ ok: true });
});

app.delete("/:id/items/:itemId", async (c) => {
  const id = c.req.param("id");
  if (!(await ownsList(c, id))) return c.json({ error: "Introuvable" }, 404);
  await c.env.DB.prepare("DELETE FROM list_items WHERE id = ? AND list_id = ?")
    .bind(c.req.param("itemId"), id)
    .run();
  return c.json({ ok: true });
});

app.post("/:id/items/reorder", async (c) => {
  const id = c.req.param("id");
  if (!(await ownsList(c, id))) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
  const stmts = ids.map((itemId, i) =>
    c.env.DB.prepare("UPDATE list_items SET position = ? WHERE id = ? AND list_id = ?").bind(i, itemId, id),
  );
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

export default app;
