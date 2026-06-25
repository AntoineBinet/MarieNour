// Petit mot de bienvenue, affiché UNE SEULE FOIS à la première connexion.
// Volontairement court et calme : on présente l'esprit de l'app, puis on passe
// la main à la carte « Premiers pas » de l'accueil (la seule source de vérité du
// parcours). Plus de checklist dupliquée ici, plus de réapparition à chaque
// login : dès qu'on le ferme (par n'importe quel chemin), il ne revient pas.
// On peut le rejouer depuis le centre d'aide (événement « mn:replay-intro »).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { useAuth } from "../auth";
import { addressName } from "../greeting";

const HIDE_KEY = "mn_hide_intro";

interface Step {
  icon: IconName;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: "sparkle",
    title: "Bienvenue dans ton atelier",
    body: "MarieNour réunit tout ce que tu veux garder, planifier et partager — un espace beau et privé, pensé d'abord pour toi.",
  },
  {
    icon: "grid",
    title: "Un accueil à ta main",
    body: "Compose ton tableau de bord avec des widgets : listes, prochain voyage, budget, photos… Glisse-les, redimensionne-les, démarre en un clic.",
  },
  {
    icon: "users",
    title: "Mieux à plusieurs",
    body: "Voyages, événements, dépenses façon Tricount : tu partages exactement ce que tu veux, et tu invites tes proches d'un simple QR code.",
  },
  {
    icon: "rocket",
    title: "À toi de jouer",
    body: "On t'a préparé quelques premiers pas pour prendre tes marques en douceur. Tu les retrouves sur ton accueil — et chacun se coche tout seul dès que c'est fait.",
  },
];

function persistSeen() {
  try {
    localStorage.setItem(HIDE_KEY, "1");
  } catch {
    /* stockage indisponible : on ignore */
  }
}

export function IntroTour() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);

  // Rejouer depuis le centre d'aide : on réinitialise sans recharger la page
  // (le composant est monté en permanence dans le Layout).
  useEffect(() => {
    const replay = () => {
      setStep(0);
      setHidden(false);
    };
    window.addEventListener("mn:replay-intro", replay);
    return () => window.removeEventListener("mn:replay-intro", replay);
  }, []);

  if (hidden) return null;

  // Fermeture = vu une bonne fois pour toutes (quel que soit le bouton utilisé).
  const close = () => {
    persistSeen();
    setHidden(true);
  };

  // Dernière étape : on passe la main à la carte « Premiers pas » de l'accueil.
  const handOff = () => {
    close();
    navigate("/");
  };

  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  // Premier écran personnalisé avec le prénom d'accueil choisi par l'utilisateur.
  const title = step === 0 && user ? `Bienvenue dans ton atelier, ${addressName(user)}` : s.title;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal intro-modal" role="dialog" aria-modal="true" aria-label="Bienvenue">
        <button className="btn btn-icon btn-soft intro-close" onClick={close} aria-label="Fermer">
          <Icon name="close" size={16} />
        </button>

        <div className="intro-hero">
          <span className="intro-hero-icon"><Icon name={s.icon} size={40} strokeWidth={1.5} /></span>
        </div>

        <h2 style={{ marginBottom: "var(--space-2)" }}>{title}</h2>
        <p className="muted" style={{ minHeight: 66 }}>{s.body}</p>

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

        <div className="row gap-2" style={{ marginTop: "var(--space-4)" }}>
          {step > 0 ? (
            <button className="btn btn-soft grow" onClick={() => setStep((v) => v - 1)}>
              <Icon name="arrowLeft" size={16} /> Précédent
            </button>
          ) : (
            <button className="btn btn-soft grow" onClick={close}>Passer</button>
          )}
          {last ? (
            <button className="btn btn-primary grow" onClick={handOff}>
              <Icon name="check" size={16} /> Voir mes premiers pas
            </button>
          ) : (
            <button className="btn btn-primary grow" onClick={() => setStep((v) => v + 1)}>
              Suivant <Icon name="arrowRight" size={16} />
            </button>
          )}
        </div>

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
      </div>
    </div>
  );
}

export default IntroTour;
