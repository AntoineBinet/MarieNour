import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm, SwatchRow } from "../ui";
import { takeCompose } from "../compose";
import Icon, { type IconName } from "../components/Icon";
import type {
  AccountKind,
  Cadence,
  CategoryKind,
  FinanceAccount,
  FinanceCategory,
  FinanceGoal,
  FinanceOverview,
  FinancePartner,
  FinanceRecurring,
  FinanceTransaction,
  TxType,
} from "@shared/types";

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const money = (n: number | null | undefined, cur?: string) =>
  (n ?? 0).toLocaleString("fr-FR", { style: "currency", currency: cur || "EUR" });

const todayISO = () => new Date().toISOString().slice(0, 10);

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthShort(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleDateString("fr-FR", { month: "short" });
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
function fmtDayMonth(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" });
}

/* Map d'une couleur stockée (clé NOTE_COLORS ou valeur libre) → CSS color. */
function colorVar(c: string | null | undefined): string {
  if (!c) return "var(--accent)";
  if (["sand", "sage", "sky", "blush", "lilac", "butter"].includes(c)) return `var(--${c})`;
  return c; // valeur CSS directe (#hex, etc.)
}
/* Couleur de texte lisible sur fond pastel. */
const SOFT_INK = "var(--ink)";

const ACCOUNT_KINDS: { value: AccountKind; label: string; icon: IconName }[] = [
  { value: "checking", label: "Compte courant", icon: "wallet" },
  { value: "savings", label: "Épargne", icon: "piggybank" },
  { value: "cash", label: "Espèces", icon: "coins" },
  { value: "card", label: "Carte", icon: "wallet" },
  { value: "investment", label: "Investissement", icon: "trend" },
];
const ACCOUNT_KIND_LABEL: Record<string, string> = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k.value, k.label]));
const ACCOUNT_KIND_ICON: Record<string, IconName> = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k.value, k.icon]));

const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "Hebdomadaire",
  monthly: "Mensuel",
  yearly: "Annuel",
};

const TYPE_META: Record<TxType, { label: string; icon: IconName; color: string; sign: string }> = {
  expense: { label: "Dépense", icon: "arrowRight", color: "var(--danger)", sign: "-" },
  income: { label: "Revenu", icon: "arrowLeft", color: "var(--sage-ink, #4a5e3f)", sign: "+" },
  transfer: { label: "Virement", icon: "transfer", color: "var(--muted)", sign: "" },
};

type TabKey = "overview" | "stats" | "transactions" | "accounts" | "budgets" | "goals" | "recurring" | "partners";
const TABS: { key: TabKey; label: string; icon: IconName }[] = [
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
type TxFilter = { category?: string; type?: string; month?: string };

/* Petite barre de progression colorée. */
function ProgressBar({ pct, color, over }: { pct: number; color?: string; over?: boolean }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="bar" style={{ height: 9 }}>
      <span style={{ width: `${w}%`, background: over ? "var(--danger)" : color || "var(--accent)" }} />
    </div>
  );
}

/* Pastille catégorie (point coloré + icône). */
function CatDot({ color, icon, size = 30 }: { color?: string; icon?: string; size?: number }) {
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

/* ── Composant principal ──────────────────────────────────────────────────── */
export default function Finance() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [month, setMonth] = useState<string>(currentMonth());
  const [owner, setOwner] = useState<string>(""); // "" = moi ; sinon id du partenaire

  const [quickAdd, setQuickAdd] = useState(false);
  const [txPrefill, setTxPrefill] = useState<Partial<TxForm> | null>(null);
  const [txFilter, setTxFilter] = useState<TxFilter | null>(null);

  // Ouverture pré-remplie depuis une note convertie (« Ajouter au portefeuille »).
  useEffect(() => {
    const c = takeCompose("finance");
    if (!c) return;
    setTxPrefill(c.prefill as Partial<TxForm>);
    setQuickAdd(true);
  }, []);
  // Navigue vers l'onglet Transactions en pré-filtrant (clic depuis l'Accueil).
  const goToTx = (f: TxFilter) => {
    setTxFilter(f);
    setTab("transactions");
  };

  const partnersQ = useQuery({ queryKey: ["finance", "partners"], queryFn: () => api.financePartners() });
  const partners = partnersQ.data?.partners ?? [];
  const sharedWithMe = partners.filter((p) => p.direction === "shared_with_me");
  const activePartner = owner ? sharedWithMe.find((p) => p.user.id === owner) : undefined;
  const canEdit = !owner || !!activePartner?.can_edit;

  // Comptes & catégories (servent au démarrage guidé + à l'ajout rapide).
  const accountsQ = useQuery({ queryKey: ["finance", "accounts"], queryFn: () => api.financeAccounts() });
  const categoriesQ = useQuery({ queryKey: ["finance", "categories"], queryFn: () => api.financeCategories() });
  const accounts = accountsQ.data?.accounts ?? [];
  const categories = categoriesQ.data?.categories ?? [];
  // Premier lancement (mon espace, rien de configuré) → carte de démarrage.
  const needsSetup =
    canEdit && !owner && !accountsQ.isLoading && !categoriesQ.isLoading && accounts.length === 0 && categories.length === 0;

  return (
    <div>
      <div className="page-head row wrap" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow">Mes finances</p>
          <h1>
            Budget <Icon name="wallet" size={26} style={{ verticalAlign: "-4px" }} />
          </h1>
          <p className="muted">Comptes, dépenses, budgets et objectifs — au même endroit.</p>
        </div>
        <div className="row gap-2 wrap" style={{ alignItems: "center" }}>
          {sharedWithMe.length > 0 && (
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <Icon name="eye" size={16} className="muted" />
              <select className="select" value={owner} onChange={(e) => setOwner(e.target.value)} style={{ minWidth: 160 }}>
                <option value="">Espace : Moi</option>
                {sharedWithMe.map((p) => (
                  <option key={p.user.id} value={p.user.id}>
                    Espace : {p.user.display_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {canEdit && !needsSetup && (
            <button className="btn btn-primary" onClick={() => setQuickAdd(true)}>
              <Icon name="plus" size={16} /> Ajouter
            </button>
          )}
        </div>
      </div>

      {needsSetup && <FinanceStarter />}

      {owner && !canEdit && (
        <p className="muted small row gap-2" style={{ marginBottom: "var(--space-3)" }}>
          <Icon name="lock" size={14} /> Lecture seule — {activePartner?.user.display_name} ne t'a pas accordé l'édition.
        </p>
      )}

      {/* Onglets — pilule horizontale scrollable */}
      <div
        className="row"
        style={{
          gap: "var(--space-2)",
          overflowX: "auto",
          paddingBottom: "var(--space-2)",
          marginBottom: "var(--space-4)",
          flexWrap: "nowrap",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              className={active ? "btn btn-primary btn-sm" : "btn btn-soft btn-sm"}
              onClick={() => {
                setTab(t.key);
                setTxFilter(null); // nav manuelle = pas de filtre hérité
              }}
              style={{ flexShrink: 0, whiteSpace: "nowrap" }}
            >
              <Icon name={t.icon} size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <OverviewTab month={month} setMonth={setMonth} owner={owner} canEdit={canEdit} setTab={setTab} goToTx={goToTx} />
      )}
      {tab === "stats" && <StatsTab month={month} owner={owner} goToTx={goToTx} />}
      {tab === "transactions" && (
        <TransactionsTab
          month={month}
          owner={owner}
          canEdit={canEdit}
          initialCategory={txFilter?.category}
          initialType={txFilter?.type}
          initialMonth={txFilter?.month}
        />
      )}
      {tab === "accounts" && <AccountsTab canEdit={canEdit} />}
      {tab === "budgets" && <BudgetsTab canEdit={canEdit} owner={owner} />}
      {tab === "goals" && <GoalsTab canEdit={canEdit} owner={owner} />}
      {tab === "recurring" && <RecurringTab canEdit={canEdit} owner={owner} />}
      {tab === "partners" && <PartnersTab partners={partners} loading={partnersQ.isLoading} />}

      {quickAdd && (
        <TxModal
          tx={null}
          initial={txPrefill ?? undefined}
          accounts={accounts}
          categories={categories}
          owner={owner}
          onClose={() => {
            setQuickAdd(false);
            setTxPrefill(null);
          }}
        />
      )}
    </div>
  );
}

/* Carte de démarrage : crée en 1 clic un compte + des catégories courantes. */
function FinanceStarter() {
  const qc = useQueryClient();
  const toast = useToast();
  const seed = useMutation({
    mutationFn: () => api.seedFinanceDefaults(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["finance"] });
      toast.push(`Prêt ! ${r.created.categories} catégories créées`);
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  return (
    <div className="card" style={{ marginBottom: "var(--space-4)", background: "color-mix(in srgb, var(--accent) 8%, var(--surface))" }}>
      <div className="row gap-3 wrap" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div className="row gap-3" style={{ alignItems: "center", minWidth: 0 }}>
          <span style={{ flexShrink: 0 }}><Icon name="sparkle" size={22} style={{ color: "var(--accent-ink)" }} /></span>
          <div style={{ minWidth: 0 }}>
            <strong style={{ display: "block" }}>Démarre ton budget en un clic</strong>
            <span className="muted small">
              On crée un compte courant et des catégories courantes (courses, logement, transport…). Tu pourras tout
              renommer ensuite.
            </span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => seed.mutate()} disabled={seed.isPending}>
          <Icon name="rocket" size={16} /> {seed.isPending ? "Configuration…" : "Configurer mon budget"}
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1. ACCUEIL — tableau de bord cliquable (chaque bloc mène à son onglet)
 * ──────────────────────────────────────────────────────────────────────────── */
function OverviewTab({
  month,
  setMonth,
  owner,
  canEdit,
  setTab,
  goToTx,
}: {
  month: string;
  setMonth: (m: string) => void;
  owner: string;
  canEdit: boolean;
  setTab: (t: TabKey) => void;
  goToTx: (f: TxFilter) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [contribGoal, setContribGoal] = useState<FinanceGoal | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["finance", "overview", month, owner],
    queryFn: () => api.financeOverview(month, owner || undefined),
  });
  const ov: FinanceOverview | undefined = data?.overview;
  const cur = ov?.currency || "EUR";

  const runRec = useMutation({
    mutationFn: (id: string) => api.runRecurring(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance"] });
      toast.push("Pointé ");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  if (isLoading) return <Spinner />;
  if (!ov) return <div className="card"><EmptyState icon="wallet" title="Données indisponibles" /></div>;

  const expenseDelta = (ov.month_expense ?? 0) - (ov.prev_month_expense ?? 0);
  const maxCat = Math.max(1, ...(ov.by_category ?? []).map((c) => c.amount));
  const totalCat = (ov.by_category ?? []).reduce((s, c) => s + c.amount, 0) || 1;
  const budgetPct = ov.budget_total > 0 ? (ov.budget_spent / ov.budget_total) * 100 : 0;

  return (
    <div className="col" style={{ gap: "var(--space-5)" }}>
      {/* Sélecteur de mois */}
      <div className="row" style={{ justifyContent: "center", gap: "var(--space-3)" }}>
        <button className="btn btn-icon btn-soft" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mois précédent">
          <Icon name="arrowLeft" size={18} />
        </button>
        <span style={{ fontWeight: 700, minWidth: 150, textAlign: "center", textTransform: "capitalize" }}>
          {monthLabel(month)}
        </span>
        <button className="btn btn-icon btn-soft" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mois suivant">
          <Icon name="arrowRight" size={18} />
        </button>
      </div>

      {/* Hero patrimoine — clic → onglet Comptes */}
      <div
        className="card fin-click"
        style={{ background: "color-mix(in srgb, var(--accent) 8%, var(--surface))" }}
        role="button"
        tabIndex={0}
        onClick={() => setTab("accounts")}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setTab("accounts")}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <p className="eyebrow" style={{ marginBottom: 4 }}>Patrimoine net</p>
          <span className="small muted row gap-1" style={{ flexShrink: 0 }}>Comptes <Icon name="arrowRight" size={13} /></span>
        </div>
        <div style={{ fontSize: "2.2rem", fontWeight: 800, lineHeight: 1.1 }}>{money(ov.net_worth, cur)}</div>
        <div className="row wrap gap-2" style={{ marginTop: "var(--space-3)" }}>
          {(ov.accounts ?? []).map((a) => (
            <span key={a.id} className="chip" style={{ gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: colorVar(a.color), display: "inline-block" }} />
              {a.name} · <strong>{money(a.balance, a.currency || cur)}</strong>
            </span>
          ))}
          {(ov.accounts ?? []).length === 0 && <span className="muted small">Aucun compte — touche pour en ajouter.</span>}
        </div>
      </div>

      {/* Stat revenus / dépenses — clic → Transactions filtrées */}
      <div className="grid-cards">
        <div
          className="card card-pad-sm fin-click"
          role="button"
          tabIndex={0}
          onClick={() => goToTx({ type: "income" })}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && goToTx({ type: "income" })}
        >
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted small">Revenus du mois</span>
            <Icon name="arrowLeft" size={16} style={{ color: "var(--sage-ink, #4a5e3f)" }} />
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--sage-ink, #4a5e3f)" }}>
            {money(ov.month_income, cur)}
          </div>
        </div>
        <div
          className="card card-pad-sm fin-click"
          role="button"
          tabIndex={0}
          onClick={() => goToTx({ type: "expense" })}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && goToTx({ type: "expense" })}
        >
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted small">Dépenses du mois</span>
            <Icon name="arrowRight" size={16} style={{ color: "var(--danger)" }} />
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--danger)" }}>{money(ov.month_expense, cur)}</div>
          {ov.prev_month_expense > 0 && (
            <p className="muted small" style={{ marginTop: 2 }}>
              <Icon name={expenseDelta > 0 ? "trend" : "check"} size={13} style={{ verticalAlign: "-2px" }} />{" "}
              {expenseDelta >= 0 ? "+" : ""}
              {money(expenseDelta, cur)} vs mois dernier
            </p>
          )}
        </div>
      </div>

      {/* Budgets — clic sur une ligne → dépenses de la catégorie */}
      <section>
        <div className="panel-head row" style={{ justifyContent: "space-between" }}>
          <h2><Icon name="target" size={18} style={{ verticalAlign: "-3px" }} /> Budgets</h2>
          <button className="btn btn-soft btn-sm" onClick={() => setTab("budgets")}>Gérer ›</button>
        </div>
        <div className="card card-pad-sm">
          {(ov.budgets ?? []).length === 0 ? (
            <p className="muted small">
              <Icon name="lightbulb" size={14} style={{ verticalAlign: "-2px" }} /> Définis un budget mensuel par catégorie
              (onglet Budgets) pour suivre tes plafonds.
            </p>
          ) : (
            <div className="col" style={{ gap: "var(--space-2)" }}>
              {(ov.budgets ?? []).map((b) => {
                const pct = b.budget > 0 ? (b.spent / b.budget) * 100 : 0;
                const over = b.spent > b.budget;
                return (
                  <div
                    key={b.category.id}
                    className="fin-click"
                    role="button"
                    tabIndex={0}
                    style={{ padding: "4px 6px", margin: "0 -6px", borderRadius: 10 }}
                    onClick={() => goToTx({ category: b.category.id, type: "expense" })}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && goToTx({ category: b.category.id, type: "expense" })}
                  >
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                      <span className="row gap-2" style={{ minWidth: 0 }}>
                        <CatDot color={b.category.color} icon={b.category.icon} size={22} />
                        <span style={{ fontWeight: 600 }}>{b.category.name}</span>
                      </span>
                      <span className="small" style={{ color: over ? "var(--danger)" : "var(--muted)", fontWeight: 600 }}>
                        {money(b.spent, cur)} / {money(b.budget, cur)}
                      </span>
                    </div>
                    <ProgressBar pct={pct} color={colorVar(b.category.color)} over={over} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {ov.budget_total > 0 && <ProgressBar pct={budgetPct} over={ov.budget_spent > ov.budget_total} />}
      </section>

      {/* Dépenses par catégorie — clic → dépenses de la catégorie */}
      <section>
        <div className="panel-head row" style={{ justifyContent: "space-between" }}>
          <h2><Icon name="chart" size={18} style={{ verticalAlign: "-3px" }} /> Dépenses par catégorie</h2>
          <button className="btn btn-soft btn-sm" onClick={() => setTab("stats")}>Statistiques ›</button>
        </div>
        <div className="card card-pad-sm">
          {(ov.by_category ?? []).length === 0 ? (
            <EmptyState icon="chart" title="Aucune dépense ce mois-ci" hint="Les dépenses apparaîtront ici, réparties par catégorie." />
          ) : (
            <div className="col" style={{ gap: "var(--space-2)" }}>
              {(ov.by_category ?? []).map((c) => {
                const go = () => goToTx(c.category_id ? { category: c.category_id, type: "expense" } : { type: "expense" });
                return (
                  <div
                    key={c.category_id ?? c.name}
                    className="fin-click"
                    role="button"
                    tabIndex={0}
                    style={{ padding: "4px 6px", margin: "0 -6px", borderRadius: 10 }}
                    onClick={go}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go()}
                  >
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                      <span className="row gap-2" style={{ minWidth: 0 }}>
                        <CatDot color={c.color} icon={c.icon} size={22} />
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                      </span>
                      <span className="small muted">
                        <strong style={{ color: "var(--ink)" }}>{money(c.amount, cur)}</strong> ·{" "}
                        {Math.round((c.amount / totalCat) * 100)}%
                      </span>
                    </div>
                    <ProgressBar pct={(c.amount / maxCat) * 100} color={colorVar(c.color)} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Objectifs d'épargne */}
      <section>
        <div className="panel-head row" style={{ justifyContent: "space-between" }}>
          <h2><Icon name="piggybank" size={18} style={{ verticalAlign: "-3px" }} /> Objectifs d'épargne</h2>
          <button className="btn btn-soft btn-sm" onClick={() => setTab("goals")}>Gérer ›</button>
        </div>
        {(ov.goals ?? []).length === 0 ? (
          <div className="card"><EmptyState icon="piggybank" title="Aucun objectif" hint="Crée un objectif (onglet Objectifs) pour épargner vers un but." /></div>
        ) : (
          <div className="grid-cards">
            {(ov.goals ?? []).map((g) => {
              const pct = g.target_amount > 0 ? (g.saved_amount / g.target_amount) * 100 : 0;
              return (
                <div key={g.id} className="card card-pad-sm col" style={{ gap: "var(--space-2)" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="row gap-2"><CatDot color={g.color} icon={g.icon || "target"} size={26} /><strong>{g.name}</strong></span>
                    {canEdit && (
                      <button className="btn btn-icon btn-soft btn-sm" onClick={() => setContribGoal(g)} aria-label="Contribuer">
                        <Icon name="plus" size={15} />
                      </button>
                    )}
                  </div>
                  <ProgressBar pct={pct} color={colorVar(g.color)} />
                  <p className="small muted">
                    {money(g.saved_amount, cur)} / {money(g.target_amount, cur)} · {Math.round(pct)}%
                    {g.target_date ? ` · ${fmtDate(g.target_date)}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* À venir (récurrents) */}
      {(ov.upcoming ?? []).length > 0 && (
        <section>
          <div className="panel-head row" style={{ justifyContent: "space-between" }}>
            <h2><Icon name="clock" size={18} style={{ verticalAlign: "-3px" }} /> À venir</h2>
            <button className="btn btn-soft btn-sm" onClick={() => setTab("recurring")}>Gérer ›</button>
          </div>
          <div className="card card-pad-sm">
            {(ov.upcoming ?? []).map((r) => (
              <div key={r.id} className="li-row" style={{ alignItems: "center" }}>
                <Icon name="repeat" size={16} className="muted" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{r.label}</div>
                  <p className="muted small">{fmtDayMonth(r.next_date)} · {CADENCE_LABEL[r.cadence]}</p>
                </div>
                <span style={{ fontWeight: 700, color: TYPE_META[r.type].color }}>
                  {TYPE_META[r.type].sign}
                  {money(r.amount, cur)}
                </span>
                {canEdit && (
                  <button className="btn btn-soft btn-sm" onClick={() => runRec.mutate(r.id)} disabled={runRec.isPending}>
                    <Icon name="check" size={14} /> Pointer
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Transactions récentes — clic → onglet Transactions */}
      <section>
        <div className="panel-head row" style={{ justifyContent: "space-between" }}>
          <h2><Icon name="lists" size={18} style={{ verticalAlign: "-3px" }} /> Dernières transactions</h2>
          <button className="btn btn-soft btn-sm" onClick={() => setTab("transactions")}>Voir tout ›</button>
        </div>
        <div className="card card-pad-sm">
          {(ov.recent ?? []).length === 0 ? (
            <p className="muted small">Aucune transaction récente.</p>
          ) : (
            (ov.recent ?? []).map((t) => {
              const acc = ov.accounts.find((a) => a.id === t.account_id);
              const meta = TYPE_META[t.type];
              return (
                <div
                  key={t.id}
                  className="li-row fin-click"
                  style={{ alignItems: "center" }}
                  role="button"
                  tabIndex={0}
                  onClick={() => setTab("transactions")}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setTab("transactions")}
                >
                  <Icon name={meta.icon} size={16} style={{ color: meta.color }} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.payee || meta.label}
                    </div>
                    <p className="muted small">{fmtDate(t.date)}{acc ? ` · ${acc.name}` : ""}</p>
                  </div>
                  <span style={{ fontWeight: 700, color: meta.color }}>
                    {meta.sign}
                    {money(t.amount, acc?.currency || cur)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      {contribGoal && (
        <ContributeModal goal={contribGoal} cur={cur} onClose={() => setContribGoal(null)} />
      )}
    </div>
  );
}

function ContributeModal({ goal, cur, onClose }: { goal: FinanceGoal; cur: string; onClose: () => void }) {
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

/* ────────────────────────────────────────────────────────────────────────────
 * 1bis. STATISTIQUES — suivi visuel des dépenses sur plusieurs mois
 * ──────────────────────────────────────────────────────────────────────────── */
function StatsTab({ month, owner, goToTx }: { month: string; owner: string; goToTx: (f: TxFilter) => void }) {
  const [months, setMonths] = useState(6);
  const { data, isLoading } = useQuery({
    queryKey: ["finance", "stats", month, months, owner],
    queryFn: () => api.financeStats({ month, months, owner: owner || undefined }),
  });
  const stats = data?.stats;
  const cur = stats?.currency || "EUR";

  if (isLoading) return <Spinner />;
  if (!stats) return <div className="card"><EmptyState icon="chart" title="Données indisponibles" /></div>;

  const hasData = stats.total_expense > 0 || stats.total_income > 0;
  const maxBar = Math.max(1, ...stats.months.flatMap((p) => [p.income, p.expense]));
  const maxCat = Math.max(1, ...stats.by_category.map((c) => c.amount));
  const totalCat = stats.by_category.reduce((s, c) => s + c.amount, 0) || 1;
  const net = stats.total_income - stats.total_expense;
  const H = 120; // hauteur max des barres

  return (
    <div className="col" style={{ gap: "var(--space-5)" }}>
      {/* Période */}
      <div className="row gap-2" style={{ justifyContent: "center" }}>
        {[3, 6, 12].map((n) => (
          <button
            key={n}
            className={months === n ? "btn btn-primary btn-sm" : "btn btn-soft btn-sm"}
            onClick={() => setMonths(n)}
          >
            {n} mois
          </button>
        ))}
      </div>

      {/* Synthèse sur la période */}
      <div className="grid-cards">
        <div className="card card-pad-sm">
          <span className="muted small">Dépenses ({months} mois)</span>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--danger)" }}>{money(stats.total_expense, cur)}</div>
        </div>
        <div className="card card-pad-sm">
          <span className="muted small">Moyenne / mois</span>
          <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{money(stats.avg_expense, cur)}</div>
        </div>
        <div className="card card-pad-sm">
          <span className="muted small">Revenus ({months} mois)</span>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--sage-ink, #4a5e3f)" }}>{money(stats.total_income, cur)}</div>
        </div>
        <div className="card card-pad-sm">
          <span className="muted small">Solde net</span>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: net >= 0 ? "var(--sage-ink, #4a5e3f)" : "var(--danger)" }}>
            {net >= 0 ? "+" : ""}{money(net, cur)}
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="card">
          <EmptyState
            icon="chart"
            title="Pas encore de données"
            hint="Ajoute quelques opérations : tes tendances et la répartition par catégorie s'afficheront ici."
          />
        </div>
      ) : (
        <>
          {/* Tendance revenus / dépenses par mois */}
          <section>
            <div className="panel-head"><h2><Icon name="trend" size={18} style={{ verticalAlign: "-3px" }} /> Tendance mensuelle</h2></div>
            <div className="card card-pad-sm">
              <div className="row" style={{ alignItems: "flex-end", gap: 8, height: H + 24, overflowX: "auto" }}>
                {stats.months.map((p) => (
                  <div key={p.month} className="col" style={{ alignItems: "center", gap: 4, flex: 1, minWidth: 34 }}>
                    <div className="row" style={{ alignItems: "flex-end", gap: 3, height: H }}>
                      <span
                        title={`Revenus · ${money(p.income, cur)}`}
                        style={{ width: 11, height: Math.max(2, (p.income / maxBar) * H), background: "var(--ok)", borderRadius: "3px 3px 0 0" }}
                      />
                      <span
                        title={`Dépenses · ${money(p.expense, cur)}`}
                        style={{ width: 11, height: Math.max(2, (p.expense / maxBar) * H), background: "var(--danger)", borderRadius: "3px 3px 0 0" }}
                      />
                    </div>
                    <span className="muted" style={{ fontSize: "0.66rem", textTransform: "capitalize" }}>{monthShort(p.month)}</span>
                  </div>
                ))}
              </div>
              <div className="row gap-4" style={{ justifyContent: "center", marginTop: "var(--space-2)" }}>
                <span className="small muted row gap-1"><span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--ok)" }} /> Revenus</span>
                <span className="small muted row gap-1"><span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--danger)" }} /> Dépenses</span>
              </div>
            </div>
          </section>

          {/* Répartition par catégorie sur la période — clic → transactions filtrées */}
          <section>
            <div className="panel-head"><h2><Icon name="chart" size={18} style={{ verticalAlign: "-3px" }} /> Où part l'argent</h2></div>
            <div className="card card-pad-sm">
              {stats.by_category.length === 0 ? (
                <p className="muted small">Aucune dépense sur la période.</p>
              ) : (
                <div className="col" style={{ gap: "var(--space-2)" }}>
                  {stats.by_category.map((c) => {
                    // Depuis les Stats (multi-mois) → on ouvre toutes les opérations (month: "").
                    const go = () =>
                      goToTx(c.category_id ? { category: c.category_id, type: "expense", month: "" } : { type: "expense", month: "" });
                    return (
                      <div
                        key={c.category_id ?? c.name}
                        className="fin-click"
                        role="button"
                        tabIndex={0}
                        style={{ padding: "4px 6px", margin: "0 -6px", borderRadius: 10 }}
                        onClick={go}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go()}
                      >
                        <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                          <span className="row gap-2" style={{ minWidth: 0 }}>
                            <CatDot color={c.color} icon={c.icon} size={22} />
                            <span style={{ fontWeight: 600 }}>{c.name}</span>
                          </span>
                          <span className="small muted">
                            <strong style={{ color: "var(--ink)" }}>{money(c.amount, cur)}</strong> · {Math.round((c.amount / totalCat) * 100)}%
                          </span>
                        </div>
                        <ProgressBar pct={(c.amount / maxCat) * 100} color={colorVar(c.color)} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. TRANSACTIONS
 * ──────────────────────────────────────────────────────────────────────────── */
interface TxForm {
  type: TxType;
  amount: string;
  date: string;
  account_id: string;
  category_id: string;
  transfer_account_id: string;
  payee: string;
  note: string;
}
const emptyTxForm = (): TxForm => ({
  type: "expense",
  amount: "",
  date: todayISO(),
  account_id: "",
  category_id: "",
  transfer_account_id: "",
  payee: "",
  note: "",
});

function TransactionsTab({
  month,
  owner,
  canEdit,
  initialCategory,
  initialType,
  initialMonth,
}: {
  month: string;
  owner: string;
  canEdit: boolean;
  initialCategory?: string;
  initialType?: string;
  initialMonth?: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [fMonth, setFMonth] = useState(initialMonth ?? month);
  const [fAccount, setFAccount] = useState("");
  const [fCategory, setFCategory] = useState(initialCategory ?? "");
  const [fType, setFType] = useState(initialType ?? "");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FinanceTransaction | null>(null);

  const accountsQ = useQuery({ queryKey: ["finance", "accounts"], queryFn: () => api.financeAccounts() });
  const categoriesQ = useQuery({ queryKey: ["finance", "categories"], queryFn: () => api.financeCategories() });
  const accounts = accountsQ.data?.accounts ?? [];
  const categories = categoriesQ.data?.categories ?? [];

  const txQ = useQuery({
    queryKey: ["finance", "tx", fMonth, fAccount, fCategory, fType, q, owner],
    queryFn: () =>
      api.financeTransactions({
        month: fMonth || undefined,
        account: fAccount || undefined,
        category: fCategory || undefined,
        type: fType || undefined,
        q: q || undefined,
        owner: owner || undefined,
      }),
  });
  const txs = txQ.data?.transactions ?? [];

  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const grouped = useMemo(() => {
    const map = new Map<string, FinanceTransaction[]>();
    for (const t of txs) {
      const k = t.date;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [txs]);

  const del = useMutation({
    mutationFn: (id: string) => api.deleteTransaction(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance"] });
      toast.push("Transaction supprimée");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const askDelete = async (t: FinanceTransaction) => {
    if (await confirm("Supprimer cette transaction ?")) del.mutate(t.id);
  };

  return (
    <div>
      {/* Filtres */}
      <div className="card card-pad-sm" style={{ marginBottom: "var(--space-4)" }}>
        <div className="row wrap gap-2">
          <input type="month" className="input" value={fMonth} onChange={(e) => setFMonth(e.target.value)} style={{ width: 160 }} />
          <select className="select" value={fAccount} onChange={(e) => setFAccount(e.target.value)} style={{ minWidth: 130 }}>
            <option value="">Tous les comptes</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="select" value={fCategory} onChange={(e) => setFCategory(e.target.value)} style={{ minWidth: 130 }}>
            <option value="">Toutes catégories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="select" value={fType} onChange={(e) => setFType(e.target.value)} style={{ minWidth: 110 }}>
            <option value="">Tous types</option>
            <option value="expense">Dépenses</option>
            <option value="income">Revenus</option>
            <option value="transfer">Virements</option>
          </select>
          <div className="grow" style={{ minWidth: 140 }}>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" />
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} /> Ajouter
            </button>
          )}
        </div>
      </div>

      {txQ.isLoading ? (
        <Spinner />
      ) : grouped.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="lists"
            title="Aucune transaction"
            hint="Ajuste les filtres ou ajoute une nouvelle transaction."
            action={canEdit ? <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Ajouter</button> : undefined}
          />
        </div>
      ) : (
        <div className="col" style={{ gap: "var(--space-4)" }}>
          {grouped.map(([date, list]) => (
            <div key={date}>
              <p className="eyebrow" style={{ marginBottom: 6, textTransform: "capitalize" }}>{fmtDayMonth(date)}</p>
              <div className="card card-pad-sm">
                {list.map((t) => {
                  const acc = accById.get(t.account_id);
                  const cat = t.category_id ? catById.get(t.category_id) : undefined;
                  const meta = TYPE_META[t.type];
                  const transferAcc = t.transfer_account_id ? accById.get(t.transfer_account_id) : undefined;
                  return (
                    <div key={t.id} className="li-row" style={{ alignItems: "center" }}>
                      <CatDot color={cat?.color || (t.type === "income" ? "sage" : t.type === "transfer" ? "sky" : "blush")} icon={cat?.icon || meta.icon} size={30} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.payee || cat?.name || meta.label}
                        </div>
                        <p className="muted small">
                          {acc?.name || "?"}
                          {t.type === "transfer" && transferAcc ? ` → ${transferAcc.name}` : ""}
                          {cat ? ` · ${cat.name}` : ""}
                        </p>
                      </div>
                      <span style={{ fontWeight: 700, color: meta.color, whiteSpace: "nowrap" }}>
                        {meta.sign}{money(t.amount, acc?.currency)}
                      </span>
                      {canEdit && (
                        <>
                          <button className="btn btn-icon btn-soft btn-sm" onClick={() => setEditing(t)} aria-label="Modifier">
                            <Icon name="edit" size={15} />
                          </button>
                          <button className="btn btn-icon btn-danger btn-sm" onClick={() => askDelete(t)} aria-label="Supprimer">
                            <Icon name="trash" size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {(adding || editing) && (
        <TxModal
          tx={editing}
          accounts={accounts}
          categories={categories}
          owner={owner}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
      {confirmNode}
    </div>
  );
}

function TxModal({
  tx,
  initial,
  accounts,
  categories,
  owner,
  onClose,
}: {
  tx: FinanceTransaction | null;
  initial?: Partial<TxForm>;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  owner: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<TxForm>(() =>
    tx
      ? {
          type: tx.type,
          amount: String(tx.amount),
          date: tx.date,
          account_id: tx.account_id,
          category_id: tx.category_id ?? "",
          transfer_account_id: tx.transfer_account_id ?? "",
          payee: tx.payee ?? "",
          note: tx.note ?? "",
        }
      : { ...emptyTxForm(), account_id: accounts[0]?.id ?? "", ...initial },
  );

  // Dès qu'un compte existe (ex. après le démarrage guidé), on le présélectionne.
  useEffect(() => {
    if (tx) return;
    setForm((f) => (f.account_id || !accounts[0] ? f : { ...f, account_id: accounts[0].id }));
  }, [accounts, tx]);

  const catsForType = categories.filter((c) => (form.type === "income" ? c.kind === "income" : c.kind === "expense"));
  const noAccounts = !tx && accounts.length === 0;

  // Démarrage guidé directement dans la modale si rien n'est encore configuré.
  const seed = useMutation({
    mutationFn: () => api.seedFinanceDefaults(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance"] });
      toast.push("Budget configuré");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const save = useMutation({
    mutationFn: async (b: Partial<FinanceTransaction> & { owner?: string }) => {
      if (tx) await api.updateTransaction(tx.id, b);
      else await api.createTransaction({ ...b, owner: owner || undefined });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance"] });
      toast.push(tx ? "Transaction modifiée" : "Transaction ajoutée");
      onClose();
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.push("Indique un montant", true);
    if (!form.account_id) return toast.push("Choisis un compte", true);
    if (form.type === "transfer" && !form.transfer_account_id) return toast.push("Choisis le compte de destination", true);
    save.mutate({
      type: form.type,
      amount,
      date: form.date || todayISO(),
      account_id: form.account_id,
      category_id: form.type === "transfer" ? null : form.category_id || null,
      transfer_account_id: form.type === "transfer" ? form.transfer_account_id : null,
      payee: form.payee.trim() || null,
      note: form.note.trim() || null,
    });
  };

  // Premier lancement : rien à remplir tant qu'il n'y a pas de compte.
  if (noAccounts) {
    return (
      <Modal
        title="Nouvelle opération"
        onClose={onClose}
        footer={<button className="btn btn-soft" onClick={onClose}>Fermer</button>}
      >
        <div className="center col gap-3" style={{ padding: "var(--space-3) 0" }}>
          <Icon name="wallet" size={34} strokeWidth={1.5} style={{ color: "var(--accent-ink)" }} />
          <p className="muted" style={{ margin: 0 }}>
            Avant ta première opération, créons ton compte et quelques catégories courantes — ça prend une seconde.
          </p>
          <button className="btn btn-primary" onClick={() => seed.mutate()} disabled={seed.isPending}>
            <Icon name="rocket" size={16} /> {seed.isPending ? "Configuration…" : "Configurer mon budget"}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={tx ? "Modifier l'opération" : "Nouvelle opération"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-soft" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Enregistrement…" : tx ? "Enregistrer" : "Ajouter"}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        {/* 1. Type d'opération */}
        <div className="row gap-2" style={{ marginBottom: "var(--space-4)" }}>
          {(["expense", "income", "transfer"] as TxType[]).map((tt) => (
            <button
              key={tt}
              type="button"
              className={form.type === tt ? "btn btn-primary btn-sm" : "btn btn-soft btn-sm"}
              onClick={() => setForm({ ...form, type: tt, category_id: "" })}
              style={{ flex: 1 }}
            >
              <Icon name={TYPE_META[tt].icon} size={14} /> {TYPE_META[tt].label}
            </button>
          ))}
        </div>

        {/* 2. Montant (mis en avant) */}
        <Field label="Montant">
          <div className="row gap-2" style={{ alignItems: "stretch" }}>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
              autoFocus
              style={{ fontSize: "1.5rem", fontWeight: 700, flex: 1, textAlign: "right" }}
            />
            <input
              className="input"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              style={{ width: 160 }}
            />
          </div>
        </Field>

        {/* 3. Catégorie en pastilles (rapide) — sauf virement */}
        {form.type === "transfer" ? (
          <div className="row gap-3 wrap">
            <div className="grow">
              <Field label="Depuis le compte">
                <select className="select" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grow">
              <Field label="Vers le compte">
                <select className="select" value={form.transfer_account_id} onChange={(e) => setForm({ ...form, transfer_account_id: e.target.value })}>
                  <option value="">—</option>
                  {accounts.filter((a) => a.id !== form.account_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
            </div>
          </div>
        ) : (
          <Field label="Catégorie">
            <div className="row wrap gap-2">
              {catsForType.map((c) => {
                const sel = form.category_id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={sel ? "btn btn-primary btn-sm" : "btn btn-soft btn-sm"}
                    onClick={() => setForm({ ...form, category_id: sel ? "" : c.id })}
                  >
                    <Icon name={(c.icon as IconName) || "tag"} size={14} /> {c.name}
                  </button>
                );
              })}
              {catsForType.length === 0 && (
                <span className="muted small">Aucune catégorie — ajoute-en dans l'onglet Budgets.</span>
              )}
            </div>
          </Field>
        )}

        {/* 4. Compte (caché si un seul) + libellé + note */}
        {form.type !== "transfer" && accounts.length > 1 && (
          <Field label="Compte">
            <select className="select" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        )}

        <Field label="Libellé (facultatif)">
          <input className="input" value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} placeholder="Supermarché, salaire…" />
        </Field>
        <Field label="Note (facultatif)">
          <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Détail…" />
        </Field>
      </form>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. COMPTES
 * ──────────────────────────────────────────────────────────────────────────── */
function AccountsTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [editing, setEditing] = useState<FinanceAccount | null>(null);
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["finance", "accounts"], queryFn: () => api.financeAccounts() });
  const accounts = data?.accounts ?? [];

  const del = useMutation({
    mutationFn: (id: string) => api.deleteAccount(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Compte supprimé"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const askDelete = async (a: FinanceAccount) => {
    if (await confirm(`Supprimer le compte « ${a.name} » et ses transactions ?`)) del.mutate(a.id);
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      {canEdit && (
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouveau compte</button>
        </div>
      )}
      {accounts.length === 0 ? (
        <div className="card">
          <EmptyState icon="wallet" title="Aucun compte" hint="Ajoute tes comptes (courant, épargne, espèces…) pour suivre ton solde."
            action={canEdit ? <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouveau compte</button> : undefined} />
        </div>
      ) : (
        <div className="grid-cards">
          {accounts.map((a) => (
            <div key={a.id} className="card card-pad-sm col" style={{ gap: "var(--space-2)", borderTop: `3px solid ${colorVar(a.color)}` }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="row gap-2"><CatDot color={a.color} icon={a.icon || ACCOUNT_KIND_ICON[a.kind]} size={30} /><strong>{a.name}</strong></span>
                <span className="chip small">{ACCOUNT_KIND_LABEL[a.kind] ?? a.kind}</span>
              </div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{money(a.balance, a.currency)}</div>
              {canEdit && (
                <div className="row gap-2" style={{ marginTop: "auto" }}>
                  <button className="btn btn-soft btn-sm" onClick={() => setEditing(a)}><Icon name="edit" size={14} /> Modifier</button>
                  <span className="spacer" />
                  <button className="btn btn-icon btn-danger btn-sm" onClick={() => askDelete(a)} aria-label="Supprimer"><Icon name="trash" size={15} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(adding || editing) && <AccountModal account={editing} onClose={() => { setAdding(false); setEditing(null); }} />}
      {confirmNode}
    </div>
  );
}

function AccountModal({ account, onClose }: { account: FinanceAccount | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    name: account?.name ?? "",
    kind: (account?.kind ?? "checking") as AccountKind,
    start_balance: account ? String(account.start_balance) : "",
    currency: account?.currency ?? "EUR",
    color: account?.color || "sky",
    icon: account?.icon ?? "",
  });

  const save = useMutation({
    mutationFn: async (b: Partial<FinanceAccount>) => {
      if (account) await api.updateAccount(account.id, b);
      else await api.createAccount(b);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push(account ? "Compte modifié" : "Compte créé"); onClose(); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.push("Le nom est requis", true);
    save.mutate({
      name: form.name.trim(),
      kind: form.kind,
      start_balance: Number(form.start_balance) || 0,
      currency: form.currency.trim() || "EUR",
      color: form.color,
      icon: form.icon.trim() || ACCOUNT_KIND_ICON[form.kind],
    });
  };

  return (
    <Modal
      title={account ? "Modifier le compte" : "Nouveau compte"}
      onClose={onClose}
      footer={<>
        <button className="btn btn-soft" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending ? "…" : account ? "Enregistrer" : "Créer"}</button>
      </>}
    >
      <form onSubmit={submit}>
        <Field label="Nom"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Compte courant" autoFocus /></Field>
        <div className="row gap-3 wrap">
          <div className="grow">
            <Field label="Type">
              <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AccountKind })}>
                {ACCOUNT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ width: 100 }}><Field label="Devise"><input className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></Field></div>
        </div>
        <Field label="Solde de départ">
          <input className="input" type="number" step="0.01" value={form.start_balance} onChange={(e) => setForm({ ...form, start_balance: e.target.value })} placeholder="0.00" />
        </Field>
        <Field label="Couleur"><SwatchRow value={form.color} onChange={(c) => setForm({ ...form, color: c })} /></Field>
      </form>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. BUDGETS (catégories)
 * ──────────────────────────────────────────────────────────────────────────── */
function BudgetsTab({ canEdit, owner }: { canEdit: boolean; owner: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({ queryKey: ["finance", "categories"], queryFn: () => api.financeCategories() });
  const categories = data?.categories ?? [];
  const expenseCats = categories.filter((c) => c.kind === "expense");
  const incomeCats = categories.filter((c) => c.kind === "income");

  const save = useMutation({
    mutationFn: ({ id, budget }: { id: string; budget: number | null }) => api.updateCategory(id, { monthly_budget: budget }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Budget mis à jour"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteCategory(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Catégorie supprimée"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const commit = (c: FinanceCategory) => {
    const raw = drafts[c.id];
    if (raw === undefined) return;
    const n = raw.trim() === "" ? null : Number(raw);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return toast.push("Montant invalide", true);
    save.mutate({ id: c.id, budget: n });
  };
  const askDelete = async (c: FinanceCategory) => {
    if (await confirm(`Supprimer la catégorie « ${c.name} » ?`)) del.mutate(c.id);
  };

  if (isLoading) return <Spinner />;

  const renderCat = (c: FinanceCategory) => (
    <div key={c.id} className="li-row" style={{ alignItems: "center" }}>
      <CatDot color={c.color} icon={c.icon} size={30} />
      <span className="grow" style={{ fontWeight: 600, minWidth: 0 }}>{c.name}</span>
      {c.kind === "expense" && canEdit ? (
        <input
          className="input"
          style={{ width: 120 }}
          type="number"
          min="0"
          step="0.01"
          placeholder="Pas de budget"
          value={drafts[c.id] ?? (c.monthly_budget ?? "")}
          onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })}
          onBlur={() => commit(c)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      ) : c.kind === "expense" ? (
        <span className="chip small">{c.monthly_budget ? money(c.monthly_budget) : "Aucun budget"}</span>
      ) : (
        <span className="chip small">Revenu</span>
      )}
      {canEdit && (
        <button className="btn btn-icon btn-danger btn-sm" onClick={() => askDelete(c)} aria-label="Supprimer"><Icon name="trash" size={15} /></button>
      )}
    </div>
  );

  return (
    <div>
      {canEdit && (
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouvelle catégorie</button>
        </div>
      )}
      {categories.length === 0 ? (
        <div className="card">
          <EmptyState icon="target" title="Aucune catégorie" hint="Crée des catégories de dépenses et fixe-leur un budget mensuel."
            action={canEdit ? <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouvelle catégorie</button> : undefined} />
        </div>
      ) : (
        <div className="col" style={{ gap: "var(--space-4)" }}>
          <div>
            <div className="panel-head"><h2><Icon name="tag" size={18} style={{ verticalAlign: "-3px" }} /> Dépenses</h2></div>
            <div className="card card-pad-sm">
              {expenseCats.length === 0 ? <p className="muted small">Aucune catégorie de dépense.</p> : expenseCats.map(renderCat)}
            </div>
          </div>
          {incomeCats.length > 0 && (
            <div>
              <div className="panel-head"><h2><Icon name="coins" size={18} style={{ verticalAlign: "-3px" }} /> Revenus</h2></div>
              <div className="card card-pad-sm">{incomeCats.map(renderCat)}</div>
            </div>
          )}
        </div>
      )}

      {adding && <CategoryModal owner={owner} onClose={() => setAdding(false)} />}
      {confirmNode}
    </div>
  );
}

function CategoryModal({ owner: _owner, onClose }: { owner: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", kind: "expense" as CategoryKind, color: "blush", monthly_budget: "", icon: "tag" });

  const save = useMutation({
    mutationFn: (b: Partial<FinanceCategory>) => api.createCategory(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Catégorie créée "); onClose(); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.push("Le nom est requis", true);
    save.mutate({
      name: form.name.trim(),
      kind: form.kind,
      color: form.color,
      icon: form.icon || "tag",
      monthly_budget: form.kind === "expense" && form.monthly_budget.trim() !== "" ? Number(form.monthly_budget) : null,
    });
  };
  return (
    <Modal
      title="Nouvelle catégorie"
      onClose={onClose}
      footer={<>
        <button className="btn btn-soft" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending ? "…" : "Créer"}</button>
      </>}
    >
      <form onSubmit={submit}>
        <Field label="Nom"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Courses, Loisirs…" autoFocus /></Field>
        <Field label="Type">
          <div className="row gap-2">
            {(["expense", "income"] as CategoryKind[]).map((k) => (
              <button key={k} type="button" className={form.kind === k ? "btn btn-primary btn-sm" : "btn btn-soft btn-sm"} onClick={() => setForm({ ...form, kind: k })} style={{ flex: 1 }}>
                {k === "expense" ? "Dépense" : "Revenu"}
              </button>
            ))}
          </div>
        </Field>
        {form.kind === "expense" && (
          <Field label="Budget mensuel (facultatif)">
            <input className="input" type="number" min="0" step="0.01" value={form.monthly_budget} onChange={(e) => setForm({ ...form, monthly_budget: e.target.value })} placeholder="0.00" />
          </Field>
        )}
        <Field label="Couleur"><SwatchRow value={form.color} onChange={(c) => setForm({ ...form, color: c })} /></Field>
      </form>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5. OBJECTIFS
 * ──────────────────────────────────────────────────────────────────────────── */
function GoalsTab({ canEdit, owner }: { canEdit: boolean; owner: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FinanceGoal | null>(null);
  const [contrib, setContrib] = useState<FinanceGoal | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["finance", "goals"], queryFn: () => api.financeGoals() });
  const goals = data?.goals ?? [];

  const del = useMutation({
    mutationFn: (id: string) => api.deleteGoal(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Objectif supprimé"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const askDelete = async (g: FinanceGoal) => {
    if (await confirm(`Supprimer l'objectif « ${g.name} » ?`)) del.mutate(g.id);
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      {canEdit && (
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouvel objectif</button>
        </div>
      )}
      {goals.length === 0 ? (
        <div className="card">
          <EmptyState icon="piggybank" title="Aucun objectif" hint="Définis un objectif d'épargne (vacances, achat…) et suis ta progression."
            action={canEdit ? <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouvel objectif</button> : undefined} />
        </div>
      ) : (
        <div className="grid-cards">
          {goals.map((g) => {
            const pct = g.target_amount > 0 ? (g.saved_amount / g.target_amount) * 100 : 0;
            return (
              <div key={g.id} className="card card-pad-sm col" style={{ gap: "var(--space-2)" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="row gap-2"><CatDot color={g.color} icon={g.icon || "target"} size={30} /><strong>{g.name}</strong></span>
                  {pct >= 100 && <Icon name="trophy" size={18} style={{ color: "var(--accent)" }} />}
                </div>
                <ProgressBar pct={pct} color={colorVar(g.color)} />
                <p className="small muted">
                  {money(g.saved_amount)} / {money(g.target_amount)} · {Math.round(pct)}%
                  {g.target_date ? ` · échéance ${fmtDate(g.target_date)}` : ""}
                </p>
                {canEdit && (
                  <div className="row gap-2" style={{ marginTop: "auto" }}>
                    <button className="btn btn-soft btn-sm" onClick={() => setContrib(g)}><Icon name="plus" size={14} /> Contribuer</button>
                    <button className="btn btn-icon btn-soft btn-sm" onClick={() => setEditing(g)} aria-label="Modifier"><Icon name="edit" size={14} /></button>
                    <span className="spacer" />
                    <button className="btn btn-icon btn-danger btn-sm" onClick={() => askDelete(g)} aria-label="Supprimer"><Icon name="trash" size={15} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(adding || editing) && <GoalModal goal={editing} owner={owner} onClose={() => { setAdding(false); setEditing(null); }} />}
      {contrib && <ContributeModal goal={contrib} cur="EUR" onClose={() => setContrib(null)} />}
      {confirmNode}
    </div>
  );
}

function GoalModal({ goal, owner: _owner, onClose }: { goal: FinanceGoal | null; owner: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    name: goal?.name ?? "",
    target_amount: goal ? String(goal.target_amount) : "",
    target_date: goal?.target_date ?? "",
    color: goal?.color || "lilac",
    icon: goal?.icon ?? "target",
  });

  const save = useMutation({
    mutationFn: async (b: Partial<FinanceGoal>) => {
      if (goal) await api.updateGoal(goal.id, b);
      else await api.createGoal(b);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push(goal ? "Objectif modifié" : "Objectif créé"); onClose(); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.push("Le nom est requis", true);
    const target = Number(form.target_amount);
    if (!Number.isFinite(target) || target <= 0) return toast.push("Montant cible invalide", true);
    save.mutate({
      name: form.name.trim(),
      target_amount: target,
      target_date: form.target_date || null,
      color: form.color,
      icon: form.icon || "target",
    });
  };
  return (
    <Modal
      title={goal ? "Modifier l'objectif" : "Nouvel objectif"}
      onClose={onClose}
      footer={<>
        <button className="btn btn-soft" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending ? "…" : goal ? "Enregistrer" : "Créer"}</button>
      </>}
    >
      <form onSubmit={submit}>
        <Field label="Nom"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Vacances, voiture…" autoFocus /></Field>
        <div className="row gap-3 wrap">
          <div style={{ width: 150 }}><Field label="Montant cible"><input className="input" type="number" min="0" step="0.01" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} placeholder="0.00" /></Field></div>
          <div className="grow"><Field label="Échéance (facultatif)"><input className="input" type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></Field></div>
        </div>
        <Field label="Couleur"><SwatchRow value={form.color} onChange={(c) => setForm({ ...form, color: c })} /></Field>
      </form>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 6. RÉCURRENT
 * ──────────────────────────────────────────────────────────────────────────── */
function RecurringTab({ canEdit, owner }: { canEdit: boolean; owner: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FinanceRecurring | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["finance", "recurring"], queryFn: () => api.financeRecurring() });
  const recurring = data?.recurring ?? [];
  const accountsQ = useQuery({ queryKey: ["finance", "accounts"], queryFn: () => api.financeAccounts() });
  const accounts = accountsQ.data?.accounts ?? [];
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const del = useMutation({
    mutationFn: (id: string) => api.deleteRecurring(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Récurrence supprimée"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.updateRecurring(id, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const run = useMutation({
    mutationFn: (id: string) => api.runRecurring(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Pointé  — prochaine échéance reportée"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const askDelete = async (r: FinanceRecurring) => {
    if (await confirm(`Supprimer « ${r.label} » ?`)) del.mutate(r.id);
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      {canEdit && (
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: "var(--space-3)" }}>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouvelle récurrence</button>
        </div>
      )}
      {recurring.length === 0 ? (
        <div className="card">
          <EmptyState icon="repeat" title="Aucune récurrence" hint="Ajoute tes revenus et charges réguliers (loyer, abonnements, salaire…)."
            action={canEdit ? <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Nouvelle récurrence</button> : undefined} />
        </div>
      ) : (
        <div className="card card-pad-sm">
          {recurring.map((r) => {
            const acc = accById.get(r.account_id);
            const meta = TYPE_META[r.type];
            return (
              <div key={r.id} className="li-row" style={{ alignItems: "center", opacity: r.active ? 1 : 0.55 }}>
                <Icon name="repeat" size={16} className="muted" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{r.label}</div>
                  <p className="muted small">
                    {CADENCE_LABEL[r.cadence]} · prochaine {fmtDate(r.next_date)}{acc ? ` · ${acc.name}` : ""}
                    {!r.active ? " · en pause" : ""}
                  </p>
                </div>
                <span style={{ fontWeight: 700, color: meta.color, whiteSpace: "nowrap" }}>{meta.sign}{money(r.amount, acc?.currency)}</span>
                {canEdit && (
                  <>
                    <button className="btn btn-soft btn-sm" onClick={() => run.mutate(r.id)} disabled={run.isPending} title="Créer la transaction et reporter">
                      <Icon name="check" size={14} /> Pointer
                    </button>
                    <button className="btn btn-icon btn-soft btn-sm" onClick={() => toggle.mutate({ id: r.id, active: !r.active })} aria-label={r.active ? "Mettre en pause" : "Activer"}>
                      <Icon name={r.active ? "eye" : "clock"} size={15} />
                    </button>
                    <button className="btn btn-icon btn-soft btn-sm" onClick={() => setEditing(r)} aria-label="Modifier"><Icon name="edit" size={15} /></button>
                    <button className="btn btn-icon btn-danger btn-sm" onClick={() => askDelete(r)} aria-label="Supprimer"><Icon name="trash" size={15} /></button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(adding || editing) && <RecurringModal rec={editing} accounts={accounts} owner={owner} onClose={() => { setAdding(false); setEditing(null); }} />}
      {confirmNode}
    </div>
  );
}

function RecurringModal({ rec, accounts, owner: _owner, onClose }: { rec: FinanceRecurring | null; accounts: FinanceAccount[]; owner: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const categoriesQ = useQuery({ queryKey: ["finance", "categories"], queryFn: () => api.financeCategories() });
  const categories = categoriesQ.data?.categories ?? [];
  const [form, setForm] = useState({
    label: rec?.label ?? "",
    type: (rec?.type ?? "expense") as TxType,
    amount: rec ? String(rec.amount) : "",
    account_id: rec?.account_id ?? accounts[0]?.id ?? "",
    category_id: rec?.category_id ?? "",
    cadence: (rec?.cadence ?? "monthly") as Cadence,
    next_date: rec?.next_date ?? todayISO(),
    active: rec?.active ?? true,
  });
  const catsForType = categories.filter((c) => (form.type === "income" ? c.kind === "income" : c.kind === "expense"));

  const save = useMutation({
    mutationFn: async (b: Partial<FinanceRecurring>) => {
      if (rec) await api.updateRecurring(rec.id, b);
      else await api.createRecurring(b);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push(rec ? "Récurrence modifiée" : "Récurrence créée"); onClose(); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label.trim()) return toast.push("Le libellé est requis", true);
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.push("Montant invalide", true);
    if (!form.account_id) return toast.push("Choisis un compte", true);
    save.mutate({
      label: form.label.trim(),
      type: form.type,
      amount,
      account_id: form.account_id,
      category_id: form.type === "transfer" ? null : form.category_id || null,
      cadence: form.cadence,
      next_date: form.next_date || todayISO(),
      active: form.active,
    });
  };
  return (
    <Modal
      title={rec ? "Modifier la récurrence" : "Nouvelle récurrence"}
      onClose={onClose}
      footer={<>
        <button className="btn btn-soft" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending ? "…" : rec ? "Enregistrer" : "Créer"}</button>
      </>}
    >
      <form onSubmit={submit}>
        <Field label="Libellé"><input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Loyer, salaire, Netflix…" autoFocus /></Field>
        <div className="row gap-2" style={{ marginBottom: "var(--space-3)" }}>
          {(["expense", "income", "transfer"] as TxType[]).map((tt) => (
            <button key={tt} type="button" className={form.type === tt ? "btn btn-primary btn-sm" : "btn btn-soft btn-sm"} onClick={() => setForm({ ...form, type: tt, category_id: "" })} style={{ flex: 1 }}>
              {TYPE_META[tt].label}
            </button>
          ))}
        </div>
        <div className="row gap-3 wrap">
          <div style={{ width: 140 }}><Field label="Montant"><input className="input" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></Field></div>
          <div className="grow">
            <Field label="Cadence">
              <select className="select" value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value as Cadence })}>
                {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => <option key={c} value={c}>{CADENCE_LABEL[c]}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <Field label="Compte">
          <select className="select" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
            <option value="">—</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        {form.type !== "transfer" && (
          <Field label="Catégorie">
            <select className="select" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Sans catégorie</option>
              {catsForType.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Prochaine échéance"><input className="input" type="date" value={form.next_date} onChange={(e) => setForm({ ...form, next_date: e.target.value })} /></Field>
        <label className="row gap-2" style={{ cursor: "pointer", marginTop: "var(--space-2)" }}>
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          <span>Active</span>
        </label>
      </form>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * 7. PARTAGE
 * ──────────────────────────────────────────────────────────────────────────── */
function PartnersTab({ partners, loading }: { partners: FinancePartner[]; loading: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [adding, setAdding] = useState(false);

  const sharedByMe = partners.filter((p) => p.direction === "shared_by_me");
  const sharedWithMe = partners.filter((p) => p.direction === "shared_with_me");

  const friendsQ = useQuery({ queryKey: ["friends"], queryFn: () => api.friends() });
  const friends = (friendsQ.data?.friends ?? []).filter((f) => f.status === "accepted");
  const alreadyShared = new Set(sharedByMe.map((p) => p.user.id));
  const candidates = friends.map((f) => f.user).filter((u) => !alreadyShared.has(u.id));

  const setPartner = useMutation({
    mutationFn: ({ id, can_edit }: { id: string; can_edit: boolean }) => api.addFinancePartner(id, can_edit),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Partage mis à jour"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.removeFinancePartner(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance"] }); toast.push("Partage retiré"); },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const askRemove = async (p: FinancePartner) => {
    if (await confirm(`Retirer l'accès de ${p.user.display_name} à tes finances ?`)) remove.mutate(p.user.id);
  };

  if (loading) return <Spinner />;

  return (
    <div className="col" style={{ gap: "var(--space-5)" }}>
      <section>
        <div className="panel-head row" style={{ justifyContent: "space-between" }}>
          <h2><Icon name="share" size={18} style={{ verticalAlign: "-3px" }} /> Je partage avec</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Ajouter</button>
        </div>
        <div className="card card-pad-sm">
          {sharedByMe.length === 0 ? (
            <p className="muted small"><Icon name="info" size={14} style={{ verticalAlign: "-2px" }} /> Tu ne partages tes finances avec personne. Ajoute un ami pour lui donner accès (lecture ou édition).</p>
          ) : (
            sharedByMe.map((p) => (
              <div key={p.user.id} className="li-row" style={{ alignItems: "center" }}>
                <CatDot color="sage" icon="profile" size={30} />
                <span className="grow" style={{ fontWeight: 600 }}>{p.user.display_name}</span>
                <label className="row gap-2 small" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={p.can_edit} onChange={(e) => setPartner.mutate({ id: p.user.id, can_edit: e.target.checked })} />
                  <span>Édition</span>
                </label>
                <button className="btn btn-icon btn-danger btn-sm" onClick={() => askRemove(p)} aria-label="Retirer"><Icon name="trash" size={15} /></button>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <div className="panel-head"><h2><Icon name="users" size={18} style={{ verticalAlign: "-3px" }} /> Partagé avec moi</h2></div>
        <div className="card card-pad-sm">
          {sharedWithMe.length === 0 ? (
            <p className="muted small">Personne ne partage ses finances avec toi pour l'instant.</p>
          ) : (
            sharedWithMe.map((p) => (
              <div key={p.user.id} className="li-row" style={{ alignItems: "center" }}>
                <CatDot color="sky" icon="profile" size={30} />
                <span className="grow" style={{ fontWeight: 600 }}>{p.user.display_name}</span>
                <span className="chip small">{p.can_edit ? "Édition" : "Lecture seule"}</span>
              </div>
            ))
          )}
          {sharedWithMe.length > 0 && (
            <p className="muted small" style={{ marginTop: "var(--space-2)" }}>
              <Icon name="lightbulb" size={14} style={{ verticalAlign: "-2px" }} /> Bascule sur leur espace via le sélecteur en haut de page.
            </p>
          )}
        </div>
      </section>

      {adding && (
        <Modal
          title="Partager mes finances"
          onClose={() => setAdding(false)}
          footer={<button className="btn btn-soft" onClick={() => setAdding(false)}>Fermer</button>}
        >
          {friendsQ.isLoading ? (
            <Spinner />
          ) : candidates.length === 0 ? (
            <EmptyState icon="friends" title="Aucun ami à ajouter" hint="Ajoute des amis (onglet Amis) puis reviens leur partager tes finances." />
          ) : (
            <div className="col" style={{ gap: "var(--space-2)" }}>
              <p className="muted small">Choisis un ami pour lui donner accès à ton espace finances (lecture par défaut).</p>
              {candidates.map((u) => (
                <div key={u.id} className="li-row" style={{ alignItems: "center" }}>
                  <CatDot color="lilac" icon="profile" size={30} />
                  <span className="grow" style={{ fontWeight: 600 }}>{u.display_name}</span>
                  <button className="btn btn-primary btn-sm" onClick={() => { setPartner.mutate({ id: u.id, can_edit: false }); }} disabled={setPartner.isPending}>
                    <Icon name="share" size={14} /> Partager
                  </button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
      {confirmNode}
    </div>
  );
}
