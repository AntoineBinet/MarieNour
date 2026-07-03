import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";
import { Spinner, EmptyState } from "../../ui";
import Icon from "../../components/Icon";
import {
  money,
  monthShort,
  colorVar,
  CatDot,
  ProgressBar,
  type TxFilter,
} from "./shared";

export function StatsTab({ month, owner, goToTx }: { month: string; owner: string; goToTx: (f: TxFilter) => void }) {
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
                {stats.months.map((p) => {
                  // Colonne tappable → ouvre toutes les opérations de ce mois (accessible au
                  // doigt sur mobile, là où le survol/title est indisponible).
                  const go = () => goToTx({ month: p.month });
                  return (
                    <div
                      key={p.month}
                      className="col fin-click"
                      role="button"
                      tabIndex={0}
                      aria-label={`${monthShort(p.month)} — revenus ${money(p.income, cur)}, dépenses ${money(p.expense, cur)}`}
                      title={`Revenus · ${money(p.income, cur)} — Dépenses · ${money(p.expense, cur)}`}
                      onClick={go}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go()}
                      style={{ alignItems: "center", gap: 4, flex: 1, minWidth: 40, padding: "2px 2px 4px", borderRadius: 8 }}
                    >
                      <div className="row" style={{ alignItems: "flex-end", gap: 3, height: H }}>
                        <span
                          style={{ width: 11, height: Math.max(2, (p.income / maxBar) * H), background: "var(--ok)", borderRadius: "3px 3px 0 0" }}
                        />
                        <span
                          style={{ width: 11, height: Math.max(2, (p.expense / maxBar) * H), background: "var(--danger)", borderRadius: "3px 3px 0 0" }}
                        />
                      </div>
                      <span className="muted" style={{ fontSize: "0.66rem", textTransform: "capitalize" }}>{monthShort(p.month)}</span>
                    </div>
                  );
                })}
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
