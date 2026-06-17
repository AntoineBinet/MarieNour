import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { now, str, uid } from "../util";
import type { InviteKind, PublicUser } from "@shared/types";

// Invitations génériques — alimentent les QR codes de l'app. Trois usages :
//   • 'friend' : ajouter en ami la personne qui scanne (même pas encore inscrite)
//   • 'trip'   : rejoindre un voyage (et réclamer son « invité » placeholder)
//   • 'group'  : rejoindre un groupe de dépenses partagées
// Le GET de prévisualisation NE requiert PAS d'authentification (la personne
// peut découvrir l'invitation avant de créer son compte) ; créer/accepter oui.

const app = new Hono<AppEnv>();

const KINDS: InviteKind[] = ["friend", "trip", "group", "event"];

// Alphabet sans caractères ambigus (0/O, 1/l/I) pour un code lisible sur un QR.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz";
function inviteToken(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

function toPub(row: Record<string, unknown>): PublicUser {
  return {
    id: row.id as string,
    display_name: row.display_name as string,
    handle: (row.handle as string) ?? null,
    role: row.role as PublicUser["role"],
    avatar_url: (row.avatar_url as string) ?? null,
    bio: (row.bio as string) ?? null,
    accent: (row.accent as string) ?? "terracotta",
    created_at: row.created_at as number,
  };
}

const PUB = "id, display_name, handle, role, avatar_url, bio, accent, created_at";

/** Titre lisible de la cible d'une invitation (voyage / groupe), ou null. */
async function targetTitle(db: AppEnv["Bindings"]["DB"], kind: string, targetId: string | null): Promise<string | null> {
  if (!targetId) return null;
  if (kind === "trip") {
    const r = await db.prepare("SELECT title FROM trips WHERE id = ?").bind(targetId).first<{ title: string }>();
    return r?.title ?? null;
  }
  if (kind === "group") {
    const r = await db.prepare("SELECT title FROM expense_groups WHERE id = ?").bind(targetId).first<{ title: string }>();
    return r?.title ?? null;
  }
  if (kind === "event") {
    const r = await db.prepare("SELECT title FROM events WHERE id = ?").bind(targetId).first<{ title: string }>();
    return r?.title ?? null;
  }
  return null;
}

// Crée une invitation et renvoie le code + l'URL absolue (à encoder en QR).
app.post("/", requireAuth, async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const kind = (KINDS.includes(body.kind) ? body.kind : "friend") as InviteKind;
  const targetId = str(body.target_id, 60) || null;
  const memberId = str(body.member_id, 60) || null;
  const label = str(body.label, 120) || null;
  const days = Number(body.expires_in_days);
  const expiresAt = Number.isFinite(days) && days > 0 ? now() + Math.trunc(days) * 86_400_000 : null;

  // Vérifie la propriété de la cible pour 'trip'/'group'.
  if (kind === "trip") {
    const ok = await c.env.DB.prepare("SELECT 1 FROM trips WHERE id = ? AND user_id = ?").bind(targetId, me).first();
    if (!ok) return c.json({ error: "Voyage introuvable" }, 404);
  } else if (kind === "group") {
    const ok = await c.env.DB.prepare("SELECT 1 FROM expense_groups WHERE id = ? AND owner_id = ?").bind(targetId, me).first();
    if (!ok) return c.json({ error: "Groupe introuvable" }, 404);
  } else if (kind === "event") {
    // L'organisateur d'origine OU un co-hôte peut générer une invitation.
    const ok = await c.env.DB.prepare(
      `SELECT 1 FROM events e WHERE e.id = ?
         AND (e.user_id = ?
              OR EXISTS (SELECT 1 FROM event_guests g WHERE g.event_id = e.id AND g.user_id = ? AND g.role IN ('owner','cohost')))`,
    )
      .bind(targetId, me, me)
      .first();
    if (!ok) return c.json({ error: "Événement introuvable" }, 404);
  }

  const token = inviteToken();
  await c.env.DB.prepare(
    `INSERT INTO invites (id, token, kind, created_by, target_id, member_id, label, max_uses, uses, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`,
  )
    .bind(uid(), token, kind, me, targetId, memberId, label, expiresAt, now())
    .run();

  const origin = new URL(c.req.url).origin;
  return c.json({
    invite: { token, url: `${origin}/i/${token}`, kind, target_id: targetId, label, expires_at: expiresAt, uses: 0 },
  });
});

// Prévisualisation publique (avant inscription éventuelle).
app.get("/:token", async (c) => {
  const token = c.req.param("token");
  const inv = await c.env.DB.prepare("SELECT * FROM invites WHERE token = ?").bind(token).first<Record<string, unknown>>();
  if (!inv) return c.json({ invite: null, error: "Invitation introuvable" }, 404);

  const inviter = await c.env.DB.prepare(`SELECT ${PUB} FROM users WHERE id = ?`)
    .bind(inv.created_by)
    .first<Record<string, unknown>>();
  if (!inviter) return c.json({ invite: null, error: "Invitation introuvable" }, 404);

  const expired = inv.expires_at != null && (inv.expires_at as number) < now();
  const title = await targetTitle(c.env.DB, inv.kind as string, (inv.target_id as string) ?? null);
  return c.json({
    invite: {
      kind: inv.kind,
      inviter: toPub(inviter),
      target_title: title,
      valid: !expired,
      reason: expired ? "Invitation expirée" : undefined,
    },
  });
});

// Accepter une invitation (l'utilisateur doit être connecté).
app.post("/:token/accept", requireAuth, async (c) => {
  const me = c.var.user!;
  const token = c.req.param("token");
  const inv = await c.env.DB.prepare("SELECT * FROM invites WHERE token = ?").bind(token).first<Record<string, unknown>>();
  if (!inv) return c.json({ error: "Invitation introuvable" }, 404);
  if (inv.expires_at != null && (inv.expires_at as number) < now()) return c.json({ error: "Invitation expirée" }, 410);

  const creator = inv.created_by as string;
  const kind = inv.kind as InviteKind;
  const targetId = (inv.target_id as string) ?? null;
  const memberId = (inv.member_id as string) ?? null;
  const ts = now();

  if (kind === "friend") {
    if (creator !== me.id) {
      const existing = await c.env.DB.prepare(
        `SELECT id, status, requester_id FROM friendships
         WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
      )
        .bind(creator, me.id, me.id, creator)
        .first<{ id: string; status: string }>();
      if (!existing) {
        await c.env.DB.prepare(
          "INSERT INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at) VALUES (?, ?, ?, 'accepted', ?, ?)",
        )
          .bind(uid(), creator, me.id, ts, ts)
          .run();
      } else if (existing.status !== "accepted") {
        await c.env.DB.prepare("UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?").bind(ts, existing.id).run();
      }
    }
  } else if (kind === "trip" && targetId) {
    // Réclame le participant « invité » s'il est fourni, sinon ajoute un participant.
    let claimed = false;
    if (memberId) {
      const m = await c.env.DB.prepare("SELECT id, user_id FROM trip_participants WHERE id = ? AND trip_id = ?")
        .bind(memberId, targetId)
        .first<{ id: string; user_id: string | null }>();
      if (m && !m.user_id) {
        await c.env.DB.prepare("UPDATE trip_participants SET user_id = ?, name = ? WHERE id = ?")
          .bind(me.id, me.display_name, memberId)
          .run();
        claimed = true;
      }
    }
    if (!claimed) {
      const exists = await c.env.DB.prepare("SELECT 1 FROM trip_participants WHERE trip_id = ? AND user_id = ?")
        .bind(targetId, me.id)
        .first();
      if (!exists) {
        await c.env.DB.prepare(
          "INSERT INTO trip_participants (id, trip_id, user_id, name, role, color, created_at) VALUES (?, ?, ?, ?, 'traveller', NULL, ?)",
        )
          .bind(uid(), targetId, me.id, me.display_name, ts)
          .run();
      }
    }
  } else if (kind === "event" && targetId) {
    // Réclame l'invité « placeholder » (sans compte) s'il est fourni, sinon
    // ajoute la personne comme nouvel invité (RSVP en attente).
    let claimed = false;
    if (memberId) {
      const g = await c.env.DB.prepare("SELECT id, user_id FROM event_guests WHERE id = ? AND event_id = ?")
        .bind(memberId, targetId)
        .first<{ id: string; user_id: string | null }>();
      if (g && !g.user_id) {
        await c.env.DB.prepare("UPDATE event_guests SET user_id = ?, name = ? WHERE id = ?")
          .bind(me.id, me.display_name, memberId)
          .run();
        claimed = true;
      }
    }
    if (!claimed) {
      const exists = await c.env.DB.prepare("SELECT 1 FROM event_guests WHERE event_id = ? AND user_id = ?")
        .bind(targetId, me.id)
        .first();
      if (!exists) {
        await c.env.DB.prepare(
          "INSERT INTO event_guests (id, event_id, user_id, name, role, rsvp, plus_ones, note, color, created_at) VALUES (?, ?, ?, ?, 'guest', 'pending', 0, NULL, NULL, ?)",
        )
          .bind(uid(), targetId, me.id, me.display_name, ts)
          .run();
      }
    }
  } else if (kind === "group" && targetId) {
    let claimed = false;
    if (memberId) {
      const m = await c.env.DB.prepare("SELECT id, user_id FROM expense_members WHERE id = ? AND group_id = ?")
        .bind(memberId, targetId)
        .first<{ id: string; user_id: string | null }>();
      if (m && !m.user_id) {
        await c.env.DB.prepare("UPDATE expense_members SET user_id = ?, name = ? WHERE id = ?")
          .bind(me.id, me.display_name, memberId)
          .run();
        claimed = true;
      }
    }
    if (!claimed) {
      const exists = await c.env.DB.prepare("SELECT 1 FROM expense_members WHERE group_id = ? AND user_id = ?")
        .bind(targetId, me.id)
        .first();
      if (!exists) {
        await c.env.DB.prepare(
          "INSERT INTO expense_members (id, group_id, user_id, name, weight, created_at) VALUES (?, ?, ?, ?, 1, ?)",
        )
          .bind(uid(), targetId, me.id, me.display_name, ts)
          .run();
      }
    }
  }

  await c.env.DB.prepare("UPDATE invites SET uses = uses + 1 WHERE id = ?").bind(inv.id).run();
  return c.json({ kind, target_id: targetId });
});

export default app;
