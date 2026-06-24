// Carte « Premiers pas » interactive, affichée sur l'accueil tant que le
// parcours n'est pas terminé (ou masqué). Chaque ligne est cliquable : elle
// emmène à l'écran concerné, et la coche se met à jour en direct une fois
// l'action réalisée. La même liste sert au tutoriel d'accueil (IntroTour).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFirstSteps, type FirstStep } from "../firstSteps";
import { Icon } from "./Icon";

const HIDE_KEY = "mn_hide_firststeps";

/** Liste des étapes (réutilisable : accueil + tutoriel). */
export function FirstStepsList({
  steps,
  onGo,
}: {
  steps: FirstStep[];
  onGo: (to: string) => void;
}) {
  return (
    <div className="firststeps-list">
      {steps.map((s) => (
        <button
          key={s.key}
          type="button"
          className={`firststep${s.done ? " done" : ""}`}
          onClick={() => onGo(s.to)}
        >
          <span className="firststep-check" aria-hidden>
            {s.done ? <Icon name="check" size={14} /> : <Icon name={s.icon} size={15} />}
          </span>
          <span className="firststep-text">
            <strong>{s.title}</strong>
            <span className="muted small">{s.desc}</span>
          </span>
          <span className="firststep-go" aria-hidden>
            {s.done ? "Fait" : <Icon name="arrowRight" size={15} />}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Carte autonome pour l'accueil. */
export default function FirstSteps() {
  const navigate = useNavigate();
  const { steps, doneCount, total, allDone, loading } = useFirstSteps();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (hidden || allDone || loading) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  const pct = Math.round((doneCount / total) * 100);

  return (
    <div className="card firststeps-card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow">Premiers pas</p>
          <h3 style={{ marginBottom: 2 }}>Prends tes marques</h3>
          <p className="muted small">Clique une étape pour t'y rendre — ça se valide tout seul.</p>
        </div>
        <button className="btn btn-icon btn-soft btn-sm" onClick={dismiss} aria-label="Masquer" title="Masquer">
          <Icon name="close" size={15} />
        </button>
      </div>

      <div className="firststeps-progress" role="progressbar" aria-valuenow={doneCount} aria-valuemax={total}>
        <div className="firststeps-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="small muted" style={{ marginBottom: "var(--space-3)" }}>
        {doneCount} / {total} terminé{doneCount > 1 ? "s" : ""}
      </p>

      <FirstStepsList steps={steps} onGo={(to) => navigate(to)} />
    </div>
  );
}
