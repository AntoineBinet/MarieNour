import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { bool, cleanVisibility, now, numOrNull, str, uid } from "../util";
import type { Trip, TripItem } from "@shared/types";

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

const KINDS = ["activity", "food", "lodging", "transport", "note"];

function toTrip(r: Record<string, unknown>): Trip {
  return {
    id: r.id as string,
    title: r.title as string,
    destination: (r.destination as string) ?? null,
    start_date: (r.start_date as string) ?? null,
    end_date: (r.end_date as string) ?? null,
    cover_url: (r.cover_url as string) ?? null,
    notes: (r.notes as string) ?? null,
    budget: (r.budget as number) ?? null,
    currency: (r.currency as string) ?? "EUR",
    visibility: cleanVisibility(r.visibility),
    created_at: r.created_at as number,
    updated_at: r.updated_at as number,
  };
}

function toTripItem(r: Record<string, unknown>): TripItem {
  return {
    id: r.id as string,
    trip_id: r.trip_id as string,
    day_date: (r.day_date as string) ?? null,
    time: (r.time as string) ?? null,
    title: r.title as string,
    kind: (KINDS.includes(r.kind as string) ? r.kind : "activity") as TripItem["kind"],
    location: (r.location as string) ?? null,
    url: (r.url as string) ?? null,
    notes: (r.notes as string) ?? null,
    cost: (r.cost as number) ?? null,
    done: bool(r.done),
    position: r.position as number,
  };
}

async function ownsTrip(c: { env: AppEnv["Bindings"]; var: AppEnv["Variables"] }, id: string): Promise<boolean> {
  const r = await c.env.DB.prepare("SELECT 1 FROM trips WHERE id = ? AND user_id = ?").bind(id, c.var.user!.id).first();
  return !!r;
}

app.get("/", async (c) => {
  const res = await c.env.DB.prepare("SELECT * FROM trips WHERE user_id = ? ORDER BY COALESCE(start_date, '9999') ASC, created_at DESC")
    .bind(c.var.user!.id)
    .all<Record<string, unknown>>();
  return c.json({ trips: (res.results ?? []).map(toTrip) });
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const trip = await c.env.DB.prepare("SELECT * FROM trips WHERE id = ? AND user_id = ?")
    .bind(id, c.var.user!.id)
    .first<Record<string, unknown>>();
  if (!trip) return c.json({ error: "Voyage introuvable" }, 404);
  const items = await c.env.DB.prepare(
    "SELECT * FROM trip_items WHERE trip_id = ? ORDER BY COALESCE(day_date, '9999') ASC, COALESCE(time, '99:99') ASC, position ASC",
  )
    .bind(id)
    .all<Record<string, unknown>>();
  return c.json({ trip: { ...toTrip(trip), items: (items.results ?? []).map(toTripItem) } });
});

app.post("/", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const id = uid();
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO trips (id, user_id, title, destination, start_date, end_date, cover_url, notes, budget, currency, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      me,
      str(body.title, 120).trim() || "Nouveau voyage",
      str(body.destination, 120) || null,
      str(body.start_date, 30) || null,
      str(body.end_date, 30) || null,
      str(body.cover_url, 1000) || null,
      str(body.notes, 5000) || null,
      numOrNull(body.budget),
      str(body.currency, 8) || "EUR",
      cleanVisibility(body.visibility),
      ts,
      ts,
    )
    .run();
  return c.json({ id });
});

app.patch("/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  if (!(await ownsTrip(c, id))) return c.json({ error: "Introuvable" }, 404);
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
  setIf("destination", "destination", (v) => str(v, 120) || null);
  setIf("start_date", "start_date", (v) => str(v, 30) || null);
  setIf("end_date", "end_date", (v) => str(v, 30) || null);
  setIf("cover_url", "cover_url", (v) => str(v, 1000) || null);
  setIf("notes", "notes", (v) => str(v, 5000) || null);
  setIf("budget", "budget", (v) => numOrNull(v));
  setIf("currency", "currency", (v) => str(v, 8));
  setIf("visibility", "visibility", (v) => cleanVisibility(v));
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  fields.push("updated_at = ?");
  values.push(now(), id, me);
  await c.env.DB.prepare(`UPDATE trips SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...values).run();
  return c.json({ ok: true });
});

app.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM trips WHERE id = ? AND user_id = ?").bind(c.req.param("id"), c.var.user!.id).run();
  return c.json({ ok: true });
});

// ── Étapes / items ───────────────────────────────────────────────────────────
app.post("/:id/items", async (c) => {
  const id = c.req.param("id");
  if (!(await ownsTrip(c, id))) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const title = str(body.title, 200).trim();
  if (!title) return c.json({ error: "Titre requis" }, 400);
  const itemId = uid();
  const max = await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM trip_items WHERE trip_id = ?")
    .bind(id)
    .first<{ m: number }>();
  await c.env.DB.prepare(
    `INSERT INTO trip_items (id, trip_id, day_date, time, title, kind, location, url, notes, cost, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      itemId,
      id,
      str(body.day_date, 30) || null,
      str(body.time, 10) || null,
      title,
      KINDS.includes(body.kind) ? body.kind : "activity",
      str(body.location, 200) || null,
      str(body.url, 1000) || null,
      str(body.notes, 2000) || null,
      numOrNull(body.cost),
      (max?.m ?? -1) + 1,
    )
    .run();
  await c.env.DB.prepare("UPDATE trips SET updated_at = ? WHERE id = ?").bind(now(), id).run();
  return c.json({ id: itemId });
});

app.patch("/:id/items/:itemId", async (c) => {
  const id = c.req.param("id");
  if (!(await ownsTrip(c, id))) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  const setIf = (key: string, col: string, t: (v: unknown) => unknown) => {
    if (body[key] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(t(body[key]));
    }
  };
  setIf("day_date", "day_date", (v) => str(v, 30) || null);
  setIf("time", "time", (v) => str(v, 10) || null);
  setIf("title", "title", (v) => str(v, 200));
  setIf("kind", "kind", (v) => (KINDS.includes(v as string) ? v : "activity"));
  setIf("location", "location", (v) => str(v, 200) || null);
  setIf("url", "url", (v) => str(v, 1000) || null);
  setIf("notes", "notes", (v) => str(v, 2000) || null);
  setIf("cost", "cost", (v) => numOrNull(v));
  setIf("done", "done", (v) => (bool(v) ? 1 : 0));
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  values.push(c.req.param("itemId"), id);
  await c.env.DB.prepare(`UPDATE trip_items SET ${fields.join(", ")} WHERE id = ? AND trip_id = ?`)
    .bind(...values)
    .run();
  return c.json({ ok: true });
});

app.delete("/:id/items/:itemId", async (c) => {
  const id = c.req.param("id");
  if (!(await ownsTrip(c, id))) return c.json({ error: "Introuvable" }, 404);
  await c.env.DB.prepare("DELETE FROM trip_items WHERE id = ? AND trip_id = ?").bind(c.req.param("itemId"), id).run();
  return c.json({ ok: true });
});

export default app;
