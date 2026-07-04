import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm } from "../ui";
import { Icon } from "../components/Icon";
import { InviteQr } from "../components/InviteQr";
import { InviteLink } from "../components/InviteLink";
import type {
  ExpenseGroup,
  ExpenseGroupDetail,
  ExpenseMember,
  SettlePlanStep,
  SplitMode,
} from "@shared/types";

/* ── Catégories (clé interne → libellé FR) ──────────────────────────────── */
const CATEGORIES: { value: string; label: string }[] = [
  { value: "lodging", label: "Logement" },
  { value: "transport", label: "Transport" },
  { value: "food", label: "Nourriture" },
  { value: "activity", label: "Activités" },
  { value: "groceries", label: "Courses" },
  { value: "other", label: "Autre" },
];
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

const SPLIT_LABEL: Record<SplitMode, string> = {
  equal: "Parts égales",
  shares: "Par parts",
  amounts: "Montants précis",
};

function fmtMoney(amount: number, currency: string): string {
  try {
    return (amount ?? 0).toLocaleString("fr-FR", { style: "currency", currency: currency || "EUR" });
  } catch {
    return `${(amount ?? 0).toFixed(2)} ${currency || "EUR"}`;
  }
}

function fmtDate(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function memberName(members: ExpenseMember[] | undefined, id: string): string {
  return members?.find((m) => m.id === id)?.name ?? "?";
}

/* ── Carte d'un groupe (liste) ──────────────────────────────────────────── */
function balanceLabel(group: ExpenseGroup): { text: string; color: string } {
  const bal = group.my_balance ?? 0;
  if (bal > 0.01) return { text: `On te doit ${fmtMoney(bal, group.currency)}`, color: "var(--sage, #2e7d57)" };
  if (bal < -0.01) return { text: `Tu dois ${fmtMoney(-bal, group.currency)}`, color: "var(--danger, #c0392b)" };
  return { text: "À jour", color: "var(--muted, #888)" };
}

export default function Expenses() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", currency: "EUR", members: "" });

  // Quick-add : /depenses?new=1 ouvre la création puis nettoie l'URL (idempotent,
  // compatible React.StrictMode grâce à la mise à jour fonctionnelle).
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setCreating(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("new");
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  const { data, isLoading } = useQuery({ queryKey: ["expense-groups"], queryFn: () => api.expenseGroups() });
  const groups = data?.groups ?? [];

  const create = useMutation({
    mutationFn: (b: { title: string; currency?: string; members?: string[] }) => api.createExpenseGroup(b),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["expense-groups"] });
      toast.push("Groupe créé");
      setCreating(false);
      setForm({ title: "", currency: "EUR", members: "" });
      if (res?.id) setSelectedId(res.id);
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const removeGroup = useMutation({
    mutationFn: (id: string) => api.deleteExpenseGroup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense-groups"] });
      toast.push("Groupe supprimé");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.push("Le titre est requis", true);
      return;
    }
    const members = form.members
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    create.mutate({ title: form.title.trim(), currency: form.currency.trim() || "EUR", members });
  };

  const askDelete = async (ev: React.MouseEvent, group: ExpenseGroup) => {
    ev.stopPropagation();
    if (await confirm(`Supprimer le groupe « ${group.title} » et toutes ses dépenses ?`)) removeGroup.mutate(group.id);
  };

  if (selectedId) {
    return <GroupDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div>
      <div className="page-head row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Tricount maison</p>
          <h1>
            Dépenses partagées <Icon name="expenses" size={26} style={{ verticalAlign: "-4px" }} />
          </h1>
          <p className="muted">Qui a payé quoi ? Équilibre les comptes en un clin d'œil.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> Nouveau groupe
        </button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="expenses"
            title="Partage tes premières dépenses"
            hint="Crée un groupe pour partager les frais d'un voyage, d'une coloc ou d'une soirée — et règle les comptes sans prise de tête."
            action={
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                <Icon name="plus" size={16} /> Nouveau groupe
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid-cards">
          {groups.map((group) => {
            const bl = balanceLabel(group);
            return (
              <div
                key={group.id}
                className="card card-pad-sm"
                style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
                onClick={() => setSelectedId(group.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setSelectedId(group.id)}
              >
                <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <h3 style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name={(group.icon as any) || "wallet"} size={20} />
                    {group.title}
                  </h3>
                  {group.archived && <span className="chip">Archivé</span>}
                </div>

                <div className="row wrap gap-3 muted small">
                  <span>
                    <Icon name="users" size={14} style={{ verticalAlign: "-2px" }} /> {group.member_count ?? 0}
                  </span>
                  <span>Total {fmtMoney(group.total_spent ?? 0, group.currency)}</span>
                </div>

                <div className="row wrap" style={{ marginTop: "auto", paddingTop: "var(--space-2)", alignItems: "center" }}>
                  <span style={{ color: bl.color, fontWeight: 600 }}>{bl.text}</span>
                  <span className="spacer" />
                  <button
                    className="btn btn-icon btn-danger btn-sm"
                    onClick={(e) => askDelete(e, group)}
                    aria-label="Supprimer"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <Modal
          title="Nouveau groupe de dépenses"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn btn-soft" onClick={() => setCreating(false)}>
                Annuler
              </button>
              <button className="btn btn-primary" onClick={submitCreate} disabled={create.isPending}>
                {create.isPending ? "Création…" : "Créer"}
              </button>
            </>
          }
        >
          <form onSubmit={submitCreate}>
            <Field label="Titre">
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Week-end à Lisbonne"
                autoCapitalize="sentences"
                autoFocus
              />
            </Field>
            <div className="row gap-3 wrap">
              <div style={{ width: 120 }}>
                <Field label="Devise">
                  <input
                    className="input"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    placeholder="EUR"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              </div>
            </div>
            <Field label="Participants (noms séparés par des virgules)">
              <input
                className="input"
                value={form.members}
                onChange={(e) => setForm({ ...form, members: e.target.value })}
                placeholder="Marie, Léa, Tom"
                autoCapitalize="words"
                autoComplete="off"
              />
            </Field>
            <p className="muted small">Tu es ajouté·e automatiquement au groupe.</p>
          </form>
        </Modal>
      )}

      {confirmNode}
    </div>
  );
}

/* ── Vue détaillée d'un groupe ──────────────────────────────────────────── */
interface ExpenseForm {
  title: string;
  amount: string;
  payer_id: string;
  category: string;
  spent_at: string;
  split_mode: SplitMode;
  shares: Record<string, string>; // member_id → valeur (part ou montant)
}

function GroupDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [addingExpense, setAddingExpense] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [memberName_, setMemberName] = useState("");
  const [form, setForm] = useState<ExpenseForm>({
    title: "",
    amount: "",
    payer_id: "",
    category: "other",
    spent_at: new Date().toISOString().slice(0, 10),
    split_mode: "equal",
    shares: {},
  });

  const { data, isLoading } = useQuery({
    queryKey: ["expense-group", id],
    queryFn: () => api.expenseGroup(id),
    enabled: !!id,
  });
  const group: ExpenseGroupDetail | undefined = data?.group;
  const members = group?.members ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["expense-group", id] });
    qc.invalidateQueries({ queryKey: ["expense-groups"] });
  };

  const addExpense = useMutation({
    mutationFn: (b: Parameters<typeof api.addExpense>[1]) => api.addExpense(id, b),
    onSuccess: () => {
      invalidate();
      toast.push("Dépense ajoutée");
      setAddingExpense(false);
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const deleteExpense = useMutation({
    mutationFn: (expenseId: string) => api.deleteExpense(id, expenseId),
    onSuccess: () => {
      invalidate();
      toast.push("Dépense supprimée");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const addMember = useMutation({
    mutationFn: (name: string) => api.addExpenseMember(id, { name }),
    onSuccess: () => {
      invalidate();
      toast.push("Participant ajouté");
      setAddingMember(false);
      setMemberName("");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const settle = useMutation({
    mutationFn: (b: { from_id: string; to_id: string; amount: number }) => api.settleExpense(id, b),
    onSuccess: () => {
      invalidate();
      toast.push("Remboursement enregistré");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const balanceByMember = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of group?.balances ?? []) m.set(b.member_id, b.balance);
    return m;
  }, [group]);

  const openAddExpense = () => {
    setForm({
      title: "",
      amount: "",
      payer_id: members.find((mm) => mm.is_me)?.id ?? members[0]?.id ?? "",
      category: "other",
      spent_at: new Date().toISOString().slice(0, 10),
      split_mode: "equal",
      shares: {},
    });
    setAddingExpense(true);
  };

  const submitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.push("Le titre est requis", true);
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.push("Montant invalide", true);
      return;
    }
    if (!form.payer_id) {
      toast.push("Choisis un payeur", true);
      return;
    }
    const shares =
      form.split_mode === "equal"
        ? undefined
        : members
            .map((mm) => ({ member_id: mm.id, value: Number(form.shares[mm.id]) || 0 }))
            .filter((s) => s.value > 0);
    addExpense.mutate({
      title: form.title.trim(),
      amount,
      payer_id: form.payer_id,
      category: form.category,
      split_mode: form.split_mode,
      spent_at: form.spent_at || undefined,
      shares,
    });
  };

  const submitMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName_.trim()) {
      toast.push("Le nom est requis", true);
      return;
    }
    addMember.mutate(memberName_.trim());
  };

  const askDeleteExpense = async (expenseId: string, title: string) => {
    if (await confirm(`Supprimer la dépense « ${title} » ?`)) deleteExpense.mutate(expenseId);
  };

  const markSettled = (step: SettlePlanStep) => {
    settle.mutate({ from_id: step.from_id, to_id: step.to_id, amount: step.amount });
  };

  if (isLoading) return <Spinner />;

  if (!group) {
    return (
      <div>
        <button className="btn btn-soft btn-sm" onClick={onBack}>
          <Icon name="arrowLeft" size={15} /> Dépenses
        </button>
        <div className="card" style={{ marginTop: "var(--space-4)" }}>
          <EmptyState icon="expenses" title="Groupe introuvable" hint="Ce groupe n'existe pas ou a été supprimé." />
        </div>
      </div>
    );
  }

  const currency = group.currency || "EUR";

  return (
    <div>
      <button className="btn btn-soft btn-sm" onClick={onBack}>
        <Icon name="arrowLeft" size={15} /> Dépenses
      </button>

      <div
        className="page-head row wrap"
        style={{ justifyContent: "space-between", marginTop: "var(--space-3)" }}
      >
        <div>
          <p className="eyebrow">Groupe partagé</p>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name={(group.icon as any) || "wallet"} size={26} />
            {group.title}
          </h1>
          <div className="row wrap gap-3" style={{ marginTop: "var(--space-2)" }}>
            <span className="chip chip-accent">Total {fmtMoney(group.total_spent ?? 0, currency)}</span>
            <span className="chip">
              <Icon name="users" size={14} style={{ verticalAlign: "-2px" }} /> {members.length} participant
              {members.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="row gap-2 wrap">
          <InviteLink kind="group" targetId={group.id} variant="soft">Lien</InviteLink>
          <InviteQr kind="group" targetId={group.id} variant="soft">QR</InviteQr>
          <button className="btn btn-soft" onClick={() => setAddingMember(true)}>
            <Icon name="users" size={16} /> Participant
          </button>
          <button className="btn btn-primary" onClick={openAddExpense}>
            <Icon name="plus" size={16} /> Dépense
          </button>
        </div>
      </div>

      {/* ── Membres & soldes ── */}
      <div className="panel-head">
        <h2>Participants</h2>
      </div>
      <div className="card card-pad-sm" style={{ marginBottom: "var(--space-5)" }}>
        {members.map((m) => {
          const bal = balanceByMember.get(m.id) ?? 0;
          const color = bal > 0.01 ? "var(--sage, #2e7d57)" : bal < -0.01 ? "var(--danger, #c0392b)" : "var(--muted, #888)";
          const label = bal > 0.01 ? `+${fmtMoney(bal, currency)}` : bal < -0.01 ? fmtMoney(bal, currency) : "à jour";
          return (
            <div key={m.id} className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
              <span style={{ fontWeight: 600 }}>
                {m.name}
                {m.is_me && <span className="chip" style={{ marginLeft: 8 }}>toi</span>}
              </span>
              <span style={{ color, fontWeight: 600 }}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* ── Équilibrer / Qui doit quoi ── */}
      <div className="panel-head">
        <h2>
          <Icon name="scale" size={18} style={{ verticalAlign: "-3px" }} /> Équilibrer
        </h2>
      </div>
      <div className="card card-pad-sm" style={{ marginBottom: "var(--space-5)" }}>
        {(group.settle_plan ?? []).length === 0 ? (
          <p className="muted">
            <Icon name="check" size={16} style={{ verticalAlign: "-2px" }} /> Tout est équilibré, rien à rembourser.
          </p>
        ) : (
          (group.settle_plan ?? []).map((step, i) => (
            <div key={i} className="row wrap" style={{ justifyContent: "space-between", alignItems: "center", padding: "6px 0", gap: 8 }}>
              <span>
                <strong>{memberName(members, step.from_id)}</strong> doit{" "}
                <strong style={{ color: "var(--accent, #c0392b)" }}>{fmtMoney(step.amount, currency)}</strong> à{" "}
                <strong>{memberName(members, step.to_id)}</strong>
              </span>
              <button className="btn btn-soft btn-sm" onClick={() => markSettled(step)} disabled={settle.isPending}>
                <Icon name="check" size={14} /> Marquer remboursé
              </button>
            </div>
          ))
        )}
      </div>

      {/* ── Liste des dépenses ── */}
      <div className="panel-head">
        <h2>Dépenses</h2>
        <button className="btn btn-primary btn-sm" onClick={openAddExpense}>
          <Icon name="plus" size={14} /> Ajouter une dépense
        </button>
      </div>

      {(group.expenses ?? []).length === 0 ? (
        <div className="card">
          <EmptyState
            icon="notes"
            title="Aucune dépense"
            hint="Ajoute une première dépense pour commencer le partage."
            action={
              <button className="btn btn-primary" onClick={openAddExpense}>
                <Icon name="plus" size={16} /> Ajouter une dépense
              </button>
            }
          />
        </div>
      ) : (
        <div className="card card-pad-sm">
          {(group.expenses ?? []).map((exp) => (
            <div key={exp.id} className="li-row" style={{ alignItems: "center" }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row wrap gap-2" style={{ alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{exp.title}</span>
                  <span className="chip small">{CATEGORY_LABEL[exp.category] ?? "Autre"}</span>
                </div>
                <p className="muted small" style={{ marginTop: 2 }}>
                  Payé par {memberName(members, exp.payer_id)}
                  {exp.spent_at ? ` · ${fmtDate(exp.spent_at)}` : ""}
                </p>
              </div>
              <span className="chip chip-accent">{fmtMoney(exp.amount, currency)}</span>
              <button
                className="btn btn-icon btn-danger btn-sm"
                onClick={() => askDeleteExpense(exp.id, exp.title)}
                aria-label="Supprimer"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Modale : ajouter une dépense ── */}
      {addingExpense && (
        <Modal
          title="Ajouter une dépense"
          onClose={() => setAddingExpense(false)}
          footer={
            <>
              <button className="btn btn-soft" onClick={() => setAddingExpense(false)}>
                Annuler
              </button>
              <button className="btn btn-primary" onClick={submitExpense} disabled={addExpense.isPending}>
                {addExpense.isPending ? "Ajout…" : "Ajouter"}
              </button>
            </>
          }
        >
          <form onSubmit={submitExpense}>
            <Field label="Titre">
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Courses, restaurant…"
                autoCapitalize="sentences"
                autoFocus
              />
            </Field>
            <div className="row gap-3 wrap">
              <div style={{ width: 140 }}>
                <Field label="Montant">
                  <input
                    type="number"
                    className="input"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    enterKeyHint="done"
                  />
                </Field>
              </div>
              <div className="grow">
                <Field label="Payé par">
                  <select
                    className="select"
                    value={form.payer_id}
                    onChange={(e) => setForm({ ...form, payer_id: e.target.value })}
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
            <div className="row gap-3 wrap">
              <div className="grow">
                <Field label="Catégorie">
                  <select
                    className="select"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div style={{ width: 170 }}>
                <Field label="Date">
                  <input
                    type="date"
                    className="input"
                    value={form.spent_at}
                    onChange={(e) => setForm({ ...form, spent_at: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <Field label="Répartition">
              <select
                className="select"
                value={form.split_mode}
                onChange={(e) => setForm({ ...form, split_mode: e.target.value as SplitMode })}
              >
                <option value="equal">{SPLIT_LABEL.equal}</option>
                <option value="shares">{SPLIT_LABEL.shares}</option>
                <option value="amounts">{SPLIT_LABEL.amounts}</option>
              </select>
            </Field>

            {form.split_mode !== "equal" && (
              <div className="col gap-2" style={{ marginTop: "var(--space-2)" }}>
                <p className="muted small">
                  {form.split_mode === "shares"
                    ? "Nombre de parts par participant (laisser vide = exclu)."
                    : "Montant exact par participant."}
                </p>
                {members.map((m) => (
                  <div key={m.id} className="row" style={{ alignItems: "center", gap: 8 }}>
                    <span className="grow">{m.name}</span>
                    <input
                      type="number"
                      className="input"
                      style={{ width: 120 }}
                      value={form.shares[m.id] ?? ""}
                      onChange={(e) => setForm({ ...form, shares: { ...form.shares, [m.id]: e.target.value } })}
                      placeholder={form.split_mode === "shares" ? "1" : "0.00"}
                      min="0"
                      step={form.split_mode === "shares" ? "1" : "0.01"}
                      inputMode={form.split_mode === "shares" ? "numeric" : "decimal"}
                    />
                  </div>
                ))}
              </div>
            )}
          </form>
        </Modal>
      )}

      {/* ── Modale : ajouter un participant ── */}
      {addingMember && (
        <Modal
          title="Ajouter un participant"
          onClose={() => setAddingMember(false)}
          footer={
            <>
              <button className="btn btn-soft" onClick={() => setAddingMember(false)}>
                Annuler
              </button>
              <button className="btn btn-primary" onClick={submitMember} disabled={addMember.isPending}>
                {addMember.isPending ? "Ajout…" : "Ajouter"}
              </button>
            </>
          }
        >
          <form onSubmit={submitMember}>
            <Field label="Nom">
              <input
                className="input"
                value={memberName_}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="Prénom du participant"
                autoCapitalize="words"
                autoComplete="off"
                autoFocus
              />
            </Field>
          </form>
        </Modal>
      )}

      {confirmNode}
    </div>
  );
}
