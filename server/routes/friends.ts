import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { sendPushToUser } from "../push";
import { PUB, PUB_U, toPub } from "../pub";
import { now, str, uid } from "../util";
import type { PublicUser } from "@shared/types";

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

// Liste : amis acceptés + demandes entrantes + demandes sortantes.
app.get("/", async (c) => {
  const me = c.var.user!.id;
  const res = await c.env.DB.prepare(
    `SELECT f.id AS friendship_id, f.status, f.requester_id, f.created_at AS friendship_created_at, ${PUB_U}
     FROM friendships f
     JOIN users u ON u.id = (CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END)
     WHERE f.requester_id = ? OR f.addressee_id = ?
     ORDER BY f.updated_at DESC`,
  )
    .bind(me, me, me)
    .all<Record<string, unknown>>();

  const friends: unknown[] = [];
  const incoming: unknown[] = [];
  const outgoing: unknown[] = [];
  for (const r of res.results ?? []) {
    const item = { id: r.friendship_id, status: r.status, created_at: r.friendship_created_at, user: toPub(r) };
    if (r.status === "accepted") friends.push(item);
    else if (r.status === "pending" && r.requester_id === me) outgoing.push(item);
    else if (r.status === "pending") incoming.push(item);
  }
  return c.json({ friends, incoming, outgoing });
});

// Recherche d'utilisateurs (pour ajouter en ami).
app.get("/search", async (c) => {
  const me = c.var.user!.id;
  const q = str(c.req.query("q"), 80).trim();
  if (q.length < 1) return c.json({ results: [] });
  const like = `%${q.toLowerCase()}%`;
  const res = await c.env.DB.prepare(
    `SELECT ${PUB} FROM users
     WHERE id != ? AND (LOWER(display_name) LIKE ? OR LOWER(handle) LIKE ? OR LOWER(email) LIKE ?)
     LIMIT 20`,
  )
    .bind(me, like, like, like)
    .all<Record<string, unknown>>();
  return c.json({ results: (res.results ?? []).map(toPub) });
});

// Demande d'ami.
app.post("/request", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const target = str(body.user_id, 60);
  if (!target || target === me) return c.json({ error: "Cible invalide" }, 400);

  const targetExists = await c.env.DB.prepare("SELECT 1 FROM users WHERE id = ?").bind(target).first();
  if (!targetExists) return c.json({ error: "Utilisateur introuvable" }, 404);

  const existing = await c.env.DB.prepare(
    `SELECT id, status, requester_id FROM friendships
     WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
  )
    .bind(me, target, target, me)
    .first<{ id: string; status: string; requester_id: string }>();

  if (existing) {
    // Si l'autre m'avait déjà demandé, on accepte directement.
    if (existing.status === "pending" && existing.requester_id === target) {
      await c.env.DB.prepare("UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?")
        .bind(now(), existing.id)
        .run();
      return c.json({ status: "accepted" });
    }
    return c.json({ status: existing.status });
  }

  const ts = now();
  await c.env.DB.prepare(
    "INSERT INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)",
  )
    .bind(uid(), me, target, ts, ts)
    .run();
  await sendPushToUser(c.env, target, {
    title: `${c.var.user!.display_name} veut t'ajouter en ami`,
    body: c.var.user!.handle ? `@${c.var.user!.handle}` : null,
    url: "/amis",
    tag: "friend-request",
  });
  return c.json({ status: "pending" });
});

// Accepter une demande entrante.
app.post("/:id/accept", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const f = await c.env.DB.prepare("SELECT addressee_id, status FROM friendships WHERE id = ?").bind(id).first<{
    addressee_id: string;
    status: string;
  }>();
  if (!f || f.addressee_id !== me) return c.json({ error: "Demande introuvable" }, 404);
  await c.env.DB.prepare("UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?").bind(now(), id).run();
  return c.json({ status: "accepted" });
});

// Supprimer / refuser / annuler.
app.delete("/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const f = await c.env.DB.prepare("SELECT requester_id, addressee_id FROM friendships WHERE id = ?").bind(id).first<{
    requester_id: string;
    addressee_id: string;
  }>();
  if (!f || (f.requester_id !== me && f.addressee_id !== me)) return c.json({ error: "Introuvable" }, 404);
  await c.env.DB.prepare("DELETE FROM friendships WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default app;
