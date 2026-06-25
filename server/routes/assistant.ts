import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import type { AssistantDigest, AssistantInsight, AssistantStats } from "@shared/types";

// « Aujourd'hui » — assistant intelligent (digest priorisé). Comme la cloche de
// notifications, ce flux est 100 % DÉRIVÉ des données existantes : on ne stocke
// rien. On parcourt toutes les sphères de l'app (événements, tâches, listes,
// budget, dépenses partagées, voyages, amis, souvenirs), on en tire des
// « insights » porteurs d'un score de priorité, puis on classe et on coupe.
//
// L'objectif : que la page d'accueil réponde d'un coup d'œil à « qu'est-ce qui
// mérite mon attention maintenant ? » — invitations à répondre, tâches à faire,
// budgets qui dérapent, départs qui approchent, soldes à régler…

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

/* ── Utilitaires de dates (UTC, cohérent avec le reste de l'app) ──────────── */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** Nombre de jours entiers entre `today` et `target` (>0 = dans le futur). */
function daysFrom(today: string, target: string): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${target}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}
/** Décalage de N jours sur une date 'YYYY-MM-DD'. */
function shiftDay(today: string, days: number): string {
  return ymd(new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000));
}
/** Formulation humaine d'une échéance ('aujourd'hui', 'demain', 'dans 3 j'…). */
function humanDay(today: string, target: string): string {
  const d = daysFrom(today, target);
  if (d < 0) return `en retard de ${-d} j`;
  if (d === 0) return "aujourd'hui";
  if (d === 1) return "demain";
  if (d <= 7) return `dans ${d} j`;
  const [, m, day] = target.split("-");
  return `le ${day}/${m}`;
}
function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return ymd(d).slice(0, 7);
}
function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "EUR", maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency || "EUR"}`;
  }
}
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Récupère la somme d'une colonne groupée par membre, pour un lot d'ids. */
async function sumByMember(
  db: AppEnv["Bindings"]["DB"],
  sql: string,
  ids: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!ids.length) return map;
  const ph = ids.map(() => "?").join(",");
  const res = await db.prepare(sql.replace("(?)", `(${ph})`)).bind(...ids).all<{ mid: string; s: number }>();
  for (const r of res.results ?? []) map.set(r.mid, r.s ?? 0);
  return map;
}

app.get("/", async (c) => {
  const me = c.var.user!.id;
  const db = c.env.DB;
  const today = ymd(new Date());
  const month = today.slice(0, 7);
  const insights: AssistantInsight[] = [];
  const stats: AssistantStats = {
    upcoming_events: 0,
    pending_rsvp: 0,
    tasks_due: 0,
    budget_alerts: 0,
    owed_to_me: 0,
    i_owe: 0,
  };

  // Devise « principale » de l'utilisateur (1er compte non archivé), repli EUR.
  const acc = await db
    .prepare("SELECT currency FROM finance_accounts WHERE user_id = ? AND archived = 0 ORDER BY position ASC LIMIT 1")
    .bind(me)
    .first<{ currency: string }>();
  const myCurrency = acc?.currency || "EUR";

  /* ── Demandes d'ami en attente ──────────────────────────────────────────── */
  const fr = await db
    .prepare("SELECT COUNT(*) AS n FROM friendships WHERE addressee_id = ? AND status = 'pending'")
    .bind(me)
    .first<{ n: number }>();
  if ((fr?.n ?? 0) > 0) {
    const n = fr!.n;
    insights.push({
      key: "friend-requests",
      category: "friend",
      severity: "attention",
      icon: "friends",
      title: `${n} demande${n > 1 ? "s" : ""} d'ami en attente`,
      body: "Quelqu'un aimerait te suivre.",
      link: "/amis",
      action_label: "Voir",
      score: 62,
    });
  }

  /* ── Événements : RSVP en attente, sondage de dates, à venir ────────────── */
  const events = await db
    .prepare(
      `SELECT e.id, e.title, e.start_date, e.start_time, e.status, e.date_decided,
              e.rsvp_deadline, e.user_id, g.id AS guest_id, g.rsvp AS my_rsvp, g.role AS my_role
       FROM events e
       LEFT JOIN event_guests g ON g.event_id = e.id AND g.user_id = ?
       WHERE (e.user_id = ? OR g.id IS NOT NULL) AND e.status != 'cancelled'`,
    )
    .bind(me, me)
    .all<Record<string, unknown>>();

  // Sondages de dates : pour mes événements, combien d'options et ai-je voté ?
  const eventIds = (events.results ?? []).map((r) => r.id as string);
  const dateVoteMap = new Map<string, { opts: number; mine: number }>();
  if (eventIds.length) {
    const ph = eventIds.map(() => "?").join(",");
    const dv = await db
      .prepare(
        `SELECT o.event_id AS eid, COUNT(o.id) AS opts,
                SUM(CASE WHEN v.id IS NOT NULL THEN 1 ELSE 0 END) AS mine
         FROM event_date_options o
         LEFT JOIN event_date_votes v ON v.option_id = o.id AND v.user_id = ?
         WHERE o.event_id IN (${ph})
         GROUP BY o.event_id`,
      )
      .bind(me, ...eventIds)
      .all<{ eid: string; opts: number; mine: number }>();
    for (const r of dv.results ?? []) dateVoteMap.set(r.eid, { opts: r.opts ?? 0, mine: r.mine ?? 0 });
  }

  for (const r of events.results ?? []) {
    const id = r.id as string;
    const title = r.title as string;
    const startDate = (r.start_date as string) ?? null;
    const startTime = (r.start_time as string) ?? null;
    const decided = (r.date_decided as number) === 1;
    const isHost = r.user_id === me || r.my_role === "owner" || r.my_role === "cohost";
    const deadline = (r.rsvp_deadline as string) ?? null;

    // 1) Invitation en attente de réponse (priorité haute).
    if (!isHost && r.guest_id && r.my_rsvp === "pending") {
      stats.pending_rsvp += 1;
      const refDate = deadline ?? startDate;
      const soon = refDate ? daysFrom(today, refDate) : 99;
      const sev = soon <= 2 ? "urgent" : "attention";
      insights.push({
        key: `event-rsvp:${id}`,
        category: "event",
        severity: sev,
        icon: "confetti",
        title: `Réponds à : ${title}`,
        body: deadline
          ? `Réponse attendue ${humanDay(today, deadline)}`
          : startDate
            ? `${decided ? humanDay(today, startDate) : "Date à confirmer"}`
            : "Réponds à l'invitation",
        link: `/evenements/${id}`,
        action_label: "Répondre",
        score: 84 - Math.max(0, Math.min(soon, 30)),
      });
      continue; // une seule carte par événement
    }

    // 2) Sondage de dates ouvert où je n'ai pas encore donné mes dispos.
    const dvote = dateVoteMap.get(id);
    if (!decided && dvote && dvote.opts > 0 && dvote.mine === 0) {
      insights.push({
        key: `event-dates:${id}`,
        category: "event",
        severity: "attention",
        icon: "calendar",
        title: `Donne tes dispos : ${title}`,
        body: `${dvote.opts} date${dvote.opts > 1 ? "s" : ""} proposée${dvote.opts > 1 ? "s" : ""} attendent ton vote`,
        link: `/evenements/${id}`,
        action_label: "Voter",
        score: 66,
      });
      continue;
    }

    // 3) Événement daté à venir (≤ 14 jours) : décompte.
    if (decided && startDate && startDate >= today) {
      const d = daysFrom(today, startDate);
      if (d <= 14) {
        stats.upcoming_events += 1;
        const sev = d <= 1 ? "urgent" : d <= 3 ? "attention" : "info";
        insights.push({
          key: `event-soon:${id}`,
          category: "event",
          severity: sev,
          icon: "confetti",
          title,
          body: `${d === 0 ? "C'est aujourd'hui" : d === 1 ? "Demain" : `Dans ${d} jours`}${startTime ? ` · ${startTime}` : ""}`,
          link: `/evenements/${id}`,
          action_label: "Voir",
          score: 72 - d,
        });
      }
    }
  }

  /* ── Tâches d'événement qui me sont assignées (non faites) ───────────────── */
  const myTasks = await db
    .prepare(
      `SELECT t.id, t.title, t.due_date, e.id AS eid, e.title AS etitle
       FROM event_tasks t
       JOIN events e ON e.id = t.event_id
       JOIN event_guests g ON g.id = t.assignee_id
       WHERE g.user_id = ? AND t.done = 0 AND e.status != 'cancelled'`,
    )
    .bind(me)
    .all<Record<string, unknown>>();
  const dueSoon = shiftDay(today, 3);
  let taskShown = 0;
  for (const r of (myTasks.results ?? [])) {
    const due = (r.due_date as string) ?? null;
    const relevant = due && due <= dueSoon; // échue ou à échéance proche
    if (relevant) {
      stats.tasks_due += 1;
      if (taskShown < 3) {
        taskShown += 1;
        const overdue = due! < today;
        insights.push({
          key: `event-task:${r.id as string}`,
          category: "task",
          severity: overdue ? "urgent" : "attention",
          icon: "check",
          title: `À faire : ${r.title as string}`,
          body: `Pour ${r.etitle as string} · ${humanDay(today, due!)}`,
          link: `/evenements/${r.eid as string}`,
          action_label: "Voir",
          score: overdue ? 82 : 64,
        });
      }
    }
  }

  /* ── Items de listes (checklists) à échéance / en retard ─────────────────── */
  const listItems = await db
    .prepare(
      `SELECT li.content, li.due_date, l.title AS list_title, l.emoji
       FROM list_items li
       JOIN lists l ON l.id = li.list_id
       WHERE l.user_id = ? AND l.archived = 0 AND li.done = 0
         AND li.due_date IS NOT NULL AND li.due_date <= ?
       ORDER BY li.due_date ASC`,
    )
    .bind(me, shiftDay(today, 7))
    .all<{ content: string; due_date: string; list_title: string; emoji: string }>();
  const liRows = listItems.results ?? [];
  if (liRows.length) {
    const overdue = liRows.filter((x) => x.due_date < today).length;
    stats.tasks_due += liRows.length;
    const soonest = liRows[0];
    insights.push({
      key: "list-due",
      category: "list",
      severity: overdue > 0 ? "urgent" : "attention",
      icon: "lists",
      title:
        overdue > 0
          ? `${overdue} tâche${overdue > 1 ? "s" : ""} en retard sur tes listes`
          : `${liRows.length} tâche${liRows.length > 1 ? "s" : ""} à faire bientôt`,
      body: `${soonest.emoji ?? ""} ${soonest.content} · ${humanDay(today, soonest.due_date)}`.trim(),
      link: "/listes",
      action_label: "Ouvrir",
      score: overdue > 0 ? 76 : 52,
    });
  }

  /* ── Voyages : départs à venir (mes voyages + ceux où je suis participant) ─ */
  const myTrips = await db
    .prepare(
      `SELECT id, title, destination, start_date FROM trips
       WHERE user_id = ? AND start_date IS NOT NULL AND start_date >= ?`,
    )
    .bind(me, today)
    .all<{ id: string; title: string; destination: string | null; start_date: string }>();
  const sharedTrips = await db
    .prepare(
      `SELECT t.id, t.title, t.destination, t.start_date
       FROM trip_participants p JOIN trips t ON t.id = p.trip_id
       WHERE p.user_id = ? AND t.user_id != ? AND t.start_date IS NOT NULL AND t.start_date >= ?`,
    )
    .bind(me, me, today)
    .all<{ id: string; title: string; destination: string | null; start_date: string }>();
  const tripSeen = new Set<string>();
  for (const t of [...(myTrips.results ?? []), ...(sharedTrips.results ?? [])]) {
    if (tripSeen.has(t.id)) continue;
    tripSeen.add(t.id);
    const d = daysFrom(today, t.start_date);
    if (d > 60) continue;
    const sev = d <= 3 ? "urgent" : d <= 14 ? "attention" : "info";
    insights.push({
      key: `trip-soon:${t.id}`,
      category: "trip",
      severity: sev,
      icon: "plane",
      title: t.title,
      body: `Départ ${d === 0 ? "aujourd'hui" : d === 1 ? "demain" : `dans ${d} jours`}${t.destination ? ` · ${t.destination}` : ""}`,
      link: `/voyages/${t.id}`,
      action_label: "Voir",
      score: 60 - Math.floor(d / 2),
    });
  }

  /* ── Budget : catégories proches/au-dessus du seuil (mois en cours) ───────── */
  const budgetRows = await db
    .prepare(
      `SELECT c.id, c.name, c.monthly_budget AS budget,
              COALESCE((SELECT SUM(t.amount) FROM finance_transactions t
                        WHERE t.category_id = c.id AND t.user_id = ? AND t.type = 'expense'
                          AND substr(t.date, 1, 7) = ?), 0) AS spent
       FROM finance_categories c
       WHERE c.user_id = ? AND c.archived = 0 AND c.kind = 'expense'
         AND c.monthly_budget IS NOT NULL AND c.monthly_budget > 0`,
    )
    .bind(me, month, me)
    .all<{ id: string; name: string; budget: number; spent: number }>();
  const budgetAlerts = (budgetRows.results ?? [])
    .map((b) => ({ ...b, pct: b.budget > 0 ? b.spent / b.budget : 0 }))
    .filter((b) => b.pct >= 0.85)
    .sort((a, b) => b.pct - a.pct);
  stats.budget_alerts = budgetAlerts.length;
  for (const b of budgetAlerts.slice(0, 3)) {
    const over = b.pct >= 1;
    insights.push({
      key: `budget:${b.id}`,
      category: "finance",
      severity: over ? "urgent" : "attention",
      icon: "wallet",
      title: over ? `Budget « ${b.name} » dépassé` : `Budget « ${b.name} » presque atteint`,
      body: `${money(r2(b.spent), myCurrency)} sur ${money(r2(b.budget), myCurrency)} (${Math.round(b.pct * 100)} %)`,
      link: "/finances",
      action_label: "Voir",
      score: over ? 80 : 50,
    });
  }

  /* ── Récurrences à venir / à enregistrer ─────────────────────────────────── */
  const rec = await db
    .prepare(
      `SELECT id, label, amount, type, next_date FROM finance_recurring
       WHERE user_id = ? AND active = 1 AND next_date <= ?
       ORDER BY next_date ASC`,
    )
    .bind(me, shiftDay(today, 3))
    .all<{ id: string; label: string; amount: number; type: string; next_date: string }>();
  for (const r of (rec.results ?? []).slice(0, 3)) {
    const overdue = r.next_date < today;
    insights.push({
      key: `recurring:${r.id}`,
      category: "finance",
      severity: overdue ? "attention" : "info",
      icon: "repeat",
      title: overdue ? `À enregistrer : ${r.label}` : `${r.label} ${humanDay(today, r.next_date)}`,
      body: `${r.type === "income" ? "+" : "−"}${money(r2(r.amount), myCurrency)} · prélèvement ${r.type === "income" ? "entrant" : "récurrent"}`,
      link: "/finances",
      action_label: "Voir",
      score: overdue ? 46 : 40,
    });
  }

  /* ── Rythme de dépenses (détection d'anomalie, mois en cours vs précédent) ─ */
  const pm = prevMonth(month);
  const spend = await db
    .prepare(
      `SELECT substr(date, 1, 7) AS m, SUM(amount) AS total
       FROM finance_transactions
       WHERE user_id = ? AND type = 'expense' AND substr(date, 1, 7) IN (?, ?)
       GROUP BY m`,
    )
    .bind(me, month, pm)
    .all<{ m: string; total: number }>();
  let thisMonth = 0;
  let lastMonth = 0;
  for (const r of spend.results ?? []) {
    if (r.m === month) thisMonth = r.total ?? 0;
    else if (r.m === pm) lastMonth = r.total ?? 0;
  }
  const dayOfMonth = Number(today.slice(8, 10));
  if (dayOfMonth >= 7 && thisMonth > 0 && lastMonth > 0) {
    const projected = (thisMonth / dayOfMonth) * daysInMonth(month);
    if (projected > lastMonth * 1.18) {
      insights.push({
        key: "spend-pace",
        category: "finance",
        severity: "attention",
        icon: "trend",
        title: "Tu dépenses plus vite que le mois dernier",
        body: `À ce rythme, ~${money(r2(projected), myCurrency)} ce mois (vs ${money(r2(lastMonth), myCurrency)} le mois dernier)`,
        link: "/finances",
        action_label: "Analyser",
        score: 44,
      });
    }
  }

  /* ── Dépenses partagées (Tricount) : mes soldes ──────────────────────────── */
  const myMembers = await db
    .prepare(
      `SELECT em.id AS member_id, em.group_id, g.title, g.currency
       FROM expense_members em JOIN expense_groups g ON g.id = em.group_id
       WHERE em.user_id = ? AND g.archived = 0`,
    )
    .bind(me)
    .all<{ member_id: string; group_id: string; title: string; currency: string }>();
  const memberRows = myMembers.results ?? [];
  if (memberRows.length) {
    const ids = memberRows.map((m) => m.member_id);
    const paid = await sumByMember(db, "SELECT payer_id AS mid, SUM(amount) AS s FROM expenses WHERE payer_id IN (?) GROUP BY payer_id", ids);
    const owed = await sumByMember(db, "SELECT member_id AS mid, SUM(amount) AS s FROM expense_shares WHERE member_id IN (?) GROUP BY member_id", ids);
    const sent = await sumByMember(db, "SELECT from_id AS mid, SUM(amount) AS s FROM settlements WHERE from_id IN (?) GROUP BY from_id", ids);
    const recv = await sumByMember(db, "SELECT to_id AS mid, SUM(amount) AS s FROM settlements WHERE to_id IN (?) GROUP BY to_id", ids);
    const balances = memberRows
      .map((m) => ({
        ...m,
        balance: r2((paid.get(m.member_id) ?? 0) - (owed.get(m.member_id) ?? 0) + (sent.get(m.member_id) ?? 0) - (recv.get(m.member_id) ?? 0)),
      }))
      .filter((m) => Math.abs(m.balance) >= 0.01)
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    for (const m of balances) {
      if (m.balance < 0) stats.i_owe += -m.balance;
      else stats.owed_to_me += m.balance;
    }
    for (const m of balances.slice(0, 3)) {
      const iOwe = m.balance < 0;
      insights.push({
        key: `balance:${m.group_id}`,
        category: "expense",
        severity: iOwe ? "attention" : "info",
        icon: "expenses",
        title: iOwe ? `Tu dois ${money(-m.balance, m.currency)}` : `On te doit ${money(m.balance, m.currency)}`,
        body: `Groupe « ${m.title} »`,
        link: "/depenses",
        action_label: "Régler",
        score: iOwe ? 56 : 36,
      });
    }
  }

  /* ── Récap hebdo de souvenirs (Mon fil) ──────────────────────────────────── */
  const weekAgo = Date.now() - 7 * 86400000;
  const recap = await db
    .prepare("SELECT COUNT(*) AS n FROM memories WHERE user_id = ? AND taken_at >= ?")
    .bind(me, weekAgo)
    .first<{ n: number }>();
  if ((recap?.n ?? 0) >= 3) {
    const n = recap!.n;
    insights.push({
      key: "memory-recap",
      category: "memory",
      severity: "celebrate",
      icon: "memories",
      title: "Ton récap de la semaine est prêt",
      body: `${n} souvenirs partagés cette semaine — revis-les en stories.`,
      link: "/fil",
      action_label: "Revivre",
      score: 32,
    });
  }

  /* ── Inspirations à trier (seulement si la pile est grande) ──────────────── */
  const insp = await db
    .prepare("SELECT COUNT(*) AS n FROM inspirations WHERE user_id = ? AND status = 'inbox'")
    .bind(me)
    .first<{ n: number }>();
  if ((insp?.n ?? 0) >= 6) {
    const n = insp!.n;
    insights.push({
      key: "inspiration-inbox",
      category: "inspiration",
      severity: "info",
      icon: "inspiration",
      title: `${n} inspirations à trier`,
      body: "Range ta boîte à idées en quelques gestes.",
      link: "/inspiration",
      action_label: "Trier",
      score: 22,
    });
  }

  // Classement final (score décroissant) + plafond.
  insights.sort((a, b) => b.score - a.score);
  const top = insights.slice(0, 12);
  stats.owed_to_me = r2(stats.owed_to_me);
  stats.i_owe = r2(stats.i_owe);

  const urgent = top.filter((i) => i.severity === "urgent" || i.severity === "attention").length;
  const focus =
    top.length === 0
      ? "Tout est calme — rien d'urgent aujourd'hui. Profites-en pour créer quelque chose."
      : urgent > 0
        ? `${urgent} chose${urgent > 1 ? "s" : ""} à regarder aujourd'hui.`
        : "Quelques nouveautés t'attendent.";

  const digest: AssistantDigest = { generated_at: Date.now(), focus, insights: top, stats };
  return c.json({ digest });
});

export default app;
