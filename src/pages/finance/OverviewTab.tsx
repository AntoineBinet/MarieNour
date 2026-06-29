import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import { Spinner, EmptyState, useToast } from "../../ui";
import Icon from "../../components/Icon";
import type { FinanceOverview, FinanceGoal } from "@shared/types";
import {
  money,
  monthLabel,
  shiftMonth,
  colorVar,
  fmtDate,
  fmtDayMonth,
  CADENCE_LABEL,
  TYPE_META,
  CatDot,
  ProgressBar,
  ContributeModal,
  type TabKey,
  type TxFilter,
} from "./shared";

export function OverviewTab({
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
