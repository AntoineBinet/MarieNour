import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { bool, cleanSharedWith, cleanVisibility, now, numOrNull, str, uid } from "../util";
import { deleteEntityShares, getEntityShares, getEntitySharesBulk, setEntityShares } from "../access";
import type { Trip, TripItem, TripKind, TripParticipant } from "@shared/types";

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

const KINDS = ["activity", "food", "lodging", "transport", "note"];
const TRIP_KINDS: TripKind[] = ["trip", "roadtrip", "weekend", "solo"];
const PART_ROLES = ["owner", "editor", "traveller"];
const cleanTripKind = (v: unknown): TripKind => (TRIP_KINDS.includes(v as TripKind) ? (v as TripKind) : "trip");

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
    kind: cleanTripKind(r.kind),
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
    votes: (r.vote_count as number) ?? 0,
    voted_by_me: !!(r.my_vote as number),
  };
}

function toParticipant(r: Record<string, unknown>, meId: string): TripParticipant {
  return {
    id: r.id as string,
    user_id: (r.user_id as string) ?? null,
    name: r.name as string,
    role: (PART_ROLES.includes(r.role as string) ? r.role : "traveller") as TripParticipant["role"],
    color: (r.color as string) ?? null,
    handle: (r.u_handle as string) ?? null,
    avatar_url: (r.u_avatar as string) ?? null,
    is_me: r.user_id === meId,
  };
}

async function loadParticipants(c: { env: AppEnv["Bindings"] }, tripId: string, meId: string): Promise<TripParticipant[]> {
  const res = await c.env.DB.prepare(
    `SELECT p.*, u.handle AS u_handle, u.avatar_url AS u_avatar
     FROM trip_participants p LEFT JOIN users u ON u.id = p.user_id
     WHERE p.trip_id = ? ORDER BY p.created_at ASC`,
  )
    .bind(tripId)
    .all<Record<string, unknown>>();
  return (res.results ?? []).map((r) => toParticipant(r, meId));
}

async function ownsTrip(c: { env: AppEnv["Bindings"]; var: AppEnv["Variables"] }, id: string): Promise<boolean> {
  const r = await c.env.DB.prepare("SELECT 1 FROM trips WHERE id = ? AND user_id = ?").bind(id, c.var.user!.id).first();
  return !!r;
}

/** Suis-je participant (rejoint via invitation) de ce voyage ? */
async function isParticipant(c: { env: AppEnv["Bindings"]; var: AppEnv["Variables"] }, id: string): Promise<boolean> {
  const r = await c.env.DB.prepare("SELECT 1 FROM trip_participants WHERE trip_id = ? AND user_id = ?")
    .bind(id, c.var.user!.id)
    .first();
  return !!r;
}

/** Accès en lecture (créateur OU participant). */
async function canAccessTrip(c: { env: AppEnv["Bindings"]; var: AppEnv["Variables"] }, id: string): Promise<boolean> {
  return (await ownsTrip(c, id)) || isParticipant(c, id);
}

/** Aperçu du créateur (avatar + nom) à partir d'une ligne jointe sur users. */
function ownerOf(r: Record<string, unknown>) {
  return {
    id: r.user_id as string,
    display_name: (r.o_name as string) ?? "",
    handle: (r.o_handle as string) ?? null,
    avatar_url: (r.o_avatar as string) ?? null,
  };
}

app.get("/", async (c) => {
  const me = c.var.user!.id;
  // Mes voyages + ceux où je suis participant (rejoint via invitation), avec le
  // créateur joint pour pouvoir le mettre en avant dans la section « Partagé ».
  const res = await c.env.DB.prepare(
    `SELECT t.*, ou.display_name AS o_name, ou.handle AS o_handle, ou.avatar_url AS o_avatar
     FROM trips t
     JOIN users ou ON ou.id = t.user_id
     WHERE t.user_id = ?
        OR EXISTS (SELECT 1 FROM trip_participants p WHERE p.trip_id = t.id AND p.user_id = ?)
     ORDER BY COALESCE(t.start_date, '9999') ASC, t.created_at DESC`,
  )
    .bind(me, me)
    .all<Record<string, unknown>>();
  const trips = (res.results ?? []).map((r) => ({ ...toTrip(r), is_owner: r.user_id === me, owner: ownerOf(r) }));
  // Attache la liste « amis choisis » sur mes propres voyages (visibilité 'shared').
  const ownIds = trips.filter((t) => t.is_owner).map((t) => t.id);
  const shareMap = await getEntitySharesBulk(c.env.DB, "trip", ownIds);
  for (const t of trips) {
    const s = shareMap.get(t.id);
    if (s && s.length) t.shared_with = s;
  }
  return c.json({ trips });
});

app.get("/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const trip = await c.env.DB.prepare(
    `SELECT t.*, ou.display_name AS o_name, ou.handle AS o_handle, ou.avatar_url AS o_avatar
     FROM trips t JOIN users ou ON ou.id = t.user_id WHERE t.id = ?`,
  )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!trip) return c.json({ error: "Voyage introuvable" }, 404);
  const isOwner = trip.user_id === me;
  // Le créateur OU un participant peut consulter (les participants en lecture).
  if (!isOwner && !(await isParticipant(c, id))) return c.json({ error: "Voyage introuvable" }, 404);
  const items = await c.env.DB.prepare(
    `SELECT ti.*,
       (SELECT COUNT(*) FROM trip_item_votes v WHERE v.item_id = ti.id) AS vote_count,
       (SELECT COUNT(*) FROM trip_item_votes v WHERE v.item_id = ti.id AND v.user_id = ?) AS my_vote
     FROM trip_items ti
     WHERE ti.trip_id = ?
     ORDER BY COALESCE(ti.day_date, '9999') ASC, COALESCE(ti.time, '99:99') ASC, ti.position ASC`,
  )
    .bind(me, id)
    .all<Record<string, unknown>>();
  const participants = await loadParticipants(c, id, me);
  const group = await c.env.DB.prepare("SELECT id FROM expense_groups WHERE trip_id = ? ORDER BY created_at ASC LIMIT 1")
    .bind(id)
    .first<{ id: string }>();
  const out: Trip = {
    ...toTrip(trip),
    items: (items.results ?? []).map(toTripItem),
    participants,
    participant_count: participants.length,
    expense_group_id: group?.id ?? null,
    is_owner: isOwner,
    owner: ownerOf(trip),
  };
  // « Amis choisis » : visible/éditable seulement par le créateur du voyage.
  if (isOwner) {
    const _s = await getEntityShares(c.env.DB, { type: "trip", id });
    if (_s.length) out.shared_with = _s;
  }
  return c.json({ trip: out });
});

// ── Participants (inscrits ou invités sans compte) ───────────────────────────
app.get("/:id/participants", async (c) => {
  const id = c.req.param("id");
  if (!(await ownsTrip(c, id))) return c.json({ error: "Introuvable" }, 404);
  return c.json({ participants: await loadParticipants(c, id, c.var.user!.id) });
});

app.post("/:id/participants", async (c) => {
  const id = c.req.param("id");
  if (!(await ownsTrip(c, id))) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const name = str(body.name, 80).trim();
  const userId = str(body.user_id, 60) || null;
  if (!name && !userId) return c.json({ error: "Nom requis" }, 400);
  const role = PART_ROLES.includes(body.role) ? body.role : "traveller";
  // Évite les doublons d'un même utilisateur inscrit.
  if (userId) {
    const dup = await c.env.DB.prepare("SELECT 1 FROM trip_participants WHERE trip_id = ? AND user_id = ?").bind(id, userId).first();
    if (dup) return c.json({ error: "Déjà participant" }, 409);
  }
  const pid = uid();
  await c.env.DB.prepare(
    "INSERT INTO trip_participants (id, trip_id, user_id, name, role, color, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)",
  )
    .bind(pid, id, userId, name || "Invité", role, now())
    .run();
  return c.json({ id: pid });
});

app.delete("/:id/participants/:pid", async (c) => {
  const id = c.req.param("id");
  if (!(await ownsTrip(c, id))) return c.json({ error: "Introuvable" }, 404);
  await c.env.DB.prepare("DELETE FROM trip_participants WHERE id = ? AND trip_id = ?").bind(c.req.param("pid"), id).run();
  return c.json({ ok: true });
});

// ── Vote sur une étape / idée (le groupe décide) ─────────────────────────────
app.post("/:id/items/:itemId/vote", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const itemId = c.req.param("itemId");
  // Voter est une décision de groupe : créateur ET participants peuvent voter.
  if (!(await canAccessTrip(c, id))) return c.json({ error: "Introuvable" }, 404);
  const item = await c.env.DB.prepare("SELECT 1 FROM trip_items WHERE id = ? AND trip_id = ?").bind(itemId, id).first();
  if (!item) return c.json({ error: "Étape introuvable" }, 404);
  const existing = await c.env.DB.prepare("SELECT id FROM trip_item_votes WHERE item_id = ? AND user_id = ?")
    .bind(itemId, me)
    .first<{ id: string }>();
  if (existing) {
    await c.env.DB.prepare("DELETE FROM trip_item_votes WHERE id = ?").bind(existing.id).run();
  } else {
    await c.env.DB.prepare("INSERT INTO trip_item_votes (id, item_id, user_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(uid(), itemId, me, now())
      .run();
  }
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM trip_item_votes WHERE item_id = ?").bind(itemId).first<{ n: number }>();
  return c.json({ voted: !existing, votes: count?.n ?? 0 });
});

app.post("/", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const id = uid();
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO trips (id, user_id, title, destination, start_date, end_date, cover_url, notes, budget, currency, visibility, kind, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      cleanTripKind(body.kind),
      ts,
      ts,
    )
    .run();
  const _sw = cleanSharedWith(body.shared_with);
  if (_sw) await setEntityShares(c.env.DB, me, { type: "trip", id }, _sw);
  // Le créateur est d'office le premier participant (organisateur).
  await c.env.DB.prepare(
    "INSERT INTO trip_participants (id, trip_id, user_id, name, role, color, created_at) VALUES (?, ?, ?, ?, 'owner', NULL, ?)",
  )
    .bind(uid(), id, me, c.var.user!.display_name, ts)
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
  setIf("kind", "kind", (v) => cleanTripKind(v));
  const _sw = cleanSharedWith(body.shared_with);
  if (!fields.length && !_sw) return c.json({ error: "Rien à mettre à jour" }, 400);
  if (fields.length) {
    fields.push("updated_at = ?");
    values.push(now(), id, me);
    await c.env.DB.prepare(`UPDATE trips SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).bind(...values).run();
  }
  if (_sw) await setEntityShares(c.env.DB, me, { type: "trip", id }, _sw);
  return c.json({ ok: true });
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM trips WHERE id = ? AND user_id = ?").bind(id, c.var.user!.id).run();
  await deleteEntityShares(c.env.DB, { type: "trip", id });
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
