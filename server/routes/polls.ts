import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { bool, cleanVisibility, now, str, uid } from "../util";
import { friendIds } from "../access";
import type { Poll, PollOption, PublicUser } from "@shared/types";

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

// Plafond d'avatars de votants renvoyés par option (les décomptes restent exacts).
const VOTERS_CAP = 12;
// Nombre maximum d'options autorisées à la création.
const MAX_OPTIONS = 10;

const PUB = "id, display_name, handle, role, avatar_url, bio, accent, created_at";
const PUB_U = PUB.split(", ")
  .map((c) => `u.${c}`)
  .join(", ");

function toPub(row: Record<string, unknown>): PublicUser {
  return {
    id: row.id as string,
    display_name: row.display_name as string,
    handle: (row.handle as string) ?? null,
    role: row.role as PublicUser["role"],
    avatar_url: (row.avatar_url as string) ?? null,
    bio: (row.bio as string) ?? null,
    accent: (row.accent as string) ?? "terracotta",
    prefs: {},
    created_at: row.created_at as number,
  };
}

interface PollRow {
  id: string;
  user_id: string;
  question: string;
  multi: number;
  closes_at: number | null;
  visibility: string;
  created_at: number;
  updated_at: number;
}

/** Visibilité d'un sondage : par défaut 'friends' (la section vit côté « Amis »). */
function pollVisibility(v: unknown): "private" | "friends" | "public" {
  if (v === undefined || v === null || v === "") return "friends";
  return cleanVisibility(v);
}

/** Le sondage est-il visible par le viewer (auteur, ami avec visibilité, ou public) ? */
function isVisible(poll: PollRow, me: string, friends: Set<string>): boolean {
  if (poll.user_id === me) return true;
  if (poll.visibility === "public") return true;
  if (poll.visibility === "friends" && friends.has(poll.user_id)) return true;
  return false;
}

/** Construit un Poll public complet (options, décomptes, votants, mes votes). */
async function buildPoll(
  c: { env: AppEnv["Bindings"] },
  poll: PollRow,
  author: PublicUser,
  me: string,
): Promise<Poll> {
  const opts = await c.env.DB.prepare(
    "SELECT id, label, position FROM poll_options WHERE poll_id = ? ORDER BY position ASC, id ASC",
  )
    .bind(poll.id)
    .all<{ id: string; label: string; position: number }>();

  // Tous les votes du sondage, joints aux utilisateurs (pour les avatars).
  const votes = await c.env.DB.prepare(
    `SELECT v.option_id, v.user_id, v.created_at AS vote_created_at, ${PUB_U}
     FROM poll_votes v JOIN users u ON u.id = v.user_id
     WHERE v.poll_id = ?
     ORDER BY v.created_at ASC`,
  )
    .bind(poll.id)
    .all<Record<string, unknown>>();

  const voteRows = votes.results ?? [];
  const countByOption = new Map<string, number>();
  const votersByOption = new Map<string, PublicUser[]>();
  const myVotes: string[] = [];
  for (const r of voteRows) {
    const optId = r.option_id as string;
    countByOption.set(optId, (countByOption.get(optId) ?? 0) + 1);
    const list = votersByOption.get(optId) ?? [];
    if (list.length < VOTERS_CAP) list.push(toPub(r));
    votersByOption.set(optId, list);
    if (r.user_id === me) myVotes.push(optId);
  }

  const options: PollOption[] = (opts.results ?? []).map((o) => ({
    id: o.id,
    label: o.label,
    votes: countByOption.get(o.id) ?? 0,
    voters: votersByOption.get(o.id) ?? [],
  }));

  return {
    id: poll.id,
    question: poll.question,
    multi: bool(poll.multi),
    closes_at: poll.closes_at ?? null,
    closed: poll.closes_at != null && poll.closes_at < now(),
    visibility: pollVisibility(poll.visibility),
    author,
    created_at: poll.created_at,
    options,
    total_votes: voteRows.length,
    my_votes: myVotes,
  };
}

// Liste : mes sondages + ceux de mes amis (visibilité friends/public) + tout public.
app.get("/", async (c) => {
  const me = c.var.user!.id;
  const friends = await friendIds(c.env.DB, me);
  const friendSet = new Set(friends);

  // NB : on aliase l'id/created_at du sondage pour éviter la collision de noms
  // avec les colonnes de l'auteur (u.id / u.created_at) — sinon le dernier nom
  // gagne et l'id du sondage serait écrasé par celui de l'auteur.
  const res = await c.env.DB.prepare(
    `SELECT p.id AS poll_id, p.user_id, p.question, p.multi, p.closes_at, p.visibility,
            p.created_at AS poll_created_at, p.updated_at, ${PUB_U}
     FROM polls p JOIN users u ON u.id = p.user_id
     ORDER BY p.created_at DESC`,
  ).all<Record<string, unknown>>();

  const polls: Poll[] = [];
  for (const r of res.results ?? []) {
    const poll: PollRow = {
      id: r.poll_id as string,
      user_id: r.user_id as string,
      question: r.question as string,
      multi: r.multi as number,
      closes_at: (r.closes_at as number) ?? null,
      visibility: r.visibility as string,
      created_at: r.poll_created_at as number,
      updated_at: r.updated_at as number,
    };
    if (!isVisible(poll, me, friendSet)) continue;
    polls.push(await buildPoll(c, poll, toPub(r), me));
  }
  return c.json({ polls });
});

// Création d'un sondage.
app.post("/", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));

  const question = str(body.question, 280).trim();
  if (!question) return c.json({ error: "Question requise" }, 400);

  // Nettoie / déduplique / limite les options.
  const seen = new Set<string>();
  const options: string[] = [];
  for (const raw of Array.isArray(body.options) ? body.options : []) {
    const label = str(raw, 200).trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(label);
    if (options.length >= MAX_OPTIONS) break;
  }
  if (options.length < 2) return c.json({ error: "Au moins deux options sont requises" }, 400);

  const id = uid();
  const ts = now();
  await c.env.DB.prepare(
    "INSERT INTO polls (id, user_id, question, multi, closes_at, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      me,
      question,
      bool(body.multi) ? 1 : 0,
      typeof body.closes_at === "number" && Number.isFinite(body.closes_at) ? Math.trunc(body.closes_at) : null,
      pollVisibility(body.visibility),
      ts,
      ts,
    )
    .run();

  let position = 0;
  for (const label of options) {
    await c.env.DB.prepare("INSERT INTO poll_options (id, poll_id, label, position) VALUES (?, ?, ?, ?)")
      .bind(uid(), id, label, position++)
      .run();
  }
  return c.json({ id });
});

// Voter (remplace l'ensemble des votes existants de l'utilisateur pour ce sondage).
app.post("/:id/vote", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const poll = await c.env.DB.prepare(
    "SELECT id, user_id, question, multi, closes_at, visibility, created_at, updated_at FROM polls WHERE id = ?",
  )
    .bind(id)
    .first<PollRow>();
  if (!poll) return c.json({ error: "Sondage introuvable" }, 404);

  const friends = await friendIds(c.env.DB, me);
  if (!isVisible(poll, me, new Set(friends))) return c.json({ error: "Sondage introuvable" }, 404);
  if (poll.closes_at != null && poll.closes_at < now()) return c.json({ error: "Sondage clôturé" }, 400);

  const body = await c.req.json().catch(() => ({}));
  const requested = (Array.isArray(body.option_ids) ? body.option_ids : []).map((v: unknown) => str(v, 60));

  // Ne garde que les options qui appartiennent réellement à ce sondage.
  const owned = await c.env.DB.prepare("SELECT id FROM poll_options WHERE poll_id = ?")
    .bind(id)
    .all<{ id: string }>();
  const ownedSet = new Set((owned.results ?? []).map((o) => o.id));

  let chosen = requested.filter((o: string) => ownedSet.has(o));
  // Dédup tout en gardant l'ordre.
  chosen = [...new Set(chosen)];
  // Choix unique : seule la première option compte.
  if (!bool(poll.multi)) chosen = chosen.slice(0, 1);

  // Remplace les votes existants par le nouvel ensemble (vide = effacement).
  await c.env.DB.prepare("DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?").bind(id, me).run();
  const ts = now();
  for (const optId of chosen) {
    await c.env.DB.prepare(
      "INSERT INTO poll_votes (id, poll_id, option_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(uid(), id, optId, me, ts)
      .run();
  }
  return c.json({ ok: true });
});

// Clôturer un sondage (auteur uniquement).
app.post("/:id/close", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const poll = await c.env.DB.prepare("SELECT user_id FROM polls WHERE id = ?").bind(id).first<{ user_id: string }>();
  if (!poll || poll.user_id !== me) return c.json({ error: "Sondage introuvable" }, 404);
  const ts = now();
  await c.env.DB.prepare("UPDATE polls SET closes_at = ?, updated_at = ? WHERE id = ?").bind(ts, ts, id).run();
  return c.json({ ok: true });
});

// Supprimer un sondage (auteur uniquement).
app.delete("/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const poll = await c.env.DB.prepare("SELECT user_id FROM polls WHERE id = ?").bind(id).first<{ user_id: string }>();
  if (!poll || poll.user_id !== me) return c.json({ error: "Sondage introuvable" }, 404);
  await c.env.DB.prepare("DELETE FROM polls WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

export default app;
