// Éléments PARTAGÉS de la section Finances : helpers de formatage, constantes
// d'affichage, types, petits composants (ProgressBar, CatDot) et la modale de
// contribution (utilisée par l'Accueil et les Objectifs). Extrait de l'ancien
// Finance.tsx monolithique (1957 lignes) pour le découper en onglets.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { Modal, Field, useToast } from "../../ui";
import Icon, { type IconName } from "../../components/Icon";
import type { AccountKind, Cadence, FinanceGoal, TxType } from "@shared/types";

/* ── Formatage ──────────────────────────────────────────────────────────────── */
export const money = (n: number | null | undefined, cur?: string) => {
  try {
    return (n ?? 0).toLocaleString("fr-FR", { style: "currency", currency: cur || "EUR" });
  } catch {
    // Code devise invalide (ISO 4217) : repli numérique au lieu de planter le rendu.
    return `${(n ?? 0).toFixed(2)} ${cur || "EUR"}`;
  }
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthShort(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleDateString("fr-FR", { month: "short" });
}
export function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
export function fmtDayMonth(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" });
}

/* Map d'une couleur stockée (clé NOTE_COLORS ou valeur libre) → CSS color. */
export function colorVar(c: string | null | undefined): string {
  if (!c) return "var(--accent)";
  if (["sand", "sage", "sky", "blush", "lilac", "butter"].includes(c)) return `var(--${c})`;
  return c; // valeur CSS directe (#hex, etc.)
}
/* Couleur de texte lisible sur fond pastel. */
export const SOFT_INK = "var(--ink)";

/* ── Constantes d'affichage ─────────────────────────────────────────────────── */
export const ACCOUNT_KINDS: { value: AccountKind; label: string; icon: IconName }[] = [
  { value: "checking", label: "Compte courant", icon: "wallet" },
  { value: "savings", label: "Épargne", icon: "piggybank" },
  { value: "cash", label: "Espèces", icon: "coins" },
  { value: "card", label: "Carte", icon: "wallet" },
  { value: "investment", label: "Investissement", icon: "trend" },
];
export const ACCOUNT_KIND_LABEL: Record<string, string> = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k.value, k.label]));
export const ACCOUNT_KIND_ICON: Record<string, IconName> = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k.value, k.icon]));

export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "Hebdomadaire",
  monthly: "Mensuel",
  yearly: "Annuel",
};

export const TYPE_META: Record<TxType, { label: string; icon: IconName; color: string; sign: string }> = {
  expense: { label: "Dépense", icon: "arrowRight", color: "var(--danger)", sign: "-" },
  income: { label: "Revenu", icon: "arrowLeft", color: "var(--sage-ink, #4a5e3f)", sign: "+" },
  transfer: { label: "Virement", icon: "transfer", color: "var(--muted)", sign: "" },
};

export type TabKey = "overview" | "stats" | "transactions" | "accounts" | "budgets" | "goals" | "recurring" | "partners";
export const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: "overview", label: "Accueil", icon: "home" },
  { key: "stats", label: "Stats", icon: "chart" },
  { key: "transactions", label: "Transactions", icon: "lists" },
  { key: "accounts", label: "Comptes", icon: "wallet" },
  { key: "budgets", label: "Budgets", icon: "target" },
  { key: "goals", label: "Objectifs", icon: "piggybank" },
  { key: "recurring", label: "Récurrent", icon: "repeat" },
  { key: "partners", label: "Partage", icon: "share" },
];

/** Filtre transmis depuis l'Accueil / les Stats vers l'onglet Transactions (clic).
 *  month: undefined = mois courant (vue Accueil) ; "" = tous les mois (vue Stats). */
export type TxFilter = { category?: string; type?: string; month?: string };

export interface TxForm {
  type: TxType;
  amount: string;
  date: string;
  account_id: string;
  category_id: string;
  transfer_account_id: string;
  payee: string;
  note: string;
}
export const emptyTxForm = (): TxForm => ({
  type: "expense",
  amount: "",
  date: todayISO(),
  account_id: "",
  category_id: "",
  transfer_account_id: "",
  payee: "",
  note: "",
});

/* ── Petits composants ──────────────────────────────────────────────────────── */
/* Petite barre de progression colorée. */
export function ProgressBar({ pct, color, over }: { pct: number; color?: string; over?: boolean }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="bar" style={{ height: 9 }}>
      <span style={{ width: `${w}%`, background: over ? "var(--danger)" : color || "var(--accent)" }} />
    </div>
  );
}

/* Pastille catégorie (point coloré + icône). */
export function CatDot({ color, icon, size = 30 }: { color?: string; icon?: string; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: colorVar(color),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: SOFT_INK,
      }}
    >
      <Icon name={(icon as IconName) || "tag"} size={Math.round(size * 0.52)} />
    </span>
  );
}

/* Contribution à un objectif (utilisée par l'Accueil et l'onglet Objectifs). */
export function ContributeModal({ goal, cur, onClose }: { goal: FinanceGoal; cur: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const m = useMutation({
    mutationFn: (n: number) => api.contributeGoal(goal.id, n),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance"] });
      toast.push("Contribution ajoutée ");
      onClose();
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return toast.push("Montant invalide", true);
    m.mutate(n);
  };
  return (
    <Modal
      title={`Contribuer · ${goal.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-soft" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit} disabled={m.isPending}>
            {m.isPending ? "Ajout…" : "Ajouter"}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <p className="muted small" style={{ marginBottom: "var(--space-3)" }}>
          Épargné : {money(goal.saved_amount, cur)} / {money(goal.target_amount, cur)}
        </p>
        <Field label="Montant à ajouter">
          <input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
        </Field>
      </form>
    </Modal>
  );
}
