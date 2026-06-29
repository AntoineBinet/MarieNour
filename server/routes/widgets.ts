import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { now, parseJson, PatchSet, str, uid } from "../util";
import type { Widget, WidgetSize } from "@shared/types";

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

const SIZES: WidgetSize[] = ["sm", "md", "lg"];

function rowToWidget(r: Record<string, unknown>): Widget {
  return {
    id: r.id as string,
    type: r.type as string,
    title: (r.title as string) ?? null,
    config: parseJson<Record<string, unknown>>(r.config, {}),
    size: (SIZES.includes(r.size as WidgetSize) ? r.size : "md") as WidgetSize,
    position: r.position as number,
  };
}

app.get("/", async (c) => {
  const res = await c.env.DB.prepare(
    "SELECT id, type, title, config, size, position FROM widgets WHERE user_id = ? ORDER BY position ASC",
  )
    .bind(c.var.user!.id)
    .all<Record<string, unknown>>();
  return c.json({ widgets: (res.results ?? []).map(rowToWidget) });
});

app.post("/", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const type = str(body.type, 40).trim();
  if (!type) return c.json({ error: "Type de widget requis" }, 400);
  const size = SIZES.includes(body.size) ? (body.size as WidgetSize) : "md";

  const max = await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM widgets WHERE user_id = ?")
    .bind(me)
    .first<{ m: number }>();
  const id = uid();
  await c.env.DB.prepare(
    "INSERT INTO widgets (id, user_id, type, title, config, size, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      me,
      type,
      body.title ? str(body.title, 80) : null,
      JSON.stringify(body.config ?? {}),
      size,
      (max?.m ?? -1) + 1,
      now(),
    )
    .run();
  return c.json({ id });
});

app.patch("/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const p = new PatchSet();
  if (typeof body.title === "string") {
    p.set("title", str(body.title, 80));
  }
  if (SIZES.includes(body.size)) {
    p.set("size", body.size);
  }
  if (body.config && typeof body.config === "object") {
    p.set("config", JSON.stringify(body.config));
  }
  if (p.empty) return c.json({ error: "Rien à mettre à jour" }, 400);
  await c.env.DB.prepare(`UPDATE widgets SET ${p.clause()} WHERE id = ? AND user_id = ?`).bind(...p.values(), id, me).run();
  return c.json({ ok: true });
});

app.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM widgets WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.var.user!.id)
    .run();
  return c.json({ ok: true });
});

app.post("/reorder", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map((x: unknown) => String(x)) : [];
  if (!ids.length) return c.json({ error: "ids requis" }, 400);
  const stmts = ids.map((id, i) =>
    c.env.DB.prepare("UPDATE widgets SET position = ? WHERE id = ? AND user_id = ?").bind(i, id, me),
  );
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

export default app;
