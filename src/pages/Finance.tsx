// Section « Budget » — SHELL. Le gros monolithe d'origine (1957 lignes) a été
// découpé : la base partagée vit dans ./finance/shared.tsx et chaque onglet dans
// son propre fichier ./finance/*Tab.tsx. Ce fichier ne garde que l'enveloppe :
// en-tête, sélecteur d'espace partagé, barre d'onglets, ajout rapide, démarrage.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useToast } from "../ui";
import { takeCompose } from "../compose";
import Icon from "../components/Icon";
import { currentMonth, TABS, type TabKey, type TxFilter, type TxForm } from "./finance/shared";
import { OverviewTab } from "./finance/OverviewTab";
import { StatsTab } from "./finance/StatsTab";
import { TransactionsTab, TxModal } from "./finance/TransactionsTab";
import { AccountsTab } from "./finance/AccountsTab";
import { BudgetsTab } from "./finance/BudgetsTab";
import { GoalsTab } from "./finance/GoalsTab";
import { RecurringTab } from "./finance/RecurringTab";
import { PartnersTab } from "./finance/PartnersTab";

/* ── Composant principal ──────────────────────────────────────────────────── */
export default function Finance() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [month, setMonth] = useState<string>(currentMonth());
  const [owner, setOwner] = useState<string>(""); // "" = moi ; sinon id du partenaire

  const [quickAdd, setQuickAdd] = useState(false);
  const [txPrefill, setTxPrefill] = useState<Partial<TxForm> | null>(null);
  const [txFilter, setTxFilter] = useState<TxFilter | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Ouverture pré-remplie depuis une note convertie (« Ajouter au portefeuille »).
  useEffect(() => {
    const c = takeCompose("finance");
    if (!c) return;
    setTxPrefill(c.prefill as Partial<TxForm>);
    setQuickAdd(true);
  }, []);
  // Quick-add : /finances?new=1 place sur l'onglet Transactions, ouvre le
  // formulaire d'ajout, puis nettoie l'URL (idempotent, compatible React.StrictMode
  // grâce à la mise à jour fonctionnelle des paramètres).
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setTab("transactions");
    setQuickAdd(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("new");
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);
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
