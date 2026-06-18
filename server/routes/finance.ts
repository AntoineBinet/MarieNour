import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { areFriends } from "../access";
import { bool, intOrNull, now, numOrNull, str, uid } from "../util";
import type {
  AccountKind,
  BudgetLine,
  CategoryKind,
  CategorySpend,
  Cadence,
  FinanceAccount,
  FinanceCategory,
  FinanceGoal,
  FinanceMonthPoint,
  FinanceOverview,
  FinancePartner,
  FinanceRecurring,
  FinanceStats,
  FinanceTransaction,
  PublicUser,
  TxType,
} from "@shared/types";

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

/** Arrondi monétaire au centime. */
const r2 = (n: number): number => Math.round(n * 100) / 100;

/* ── Énumérations ───────────────────────────────────────────────────────── */
const ACCOUNT_KINDS: AccountKind[] = ["checking", "savings", "cash", "card", "investment"];
const CATEGORY_KINDS: CategoryKind[] = ["expense", "income"];
const TX_TYPES: TxType[] = ["expense", "income", "transfer"];
const CADENCES: Cadence[] = ["weekly", "monthly", "yearly"];

const cleanAccountKind = (v: unknown): AccountKind =>
  ACCOUNT_KINDS.includes(v as AccountKind) ? (v as AccountKind) : "checking";
const cleanCategoryKind = (v: unknown): CategoryKind =>
  CATEGORY_KINDS.includes(v as CategoryKind) ? (v as CategoryKind) : "expense";
const cleanTxType = (v: unknown): TxType | null => (TX_TYPES.includes(v as TxType) ? (v as TxType) : null);
const cleanCadence = (v: unknown): Cadence => (CADENCES.includes(v as Cadence) ? (v as Cadence) : "monthly");

/* ── Colonnes utilisateur public (identique à friends.ts) ───────────────── */
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
    created_at: row.created_at as number,
  };
}

/* ── Dates ──────────────────────────────────────────────────────────────── */
/** Mois courant 'YYYY-MM' (UTC). */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Normalise un paramètre mois en 'YYYY-MM' (repli sur le mois courant). */
function cleanMonth(v: unknown): string {
  const s = str(v, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : currentMonth();
}

/** Mois précédent d'un 'YYYY-MM' donné. */
function prevMonth(month: string): string {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  const d = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return d;
}

/** Décale un 'YYYY-MM' de `delta` mois (négatif = passé). */
function shiftMonthStr(month: string, delta: number): string {
  const [y, m] = month.split("-").map((n) => parseInt(n, 10));
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Avance une date 'YYYY-MM-DD' selon la cadence (jour conservé, borné à la fin du mois). */
function advanceDate(date: string, cadence: Cadence): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  let y = parseInt(m[1], 10);
  let mo = parseInt(m[2], 10); // 1-12
  const day = parseInt(m[3], 10);
  if (cadence === "weekly") {
    // +7 jours via l'horloge UTC (gère les débordements de mois/année).
    const dt = new Date(Date.UTC(y, mo - 1, day));
    dt.setUTCDate(dt.getUTCDate() + 7);
    return dt.toISOString().slice(0, 10);
  }
  if (cadence === "yearly") {
    y += 1;
  } else {
    // monthly
    mo += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  // Borne le jour à la longueur du mois cible.
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const clamped = Math.min(day, lastDay);
  return `${y}-${String(mo).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

/* ── Sérialisation ──────────────────────────────────────────────────────── */
function toAccount(r: Record<string, unknown>, balance: number): FinanceAccount {
  return {
    id: r.id as string,
    name: r.name as string,
    kind: cleanAccountKind(r.kind),
    currency: (r.currency as string) ?? "EUR",
    start_balance: r2((r.start_balance as number) ?? 0),
    icon: (r.icon as string) ?? "wallet",
    color: (r.color as string) ?? "sand",
    archived: bool(r.archived),
    position: (r.position as number) ?? 0,
    balance: r2(balance),
  };
}

function toCategory(r: Record<string, unknown>): FinanceCategory {
  return {
    id: r.id as string,
    name: r.name as string,
    kind: cleanCategoryKind(r.kind),
    icon: (r.icon as string) ?? "tag",
    color: (r.color as string) ?? "sand",
    monthly_budget: r.monthly_budget == null ? null : r2(r.monthly_budget as number),
    position: (r.position as number) ?? 0,
    archived: bool(r.archived),
  };
}

function toTransaction(r: Record<string, unknown>): FinanceTransaction {
  return {
    id: r.id as string,
    account_id: r.account_id as string,
    category_id: (r.category_id as string) ?? null,
    type: cleanTxType(r.type) ?? "expense",
    amount: r2((r.amount as number) ?? 0),
    date: r.date as string,
    payee: (r.payee as string) ?? null,
    note: (r.note as string) ?? null,
    transfer_account_id: (r.transfer_account_id as string) ?? null,
    recurring_id: (r.recurring_id as string) ?? null,
    created_at: r.created_at as number,
  };
}

function toRecurring(r: Record<string, unknown>): FinanceRecurring {
  return {
    id: r.id as string,
    account_id: r.account_id as string,
    category_id: (r.category_id as string) ?? null,
    type: cleanTxType(r.type) ?? "expense",
    amount: r2((r.amount as number) ?? 0),
    label: r.label as string,
    cadence: cleanCadence(r.cadence),
    next_date: r.next_date as string,
    active: bool(r.active),
  };
}

function toGoal(r: Record<string, unknown>): FinanceGoal {
  return {
    id: r.id as string,
    name: r.name as string,
    target_amount: r2((r.target_amount as number) ?? 0),
    saved_amount: r2((r.saved_amount as number) ?? 0),
    target_date: (r.target_date as string) ?? null,
    account_id: (r.account_id as string) ?? null,
    icon: (r.icon as string) ?? "target",
    color: (r.color as string) ?? "sage",
  };
}

/* ── Accès / partage avec un partenaire ─────────────────────────────────── */
/**
 * Résout l'espace finances ciblé. Si `requested` est vide ou égal à moi →
 * mon propre espace (édition autorisée). Sinon, vérifie un partage
 * finance_shares(owner_id=requested, partner_id=me) ; renvoie null si absent
 * (l'appelant répond alors 403).
 */
async function resolveOwner(
  c: { env: AppEnv["Bindings"]; var: AppEnv["Variables"] },
  requested?: string | null,
): Promise<{ ownerId: string; canEdit: boolean } | null> {
  const me = c.var.user!.id;
  const req = (requested ?? "").trim();
  if (!req || req === me) return { ownerId: me, canEdit: true };
  const row = await c.env.DB.prepare(
    "SELECT can_edit FROM finance_shares WHERE owner_id = ? AND partner_id = ?",
  )
    .bind(req, me)
    .first<{ can_edit: number }>();
  if (!row) return null;
  return { ownerId: req, canEdit: bool(row.can_edit) };
}

/** Calcule le solde d'un compte (en JS, à partir des transactions). */
function accountBalance(
  start: number,
  txs: { account_id: string; transfer_account_id: string | null; type: TxType; amount: number }[],
  accId: string,
): number {
  let bal = start;
  for (const t of txs) {
    if (t.account_id === accId) {
      if (t.type === "income") bal += t.amount;
      else bal -= t.amount; // expense ou transfer : sortie du compte source
    }
    if (t.type === "transfer" && t.transfer_account_id === accId) bal += t.amount; // entrée sur le compte cible
  }
  return bal;
}

/** Charge toutes les transactions d'un espace (pour les calculs de solde). */
async function loadAllTx(
  c: { env: AppEnv["Bindings"] },
  ownerId: string,
): Promise<{ account_id: string; transfer_account_id: string | null; type: TxType; amount: number }[]> {
  const res = await c.env.DB.prepare(
    "SELECT account_id, transfer_account_id, type, amount FROM finance_transactions WHERE user_id = ?",
  )
    .bind(ownerId)
    .all<Record<string, unknown>>();
  return (res.results ?? []).map((r) => ({
    account_id: r.account_id as string,
    transfer_account_id: (r.transfer_account_id as string) ?? null,
    type: cleanTxType(r.type) ?? "expense",
    amount: (r.amount as number) ?? 0,
  }));
}

/* ── Aperçu (overview) ──────────────────────────────────────────────────── */
app.get("/overview", async (c) => {
  const space = await resolveOwner(c, c.req.query("owner"));
  if (!space) return c.json({ error: "Accès refusé" }, 403);
  const ownerId = space.ownerId;
  const month = cleanMonth(c.req.query("month"));
  const prev = prevMonth(month);

  // Comptes (tous, pour calculer la valeur nette ; on n'expose que les actifs).
  const accRes = await c.env.DB.prepare(
    "SELECT * FROM finance_accounts WHERE user_id = ? ORDER BY position ASC, created_at ASC",
  )
    .bind(ownerId)
    .all<Record<string, unknown>>();
  const accountRows = accRes.results ?? [];
  const allTx = await loadAllTx(c, ownerId);

  const balances = new Map<string, number>();
  for (const a of accountRows) {
    const id = a.id as string;
    balances.set(id, r2(accountBalance((a.start_balance as number) ?? 0, allTx, id)));
  }

  const accounts: FinanceAccount[] = accountRows
    .filter((a) => !bool(a.archived))
    .map((a) => toAccount(a, balances.get(a.id as string) ?? 0));

  // Valeur nette : Σ soldes des comptes non archivés.
  const net_worth = r2(accounts.reduce((s, a) => s + a.balance, 0));
  const currency = accounts[0]?.currency ?? (accountRows[0]?.currency as string) ?? "EUR";

  // Totaux du mois (et du mois précédent pour les dépenses).
  const monthAgg = await c.env.DB.prepare(
    `SELECT type, COALESCE(SUM(amount), 0) AS total
     FROM finance_transactions
     WHERE user_id = ? AND substr(date, 1, 7) = ? AND type IN ('income', 'expense')
     GROUP BY type`,
  )
    .bind(ownerId, month)
    .all<{ type: string; total: number }>();
  let month_income = 0;
  let month_expense = 0;
  for (const row of monthAgg.results ?? []) {
    if (row.type === "income") month_income = r2(row.total ?? 0);
    else if (row.type === "expense") month_expense = r2(row.total ?? 0);
  }
  const prevAgg = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM finance_transactions
     WHERE user_id = ? AND substr(date, 1, 7) = ? AND type = 'expense'`,
  )
    .bind(ownerId, prev)
    .first<{ total: number }>();
  const prev_month_expense = r2(prevAgg?.total ?? 0);

  // Dépenses du mois par catégorie (catégorie réelle des transactions de type 'expense').
  const catSpendRes = await c.env.DB.prepare(
    `SELECT t.category_id AS category_id, COALESCE(SUM(t.amount), 0) AS amount
     FROM finance_transactions t
     WHERE t.user_id = ? AND t.type = 'expense' AND substr(t.date, 1, 7) = ?
     GROUP BY t.category_id`,
  )
    .bind(ownerId, month)
    .all<{ category_id: string | null; amount: number }>();
  const spentByCat = new Map<string | null, number>();
  for (const row of catSpendRes.results ?? []) {
    spentByCat.set(row.category_id ?? null, r2(row.amount ?? 0));
  }

  // Catégories (dépense) pour budgets + libellés.
  const catRes = await c.env.DB.prepare(
    "SELECT * FROM finance_categories WHERE user_id = ? AND archived = 0 ORDER BY kind ASC, position ASC, created_at ASC",
  )
    .bind(ownerId)
    .all<Record<string, unknown>>();
  const categoryRows = catRes.results ?? [];

  const budgets: BudgetLine[] = [];
  let budget_total = 0;
  let budget_spent = 0;
  for (const row of categoryRows) {
    if (cleanCategoryKind(row.kind) !== "expense") continue;
    if (row.monthly_budget == null) continue;
    const cat = toCategory(row);
    const spent = spentByCat.get(cat.id) ?? 0;
    cat.spent = r2(spent);
    const budget = r2(cat.monthly_budget ?? 0);
    budgets.push({ category: cat, budget, spent: r2(spent) });
    budget_total = r2(budget_total + budget);
    budget_spent = r2(budget_spent + spent);
  }

  // by_category : toutes les dépenses du mois groupées par catégorie (dont « Sans catégorie »).
  const catById = new Map<string, Record<string, unknown>>();
  for (const row of categoryRows) catById.set(row.id as string, row);
  const by_category: CategorySpend[] = [];
  for (const [catId, amount] of spentByCat.entries()) {
    if (catId == null) {
      by_category.push({ category_id: null, name: "Sans catégorie", color: "sand", icon: "tag", amount: r2(amount) });
    } else {
      const row = catById.get(catId);
      by_category.push({
        category_id: catId,
        name: (row?.name as string) ?? "Sans catégorie",
        color: (row?.color as string) ?? "sand",
        icon: (row?.icon as string) ?? "tag",
        amount: r2(amount),
      });
    }
  }
  by_category.sort((a, b) => b.amount - a.amount);

  // Objectifs.
  const goalRes = await c.env.DB.prepare(
    "SELECT * FROM finance_goals WHERE user_id = ? ORDER BY created_at ASC",
  )
    .bind(ownerId)
    .all<Record<string, unknown>>();
  const goals = (goalRes.results ?? []).map(toGoal);

  // Dernières transactions.
  const recentRes = await c.env.DB.prepare(
    "SELECT * FROM finance_transactions WHERE user_id = ? ORDER BY date DESC, created_at DESC LIMIT 8",
  )
    .bind(ownerId)
    .all<Record<string, unknown>>();
  const recent = (recentRes.results ?? []).map(toTransaction);

  // Récurrences à venir.
  const upcomingRes = await c.env.DB.prepare(
    "SELECT * FROM finance_recurring WHERE user_id = ? AND active = 1 ORDER BY next_date ASC LIMIT 6",
  )
    .bind(ownerId)
    .all<Record<string, unknown>>();
  const upcoming = (upcomingRes.results ?? []).map(toRecurring);

  const overview: FinanceOverview = {
    currency,
    net_worth,
    accounts,
    month,
    month_income,
    month_expense,
    prev_month_expense,
    budget_total,
    budget_spent,
    budgets,
    by_category,
    goals,
    recent,
    upcoming,
  };
  return c.json({ overview });
});

/* ── Statistiques (séries multi-mois + répartition par catégorie) ─────────── */
app.get("/stats", async (c) => {
  const space = await resolveOwner(c, c.req.query("owner"));
  if (!space) return c.json({ error: "Accès refusé" }, 403);
  const ownerId = space.ownerId;
  const monthsN = Math.min(24, Math.max(2, Math.trunc(Number(c.req.query("months")) || 6)));
  const endMonth = cleanMonth(c.req.query("month"));
  const monthList: string[] = [];
  for (let i = monthsN - 1; i >= 0; i--) monthList.push(shiftMonthStr(endMonth, -i));
  const first = monthList[0];

  // Revenus / dépenses par mois sur la période.
  const agg = await c.env.DB.prepare(
    `SELECT substr(date, 1, 7) AS m, type, COALESCE(SUM(amount), 0) AS total
     FROM finance_transactions
     WHERE user_id = ? AND type IN ('income', 'expense')
       AND substr(date, 1, 7) >= ? AND substr(date, 1, 7) <= ?
     GROUP BY m, type`,
  )
    .bind(ownerId, first, endMonth)
    .all<{ m: string; type: string; total: number }>();
  const incomeBy = new Map<string, number>();
  const expenseBy = new Map<string, number>();
  for (const row of agg.results ?? []) {
    if (row.type === "income") incomeBy.set(row.m, r2(row.total ?? 0));
    else expenseBy.set(row.m, r2(row.total ?? 0));
  }
  const months: FinanceMonthPoint[] = monthList.map((m) => ({
    month: m,
    income: incomeBy.get(m) ?? 0,
    expense: expenseBy.get(m) ?? 0,
  }));

  // Répartition des dépenses par catégorie sur toute la période.
  const catAgg = await c.env.DB.prepare(
    `SELECT t.category_id AS category_id, COALESCE(SUM(t.amount), 0) AS amount
     FROM finance_transactions t
     WHERE t.user_id = ? AND t.type = 'expense'
       AND substr(t.date, 1, 7) >= ? AND substr(t.date, 1, 7) <= ?
     GROUP BY t.category_id`,
  )
    .bind(ownerId, first, endMonth)
    .all<{ category_id: string | null; amount: number }>();
  const catRes = await c.env.DB.prepare(
    "SELECT id, name, color, icon FROM finance_categories WHERE user_id = ?",
  )
    .bind(ownerId)
    .all<Record<string, unknown>>();
  const catById = new Map<string, Record<string, unknown>>();
  for (const row of catRes.results ?? []) catById.set(row.id as string, row);
  const by_category: CategorySpend[] = [];
  for (const row of catAgg.results ?? []) {
    if (row.category_id == null) {
      by_category.push({ category_id: null, name: "Sans catégorie", color: "sand", icon: "tag", amount: r2(row.amount ?? 0) });
    } else {
      const meta = catById.get(row.category_id);
      by_category.push({
        category_id: row.category_id,
        name: (meta?.name as string) ?? "Sans catégorie",
        color: (meta?.color as string) ?? "sand",
        icon: (meta?.icon as string) ?? "tag",
        amount: r2(row.amount ?? 0),
      });
    }
  }
  by_category.sort((a, b) => b.amount - a.amount);

  const total_income = r2(months.reduce((s, p) => s + p.income, 0));
  const total_expense = r2(months.reduce((s, p) => s + p.expense, 0));
  const avg_expense = r2(total_expense / monthsN);
  const accCur = await c.env.DB.prepare(
    "SELECT currency FROM finance_accounts WHERE user_id = ? ORDER BY position ASC, created_at ASC LIMIT 1",
  )
    .bind(ownerId)
    .first<{ currency: string }>();
  const currency = accCur?.currency ?? "EUR";

  const stats: FinanceStats = { currency, months, by_category, total_income, total_expense, avg_expense };
  return c.json({ stats });
});

/* ── Comptes (SELF ONLY) ────────────────────────────────────────────────── */
app.get("/accounts", async (c) => {
  const me = c.var.user!.id;
  const accRes = await c.env.DB.prepare(
    "SELECT * FROM finance_accounts WHERE user_id = ? ORDER BY archived ASC, position ASC, created_at ASC",
  )
    .bind(me)
    .all<Record<string, unknown>>();
  const rows = accRes.results ?? [];
  const allTx = await loadAllTx(c, me);
  const accounts: FinanceAccount[] = rows.map((a) =>
    toAccount(a, accountBalance((a.start_balance as number) ?? 0, allTx, a.id as string)),
  );
  return c.json({ accounts });
});

app.post("/accounts", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const id = uid();
  const ts = now();
  const max = await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM finance_accounts WHERE user_id = ?")
    .bind(me)
    .first<{ m: number }>();
  await c.env.DB.prepare(
    `INSERT INTO finance_accounts (id, user_id, name, kind, currency, start_balance, icon, color, archived, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
  )
    .bind(
      id,
      me,
      str(body.name, 80).trim() || "Compte",
      cleanAccountKind(body.kind),
      str(body.currency, 8) || "EUR",
      numOrNull(body.start_balance) ?? 0,
      str(body.icon, 40) || "wallet",
      str(body.color, 40) || "sand",
      (max?.m ?? -1) + 1,
      ts,
      ts,
    )
    .run();
  return c.json({ id });
});

app.patch("/accounts/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT 1 FROM finance_accounts WHERE id = ? AND user_id = ?")
    .bind(id, me)
    .first();
  if (!existing) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  const setIf = (key: string, col: string, t: (v: unknown) => unknown) => {
    if (body[key] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(t(body[key]));
    }
  };
  setIf("name", "name", (v) => str(v, 80).trim() || "Compte");
  setIf("kind", "kind", (v) => cleanAccountKind(v));
  setIf("currency", "currency", (v) => str(v, 8) || "EUR");
  setIf("start_balance", "start_balance", (v) => numOrNull(v) ?? 0);
  setIf("icon", "icon", (v) => str(v, 40) || "wallet");
  setIf("color", "color", (v) => str(v, 40) || "sand");
  setIf("archived", "archived", (v) => (bool(v) ? 1 : 0));
  setIf("position", "position", (v) => intOrNull(v) ?? 0);
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  fields.push("updated_at = ?");
  values.push(now(), id, me);
  await c.env.DB.prepare(`UPDATE finance_accounts SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();
  return c.json({ ok: true });
});

app.delete("/accounts/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM finance_accounts WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.var.user!.id)
    .run();
  return c.json({ ok: true });
});

/* ── Catégories (SELF ONLY) ─────────────────────────────────────────────── */
app.get("/categories", async (c) => {
  const me = c.var.user!.id;
  const res = await c.env.DB.prepare(
    "SELECT * FROM finance_categories WHERE user_id = ? ORDER BY kind ASC, position ASC, created_at ASC",
  )
    .bind(me)
    .all<Record<string, unknown>>();
  return c.json({ categories: (res.results ?? []).map(toCategory) });
});

app.post("/categories", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const id = uid();
  const ts = now();
  const kind = cleanCategoryKind(body.kind);
  const max = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(position), -1) AS m FROM finance_categories WHERE user_id = ? AND kind = ?",
  )
    .bind(me, kind)
    .first<{ m: number }>();
  await c.env.DB.prepare(
    `INSERT INTO finance_categories (id, user_id, name, kind, icon, color, monthly_budget, position, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  )
    .bind(
      id,
      me,
      str(body.name, 80).trim() || "Catégorie",
      kind,
      str(body.icon, 40) || "tag",
      str(body.color, 40) || "sand",
      numOrNull(body.monthly_budget),
      (max?.m ?? -1) + 1,
      ts,
      ts,
    )
    .run();
  return c.json({ id });
});

app.patch("/categories/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT 1 FROM finance_categories WHERE id = ? AND user_id = ?")
    .bind(id, me)
    .first();
  if (!existing) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  const setIf = (key: string, col: string, t: (v: unknown) => unknown) => {
    if (body[key] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(t(body[key]));
    }
  };
  setIf("name", "name", (v) => str(v, 80).trim() || "Catégorie");
  setIf("kind", "kind", (v) => cleanCategoryKind(v));
  setIf("icon", "icon", (v) => str(v, 40) || "tag");
  setIf("color", "color", (v) => str(v, 40) || "sand");
  setIf("monthly_budget", "monthly_budget", (v) => numOrNull(v));
  setIf("position", "position", (v) => intOrNull(v) ?? 0);
  setIf("archived", "archived", (v) => (bool(v) ? 1 : 0));
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  fields.push("updated_at = ?");
  values.push(now(), id, me);
  await c.env.DB.prepare(`UPDATE finance_categories SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();
  return c.json({ ok: true });
});

app.delete("/categories/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM finance_categories WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.var.user!.id)
    .run();
  return c.json({ ok: true });
});

/* ── Démarrage en 1 clic ──────────────────────────────────────────────────
 * Crée un compte courant (si aucun) et un jeu de catégories courantes (si
 * aucune) pour que l'utilisateur puisse saisir une dépense tout de suite.
 * Idempotent : ne fait rien sur ce qui existe déjà. */
const DEFAULT_CATEGORIES: { name: string; kind: "expense" | "income"; icon: string; color: string }[] = [
  { name: "Courses", kind: "expense", icon: "tag", color: "sage" },
  { name: "Logement", kind: "expense", icon: "home", color: "sand" },
  { name: "Transport", kind: "expense", icon: "car", color: "sky" },
  { name: "Restaurants", kind: "expense", icon: "fork", color: "blush" },
  { name: "Loisirs", kind: "expense", icon: "confetti", color: "lilac" },
  { name: "Santé", kind: "expense", icon: "heart", color: "blush" },
  { name: "Abonnements", kind: "expense", icon: "repeat", color: "butter" },
  { name: "Shopping", kind: "expense", icon: "gift", color: "lilac" },
  { name: "Voyages", kind: "expense", icon: "plane", color: "sky" },
  { name: "Salaire", kind: "income", icon: "coins", color: "sage" },
  { name: "Autres revenus", kind: "income", icon: "wallet", color: "sky" },
];

app.post("/seed-defaults", async (c) => {
  const me = c.var.user!.id;
  const ts = now();
  const created = { accounts: 0, categories: 0 };

  const accCount = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM finance_accounts WHERE user_id = ?")
    .bind(me)
    .first<{ n: number }>();
  if ((accCount?.n ?? 0) === 0) {
    await c.env.DB.prepare(
      `INSERT INTO finance_accounts (id, user_id, name, kind, currency, start_balance, icon, color, archived, position, created_at, updated_at)
       VALUES (?, ?, 'Compte courant', 'checking', 'EUR', 0, 'wallet', 'sand', 0, 0, ?, ?)`,
    )
      .bind(uid(), me, ts, ts)
      .run();
    created.accounts = 1;
  }

  const catCount = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM finance_categories WHERE user_id = ?")
    .bind(me)
    .first<{ n: number }>();
  if ((catCount?.n ?? 0) === 0) {
    let posExpense = 0;
    let posIncome = 0;
    for (const cat of DEFAULT_CATEGORIES) {
      const pos = cat.kind === "income" ? posIncome++ : posExpense++;
      await c.env.DB.prepare(
        `INSERT INTO finance_categories (id, user_id, name, kind, icon, color, monthly_budget, position, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, ?)`,
      )
        .bind(uid(), me, cat.name, cat.kind, cat.icon, cat.color, pos, ts, ts)
        .run();
      created.categories++;
    }
  }

  return c.json({ ok: true, created });
});

/* ── Transactions ───────────────────────────────────────────────────────── */
app.get("/transactions", async (c) => {
  const space = await resolveOwner(c, c.req.query("owner"));
  if (!space) return c.json({ error: "Accès refusé" }, 403);
  const ownerId = space.ownerId;

  const where: string[] = ["user_id = ?"];
  const values: unknown[] = [ownerId];

  const month = str(c.req.query("month"), 7);
  if (/^\d{4}-\d{2}$/.test(month)) {
    where.push("substr(date, 1, 7) = ?");
    values.push(month);
  }
  const account = str(c.req.query("account"), 60);
  if (account) {
    where.push("account_id = ?");
    values.push(account);
  }
  const category = str(c.req.query("category"), 60);
  if (category) {
    where.push("category_id = ?");
    values.push(category);
  }
  const type = cleanTxType(c.req.query("type"));
  if (type) {
    where.push("type = ?");
    values.push(type);
  }
  const q = str(c.req.query("q"), 120).trim();
  if (q) {
    where.push("(LOWER(payee) LIKE ? OR LOWER(note) LIKE ?)");
    const like = `%${q.toLowerCase()}%`;
    values.push(like, like);
  }

  const res = await c.env.DB.prepare(
    `SELECT * FROM finance_transactions WHERE ${where.join(" AND ")} ORDER BY date DESC, created_at DESC LIMIT 500`,
  )
    .bind(...values)
    .all<Record<string, unknown>>();
  return c.json({ transactions: (res.results ?? []).map(toTransaction) });
});

app.post("/transactions", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const space = await resolveOwner(c, str(body.owner, 60) || null);
  if (!space) return c.json({ error: "Accès refusé" }, 403);
  if (!space.canEdit) return c.json({ error: "Accès refusé" }, 403);
  const ownerId = space.ownerId;

  const type = cleanTxType(body.type);
  if (!type) return c.json({ error: "Type invalide" }, 400);
  const amount = numOrNull(body.amount);
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return c.json({ error: "Montant invalide" }, 400);

  const accountId = str(body.account_id, 60);
  const acc = await c.env.DB.prepare("SELECT 1 FROM finance_accounts WHERE id = ? AND user_id = ?")
    .bind(accountId, ownerId)
    .first();
  if (!acc) return c.json({ error: "Compte introuvable" }, 404);

  let categoryId: string | null = str(body.category_id, 60) || null;
  let transferAccountId: string | null = null;

  if (type === "transfer") {
    transferAccountId = str(body.transfer_account_id, 60) || null;
    if (!transferAccountId || transferAccountId === accountId) return c.json({ error: "Compte cible invalide" }, 400);
    const dest = await c.env.DB.prepare("SELECT 1 FROM finance_accounts WHERE id = ? AND user_id = ?")
      .bind(transferAccountId, ownerId)
      .first();
    if (!dest) return c.json({ error: "Compte cible introuvable" }, 404);
    categoryId = null; // pas de catégorie sur un virement
  } else if (categoryId) {
    const cat = await c.env.DB.prepare("SELECT 1 FROM finance_categories WHERE id = ? AND user_id = ?")
      .bind(categoryId, ownerId)
      .first();
    if (!cat) return c.json({ error: "Catégorie introuvable" }, 404);
  }

  const date = str(body.date, 30) || currentMonth() + "-01";
  const id = uid();
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO finance_transactions (id, user_id, account_id, category_id, type, amount, date, payee, note, transfer_account_id, recurring_id, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
  )
    .bind(
      id,
      ownerId,
      accountId,
      categoryId,
      type,
      r2(amount),
      date,
      str(body.payee, 120) || null,
      str(body.note, 2000) || null,
      transferAccountId,
      me,
      ts,
      ts,
    )
    .run();
  return c.json({ id });
});

app.patch("/transactions/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  // Charge la transaction puis vérifie que l'espace est éditable par moi.
  const current = await c.env.DB.prepare("SELECT * FROM finance_transactions WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!current) return c.json({ error: "Introuvable" }, 404);
  const space = await resolveOwner(c, current.user_id as string);
  if (!space || !space.canEdit) return c.json({ error: "Accès refusé" }, 403);
  const ownerId = space.ownerId;

  const body = await c.req.json().catch(() => ({}));

  // Type final (existant ou fourni).
  const type = body.type !== undefined ? cleanTxType(body.type) : cleanTxType(current.type);
  if (!type) return c.json({ error: "Type invalide" }, 400);

  const fields: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown) => {
    fields.push(`${col} = ?`);
    values.push(val);
  };

  if (body.amount !== undefined) {
    const amount = numOrNull(body.amount);
    if (amount == null || !Number.isFinite(amount) || amount <= 0) return c.json({ error: "Montant invalide" }, 400);
    push("amount", r2(amount));
  }
  if (body.type !== undefined) push("type", type);

  if (body.account_id !== undefined) {
    const accountId = str(body.account_id, 60);
    const acc = await c.env.DB.prepare("SELECT 1 FROM finance_accounts WHERE id = ? AND user_id = ?")
      .bind(accountId, ownerId)
      .first();
    if (!acc) return c.json({ error: "Compte introuvable" }, 404);
    push("account_id", accountId);
  }

  if (body.transfer_account_id !== undefined) {
    const transferAccountId = str(body.transfer_account_id, 60) || null;
    if (transferAccountId) {
      const dest = await c.env.DB.prepare("SELECT 1 FROM finance_accounts WHERE id = ? AND user_id = ?")
        .bind(transferAccountId, ownerId)
        .first();
      if (!dest) return c.json({ error: "Compte cible introuvable" }, 404);
    }
    push("transfer_account_id", transferAccountId);
  }

  if (body.category_id !== undefined) {
    let categoryId = str(body.category_id, 60) || null;
    if (type === "transfer") categoryId = null;
    else if (categoryId) {
      const cat = await c.env.DB.prepare("SELECT 1 FROM finance_categories WHERE id = ? AND user_id = ?")
        .bind(categoryId, ownerId)
        .first();
      if (!cat) return c.json({ error: "Catégorie introuvable" }, 404);
    }
    push("category_id", categoryId);
  } else if (type === "transfer" && cleanTxType(current.type) !== "transfer") {
    // Bascule vers un virement : on retire la catégorie.
    push("category_id", null);
  }

  if (body.date !== undefined) push("date", str(body.date, 30) || (current.date as string));
  if (body.payee !== undefined) push("payee", str(body.payee, 120) || null);
  if (body.note !== undefined) push("note", str(body.note, 2000) || null);

  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  push("updated_at", now());
  values.push(id);
  await c.env.DB.prepare(`UPDATE finance_transactions SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
  return c.json({ ok: true });
});

app.delete("/transactions/:id", async (c) => {
  const id = c.req.param("id");
  const current = await c.env.DB.prepare("SELECT user_id FROM finance_transactions WHERE id = ?")
    .bind(id)
    .first<{ user_id: string }>();
  if (!current) return c.json({ error: "Introuvable" }, 404);
  const space = await resolveOwner(c, current.user_id);
  if (!space || !space.canEdit) return c.json({ error: "Accès refusé" }, 403);
  await c.env.DB.prepare("DELETE FROM finance_transactions WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

/* ── Récurrences (SELF ONLY) ────────────────────────────────────────────── */
app.get("/recurring", async (c) => {
  const me = c.var.user!.id;
  const res = await c.env.DB.prepare(
    "SELECT * FROM finance_recurring WHERE user_id = ? ORDER BY active DESC, next_date ASC",
  )
    .bind(me)
    .all<Record<string, unknown>>();
  return c.json({ recurring: (res.results ?? []).map(toRecurring) });
});

app.post("/recurring", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const type = cleanTxType(body.type);
  if (!type) return c.json({ error: "Type invalide" }, 400);
  const amount = numOrNull(body.amount);
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return c.json({ error: "Montant invalide" }, 400);

  const accountId = str(body.account_id, 60);
  const acc = await c.env.DB.prepare("SELECT 1 FROM finance_accounts WHERE id = ? AND user_id = ?")
    .bind(accountId, me)
    .first();
  if (!acc) return c.json({ error: "Compte introuvable" }, 404);

  let categoryId: string | null = type === "transfer" ? null : str(body.category_id, 60) || null;
  if (categoryId) {
    const cat = await c.env.DB.prepare("SELECT 1 FROM finance_categories WHERE id = ? AND user_id = ?")
      .bind(categoryId, me)
      .first();
    if (!cat) return c.json({ error: "Catégorie introuvable" }, 404);
  }

  const id = uid();
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO finance_recurring (id, user_id, account_id, category_id, type, amount, label, cadence, next_date, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      me,
      accountId,
      categoryId,
      type,
      r2(amount),
      str(body.label, 120).trim() || "Récurrence",
      cleanCadence(body.cadence),
      str(body.next_date, 30) || currentMonth() + "-01",
      body.active === undefined ? 1 : bool(body.active) ? 1 : 0,
      ts,
      ts,
    )
    .run();
  return c.json({ id });
});

app.patch("/recurring/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM finance_recurring WHERE id = ? AND user_id = ?")
    .bind(id, me)
    .first<Record<string, unknown>>();
  if (!existing) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));

  const type = body.type !== undefined ? cleanTxType(body.type) : cleanTxType(existing.type);
  if (!type) return c.json({ error: "Type invalide" }, 400);

  const fields: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown) => {
    fields.push(`${col} = ?`);
    values.push(val);
  };

  if (body.account_id !== undefined) {
    const accountId = str(body.account_id, 60);
    const acc = await c.env.DB.prepare("SELECT 1 FROM finance_accounts WHERE id = ? AND user_id = ?")
      .bind(accountId, me)
      .first();
    if (!acc) return c.json({ error: "Compte introuvable" }, 404);
    push("account_id", accountId);
  }
  if (body.category_id !== undefined || (body.type !== undefined && type === "transfer")) {
    let categoryId: string | null = type === "transfer" ? null : str(body.category_id, 60) || null;
    if (categoryId) {
      const cat = await c.env.DB.prepare("SELECT 1 FROM finance_categories WHERE id = ? AND user_id = ?")
        .bind(categoryId, me)
        .first();
      if (!cat) return c.json({ error: "Catégorie introuvable" }, 404);
    }
    push("category_id", categoryId);
  }
  if (body.type !== undefined) push("type", type);
  if (body.amount !== undefined) {
    const amount = numOrNull(body.amount);
    if (amount == null || !Number.isFinite(amount) || amount <= 0) return c.json({ error: "Montant invalide" }, 400);
    push("amount", r2(amount));
  }
  if (body.label !== undefined) push("label", str(body.label, 120).trim() || "Récurrence");
  if (body.cadence !== undefined) push("cadence", cleanCadence(body.cadence));
  if (body.next_date !== undefined) push("next_date", str(body.next_date, 30) || (existing.next_date as string));
  if (body.active !== undefined) push("active", bool(body.active) ? 1 : 0);

  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  push("updated_at", now());
  values.push(id, me);
  await c.env.DB.prepare(`UPDATE finance_recurring SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();
  return c.json({ ok: true });
});

app.delete("/recurring/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM finance_recurring WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.var.user!.id)
    .run();
  return c.json({ ok: true });
});

// Génère une transaction depuis une récurrence puis avance next_date.
app.post("/recurring/:id/run", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const rec = await c.env.DB.prepare("SELECT * FROM finance_recurring WHERE id = ? AND user_id = ?")
    .bind(id, me)
    .first<Record<string, unknown>>();
  if (!rec) return c.json({ error: "Introuvable" }, 404);

  const type = cleanTxType(rec.type) ?? "expense";
  const date = rec.next_date as string;
  const txId = uid();
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO finance_transactions (id, user_id, account_id, category_id, type, amount, date, payee, note, transfer_account_id, recurring_id, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
  )
    .bind(
      txId,
      me,
      rec.account_id as string,
      type === "transfer" ? null : ((rec.category_id as string) ?? null),
      type,
      r2((rec.amount as number) ?? 0),
      date,
      str(rec.label, 120) || null,
      id,
      me,
      ts,
      ts,
    )
    .run();

  const next = advanceDate(date, cleanCadence(rec.cadence));
  await c.env.DB.prepare("UPDATE finance_recurring SET next_date = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(next, now(), id, me)
    .run();
  return c.json({ id: txId });
});

/* ── Objectifs d'épargne (SELF ONLY) ────────────────────────────────────── */
app.get("/goals", async (c) => {
  const me = c.var.user!.id;
  const res = await c.env.DB.prepare("SELECT * FROM finance_goals WHERE user_id = ? ORDER BY created_at ASC")
    .bind(me)
    .all<Record<string, unknown>>();
  return c.json({ goals: (res.results ?? []).map(toGoal) });
});

app.post("/goals", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  let accountId: string | null = str(body.account_id, 60) || null;
  if (accountId) {
    const acc = await c.env.DB.prepare("SELECT 1 FROM finance_accounts WHERE id = ? AND user_id = ?")
      .bind(accountId, me)
      .first();
    if (!acc) return c.json({ error: "Compte introuvable" }, 404);
  }
  const id = uid();
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO finance_goals (id, user_id, name, target_amount, saved_amount, target_date, account_id, icon, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      me,
      str(body.name, 80).trim() || "Objectif",
      numOrNull(body.target_amount) ?? 0,
      Math.max(0, numOrNull(body.saved_amount) ?? 0),
      str(body.target_date, 30) || null,
      accountId,
      str(body.icon, 40) || "target",
      str(body.color, 40) || "sage",
      ts,
      ts,
    )
    .run();
  return c.json({ id });
});

app.patch("/goals/:id", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT 1 FROM finance_goals WHERE id = ? AND user_id = ?")
    .bind(id, me)
    .first();
  if (!existing) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown) => {
    fields.push(`${col} = ?`);
    values.push(val);
  };
  if (body.name !== undefined) push("name", str(body.name, 80).trim() || "Objectif");
  if (body.target_amount !== undefined) push("target_amount", numOrNull(body.target_amount) ?? 0);
  if (body.saved_amount !== undefined) push("saved_amount", Math.max(0, numOrNull(body.saved_amount) ?? 0));
  if (body.target_date !== undefined) push("target_date", str(body.target_date, 30) || null);
  if (body.account_id !== undefined) {
    const accountId = str(body.account_id, 60) || null;
    if (accountId) {
      const acc = await c.env.DB.prepare("SELECT 1 FROM finance_accounts WHERE id = ? AND user_id = ?")
        .bind(accountId, me)
        .first();
      if (!acc) return c.json({ error: "Compte introuvable" }, 404);
    }
    push("account_id", accountId);
  }
  if (body.icon !== undefined) push("icon", str(body.icon, 40) || "target");
  if (body.color !== undefined) push("color", str(body.color, 40) || "sage");
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  push("updated_at", now());
  values.push(id, me);
  await c.env.DB.prepare(`UPDATE finance_goals SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();
  return c.json({ ok: true });
});

app.delete("/goals/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM finance_goals WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), c.var.user!.id)
    .run();
  return c.json({ ok: true });
});

// Contribue (ou retire) à un objectif. saved_amount borné à >= 0.
app.post("/goals/:id/contribute", async (c) => {
  const me = c.var.user!.id;
  const id = c.req.param("id");
  const goal = await c.env.DB.prepare("SELECT saved_amount FROM finance_goals WHERE id = ? AND user_id = ?")
    .bind(id, me)
    .first<{ saved_amount: number }>();
  if (!goal) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const amount = numOrNull(body.amount);
  if (amount == null || !Number.isFinite(amount)) return c.json({ error: "Montant invalide" }, 400);
  const next = Math.max(0, r2((goal.saved_amount ?? 0) + amount));
  await c.env.DB.prepare("UPDATE finance_goals SET saved_amount = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(next, now(), id, me)
    .run();
  return c.json({ ok: true });
});

/* ── Partenaires (partage de l'espace finances) ─────────────────────────── */
app.get("/partners", async (c) => {
  const me = c.var.user!.id;
  // Espaces que JE partage (owner_id = me).
  const byMe = await c.env.DB.prepare(
    `SELECT s.can_edit, ${PUB_U}
     FROM finance_shares s JOIN users u ON u.id = s.partner_id
     WHERE s.owner_id = ?
     ORDER BY s.created_at DESC`,
  )
    .bind(me)
    .all<Record<string, unknown>>();
  // Espaces partagés AVEC moi (partner_id = me).
  const withMe = await c.env.DB.prepare(
    `SELECT s.can_edit, ${PUB_U}
     FROM finance_shares s JOIN users u ON u.id = s.owner_id
     WHERE s.partner_id = ?
     ORDER BY s.created_at DESC`,
  )
    .bind(me)
    .all<Record<string, unknown>>();

  const partners: FinancePartner[] = [];
  for (const r of byMe.results ?? []) {
    partners.push({ user: toPub(r), can_edit: bool(r.can_edit), direction: "shared_by_me" });
  }
  for (const r of withMe.results ?? []) {
    partners.push({ user: toPub(r), can_edit: bool(r.can_edit), direction: "shared_with_me" });
  }
  return c.json({ partners });
});

app.post("/partners", async (c) => {
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));
  const userId = str(body.user_id, 60);
  if (!userId || userId === me) return c.json({ error: "Cible invalide" }, 400);
  // Doit être un ami accepté.
  if (!(await areFriends(c.env.DB, me, userId))) return c.json({ error: "Doit être un ami" }, 400);
  const canEdit = bool(body.can_edit) ? 1 : 0;

  // Upsert sur la contrainte UNIQUE(owner_id, partner_id).
  const existing = await c.env.DB.prepare("SELECT id FROM finance_shares WHERE owner_id = ? AND partner_id = ?")
    .bind(me, userId)
    .first<{ id: string }>();
  if (existing) {
    await c.env.DB.prepare("UPDATE finance_shares SET can_edit = ? WHERE id = ?").bind(canEdit, existing.id).run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO finance_shares (id, owner_id, partner_id, can_edit, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(uid(), me, userId, canEdit, now())
      .run();
  }
  return c.json({ ok: true });
});

app.delete("/partners/:userId", async (c) => {
  await c.env.DB.prepare("DELETE FROM finance_shares WHERE owner_id = ? AND partner_id = ?")
    .bind(c.var.user!.id, c.req.param("userId"))
    .run();
  return c.json({ ok: true });
});

export default app;
