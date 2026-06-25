import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Icon, type IconName } from "./Icon";
import type { AssistantInsight, InsightSeverity } from "@shared/types";

// « Aujourd'hui » — la carte d'assistant intelligent. Affiche le digest priorisé
// renvoyé par GET /api/assistant (événements à répondre, tâches, budgets, soldes,
// départs…). Réutilisable : pleine page (accueil) ou compacte (widget).

const SEV_ICON_TONE: Record<InsightSeverity, string> = {
  urgent: "var(--danger)",
  attention: "var(--accent-ink)",
  info: "var(--muted)",
  celebrate: "var(--ok, var(--accent-ink))",
};

function InsightRow({ insight }: { insight: AssistantInsight }) {
  return (
    <Link to={insight.link} className={`assist-row sev-${insight.severity}`}>
      <span className="assist-row-ic" style={{ color: SEV_ICON_TONE[insight.severity] }}>
        <Icon name={insight.icon as IconName} size={18} />
      </span>
      <span className="assist-row-main">
        <span className="assist-row-title">{insight.title}</span>
        {insight.body && <span className="assist-row-body">{insight.body}</span>}
      </span>
      {insight.action_label && (
        <span className="assist-row-action">
          {insight.action_label}
          <Icon name="arrowRight" size={14} />
        </span>
      )}
    </Link>
  );
}

export default function AssistantCard({
  compact = false,
  limit,
  hideWhenEmpty = false,
  bare = false,
}: {
  compact?: boolean;
  limit?: number;
  /** Sur l'accueil : ne rien afficher tant qu'il n'y a rien à signaler (jour calme). */
  hideWhenEmpty?: boolean;
  /** Mode widget : pas de carte ni d'en-tête (le widget fournit déjà son cadre). */
  bare?: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["assistant"],
    queryFn: () => api.assistant(),
    staleTime: 60_000,
  });

  // En mode « héros » de l'accueil, on s'efface les jours calmes pour ne pas
  // encombrer : pas de squelette qui clignote, pas de carte vide.
  if (hideWhenEmpty && (isLoading || (data && data.digest.insights.length === 0))) return null;

  if (isLoading) {
    const sk = (
      <div className="assist-skeleton">
        <span className="sk-line" style={{ width: "40%" }} />
        <span className="sk-line" style={{ width: "85%" }} />
        <span className="sk-line" style={{ width: "70%" }} />
      </div>
    );
    return bare ? <div className="widget-body">{sk}</div> : <div className={`card assist-card${compact ? " assist-compact" : ""}`}>{sk}</div>;
  }

  const digest = data?.digest;
  const insights = (digest?.insights ?? []).slice(0, limit ?? (compact || bare ? 4 : 8));
  const stats = digest?.stats;

  // Mode widget : seulement la liste (ou un état calme), sans cadre ni en-tête.
  if (bare) {
    return insights.length === 0 ? (
      <div className="widget-body"><p className="muted small">{digest?.focus ?? "Tout est calme."}</p></div>
    ) : (
      <div className="widget-body"><div className="assist-list">{insights.map((i) => <InsightRow key={i.key} insight={i} />)}</div></div>
    );
  }

  return (
    <div className={`card assist-card${compact ? " assist-compact" : ""}`}>
      {!compact && (
        <div className="assist-head">
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <span className="assist-head-ic"><Icon name="sparkle" size={18} /></span>
            <h2 className="assist-title">Aujourd'hui</h2>
          </div>
          {digest?.focus && <p className="assist-focus">{digest.focus}</p>}
        </div>
      )}

      {!compact && stats && (
        <div className="assist-stats">
          {stats.pending_rsvp > 0 && <StatChip icon="confetti" label="à répondre" value={stats.pending_rsvp} />}
          {stats.tasks_due > 0 && <StatChip icon="check" label="à faire" value={stats.tasks_due} />}
          {stats.upcoming_events > 0 && <StatChip icon="calendar" label="à venir" value={stats.upcoming_events} />}
          {stats.budget_alerts > 0 && <StatChip icon="wallet" label="budgets" value={stats.budget_alerts} tone="danger" />}
          {stats.i_owe > 0 && <StatChip icon="expenses" label="tu dois" money={stats.i_owe} tone="danger" />}
          {stats.owed_to_me > 0 && <StatChip icon="coins" label="on te doit" money={stats.owed_to_me} tone="ok" />}
        </div>
      )}

      {insights.length === 0 ? (
        <div className="assist-empty">
          <span className="assist-head-ic"><Icon name="leaf" size={22} /></span>
          <p className="muted small">{digest?.focus ?? "Tout est calme — rien d'urgent."}</p>
        </div>
      ) : (
        <div className="assist-list">
          {insights.map((i) => (
            <InsightRow key={i.key} insight={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatChip({
  icon,
  label,
  value,
  money,
  tone,
}: {
  icon: IconName;
  label: string;
  value?: number;
  money?: number;
  tone?: "danger" | "ok";
}) {
  const text =
    money != null ? money.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: money % 1 === 0 ? 0 : 2 }) : value;
  return (
    <span className={`assist-stat${tone ? ` tone-${tone}` : ""}`}>
      <Icon name={icon} size={14} />
      <strong>{text}</strong>
      <span className="assist-stat-label">{label}</span>
    </span>
  );
}
