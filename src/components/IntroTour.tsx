// Petit tutoriel d'accueil affiché à chaque connexion, tant que l'utilisateur
// n'a pas coché « Ne plus afficher l'introduction » (mémorisé en local).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { useFirstSteps } from "../firstSteps";
import { FirstStepsList } from "./FirstSteps";

const HIDE_KEY = "mn_hide_intro";

interface Step {
  icon: IconName;
  title: string;
  body: string;
  interactive?: boolean;
}

const STEPS: Step[] = [
  {
    icon: "sparkle",
    title: "Bienvenue dans ton atelier",
    body: "MarieNour réunit tout ce que tu veux garder, planifier et partager — un seul endroit, beau et simple, pensé d'abord pour toi.",
  },
  {
    icon: "grid",
    title: "Un tableau de bord à toi",
    body: "Compose ton accueil avec des widgets : listes, prochain voyage, dépenses, photos… Glisse-les, redimensionne-les, et démarre en un clic.",
  },
  {
    icon: "wallet",
    title: "Tes finances, maîtrisées",
    body: "Comptes, budgets par catégorie, opérations récurrentes et objectifs d'épargne. Suis ton reste-à-vivre et, si tu veux, partage avec ton/ta partenaire.",
  },
  {
    icon: "compass",
    title: "Voyages & dépenses en groupe",
    body: "Planifie un week-end ou un road trip, vote les étapes à plusieurs, et règle les comptes façon Tricount — même avec des amis pas encore inscrits.",
  },
  {
    icon: "qr",
    title: "Invite d'un simple scan",
    body: "Un QR code suffit pour ajouter quelqu'un en ami, à un voyage ou à un groupe de dépenses. Pratique, instantané, sans friction.",
  },
  {
    icon: "rocket",
    title: "À toi de jouer",
    body: "Quelques gestes pour démarrer — clique pour t'y rendre, ça se coche en direct dès que c'est fait.",
    interactive: true,
  },
];

// Mini-checklist interactive (montée seulement sur la dernière étape → on ne
// déclenche les requêtes que si l'utilisateur va jusque-là).
function IntroChecklist({ onGo }: { onGo: (to: string) => void }) {
  const { steps, doneCount, total } = useFirstSteps();
  return (
    <div className="intro-checklist">
      <p className="small muted" style={{ marginBottom: "var(--space-2)" }}>
        {doneCount} / {total} déjà fait{doneCount > 1 ? "s" : ""}
      </p>
      <FirstStepsList steps={steps} onGo={onGo} />
    </div>
  );
}

export function IntroTour() {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);

  if (hidden) return null;

  const close = () => {
    if (dontShow) {
      try {
        localStorage.setItem(HIDE_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    setHidden(true);
  };

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal intro-modal" role="dialog" aria-modal="true" aria-label="Introduction">
        <button className="btn btn-icon btn-soft intro-close" onClick={close} aria-label="Fermer">
          <Icon name="close" size={16} />
        </button>

        <div className="intro-hero">
          <span className="intro-hero-icon"><Icon name={s.icon} size={40} strokeWidth={1.5} /></span>
        </div>

        <h2 style={{ marginBottom: "var(--space-2)" }}>{s.title}</h2>
        <p className="muted" style={{ minHeight: s.interactive ? undefined : 66 }}>{s.body}</p>

        {s.interactive && (
          <IntroChecklist
            onGo={(to) => {
              close();
              navigate(to);
            }}
          />
        )}

        <div className="intro-dots" role="tablist" aria-label="Étapes">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`intro-dot${i === step ? " active" : ""}`}
              onClick={() => setStep(i)}
              aria-label={`Étape ${i + 1}`}
              aria-selected={i === step}
            />
          ))}
        </div>

        <label className="row gap-2 intro-skip">
          <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
          <span className="small muted">Ne plus afficher l'introduction</span>
        </label>

        <div className="row gap-2" style={{ marginTop: "var(--space-4)" }}>
          {step > 0 ? (
            <button className="btn btn-soft grow" onClick={() => setStep((v) => v - 1)}>
              <Icon name="arrowLeft" size={16} /> Précédent
            </button>
          ) : (
            <button className="btn btn-soft grow" onClick={close}>Passer</button>
          )}
          {last ? (
            <button className="btn btn-primary grow" onClick={close}>
              <Icon name="check" size={16} /> C'est parti
            </button>
          ) : (
            <button className="btn btn-primary grow" onClick={() => setStep((v) => v + 1)}>
              Suivant <Icon name="arrowRight" size={16} />
            </button>
          )}
        </div>

        {last && (
          <button
            type="button"
            className="intro-help-link"
            onClick={() => {
              close();
              navigate("/aide");
            }}
          >
            <Icon name="lightbulb" size={14} /> Besoin d'un coup de main ? Voir le centre d'aide
          </button>
        )}
      </div>
    </div>
  );
}

export default IntroTour;
