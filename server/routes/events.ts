import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { bool, cleanSharedWith, cleanVisibility, intOrNull, now, numOrNull, str, uid } from "../util";
import {
  canView as canViewContent,
  setEntityShares,
  getEntityShares,
  getEntitySharesBulk,
  deleteEntityShares,
} from "../access";
import { sendPushToUser } from "../push";
import type {
  EventAgendaItem,
  EventBringItem,
  EventDateOption,
  EventDetail,
  EventGuest,
  EventSummary,
  EventTask,
} from "@shared/types";

// Planification d'événements (week-end, EVG/EVJF, soirée, anniv…) — section
// complète & semi-sociale. Un organisateur, des invités (inscrits ou non), un
// RSVP, un sondage de dates, des tâches, un programme et une liste « qui apporte
// quoi ». Écrit pour l'API D1/R2 — tourne tel quel sur la VM (SQLite) et sur
// Cloudflare Pages.

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

const KINDS = ["weekend", "evg", "evjf", "party", "birthday", "dinner", "aperitif", "wedding", "trip", "other"];
const STATUSES = ["planning", "confirmed", "cancelled", "done"];
const RSVPS = ["pending", "yes", "no", "maybe"];
const GUEST_ROLES = ["owner", "cohost", "guest"];
const ITEM_KINDS = ["activity", "food", "transport", "break", "other"];
const BRING_CATS = ["food", "drink", "material", "other"];
const DATE_VOTES = ["yes", "maybe", "no"];

const pick = (allowed: string[], v: unknown, fallback: string): string =>
  allowed.includes(v as string) ? (v as string) : fallback;

/* ── Mappers row → type ─────────────────────────────────────────────────── */
function toSummary(r: Record<string, unknown>, me: string): EventSummary {
  const myRole = (r.my_role as string) ?? null;
  return {
    id: r.id as string,
    title: r.title as string,
    kind: pick(KINDS, r.kind, "party") as EventSummary["kind"],
    description: (r.description as string) ?? null,
    location: (r.location as string) ?? null,
    start_date: (r.start_date as string) ?? null,
    start_time: (r.start_time as string) ?? null,
    end_date: (r.end_date as string) ?? null,
    end_time: (r.end_time as string) ?? null,
    cover_url: (r.cover_url as string) ?? null,
    budget: (r.budget as number) ?? null,
    currency: (r.currency as string) ?? "EUR",
    capacity: (r.capacity as number) ?? null,
    rsvp_deadline: (r.rsvp_deadline as string) ?? null,
    status: pick(STATUSES, r.status, "planning") as EventSummary["status"],
    date_decided: bool(r.date_decided),
    visibility: cleanVisibility(r.visibility),
    created_at: r.created_at as number,
    updated_at: r.updated_at as number,
    is_host: r.user_id === me || myRole === "owner" || myRole === "cohost",
    my_rsvp: ((r.my_rsvp as string) ?? null) as EventSummary["my_rsvp"],
    guest_count: (r.guest_count as number) ?? 0,
    going_count: (r.going_count as number) ?? 0,
  };
}

function toGuest(r: Record<string, unknown>, me: string): EventGuest {
  return {
    id: r.id as string,
    user_id: (r.user_id as string) ?? null,
    name: r.name as string,
    role: pick(GUEST_ROLES, r.role, "guest") as EventGuest["role"],
    rsvp: pick(RSVPS, r.rsvp, "pending") as EventGuest["rsvp"],
    plus_ones: (r.plus_ones as number) ?? 0,
    note: (r.note as string) ?? null,
    color: (r.color as string) ?? null,
    handle: (r.u_handle as string) ?? null,
    avatar_url: (r.u_avatar as string) ?? null,
    is_me: r.user_id === me,
  };
}

function toDateOption(r: Record<string, unknown>): EventDateOption {
  return {
    id: r.id as string,
    day_date: r.day_date as string,
    start_time: (r.start_time as string) ?? null,
    end_time: (r.end_time as string) ?? null,
    position: (r.position as number) ?? 0,
    yes: (r.yes as number) ?? 0,
    maybe: (r.maybe as number) ?? 0,
    no: (r.no as number) ?? 0,
    my_vote: ((r.my_vote as string) ?? null) as EventDateOption["my_vote"],
  };
}

function toTask(r: Record<string, unknown>): EventTask {
  return {
    id: r.id as string,
    title: r.title as string,
    assignee_id: (r.assignee_id as string) ?? null,
    done: bool(r.done),
    due_date: (r.due_date as string) ?? null,
    position: (r.position as number) ?? 0,
  };
}

function toAgenda(r: Record<string, unknown>): EventAgendaItem {
  return {
    id: r.id as string,
    day_date: (r.day_date as string) ?? null,
    time: (r.time as string) ?? null,
    title: r.title as string,
    kind: pick(ITEM_KINDS, r.kind, "activity") as EventAgendaItem["kind"],
    location: (r.location as string) ?? null,
    notes: (r.notes as string) ?? null,
    position: (r.position as number) ?? 0,
  };
}

function toBring(r: Record<string, unknown>): EventBringItem {
  return {
    id: r.id as string,
    title: r.title as string,
    qty_needed: (r.qty_needed as number) ?? 1,
    category: pick(BRING_CATS, r.category, "other") as EventBringItem["category"],
    claimed_by: (r.claimed_by as string) ?? null,
    note: (r.note as string) ?? null,
    position: (r.position as number) ?? 0,
  };
}

/* ── Contexte d'accès ───────────────────────────────────────────────────── */
interface EventCtx {
  ev: Record<string, unknown>;
  guest: Record<string, unknown> | null; // ma ligne d'invité (si j'en suis un)
  isOwner: boolean;
  canEdit: boolean; // organisateur ou co-hôte
  canView: boolean;
}

async function loadCtx(c: { env: AppEnv["Bindings"]; var: AppEnv["Variables"] }, id: string): Promise<EventCtx | null> {
  const me = c.var.user!.id;
  const ev = await c.env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!ev) return null;
  const guest = await c.env.DB.prepare("SELECT * FROM event_guests WHERE event_id = ? AND user_id = ?")
    .bind(id, me)
    .first<Record<string, unknown>>();
  const isOwner = ev.user_id === me;
  const role = (guest?.role as string) ?? null;
  const canEdit = isOwner || role === "owner" || role === "cohost";
  const canView =
    canEdit ||
    !!guest ||
    (await canViewContent(c.env.DB, me, ev.user_id as string, cleanVisibility(ev.visibility), {
      type: "event",
      id: ev.id as string,
    }));
  return { ev, guest, isOwner, canEdit, canView };
}

async function loadGuests(c: { env: AppEnv["Bindings"] }, eventId: string, me: string): Promise<EventGuest[]> {
  const res = await c.env.DB.prepare(
    `SELECT g.*, u.handle AS u_handle, u.avatar_url AS u_avatar
     FROM event_guests g LEFT JOIN users u ON u.id = g.user_id
     WHERE g.event_id = ?
     ORDER BY CASE g.role WHEN 'owner' THEN 0 WHEN 'cohost' THEN 1 ELSE 2 END, g.created_at ASC`,
  )
    .bind(eventId)
    .all<Record<string, unknown>>();
  return (res.results ?? []).map((r) => toGuest(r, me));
}

const touch = (c: { env: AppEnv["Bindings"] }, id: string) =>
  c.env.DB.prepare("UPDATE events SET updated_at = ? WHERE id = ?").bind(now(), id).run();

/* ── Liste : événements que j'organise OU auxquels je suis invité ─────────── */
app.get("/", async (c) => {
  const me = c.var.user!.id;
  const res = await c.env.DB.prepare(
    `SELECT e.*,
       (SELECT COUNT(*) FROM event_guests g2 WHERE g2.event_id = e.id) AS guest_count,
       (SELECT COALESCE(SUM(1 + g3.plus_ones), 0) FROM event_guests g3 WHERE g3.event_id = e.id AND g3.rsvp = 'yes') AS going_count,
       (SELECT g4.rsvp FROM event_guests g4 WHERE g4.event_id = e.id AND g4.user_id = ?) AS my_rsvp,
       (SELECT g5.role FROM event_guests g5 WHERE g5.event_id = e.id AND g5.user_id = ?) AS my_role
     FROM events e
     LEFT JOIN event_guests g ON g.event_id = e.id AND g.user_id = ?
     WHERE e.user_id = ? OR g.id IS NOT NULL
     GROUP BY e.id
     ORDER BY COALESCE(e.start_date, '9999') ASC, e.created_at DESC`,
  )
    .bind(me, me, me, me)
    .all<Record<string, unknown>>();
  const events = (res.results ?? []).map((r) => toSummary(r, me));
  // N'expose la liste des amis choisis que pour les événements dont je suis
  // l'organisateur (évite de divulguer les destinataires aux invités).
  const ownIds = events.filter((e) => e.is_host).map((e) => e.id);
  const shareMap = await getEntitySharesBulk(c.env.DB, "event", ownIds);
  for (const ev of events) {
    if (!ev.is_host) continue;
    const s = shareMap.get(ev.id);
    if (s && s.length) ev.shared_with = s;
  }
  return c.json({ events });
});

/* ── Détail complet ────────────────────────────────────────────────────────*/
app.get("/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx || !ctx.canView) return c.json({ error: "Événement introuvable" }, 404);

  const guests = await loadGuests(c, id, me);
  const dateOpts = await c.env.DB.prepare(
    `SELECT o.*,
       (SELECT COUNT(*) FROM event_date_votes v WHERE v.option_id = o.id AND v.vote = 'yes')   AS yes,
       (SELECT COUNT(*) FROM event_date_votes v WHERE v.option_id = o.id AND v.vote = 'maybe') AS maybe,
       (SELECT COUNT(*) FROM event_date_votes v WHERE v.option_id = o.id AND v.vote = 'no')    AS no,
       (SELECT v.vote FROM event_date_votes v WHERE v.option_id = o.id AND v.user_id = ?)       AS my_vote
     FROM event_date_options o WHERE o.event_id = ?
     ORDER BY o.day_date ASC, COALESCE(o.start_time, '99:99') ASC, o.position ASC`,
  )
    .bind(me, id)
    .all<Record<string, unknown>>();
  const tasks = await c.env.DB.prepare(
    "SELECT * FROM event_tasks WHERE event_id = ? ORDER BY done ASC, COALESCE(due_date, '9999') ASC, position ASC",
  )
    .bind(id)
    .all<Record<string, unknown>>();
  const agenda = await c.env.DB.prepare(
    "SELECT * FROM event_items WHERE event_id = ? ORDER BY COALESCE(day_date, '9999') ASC, COALESCE(time, '99:99') ASC, position ASC",
  )
    .bind(id)
    .all<Record<string, unknown>>();
  const bring = await c.env.DB.prepare("SELECT * FROM event_bring WHERE event_id = ? ORDER BY position ASC, created_at ASC")
    .bind(id)
    .all<Record<string, unknown>>();
  const group = await c.env.DB.prepare("SELECT id FROM expense_groups WHERE event_id = ? ORDER BY created_at ASC LIMIT 1")
    .bind(id)
    .first<{ id: string }>();

  const myGuest = guests.find((g) => g.is_me) ?? null;
  const goingCount = guests.filter((g) => g.rsvp === "yes").reduce((s, g) => s + 1 + g.plus_ones, 0);

  const ev = ctx.ev;
  const detail: EventDetail = {
    ...toSummary(
      { ...ev, my_rsvp: myGuest?.rsvp ?? null, my_role: myGuest?.role ?? null, guest_count: guests.length, going_count: goingCount },
      me,
    ),
    address: (ev.address as string) ?? null,
    guests,
    date_options: (dateOpts.results ?? []).map(toDateOption),
    tasks: (tasks.results ?? []).map(toTask),
    agenda: (agenda.results ?? []).map(toAgenda),
    bring: (bring.results ?? []).map(toBring),
    expense_group_id: group?.id ?? null,
  };
  // Liste des amis choisis : visible uniquement par l'organisateur (propriétaire).
  if (ctx.isOwner) {
    const _s = await getEntityShares(c.env.DB, { type: "event", id });
    if (_s.length) detail.shared_with = _s;
  }
  return c.json({ event: detail });
});

/* ── Création ──────────────────────────────────────────────────────────────*/
app.post("/", async (c) => {
  const me = c.var.user!;
  const body = await c.req.json().catch(() => ({}));
  const id = uid();
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO events (id, user_id, title, kind, description, location, address, start_date, start_time, end_date, end_time,
       cover_url, budget, currency, capacity, rsvp_deadline, status, date_decided, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      me.id,
      str(body.title, 120).trim() || "Nouvel événement",
      pick(KINDS, body.kind, "party"),
      str(body.description, 5000) || null,
      str(body.location, 200) || null,
      str(body.address, 300) || null,
      str(body.start_date, 30) || null,
      str(body.start_time, 10) || null,
      str(body.end_date, 30) || null,
      str(body.end_time, 10) || null,
      str(body.cover_url, 1000) || null,
      numOrNull(body.budget),
      str(body.currency, 8) || "EUR",
      intOrNull(body.capacity),
      str(body.rsvp_deadline, 30) || null,
      pick(STATUSES, body.status, "planning"),
      bool(body.date_decided) ? 1 : 0,
      cleanVisibility(body.visibility),
      ts,
      ts,
    )
    .run();
  // L'organisateur est d'office un invité « owner » qui vient (rsvp = yes).
  await c.env.DB.prepare(
    "INSERT INTO event_guests (id, event_id, user_id, name, role, rsvp, plus_ones, note, color, created_at) VALUES (?, ?, ?, ?, 'owner', 'yes', 0, NULL, NULL, ?)",
  )
    .bind(uid(), id, me.id, me.display_name, ts)
    .run();
  const _sw = cleanSharedWith(body.shared_with);
  if (_sw) await setEntityShares(c.env.DB, me.id, { type: "event", id }, _sw);
  return c.json({ id });
});

/* ── Édition (organisateur / co-hôte) ───────────────────────────────────────*/
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.canEdit) return c.json({ error: "Action réservée à l'organisateur" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  const setIf = (key: string, col: string, t: (v: unknown) => unknown) => {
    if (body[key] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(t(body[key]));
    }
  };
  setIf("title", "title", (v) => str(v, 120).trim() || "Événement");
  setIf("kind", "kind", (v) => pick(KINDS, v, "party"));
  setIf("description", "description", (v) => str(v, 5000) || null);
  setIf("location", "location", (v) => str(v, 200) || null);
  setIf("address", "address", (v) => str(v, 300) || null);
  setIf("start_date", "start_date", (v) => str(v, 30) || null);
  setIf("start_time", "start_time", (v) => str(v, 10) || null);
  setIf("end_date", "end_date", (v) => str(v, 30) || null);
  setIf("end_time", "end_time", (v) => str(v, 10) || null);
  setIf("cover_url", "cover_url", (v) => str(v, 1000) || null);
  setIf("budget", "budget", (v) => numOrNull(v));
  setIf("currency", "currency", (v) => str(v, 8) || "EUR");
  setIf("capacity", "capacity", (v) => intOrNull(v));
  setIf("rsvp_deadline", "rsvp_deadline", (v) => str(v, 30) || null);
  setIf("status", "status", (v) => pick(STATUSES, v, "planning"));
  setIf("date_decided", "date_decided", (v) => (bool(v) ? 1 : 0));
  setIf("visibility", "visibility", (v) => cleanVisibility(v));
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  fields.push("updated_at = ?");
  values.push(now(), id);
  await c.env.DB.prepare(`UPDATE events SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  // Les partages appartiennent à l'organisateur (propriétaire), pas au co-hôte.
  const _sw = cleanSharedWith(body.shared_with);
  if (_sw) await setEntityShares(c.env.DB, ctx.ev.user_id as string, { type: "event", id }, _sw);
  return c.json({ ok: true });
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  // Seul le créateur peut supprimer l'événement entier.
  await c.env.DB.prepare("DELETE FROM events WHERE id = ? AND user_id = ?").bind(id, c.var.user!.id).run();
  await deleteEntityShares(c.env.DB, { type: "event", id });
  return c.json({ ok: true });
});

/* ── Invités & RSVP ─────────────────────────────────────────────────────────*/
// Ajout d'un invité (par l'organisateur) — inscrit (user_id) ou simple nom.
app.post("/:id/guests", async (c) => {
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.canEdit) return c.json({ error: "Action réservée à l'organisateur" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const name = str(body.name, 80).trim();
  const userId = str(body.user_id, 60) || null;
  if (!name && !userId) return c.json({ error: "Nom requis" }, 400);
  const role = body.role === "cohost" ? "cohost" : "guest";
  if (userId) {
    const dup = await c.env.DB.prepare("SELECT 1 FROM event_guests WHERE event_id = ? AND user_id = ?").bind(id, userId).first();
    if (dup) return c.json({ error: "Déjà invité" }, 409);
  }
  const gid = uid();
  await c.env.DB.prepare(
    "INSERT INTO event_guests (id, event_id, user_id, name, role, rsvp, plus_ones, note, color, created_at) VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, ?)",
  )
    .bind(gid, id, userId, name || "Invité", role, now())
    .run();
  await touch(c, id);
  // Notifie l'invité inscrit.
  if (userId) {
    await sendPushToUser(c.env, userId, {
      title: `Invitation : ${ctx.ev.title as string}`,
      body: "Réponds à l'invitation",
      url: `/evenements/${id}`,
      tag: `event-invite-${id}`,
    });
  }
  return c.json({ id: gid });
});

// Mise à jour d'un invité par l'organisateur (rôle, RSVP, +1, mot, nom).
app.patch("/:id/guests/:gid", async (c) => {
  const id = c.req.param("id");
  const gid = c.req.param("gid");
  const ctx = await loadCtx(c, id);
  if (!ctx) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.canEdit) return c.json({ error: "Action réservée à l'organisateur" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  const setIf = (key: string, col: string, t: (v: unknown) => unknown) => {
    if (body[key] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(t(body[key]));
    }
  };
  setIf("name", "name", (v) => str(v, 80).trim() || "Invité");
  setIf("role", "role", (v) => pick(GUEST_ROLES, v, "guest"));
  setIf("rsvp", "rsvp", (v) => pick(RSVPS, v, "pending"));
  setIf("plus_ones", "plus_ones", (v) => Math.max(0, intOrNull(v) ?? 0));
  setIf("note", "note", (v) => str(v, 500) || null);
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  values.push(gid, id);
  await c.env.DB.prepare(`UPDATE event_guests SET ${fields.join(", ")} WHERE id = ? AND event_id = ?`).bind(...values).run();
  await touch(c, id);
  return c.json({ ok: true });
});

app.delete("/:id/guests/:gid", async (c) => {
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.canEdit) return c.json({ error: "Action réservée à l'organisateur" }, 403);
  const gid = c.req.param("gid");
  // On ne retire jamais l'organisateur d'origine.
  await c.env.DB.prepare("DELETE FROM event_guests WHERE id = ? AND event_id = ? AND role != 'owner'")
    .bind(gid, id)
    .run();
  // Détache explicitement ses tâches et lignes « qui apporte quoi » : le schéma
  // déclare ON DELETE SET NULL, mais D1 (repli serverless) n'applique pas les clés
  // étrangères — sans ça, l'invité supprimé resterait « assigné » dans l'UI.
  await c.env.DB.prepare("UPDATE event_tasks SET assignee_id = NULL WHERE assignee_id = ? AND event_id = ?").bind(gid, id).run();
  await c.env.DB.prepare("UPDATE event_bring SET claimed_by = NULL WHERE claimed_by = ? AND event_id = ?").bind(gid, id).run();
  await touch(c, id);
  return c.json({ ok: true });
});

// Je réponds pour moi-même (et me rajoute si l'événement m'est visible).
app.post("/:id/rsvp", async (c) => {
  const me = c.var.user!;
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx || !ctx.canView) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const rsvp = pick(RSVPS, body.rsvp, "yes");
  const plusOnes = Math.max(0, intOrNull(body.plus_ones) ?? 0);
  const note = str(body.note, 500) || null;
  if (ctx.guest) {
    await c.env.DB.prepare("UPDATE event_guests SET rsvp = ?, plus_ones = ?, note = ? WHERE id = ?")
      .bind(rsvp, plusOnes, note, ctx.guest.id)
      .run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO event_guests (id, event_id, user_id, name, role, rsvp, plus_ones, note, color, created_at) VALUES (?, ?, ?, ?, 'guest', ?, ?, ?, NULL, ?)",
    )
      .bind(uid(), id, me.id, me.display_name, rsvp, plusOnes, note, now())
      .run();
  }
  await touch(c, id);
  return c.json({ ok: true, rsvp });
});

/* ── Sondage de dates (disponibilités) ──────────────────────────────────────*/
app.post("/:id/dates", async (c) => {
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.canEdit) return c.json({ error: "Action réservée à l'organisateur" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const day = str(body.day_date, 30);
  if (!day) return c.json({ error: "Date requise" }, 400);
  const oid = uid();
  const max = await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM event_date_options WHERE event_id = ?")
    .bind(id)
    .first<{ m: number }>();
  await c.env.DB.prepare(
    "INSERT INTO event_date_options (id, event_id, day_date, start_time, end_time, position) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(oid, id, day, str(body.start_time, 10) || null, str(body.end_time, 10) || null, (max?.m ?? -1) + 1)
    .run();
  await touch(c, id);
  return c.json({ id: oid });
});

app.delete("/:id/dates/:oid", async (c) => {
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.canEdit) return c.json({ error: "Action réservée à l'organisateur" }, 403);
  await c.env.DB.prepare("DELETE FROM event_date_options WHERE id = ? AND event_id = ?").bind(c.req.param("oid"), id).run();
  await touch(c, id);
  return c.json({ ok: true });
});

// Je vote ma disponibilité (oui/peut-être/non) — toggle si même valeur.
app.post("/:id/dates/:oid/vote", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const oid = c.req.param("oid");
  const ctx = await loadCtx(c, id);
  if (!ctx || !ctx.canView) return c.json({ error: "Introuvable" }, 404);
  const opt = await c.env.DB.prepare("SELECT 1 FROM event_date_options WHERE id = ? AND event_id = ?").bind(oid, id).first();
  if (!opt) return c.json({ error: "Date introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const vote = pick(DATE_VOTES, body.vote, "yes");
  const existing = await c.env.DB.prepare("SELECT id, vote FROM event_date_votes WHERE option_id = ? AND user_id = ?")
    .bind(oid, me)
    .first<{ id: string; vote: string }>();
  if (existing && existing.vote === vote) {
    await c.env.DB.prepare("DELETE FROM event_date_votes WHERE id = ?").bind(existing.id).run();
  } else if (existing) {
    await c.env.DB.prepare("UPDATE event_date_votes SET vote = ?, created_at = ? WHERE id = ?").bind(vote, now(), existing.id).run();
  } else {
    await c.env.DB.prepare("INSERT INTO event_date_votes (id, option_id, user_id, vote, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(uid(), oid, me, vote, now())
      .run();
  }
  return c.json({ ok: true });
});

// L'organisateur fige la date à partir d'une option (clôt le sondage).
app.post("/:id/dates/:oid/decide", async (c) => {
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.canEdit) return c.json({ error: "Action réservée à l'organisateur" }, 403);
  const opt = await c.env.DB.prepare("SELECT * FROM event_date_options WHERE id = ? AND event_id = ?")
    .bind(c.req.param("oid"), id)
    .first<Record<string, unknown>>();
  if (!opt) return c.json({ error: "Date introuvable" }, 404);
  await c.env.DB.prepare(
    "UPDATE events SET start_date = ?, start_time = ?, end_time = ?, date_decided = 1, updated_at = ? WHERE id = ?",
  )
    .bind(opt.day_date, (opt.start_time as string) ?? null, (opt.end_time as string) ?? null, now(), id)
    .run();
  return c.json({ ok: true, start_date: opt.day_date });
});

/* ── Tâches assignables ─────────────────────────────────────────────────────*/
app.post("/:id/tasks", async (c) => {
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.canEdit) return c.json({ error: "Action réservée à l'organisateur" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const title = str(body.title, 200).trim();
  if (!title) return c.json({ error: "Titre requis" }, 400);
  const tid = uid();
  const max = await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM event_tasks WHERE event_id = ?")
    .bind(id)
    .first<{ m: number }>();
  await c.env.DB.prepare(
    "INSERT INTO event_tasks (id, event_id, title, assignee_id, done, due_date, position, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)",
  )
    .bind(tid, id, title, str(body.assignee_id, 60) || null, str(body.due_date, 30) || null, (max?.m ?? -1) + 1, now())
    .run();
  await touch(c, id);
  return c.json({ id: tid });
});

app.patch("/:id/tasks/:tid", async (c) => {
  const id = c.req.param("id");
  const tid = c.req.param("tid");
  const ctx = await loadCtx(c, id);
  if (!ctx) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  // Cas spécial : l'invité assigné peut cocher/décocher sa propre tâche.
  const onlyDone = Object.keys(body).length === 1 && body.done !== undefined;
  if (!ctx.canEdit) {
    if (!(onlyDone && ctx.guest)) return c.json({ error: "Action réservée à l'organisateur" }, 403);
    const mine = await c.env.DB.prepare("SELECT 1 FROM event_tasks WHERE id = ? AND event_id = ? AND assignee_id = ?")
      .bind(tid, id, ctx.guest.id)
      .first();
    if (!mine) return c.json({ error: "Tâche non assignée à toi" }, 403);
  }
  const fields: string[] = [];
  const values: unknown[] = [];
  const setIf = (key: string, col: string, t: (v: unknown) => unknown) => {
    if (body[key] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(t(body[key]));
    }
  };
  setIf("title", "title", (v) => str(v, 200).trim() || "Tâche");
  setIf("assignee_id", "assignee_id", (v) => str(v, 60) || null);
  setIf("due_date", "due_date", (v) => str(v, 30) || null);
  setIf("done", "done", (v) => (bool(v) ? 1 : 0));
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  values.push(tid, id);
  await c.env.DB.prepare(`UPDATE event_tasks SET ${fields.join(", ")} WHERE id = ? AND event_id = ?`).bind(...values).run();
  await touch(c, id);
  return c.json({ ok: true });
});

app.delete("/:id/tasks/:tid", async (c) => {
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.canEdit) return c.json({ error: "Action réservée à l'organisateur" }, 403);
  await c.env.DB.prepare("DELETE FROM event_tasks WHERE id = ? AND event_id = ?").bind(c.req.param("tid"), id).run();
  await touch(c, id);
  return c.json({ ok: true });
});

/* ── Programme / itinéraire ─────────────────────────────────────────────────*/
app.post("/:id/items", async (c) => {
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.canEdit) return c.json({ error: "Action réservée à l'organisateur" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const title = str(body.title, 200).trim();
  if (!title) return c.json({ error: "Titre requis" }, 400);
  const iid = uid();
  const max = await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM event_items WHERE event_id = ?")
    .bind(id)
    .first<{ m: number }>();
  await c.env.DB.prepare(
    "INSERT INTO event_items (id, event_id, day_date, time, title, kind, location, notes, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      iid,
      id,
      str(body.day_date, 30) || null,
      str(body.time, 10) || null,
      title,
      pick(ITEM_KINDS, body.kind, "activity"),
      str(body.location, 200) || null,
      str(body.notes, 2000) || null,
      (max?.m ?? -1) + 1,
    )
    .run();
  await touch(c, id);
  return c.json({ id: iid });
});

app.patch("/:id/items/:iid", async (c) => {
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.canEdit) return c.json({ error: "Action réservée à l'organisateur" }, 403);
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
  setIf("title", "title", (v) => str(v, 200).trim() || "Étape");
  setIf("kind", "kind", (v) => pick(ITEM_KINDS, v, "activity"));
  setIf("location", "location", (v) => str(v, 200) || null);
  setIf("notes", "notes", (v) => str(v, 2000) || null);
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  values.push(c.req.param("iid"), id);
  await c.env.DB.prepare(`UPDATE event_items SET ${fields.join(", ")} WHERE id = ? AND event_id = ?`).bind(...values).run();
  await touch(c, id);
  return c.json({ ok: true });
});

app.delete("/:id/items/:iid", async (c) => {
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.canEdit) return c.json({ error: "Action réservée à l'organisateur" }, 403);
  await c.env.DB.prepare("DELETE FROM event_items WHERE id = ? AND event_id = ?").bind(c.req.param("iid"), id).run();
  await touch(c, id);
  return c.json({ ok: true });
});

/* ── « Qui apporte quoi » (potluck / matériel) ──────────────────────────────*/
// Tout invité peut ajouter une ligne à la liste.
app.post("/:id/bring", async (c) => {
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx || !ctx.canView) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.canEdit && !ctx.guest) return c.json({ error: "Rejoins l'événement d'abord" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const title = str(body.title, 200).trim();
  if (!title) return c.json({ error: "Titre requis" }, 400);
  const bid = uid();
  const max = await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM event_bring WHERE event_id = ?")
    .bind(id)
    .first<{ m: number }>();
  // Si c'est un invité qui propose d'apporter, il se l'attribue d'office.
  const claimedBy = body.claim && ctx.guest ? (ctx.guest.id as string) : null;
  await c.env.DB.prepare(
    "INSERT INTO event_bring (id, event_id, title, qty_needed, category, claimed_by, note, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(bid, id, title, Math.max(1, intOrNull(body.qty_needed) ?? 1), pick(BRING_CATS, body.category, "other"), claimedBy, str(body.note, 300) || null, (max?.m ?? -1) + 1, now())
    .run();
  await touch(c, id);
  return c.json({ id: bid });
});

app.patch("/:id/bring/:bid", async (c) => {
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.canEdit) return c.json({ error: "Action réservée à l'organisateur" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  const setIf = (key: string, col: string, t: (v: unknown) => unknown) => {
    if (body[key] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(t(body[key]));
    }
  };
  setIf("title", "title", (v) => str(v, 200).trim() || "À apporter");
  setIf("qty_needed", "qty_needed", (v) => Math.max(1, intOrNull(v) ?? 1));
  setIf("category", "category", (v) => pick(BRING_CATS, v, "other"));
  setIf("claimed_by", "claimed_by", (v) => str(v, 60) || null);
  setIf("note", "note", (v) => str(v, 300) || null);
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  values.push(c.req.param("bid"), id);
  await c.env.DB.prepare(`UPDATE event_bring SET ${fields.join(", ")} WHERE id = ? AND event_id = ?`).bind(...values).run();
  await touch(c, id);
  return c.json({ ok: true });
});

// Je m'attribue (ou me retire de) une ligne « à apporter ».
app.post("/:id/bring/:bid/claim", async (c) => {
  const id = c.req.param("id");
  const bid = c.req.param("bid");
  const ctx = await loadCtx(c, id);
  if (!ctx || !ctx.canView) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.guest) return c.json({ error: "Rejoins l'événement d'abord" }, 403);
  const row = await c.env.DB.prepare("SELECT claimed_by FROM event_bring WHERE id = ? AND event_id = ?")
    .bind(bid, id)
    .first<{ claimed_by: string | null }>();
  if (!row) return c.json({ error: "Ligne introuvable" }, 404);
  const mine = ctx.guest.id as string;
  // Si c'est déjà moi → je me retire ; sinon je me l'attribue (libre ou non).
  const next = row.claimed_by === mine ? null : mine;
  await c.env.DB.prepare("UPDATE event_bring SET claimed_by = ? WHERE id = ? AND event_id = ?").bind(next, bid, id).run();
  await touch(c, id);
  return c.json({ ok: true, claimed_by: next });
});

app.delete("/:id/bring/:bid", async (c) => {
  const id = c.req.param("id");
  const ctx = await loadCtx(c, id);
  if (!ctx) return c.json({ error: "Introuvable" }, 404);
  if (!ctx.canEdit) return c.json({ error: "Action réservée à l'organisateur" }, 403);
  await c.env.DB.prepare("DELETE FROM event_bring WHERE id = ? AND event_id = ?").bind(c.req.param("bid"), id).run();
  await touch(c, id);
  return c.json({ ok: true });
});

export default app;
