import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { now, uid } from "../util";

// Contenu de démarrage : évite l'écran vide au premier login. Idempotent grâce
// au drapeau users.onboarded (on ne sème qu'une fois).
const app = new Hono<AppEnv>();
app.use("*", requireAuth);

app.post("/seed", async (c) => {
  const me = c.var.user!.id;
  const flag = await c.env.DB.prepare("SELECT onboarded FROM users WHERE id = ?").bind(me).first<{ onboarded: number }>();
  if (flag?.onboarded) return c.json({ ok: true, created: {} });

  const ts = now();
  const created: Record<string, number> = { lists: 0, notes: 0, trips: 0, events: 0 };

  // ── Une checklist « Premiers pas » pré-remplie ───────────────────────────
  const listId = uid();
  await c.env.DB.prepare(
    `INSERT INTO lists (id, user_id, title, emoji, color, kind, archived, visibility, position, created_at, updated_at)
     VALUES (?, ?, 'Premiers pas sur marienour', '🌿', 'sage', 'checklist', 0, 'private', 0, ?, ?)`,
  )
    .bind(listId, me, ts, ts)
    .run();
  const steps = [
    "Personnaliser mon profil et ma couleur d'accent",
    "Ajouter mes premiers amis (essaie le QR code !)",
    "Créer une note ou une idée",
    "Planifier un voyage ou un week-end",
    "Lancer un groupe de dépenses partagées",
  ];
  let pos = 0;
  for (const content of steps) {
    await c.env.DB.prepare(
      `INSERT INTO list_items (id, list_id, content, note, done, due_date, position, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 0, NULL, ?, ?, ?)`,
    )
      .bind(uid(), listId, content, pos++, ts, ts)
      .run();
  }
  created.lists = 1;

  // ── Une liste de courses vierge mais structurée ──────────────────────────
  const courses = uid();
  await c.env.DB.prepare(
    `INSERT INTO lists (id, user_id, title, emoji, color, kind, archived, visibility, position, created_at, updated_at)
     VALUES (?, ?, 'Courses de la semaine', '🛒', 'butter', 'checklist', 0, 'private', 1, ?, ?)`,
  )
    .bind(courses, me, ts, ts)
    .run();
  created.lists = 2;

  // ── Une note de bienvenue ────────────────────────────────────────────────
  await c.env.DB.prepare(
    `INSERT INTO notes (id, user_id, title, body, color, pinned, tags, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'blush', 1, ?, 'private', ?, ?)`,
  )
    .bind(
      uid(),
      me,
      "Bienvenue ✨",
      "Ceci est ton atelier perso : listes, notes, voyages, recettes, inspirations et dépenses partagées, le tout avec tes amis.\n\nÉpingle ce qui compte, invite tes proches par QR code, et fais-toi plaisir !",
      JSON.stringify(["bienvenue"]),
      ts,
      ts,
    )
    .run();
  created.notes = 1;

  // ── Un voyage exemple à compléter ────────────────────────────────────────
  await c.env.DB.prepare(
    `INSERT INTO trips (id, user_id, title, destination, start_date, end_date, cover_url, notes, budget, currency, visibility, kind, created_at, updated_at)
     VALUES (?, ?, 'Mon prochain week-end', NULL, NULL, NULL, NULL, 'Idée à creuser : où part-on ?', NULL, 'EUR', 'private', 'weekend', ?, ?)`,
  )
    .bind(uid(), me, ts, ts)
    .run();
  created.trips = 1;

  // ── Un événement exemple (montre le RSVP + le sondage de dates) ──────────
  const eventId = uid();
  await c.env.DB.prepare(
    `INSERT INTO events (id, user_id, title, kind, description, location, address, start_date, start_time, end_date, end_time,
       cover_url, budget, currency, capacity, rsvp_deadline, status, date_decided, visibility, created_at, updated_at)
     VALUES (?, ?, 'Soirée entre amis', 'party', 'Première soirée à organiser : propose des dates et invite tes amis !',
       NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'EUR', NULL, NULL, 'planning', 0, 'friends', ?, ?)`,
  )
    .bind(eventId, me, ts, ts)
    .run();
  await c.env.DB.prepare(
    "INSERT INTO event_guests (id, event_id, user_id, name, role, rsvp, plus_ones, note, color, created_at) VALUES (?, ?, ?, ?, 'owner', 'yes', 0, NULL, NULL, ?)",
  )
    .bind(uid(), eventId, me, c.var.user!.display_name, ts)
    .run();
  // Deux créneaux proposés pour illustrer le sondage de dates.
  let dpos = 0;
  for (const offset of [10, 17]) {
    const day = new Date(ts + offset * 86_400_000).toISOString().slice(0, 10);
    await c.env.DB.prepare(
      "INSERT INTO event_date_options (id, event_id, day_date, start_time, end_time, position) VALUES (?, ?, ?, '20:00', NULL, ?)",
    )
      .bind(uid(), eventId, day, dpos++)
      .run();
  }
  created.events = 1;

  await c.env.DB.prepare("UPDATE users SET onboarded = 1, updated_at = ? WHERE id = ?").bind(ts, me).run();
  return c.json({ ok: true, created });
});

export default app;
