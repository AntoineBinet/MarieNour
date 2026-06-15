import { Hono } from "hono";
import type { AppEnv } from "../types";
import { hashPassword, requireAdmin } from "../auth";
import { now, str } from "../util";

const app = new Hono<AppEnv>();
app.use("*", requireAdmin);

app.get("/stats", async (c) => {
  const tables = ["users", "lists", "list_items", "notes", "trips", "recipes", "boards", "inspirations", "media", "friendships"];
  const stats: Record<string, number> = {};
  for (const t of tables) {
    const r = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>();
    stats[t] = r?.n ?? 0;
  }
  return c.json({ stats, app_name: c.env.APP_NAME });
});

app.get("/users", async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.handle, u.role, u.created_at,
       (SELECT COUNT(*) FROM notes n WHERE n.user_id = u.id) AS notes,
       (SELECT COUNT(*) FROM recipes r WHERE r.user_id = u.id) AS recipes,
       (SELECT COUNT(*) FROM trips t WHERE t.user_id = u.id) AS trips
     FROM users u ORDER BY u.created_at ASC`,
  ).all();
  return c.json({ users: res.results ?? [] });
});

app.post("/users/:id/reset-password", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const password = str(body.password, 200);
  if (password.length < 6) return c.json({ error: "Mot de passe trop court" }, 400);
  const { hash, salt } = await hashPassword(password);
  const res = await c.env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?")
    .bind(hash, salt, now(), id)
    .run();
  return c.json({ ok: true, changed: res.meta.changes ?? 0 });
});

app.patch("/users/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  if (body.role !== "admin" && body.role !== "member") return c.json({ error: "Rôle invalide" }, 400);
  if (id === c.var.user!.id && body.role !== "admin") return c.json({ error: "Tu ne peux pas te rétrograder" }, 400);
  await c.env.DB.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").bind(body.role, now(), id).run();
  return c.json({ ok: true });
});

app.delete("/users/:id", async (c) => {
  const id = c.req.param("id");
  if (id === c.var.user!.id) return c.json({ error: "Impossible de supprimer ton propre compte admin" }, 400);
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default app;
