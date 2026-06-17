import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAuth } from "../auth";
import { bool, now, numOrNull, str, uid } from "../util";
import type {
  Expense,
  ExpenseGroup,
  ExpenseGroupDetail,
  ExpenseMember,
  ExpenseShare,
  MemberBalance,
  Settlement,
  SettlePlanStep,
  SplitMode,
} from "@shared/types";

const app = new Hono<AppEnv>();
app.use("*", requireAuth);

const CATEGORIES = ["other", "lodging", "transport", "food", "activity", "groceries"];
const SPLIT_MODES: SplitMode[] = ["equal", "shares", "amounts"];

/** Arrondi monétaire au centime. */
const r2 = (n: number): number => Math.round(n * 100) / 100;

function cleanCategory(v: unknown): string {
  const s = str(v, 30);
  return CATEGORIES.includes(s) ? s : "other";
}

function cleanSplit(v: unknown): SplitMode {
  return SPLIT_MODES.includes(v as SplitMode) ? (v as SplitMode) : "equal";
}

/* ── Sérialisation ──────────────────────────────────────────────────────── */
function toMember(r: Record<string, unknown>, me: string): ExpenseMember {
  return {
    id: r.id as string,
    user_id: (r.user_id as string) ?? null,
    name: r.name as string,
    weight: (r.weight as number) ?? 1,
    handle: (r.handle as string) ?? null,
    avatar_url: (r.avatar_url as string) ?? null,
    is_me: r.user_id != null && r.user_id === me,
  };
}

function toSettlement(r: Record<string, unknown>): Settlement {
  return {
    id: r.id as string,
    group_id: r.group_id as string,
    from_id: r.from_id as string,
    to_id: r.to_id as string,
    amount: r2((r.amount as number) ?? 0),
    note: (r.note as string) ?? null,
    created_at: r.created_at as number,
  };
}

/* ── Accès ──────────────────────────────────────────────────────────────── */
/** L'utilisateur peut-il accéder à ce groupe (propriétaire OU membre lié) ? */
async function canAccessGroup(
  c: { env: AppEnv["Bindings"]; var: AppEnv["Variables"] },
  groupId: string,
): Promise<boolean> {
  const me = c.var.user!.id;
  const row = await c.env.DB.prepare(
    `SELECT 1 FROM expense_groups g
     WHERE g.id = ?
       AND (g.owner_id = ?
            OR EXISTS (SELECT 1 FROM expense_members m WHERE m.group_id = g.id AND m.user_id = ?))`,
  )
    .bind(groupId, me, me)
    .first();
  return !!row;
}

async function isOwner(
  c: { env: AppEnv["Bindings"]; var: AppEnv["Variables"] },
  groupId: string,
): Promise<boolean> {
  const row = await c.env.DB.prepare("SELECT 1 FROM expense_groups WHERE id = ? AND owner_id = ?")
    .bind(groupId, c.var.user!.id)
    .first();
  return !!row;
}

/* ── Calculs (parts, soldes, plan d'équilibrage) ────────────────────────── */

/**
 * Calcule la part de chaque membre pour une dépense.
 * Renvoie une liste {member_id, amount} dont la somme vaut exactement `amount`
 * (le reliquat d'arrondi est ajouté à la plus grosse part).
 */
function computeShares(
  amount: number,
  splitMode: SplitMode,
  members: { id: string; weight: number }[],
  input: { member_id: string; value: number }[],
): { member_id: string; amount: number }[] {
  let raw: { member_id: string; amount: number }[] = [];

  if (splitMode === "amounts") {
    // Montants explicites : on les prend tels quels.
    const byId = new Map(input.map((s) => [s.member_id, s.value]));
    raw = members
      .filter((m) => byId.has(m.id))
      .map((m) => ({ member_id: m.id, amount: r2(Number(byId.get(m.id)) || 0) }));
    // Si aucune part fournie, repli sur un partage égal.
    if (!raw.length) return computeShares(amount, "equal", members, input);
    return raw; // pas de correction de reliquat : on respecte les montants saisis
  }

  if (splitMode === "shares") {
    // Pondération par membre (poids 0/absent = exclu).
    const byId = new Map(input.map((s) => [s.member_id, Number(s.value) || 0]));
    const weighted = members
      .map((m) => ({ id: m.id, w: byId.has(m.id) ? (byId.get(m.id) as number) : 0 }))
      .filter((m) => m.w > 0);
    const totalW = weighted.reduce((s, m) => s + m.w, 0);
    if (totalW <= 0) return computeShares(amount, "equal", members, input);
    raw = weighted.map((m) => ({ member_id: m.id, amount: r2((amount * m.w) / totalW) }));
  } else {
    // equal : partage égal entre tous les membres du groupe.
    if (!members.length) return [];
    const each = amount / members.length;
    raw = members.map((m) => ({ member_id: m.id, amount: r2(each) }));
  }

  // Correction du reliquat d'arrondi : on l'ajoute à la plus grosse part.
  fixDrift(raw, amount);
  return raw;
}

/** Ajuste les parts pour que leur somme vaille exactement `amount`. */
function fixDrift(raw: { member_id: string; amount: number }[], amount: number) {
  if (!raw.length) return;
  const sum = r2(raw.reduce((s, p) => s + p.amount, 0));
  const drift = r2(amount - sum);
  if (drift !== 0) {
    let idx = 0;
    for (let i = 1; i < raw.length; i++) if (raw[i].amount > raw[idx].amount) idx = i;
    raw[idx].amount = r2(raw[idx].amount + drift);
  }
}

interface BalanceInput {
  members: { id: string }[];
  expenses: { payer_id: string; amount: number }[];
  shares: { member_id: string; amount: number }[];
  settlements: { from_id: string; to_id: string; amount: number }[];
}

function computeBalances(data: BalanceInput): MemberBalance[] {
  const paid = new Map<string, number>();
  const owed = new Map<string, number>();
  const sent = new Map<string, number>();
  const received = new Map<string, number>();
  for (const m of data.members) {
    paid.set(m.id, 0);
    owed.set(m.id, 0);
    sent.set(m.id, 0);
    received.set(m.id, 0);
  }
  for (const e of data.expenses) paid.set(e.payer_id, (paid.get(e.payer_id) ?? 0) + e.amount);
  for (const s of data.shares) owed.set(s.member_id, (owed.get(s.member_id) ?? 0) + s.amount);
  for (const s of data.settlements) {
    sent.set(s.from_id, (sent.get(s.from_id) ?? 0) + s.amount);
    received.set(s.to_id, (received.get(s.to_id) ?? 0) + s.amount);
  }
  return data.members.map((m) => {
    const p = r2(paid.get(m.id) ?? 0);
    const o = r2(owed.get(m.id) ?? 0);
    // balance = payé - dû + remboursements envoyés - remboursements reçus.
    const balance = r2(p - o + (sent.get(m.id) ?? 0) - (received.get(m.id) ?? 0));
    return { member_id: m.id, paid: p, owed: o, balance };
  });
}

/** Plan d'équilibrage glouton (cash-flow minimal). */
function computeSettlePlan(balances: MemberBalance[]): SettlePlanStep[] {
  const EPS = 0.01;
  // Copie mutable des soldes nets.
  const net = balances.map((b) => ({ id: b.member_id, bal: b.balance }));
  const steps: SettlePlanStep[] = [];
  // Garde-fou contre une boucle infinie.
  for (let guard = 0; guard < 1000; guard++) {
    let debtor = -1; // solde le plus négatif (doit de l'argent)
    let creditor = -1; // solde le plus positif (on lui doit)
    for (let i = 0; i < net.length; i++) {
      if (net[i].bal < (debtor === -1 ? -EPS : net[debtor].bal)) debtor = i;
      if (net[i].bal > (creditor === -1 ? EPS : net[creditor].bal)) creditor = i;
    }
    if (debtor === -1 || creditor === -1) break;
    const amount = r2(Math.min(-net[debtor].bal, net[creditor].bal));
    if (amount < EPS) break;
    steps.push({ from_id: net[debtor].id, to_id: net[creditor].id, amount });
    net[debtor].bal = r2(net[debtor].bal + amount);
    net[creditor].bal = r2(net[creditor].bal - amount);
  }
  return steps;
}

/** Charge les membres d'un groupe (avec infos user éventuelles). */
async function loadMembers(c: { env: AppEnv["Bindings"] }, groupId: string): Promise<Record<string, unknown>[]> {
  const res = await c.env.DB.prepare(
    `SELECT m.id, m.user_id, m.name, m.weight, u.handle, u.avatar_url
     FROM expense_members m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.group_id = ?
     ORDER BY m.created_at ASC`,
  )
    .bind(groupId)
    .all<Record<string, unknown>>();
  return res.results ?? [];
}

/* ── Routes : groupes ───────────────────────────────────────────────────── */

app.get("/", async (c) => {
  const me = c.var.user!.id;
  const res = await c.env.DB.prepare(
    `SELECT g.* FROM expense_groups g
     WHERE g.owner_id = ?
        OR EXISTS (SELECT 1 FROM expense_members m WHERE m.group_id = g.id AND m.user_id = ?)
     ORDER BY g.archived ASC, g.updated_at DESC`,
  )
    .bind(me, me)
    .all<Record<string, unknown>>();

  const groups: ExpenseGroup[] = [];
  for (const g of res.results ?? []) {
    const groupId = g.id as string;
    const members = await loadMembers(c, groupId);
    const expensesRes = await c.env.DB.prepare("SELECT payer_id, amount FROM expenses WHERE group_id = ?")
      .bind(groupId)
      .all<{ payer_id: string; amount: number }>();
    const sharesRes = await c.env.DB.prepare(
      `SELECT s.member_id, s.amount FROM expense_shares s
       JOIN expenses e ON e.id = s.expense_id WHERE e.group_id = ?`,
    )
      .bind(groupId)
      .all<{ member_id: string; amount: number }>();
    const settlementsRes = await c.env.DB.prepare(
      "SELECT from_id, to_id, amount FROM settlements WHERE group_id = ?",
    )
      .bind(groupId)
      .all<{ from_id: string; to_id: string; amount: number }>();

    const expenses = expensesRes.results ?? [];
    const balances = computeBalances({
      members: members.map((m) => ({ id: m.id as string })),
      expenses,
      shares: sharesRes.results ?? [],
      settlements: settlementsRes.results ?? [],
    });
    const myMember = members.find((m) => m.user_id != null && m.user_id === me);
    const myBalance = myMember ? balances.find((b) => b.member_id === myMember.id)?.balance ?? 0 : 0;

    groups.push({
      id: groupId,
      title: g.title as string,
      icon: (g.icon as string) ?? "wallet",
      currency: (g.currency as string) ?? "EUR",
      trip_id: (g.trip_id as string) ?? null,
      archived: bool(g.archived),
      created_at: g.created_at as number,
      updated_at: g.updated_at as number,
      member_count: members.length,
      total_spent: r2(expenses.reduce((s, e) => s + e.amount, 0)),
      my_balance: r2(myBalance),
    });
  }

  return c.json({ groups });
});

app.post("/", async (c) => {
  const me = c.var.user!;
  const body = await c.req.json().catch(() => ({}));
  const id = uid();
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO expense_groups (id, owner_id, title, icon, currency, trip_id, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  )
    .bind(
      id,
      me.id,
      str(body.title, 120).trim() || "Nouveau groupe",
      str(body.icon, 40) || "wallet",
      str(body.currency, 8) || "EUR",
      str(body.trip_id, 60) || null,
      ts,
      ts,
    )
    .run();

  // Toujours créer un membre pour le propriétaire (lié à son compte).
  await c.env.DB.prepare(
    "INSERT INTO expense_members (id, group_id, user_id, name, weight, created_at) VALUES (?, ?, ?, ?, 1, ?)",
  )
    .bind(uid(), id, me.id, me.display_name, ts)
    .run();

  // Participants supplémentaires sans compte (simple nom).
  const members = Array.isArray(body.members) ? body.members : [];
  for (const name of members) {
    const n = str(name, 80).trim();
    if (!n) continue;
    await c.env.DB.prepare(
      "INSERT INTO expense_members (id, group_id, user_id, name, weight, created_at) VALUES (?, ?, NULL, ?, 1, ?)",
    )
      .bind(uid(), id, n, ts)
      .run();
  }

  return c.json({ id });
});

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessGroup(c, id))) return c.json({ error: "Introuvable" }, 404);
  const me = c.var.user!.id;

  const g = await c.env.DB.prepare("SELECT * FROM expense_groups WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!g) return c.json({ error: "Introuvable" }, 404);

  const memberRows = await loadMembers(c, id);
  const members = memberRows.map((m) => toMember(m, me));

  const expenseRows = await c.env.DB.prepare(
    `SELECT * FROM expenses WHERE group_id = ?
     ORDER BY COALESCE(spent_at, '0000') DESC, created_at DESC`,
  )
    .bind(id)
    .all<Record<string, unknown>>();

  const shareRows = await c.env.DB.prepare(
    `SELECT s.* FROM expense_shares s JOIN expenses e ON e.id = s.expense_id WHERE e.group_id = ?`,
  )
    .bind(id)
    .all<Record<string, unknown>>();
  const sharesByExpense = new Map<string, ExpenseShare[]>();
  for (const s of shareRows.results ?? []) {
    const eid = s.expense_id as string;
    if (!sharesByExpense.has(eid)) sharesByExpense.set(eid, []);
    sharesByExpense.get(eid)!.push({ member_id: s.member_id as string, amount: r2((s.amount as number) ?? 0) });
  }

  const expenses: Expense[] = (expenseRows.results ?? []).map((e) => ({
    id: e.id as string,
    group_id: e.group_id as string,
    payer_id: e.payer_id as string,
    title: e.title as string,
    amount: r2((e.amount as number) ?? 0),
    category: (e.category as string) ?? "other",
    split_mode: cleanSplit(e.split_mode),
    spent_at: (e.spent_at as string) ?? null,
    note: (e.note as string) ?? null,
    created_at: e.created_at as number,
    shares: sharesByExpense.get(e.id as string) ?? [],
  }));

  const settlementRows = await c.env.DB.prepare(
    "SELECT * FROM settlements WHERE group_id = ? ORDER BY created_at DESC",
  )
    .bind(id)
    .all<Record<string, unknown>>();
  const settlements = (settlementRows.results ?? []).map(toSettlement);

  const balances = computeBalances({
    members: members.map((m) => ({ id: m.id })),
    expenses: expenses.map((e) => ({ payer_id: e.payer_id, amount: e.amount })),
    shares: expenses.flatMap((e) => e.shares),
    settlements: settlements.map((s) => ({ from_id: s.from_id, to_id: s.to_id, amount: s.amount })),
  });
  const settle_plan = computeSettlePlan(balances);

  const detail: ExpenseGroupDetail = {
    id: g.id as string,
    title: g.title as string,
    icon: (g.icon as string) ?? "wallet",
    currency: (g.currency as string) ?? "EUR",
    trip_id: (g.trip_id as string) ?? null,
    archived: bool(g.archived),
    created_at: g.created_at as number,
    updated_at: g.updated_at as number,
    member_count: members.length,
    total_spent: r2(expenses.reduce((s, e) => s + e.amount, 0)),
    my_balance: r2(
      (() => {
        const mine = members.find((m) => m.is_me);
        return mine ? balances.find((b) => b.member_id === mine.id)?.balance ?? 0 : 0;
      })(),
    ),
    members,
    expenses,
    settlements,
    balances,
    settle_plan,
  };

  return c.json({ group: detail });
});

app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  if (!(await isOwner(c, id))) return c.json({ error: "Introuvable" }, 404);
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
  setIf("icon", "icon", (v) => str(v, 40) || "wallet");
  setIf("currency", "currency", (v) => str(v, 8) || "EUR");
  setIf("archived", "archived", (v) => (bool(v) ? 1 : 0));
  if (!fields.length) return c.json({ error: "Rien à mettre à jour" }, 400);
  fields.push("updated_at = ?");
  values.push(now(), id);
  await c.env.DB.prepare(`UPDATE expense_groups SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  return c.json({ ok: true });
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (!(await isOwner(c, id))) return c.json({ error: "Introuvable" }, 404);
  await c.env.DB.prepare("DELETE FROM expense_groups WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

/* ── Routes : membres ───────────────────────────────────────────────────── */

app.post("/:id/members", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessGroup(c, id))) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const name = str(body.name, 80).trim();
  if (!name) return c.json({ error: "Nom requis" }, 400);

  let userId: string | null = null;
  if (body.user_id) {
    userId = str(body.user_id, 60);
    const exists = await c.env.DB.prepare("SELECT 1 FROM users WHERE id = ?").bind(userId).first();
    if (!exists) return c.json({ error: "Utilisateur introuvable" }, 404);
  }

  const weight = numOrNull(body.weight);
  const memberId = uid();
  await c.env.DB.prepare(
    "INSERT INTO expense_members (id, group_id, user_id, name, weight, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(memberId, id, userId, name, weight != null && weight > 0 ? weight : 1, now())
    .run();
  await c.env.DB.prepare("UPDATE expense_groups SET updated_at = ? WHERE id = ?").bind(now(), id).run();
  return c.json({ id: memberId });
});

app.delete("/:id/members/:memberId", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessGroup(c, id))) return c.json({ error: "Introuvable" }, 404);
  const memberId = c.req.param("memberId");

  // Refuse la suppression d'un membre encore lié à des dépenses/remboursements.
  const used = await c.env.DB.prepare(
    `SELECT 1 WHERE EXISTS (SELECT 1 FROM expenses WHERE group_id = ? AND payer_id = ?)
        OR EXISTS (SELECT 1 FROM expense_shares WHERE member_id = ?)
        OR EXISTS (SELECT 1 FROM settlements WHERE group_id = ? AND (from_id = ? OR to_id = ?))`,
  )
    .bind(id, memberId, memberId, id, memberId, memberId)
    .first();
  if (used) return c.json({ error: "Membre lié à des dépenses" }, 400);

  await c.env.DB.prepare("DELETE FROM expense_members WHERE id = ? AND group_id = ?").bind(memberId, id).run();
  await c.env.DB.prepare("UPDATE expense_groups SET updated_at = ? WHERE id = ?").bind(now(), id).run();
  return c.json({ ok: true });
});

/* ── Routes : dépenses ──────────────────────────────────────────────────── */

/** Insère les parts calculées pour une dépense. */
async function insertShares(
  c: { env: AppEnv["Bindings"] },
  expenseId: string,
  shares: { member_id: string; amount: number }[],
) {
  for (const s of shares) {
    await c.env.DB.prepare(
      "INSERT INTO expense_shares (id, expense_id, member_id, amount) VALUES (?, ?, ?, ?)",
    )
      .bind(uid(), expenseId, s.member_id, r2(s.amount))
      .run();
  }
}

function parseShareInput(v: unknown): { member_id: string; value: number }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((s) => ({ member_id: str(s?.member_id, 60), value: Number(s?.value) || 0 }))
    .filter((s) => s.member_id);
}

app.post("/:id/expenses", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessGroup(c, id))) return c.json({ error: "Introuvable" }, 404);
  const me = c.var.user!.id;
  const body = await c.req.json().catch(() => ({}));

  const title = str(body.title, 200).trim();
  if (!title) return c.json({ error: "Titre requis" }, 400);
  const amount = numOrNull(body.amount);
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return c.json({ error: "Montant invalide" }, 400);

  const memberRows = await loadMembers(c, id);
  const members = memberRows.map((m) => ({ id: m.id as string, weight: (m.weight as number) ?? 1 }));
  const payerId = str(body.payer_id, 60);
  if (!members.some((m) => m.id === payerId)) return c.json({ error: "Payeur invalide" }, 400);

  const splitMode = cleanSplit(body.split_mode);
  const shareInput = parseShareInput(body.shares);
  const shares = computeShares(r2(amount), splitMode, members, shareInput);

  const expenseId = uid();
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO expenses (id, group_id, payer_id, title, amount, category, split_mode, spent_at, note, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      expenseId,
      id,
      payerId,
      title,
      r2(amount),
      cleanCategory(body.category),
      splitMode,
      str(body.spent_at, 30) || null,
      str(body.note, 2000) || null,
      me,
      ts,
      ts,
    )
    .run();
  await insertShares(c, expenseId, shares);
  await c.env.DB.prepare("UPDATE expense_groups SET updated_at = ? WHERE id = ?").bind(ts, id).run();
  return c.json({ id: expenseId });
});

app.patch("/:id/expenses/:expenseId", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessGroup(c, id))) return c.json({ error: "Introuvable" }, 404);
  const expenseId = c.req.param("expenseId");
  const body = await c.req.json().catch(() => ({}));

  const current = await c.env.DB.prepare("SELECT * FROM expenses WHERE id = ? AND group_id = ?")
    .bind(expenseId, id)
    .first<Record<string, unknown>>();
  if (!current) return c.json({ error: "Dépense introuvable" }, 404);

  // Valeurs fusionnées (existant + champs fournis).
  const amount =
    body.amount !== undefined ? numOrNull(body.amount) : ((current.amount as number) ?? 0);
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return c.json({ error: "Montant invalide" }, 400);

  const memberRows = await loadMembers(c, id);
  const members = memberRows.map((m) => ({ id: m.id as string, weight: (m.weight as number) ?? 1 }));

  const payerId = body.payer_id !== undefined ? str(body.payer_id, 60) : (current.payer_id as string);
  if (!members.some((m) => m.id === payerId)) return c.json({ error: "Payeur invalide" }, 400);

  const splitMode = body.split_mode !== undefined ? cleanSplit(body.split_mode) : cleanSplit(current.split_mode);
  const title = body.title !== undefined ? str(body.title, 200).trim() || (current.title as string) : (current.title as string);

  const fields: string[] = ["title = ?", "amount = ?", "payer_id = ?", "split_mode = ?"];
  const values: unknown[] = [title, r2(amount), payerId, splitMode];
  if (body.category !== undefined) {
    fields.push("category = ?");
    values.push(cleanCategory(body.category));
  }
  if (body.spent_at !== undefined) {
    fields.push("spent_at = ?");
    values.push(str(body.spent_at, 30) || null);
  }
  if (body.note !== undefined) {
    fields.push("note = ?");
    values.push(str(body.note, 2000) || null);
  }
  fields.push("updated_at = ?");
  values.push(now(), expenseId, id);
  await c.env.DB.prepare(`UPDATE expenses SET ${fields.join(", ")} WHERE id = ? AND group_id = ?`)
    .bind(...values)
    .run();

  // Recalcule systématiquement les parts (approche robuste : on efface puis réinsère).
  const shareInput = parseShareInput(body.shares);
  const shares = computeShares(r2(amount), splitMode, members, shareInput);
  await c.env.DB.prepare("DELETE FROM expense_shares WHERE expense_id = ?").bind(expenseId).run();
  await insertShares(c, expenseId, shares);

  await c.env.DB.prepare("UPDATE expense_groups SET updated_at = ? WHERE id = ?").bind(now(), id).run();
  return c.json({ ok: true });
});

app.delete("/:id/expenses/:expenseId", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessGroup(c, id))) return c.json({ error: "Introuvable" }, 404);
  await c.env.DB.prepare("DELETE FROM expenses WHERE id = ? AND group_id = ?")
    .bind(c.req.param("expenseId"), id)
    .run();
  await c.env.DB.prepare("UPDATE expense_groups SET updated_at = ? WHERE id = ?").bind(now(), id).run();
  return c.json({ ok: true });
});

/* ── Routes : remboursements ────────────────────────────────────────────── */

app.post("/:id/settle", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessGroup(c, id))) return c.json({ error: "Introuvable" }, 404);
  const body = await c.req.json().catch(() => ({}));

  const amount = numOrNull(body.amount);
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return c.json({ error: "Montant invalide" }, 400);

  const fromId = str(body.from_id, 60);
  const toId = str(body.to_id, 60);
  if (!fromId || !toId || fromId === toId) return c.json({ error: "Membres invalides" }, 400);

  const memberRows = await loadMembers(c, id);
  const ids = new Set(memberRows.map((m) => m.id as string));
  if (!ids.has(fromId) || !ids.has(toId)) return c.json({ error: "Membres invalides" }, 400);

  const settlementId = uid();
  await c.env.DB.prepare(
    "INSERT INTO settlements (id, group_id, from_id, to_id, amount, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(settlementId, id, fromId, toId, r2(amount), str(body.note, 500) || null, now())
    .run();
  await c.env.DB.prepare("UPDATE expense_groups SET updated_at = ? WHERE id = ?").bind(now(), id).run();
  return c.json({ id: settlementId });
});

app.delete("/:id/settle/:settlementId", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessGroup(c, id))) return c.json({ error: "Introuvable" }, 404);
  await c.env.DB.prepare("DELETE FROM settlements WHERE id = ? AND group_id = ?")
    .bind(c.req.param("settlementId"), id)
    .run();
  await c.env.DB.prepare("UPDATE expense_groups SET updated_at = ? WHERE id = ?").bind(now(), id).run();
  return c.json({ ok: true });
});

export default app;
