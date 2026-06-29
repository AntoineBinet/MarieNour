import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { PUB, toPub } from "../pub";
import { now, str } from "../util";
import type { AppNotification } from "@shared/types";

// Cloche de notifications (en haut de l'app). Le flux est DÉRIVÉ des données
// existantes — on ne stocke pas chaque notification :
//   • friend_request : demande d'ami reçue (en attente)
//   • trip_shared    : on m'a partagé un voyage (je suis participant, pas créateur)
//   • event_invite   : je suis invité·e à un événement (RSVP en attente)
//   • event_upcoming : un événement auquel je participe approche
// L'utilisateur peut « écarter » une notif (clic ou petite croix) : on persiste
// alors sa clé dans notification_dismissals pour qu'elle ne réapparaisse pas.

const app = new Hono<AppEnv>();
app.use("*", requireAuth);


/** Timestamp (ms) d'une date 'YYYY-MM-DD', ou fallback fourni. */
function dateMs(day: string | null, fallback: number): number {
  if (!day) return fallback;
  const t = Date.parse(`${day}T00:00:00`);
  return Number.isNaN(t) ? fallback : t;
}

/** Liste « brute » de toutes les notifications candidates (avant filtrage des
 *  notifications écartées). Réutilisée par GET et par « tout écarter ». */
async function rawNotifications(c: { env: AppEnv["Bindings"]; var: AppEnv["Variables"] }): Promise<AppNotification[]> {
  const me = c.var.user!.id;
  const out: AppNotification[] = [];

  // ── Demandes d'amis reçues (en attente) ──────────────────────────────────
  const friendReqs = await c.env.DB.prepare(
    `SELECT f.id AS fid, f.created_at AS req_created_at, ${PUB.split(", ").map((x) => `u.${x}`).join(", ")}
     FROM friendships f JOIN users u ON u.id = f.requester_id
     WHERE f.addressee_id = ? AND f.status = 'pending'`,
  )
    .bind(me)
    .all<Record<string, unknown>>();
  for (const r of friendReqs.results ?? []) {
    const actor = toPub(r);
    out.push({
      key: `friend:${r.fid}`,
      type: "friend_request",
      title: `${actor.display_name} veut t'ajouter en ami`,
      body: actor.handle ? `@${actor.handle}` : null,
      icon: "friends",
      link: "/amis",
      actor,
      created_at: (r.req_created_at as number) ?? now(),
    });
  }

  // ── Voyages partagés (je suis participant, pas le créateur) ───────────────
  const sharedTrips = await c.env.DB.prepare(
    `SELECT t.id AS tid, t.title AS title, p.created_at AS joined_at,
            ${PUB.split(", ").map((x) => `ou.${x}`).join(", ")}
     FROM trip_participants p
     JOIN trips t ON t.id = p.trip_id
     JOIN users ou ON ou.id = t.user_id
     WHERE p.user_id = ? AND t.user_id != ?`,
  )
    .bind(me, me)
    .all<Record<string, unknown>>();
  for (const r of sharedTrips.results ?? []) {
    const actor = toPub(r);
    out.push({
      key: `trip:${r.tid}`,
      type: "trip_shared",
      title: `${actor.display_name} t'a partagé un voyage`,
      body: r.title as string,
      icon: "trips",
      link: `/voyages/${r.tid}`,
      actor,
      created_at: (r.joined_at as number) ?? now(),
    });
  }

  // ── Événements : invitations en attente + événements à venir ──────────────
  const today = new Date().toISOString().slice(0, 10);
  const events = await c.env.DB.prepare(
    `SELECT e.id AS eid, e.title AS title, e.start_date AS start_date, e.status AS status,
            e.user_id AS user_id, e.created_at AS created_at,
            g.rsvp AS my_rsvp, g.role AS my_role, g.created_at AS guest_since
     FROM events e
     LEFT JOIN event_guests g ON g.event_id = e.id AND g.user_id = ?
     WHERE (e.user_id = ? OR g.id IS NOT NULL) AND e.status != 'cancelled'`,
  )
    .bind(me, me)
    .all<Record<string, unknown>>();
  for (const r of events.results ?? []) {
    const id = r.eid as string;
    const isHost = r.user_id === me || r.my_role === "owner" || r.my_role === "cohost";
    const startDate = (r.start_date as string) ?? null;
    // Invitation en attente : priorité (on ne montre pas aussi le rappel).
    if (!isHost && r.my_role === "guest" && r.my_rsvp === "pending") {
      out.push({
        key: `event-invite:${id}`,
        type: "event_invite",
        title: `Invitation : ${r.title as string}`,
        body: startDate ? `Réponds à l'invitation${startDate ? ` · ${startDate}` : ""}` : "Réponds à l'invitation",
        icon: "confetti",
        link: `/evenements/${id}`,
        actor: null,
        created_at: (r.guest_since as number) ?? (r.created_at as number),
      });
      continue;
    }
    // Événement à venir (date fixée, aujourd'hui ou plus tard).
    if (startDate && startDate >= today) {
      out.push({
        key: `event-soon:${id}`,
        type: "event_upcoming",
        title: `À venir : ${r.title as string}`,
        body: startDate,
        icon: "confetti",
        link: `/evenements/${id}`,
        actor: null,
        created_at: dateMs(startDate, r.created_at as number),
      });
    }
  }

  return out;
}

/** Notifications visibles = brutes − écartées, triées (plus récentes d'abord). */
app.get("/", async (c) => {
  const me = c.var.user!.id;
  const raw = await rawNotifications(c);
  const dismissed = await c.env.DB.prepare("SELECT notif_key FROM notification_dismissals WHERE user_id = ?")
    .bind(me)
    .all<{ notif_key: string }>();
  const hidden = new Set((dismissed.results ?? []).map((r) => r.notif_key));
  const notifications = raw
    .filter((n) => !hidden.has(n.key))
    .sort((a, b) => b.created_at - a.created_at);
  return c.json({ notifications });
});

/** Écarte une notification (clic ou petite croix). Idempotent. */
app.post("/dismiss", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const key = str(body.key, 120).trim();
  if (!key) return c.json({ error: "Clé requise" }, 400);
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO notification_dismissals (user_id, notif_key, created_at) VALUES (?, ?, ?)",
  )
    .bind(me, key, now())
    .run();
  return c.json({ ok: true });
});

/** Écarte toutes les notifications actuellement visibles. */
app.post("/dismiss-all", async (c) => {
  const me = c.var.user!.id;
  const raw = await rawNotifications(c);
  const ts = now();
  for (const n of raw) {
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO notification_dismissals (user_id, notif_key, created_at) VALUES (?, ?, ?)",
    )
      .bind(me, n.key, ts)
      .run();
  }
  return c.json({ ok: true });
});

export default app;
