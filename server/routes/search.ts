import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { str } from "../util";
import type { SearchResult } from "@shared/types";

// Recherche universelle — alimente la palette de commandes (⌘K). On cherche dans
// TOUT le contenu de l'utilisateur (notes, listes, voyages, événements, recettes,
// inspirations, collections de souvenirs, groupes de dépenses, transactions) et
// parmi ses amis. Lecture seule, borné par type pour rester rapide.

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

const PER_TYPE = 6;

function clip(s: string | null | undefined, max = 80): string | null {
  if (!s) return null;
  const t = String(s).replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

app.get("/", async (c) => {
  const me = c.var.user!.id;
  const db = c.env.DB;
  const raw = str(c.req.query("q"), 80).trim().toLowerCase();
  if (raw.length < 2) return c.json({ results: [] as SearchResult[] });
  // Neutralise les jokers LIKE pour une recherche littérale.
  const q = raw.replace(/[%_]/g, " ");
  const like = `%${q}%`;
  const results: SearchResult[] = [];

  // ── Notes ────────────────────────────────────────────────────────────────
  const notes = await db
    .prepare(
      `SELECT id, title, body FROM notes
       WHERE user_id = ? AND (LOWER(title) LIKE ? OR LOWER(body) LIKE ?)
       ORDER BY pinned DESC, updated_at DESC LIMIT ?`,
    )
    .bind(me, like, like, PER_TYPE)
    .all<{ id: string; title: string | null; body: string | null }>();
  for (const r of notes.results ?? [])
    results.push({ type: "note", id: r.id, title: r.title || "Note sans titre", subtitle: clip(r.body), icon: "notes", link: "/notes" });

  // ── Listes ───────────────────────────────────────────────────────────────
  const lists = await db
    .prepare(
      `SELECT id, title, emoji, kind FROM lists
       WHERE user_id = ? AND archived = 0 AND LOWER(title) LIKE ?
       ORDER BY position ASC LIMIT ?`,
    )
    .bind(me, like, PER_TYPE)
    .all<{ id: string; title: string; emoji: string; kind: string }>();
  for (const r of lists.results ?? [])
    results.push({ type: "list", id: r.id, title: `${r.emoji ?? ""} ${r.title}`.trim(), subtitle: r.kind === "checklist" ? "Checklist" : "Liste", icon: "lists", link: "/listes" });

  // ── Voyages ──────────────────────────────────────────────────────────────
  const trips = await db
    .prepare(
      `SELECT id, title, destination, start_date FROM trips
       WHERE user_id = ? AND (LOWER(title) LIKE ? OR LOWER(destination) LIKE ?)
       ORDER BY start_date DESC LIMIT ?`,
    )
    .bind(me, like, like, PER_TYPE)
    .all<{ id: string; title: string; destination: string | null; start_date: string | null }>();
  for (const r of trips.results ?? [])
    results.push({ type: "trip", id: r.id, title: r.title, subtitle: clip(r.destination || r.start_date), icon: "trips", link: `/voyages/${r.id}` });

  // ── Événements ───────────────────────────────────────────────────────────
  const events = await db
    .prepare(
      `SELECT DISTINCT e.id, e.title, e.location, e.start_date
       FROM events e
       LEFT JOIN event_guests g ON g.event_id = e.id AND g.user_id = ?
       WHERE (e.user_id = ? OR g.id IS NOT NULL)
         AND (LOWER(e.title) LIKE ? OR LOWER(e.location) LIKE ?)
       ORDER BY e.start_date DESC LIMIT ?`,
    )
    .bind(me, me, like, like, PER_TYPE)
    .all<{ id: string; title: string; location: string | null; start_date: string | null }>();
  for (const r of events.results ?? [])
    results.push({ type: "event", id: r.id, title: r.title, subtitle: clip(r.location || r.start_date), icon: "confetti", link: `/evenements/${r.id}` });

  // ── Recettes ─────────────────────────────────────────────────────────────
  const recipes = await db
    .prepare(
      `SELECT id, title, description FROM recipes
       WHERE user_id = ? AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)
       ORDER BY favorite DESC, updated_at DESC LIMIT ?`,
    )
    .bind(me, like, like, PER_TYPE)
    .all<{ id: string; title: string; description: string | null }>();
  for (const r of recipes.results ?? [])
    results.push({ type: "recipe", id: r.id, title: r.title, subtitle: clip(r.description), icon: "recipes", link: "/recettes" });

  // ── Inspirations ─────────────────────────────────────────────────────────
  const insp = await db
    .prepare(
      `SELECT id, title, note, source FROM inspirations
       WHERE user_id = ? AND (LOWER(title) LIKE ? OR LOWER(note) LIKE ? OR LOWER(url) LIKE ?)
       ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(me, like, like, like, PER_TYPE)
    .all<{ id: string; title: string | null; note: string | null; source: string }>();
  for (const r of insp.results ?? [])
    results.push({ type: "inspiration", id: r.id, title: r.title || "Inspiration", subtitle: clip(r.note || r.source), icon: "inspiration", link: "/inspiration" });

  // ── Collections de souvenirs (Mon fil) ───────────────────────────────────
  const colls = await db
    .prepare(
      `SELECT id, title, description FROM memory_collections
       WHERE user_id = ? AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)
       ORDER BY position ASC LIMIT ?`,
    )
    .bind(me, like, like, PER_TYPE)
    .all<{ id: string; title: string; description: string | null }>();
  for (const r of colls.results ?? [])
    results.push({ type: "collection", id: r.id, title: r.title, subtitle: clip(r.description) || "Collection", icon: "memories", link: "/fil" });

  // ── Groupes de dépenses (que je possède ou dont je suis membre) ──────────
  const groups = await db
    .prepare(
      `SELECT DISTINCT g.id, g.title, g.currency
       FROM expense_groups g
       LEFT JOIN expense_members m ON m.group_id = g.id AND m.user_id = ?
       WHERE g.archived = 0 AND (g.owner_id = ? OR m.id IS NOT NULL)
         AND LOWER(g.title) LIKE ?
       ORDER BY g.updated_at DESC LIMIT ?`,
    )
    .bind(me, me, like, PER_TYPE)
    .all<{ id: string; title: string; currency: string }>();
  for (const r of groups.results ?? [])
    results.push({ type: "expense_group", id: r.id, title: r.title, subtitle: "Dépenses partagées", icon: "expenses", link: "/depenses" });

  // ── Transactions (libellé / note) ────────────────────────────────────────
  const tx = await db
    .prepare(
      `SELECT id, payee, note, amount, date, type FROM finance_transactions
       WHERE user_id = ? AND (LOWER(payee) LIKE ? OR LOWER(note) LIKE ?)
       ORDER BY date DESC LIMIT ?`,
    )
    .bind(me, like, like, PER_TYPE)
    .all<{ id: string; payee: string | null; note: string | null; amount: number; date: string; type: string }>();
  for (const r of tx.results ?? [])
    results.push({
      type: "transaction",
      id: r.id,
      title: r.payee || r.note || "Transaction",
      subtitle: `${r.type === "income" ? "+" : "−"}${r.amount} · ${r.date}`,
      icon: "wallet",
      link: "/finances",
    });

  // ── Amis ─────────────────────────────────────────────────────────────────
  const friends = await db
    .prepare(
      `SELECT u.id, u.display_name, u.handle, u.avatar_url
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
       WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)
         AND (LOWER(u.display_name) LIKE ? OR LOWER(u.handle) LIKE ?)
       LIMIT ?`,
    )
    .bind(me, me, me, like, like, PER_TYPE)
    .all<{ id: string; display_name: string; handle: string | null; avatar_url: string | null }>();
  for (const r of friends.results ?? [])
    results.push({ type: "friend", id: r.id, title: r.display_name, subtitle: r.handle ? `@${r.handle}` : "Ami", icon: "friends", link: r.handle ? `/u/${r.handle}` : "/amis" });

  return c.json({ results });
});

export default app;
