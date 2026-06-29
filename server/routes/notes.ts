import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { bool, cleanVisibility, cleanSharedWith, now, parseJson, PatchSet, str, uid } from "../util";
import { setEntityShares, getEntitySharesBulk, deleteEntityShares } from "../access";
import type { Note } from "@shared/types";

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

function toNote(r: Record<string, unknown>): Note {
  return {
    id: r.id as string,
    title: (r.title as string) ?? null,
    body: (r.body as string) ?? null,
    color: (r.color as string) ?? "sand",
    pinned: bool(r.pinned),
    tags: parseJson<string[]>(r.tags, []),
    visibility: cleanVisibility(r.visibility),
    created_at: r.created_at as number,
    updated_at: r.updated_at as number,
  };
}

app.get("/", async (c) => {
  const q = str(c.req.query("q"), 80).trim().toLowerCase();
  const base =
    "SELECT * FROM notes WHERE user_id = ?" +
    (q ? " AND (LOWER(title) LIKE ? OR LOWER(body) LIKE ?)" : "") +
    " ORDER BY pinned DESC, updated_at DESC";
  const stmt = q
    ? c.env.DB.prepare(base).bind(c.var.user!.id, `%${q}%`, `%${q}%`)
    : c.env.DB.prepare(base).bind(c.var.user!.id);
  const res = await stmt.all<Record<string, unknown>>();
  const notes = (res.results ?? []).map(toNote);
  const shareMap = await getEntitySharesBulk(c.env.DB, "note", notes.map((i) => i.id));
  for (const it of notes) { const s = shareMap.get(it.id); if (s && s.length) it.shared_with = s; }
  return c.json({ notes });
});

app.post("/", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const id = uid();
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO notes (id, user_id, title, body, color, tags, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      me,
      str(body.title, 200) || null,
      str(body.body, 20000) || null,
      str(body.color, 24) || "sand",
      JSON.stringify(Array.isArray(body.tags) ? body.tags.slice(0, 20).map((t: unknown) => str(t, 40)) : []),
      cleanVisibility(body.visibility),
      ts,
      ts,
    )
    .run();
  const _sw = cleanSharedWith(body.shared_with);
  if (_sw) await setEntityShares(c.env.DB, me, { type: "note", id }, _sw);
  return c.json({ id });
});

app.patch("/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const p = new PatchSet();
  if (body.title !== undefined) {
    p.set("title", str(body.title, 200) || null);
  }
  if (body.body !== undefined) {
    p.set("body", str(body.body, 20000) || null);
  }
  if (body.color !== undefined) {
    p.set("color", str(body.color, 24));
  }
  if (body.pinned !== undefined) {
    p.set("pinned", bool(body.pinned) ? 1 : 0);
  }
  if (body.visibility !== undefined) {
    p.set("visibility", cleanVisibility(body.visibility));
  }
  if (body.tags !== undefined) {
    p.set("tags", JSON.stringify(Array.isArray(body.tags) ? body.tags.slice(0, 20).map((t: unknown) => str(t, 40)) : []));
  }
  if (p.empty) return c.json({ error: "Rien à mettre à jour" }, 400);
  p.set("updated_at", now());
  await c.env.DB.prepare(`UPDATE notes SET ${p.clause()} WHERE id = ? AND user_id = ?`).bind(...p.values(), id, me).run();
  const _sw = cleanSharedWith(body.shared_with);
  if (_sw) await setEntityShares(c.env.DB, me, { type: "note", id }, _sw);
  return c.json({ ok: true });
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(id, c.var.user!.id).run();
  await deleteEntityShares(c.env.DB, { type: "note", id });
  return c.json({ ok: true });
});

export default app;
