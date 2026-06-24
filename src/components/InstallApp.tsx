import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useToast } from "../ui";
import { Icon, type IconName } from "./Icon";
import { canInstall, isStandalone, onInstallChange, promptInstall } from "../pwa";

/* ════════════════════════════════════════════════════════════════════════
   Tuto d'installation « Ajouter à l'écran d'accueil ».

   marienour est une PWA : sur iPhone, on l'installe via Safari → Partager →
   « Sur l'écran d'accueil » (aucun compte développeur, aucun App Store, gratuit).
   Ce composant guide l'utilisateur pas à pas, avec des maquettes SVG de Safari
   et un anneau qui « pulse » sur le bouton exact à toucher. Il détecte la
   plateforme (iOS / Android / ordi) et le navigateur, et prévient quand on est
   dans un navigateur intégré (Instagram…) ou Chrome iOS, d'où l'installation
   est impossible — il faut alors rouvrir dans Safari.
   ════════════════════════════════════════════════════════════════════════ */

const LS_DISMISSED = "mn.install.dismissed"; // l'utilisateur a coché « ne plus proposer »
const LS_AUTOSHOWN = "mn.install.autoShown"; // l'invite auto ne se déclenche qu'une fois
const LS_INTRO_HIDDEN = "mn_hide_intro"; // clé de l'IntroTour : on attend qu'elle soit passée

const ls = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* stockage indisponible */
  }
};

type Platform = "ios" | "android" | "desktop";
type Browser = "safari" | "crios" | "fxios" | "edgios" | "inapp" | "chromium" | "firefox" | "other";

interface Env {
  platform: Platform;
  browser: Browser;
  /** iOS sans Safari réel (navigateur intégré ou Chrome/Firefox/Edge iOS) : install impossible. */
  iosBlocked: boolean;
  /** Android dans un navigateur intégré (webview d'une autre app). */
  androidInApp: boolean;
}

// Navigateurs intégrés courants (webviews) qui ne savent pas installer une PWA.
const INAPP_RE =
  /(FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|MicroMessenger|Snapchat|Pinterest|TikTok|musical_ly|GSA\/|LinkedInApp|Twitter|WhatsApp|WeChat)/i;

function detectEnv(): Env {
  if (typeof navigator === "undefined") {
    return { platform: "desktop", browser: "other", iosBlocked: false, androidInApp: false };
  }
  const ua = navigator.userAgent || "";
  // iPadOS se fait passer pour un Mac : on le démasque via le tactile.
  const iPadOS = navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;
  const ios = /iPad|iPhone|iPod/.test(ua) || iPadOS;
  const android = /Android/.test(ua);
  const platform: Platform = ios ? "ios" : android ? "android" : "desktop";
  const inapp = INAPP_RE.test(ua);

  let browser: Browser = "other";
  if (ios) {
    if (/CriOS/.test(ua)) browser = "crios";
    else if (/FxiOS/.test(ua)) browser = "fxios";
    else if (/EdgiOS/.test(ua)) browser = "edgios";
    // Safari réel = jeton « Version/… … Safari ». Les webviews intégrées
    // (Instagram, etc.) portent « Safari » mais PAS « Version/ ».
    else if (inapp || !/Safari/.test(ua) || !/Version\//.test(ua)) browser = "inapp";
    else browser = "safari";
  } else if (android) {
    browser = inapp ? "inapp" : /Firefox/.test(ua) ? "firefox" : "chromium";
  } else {
    browser = /Firefox/.test(ua) ? "firefox" : "chromium";
  }

  const iosBlocked = ios && browser !== "safari";
  const androidInApp = android && browser === "inapp";
  return { platform, browser, iosBlocked, androidInApp };
}

/* ── Maquettes SVG de l'iPhone ─────────────────────────────────────────────
   Dessinées « maison » (mêmes conventions que Icon.tsx), thémées via les
   classes CSS (suivent le clair/sombre et la couleur d'accent). `glow` ajoute
   un halo sur la cible mise en avant. */

function Phone({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 240 380" role="img" aria-hidden="true">
      <rect className="install-phone-frame" x="8" y="4" width="224" height="372" rx="34" strokeWidth="2" />
      <rect className="install-phone-screen" x="16" y="12" width="208" height="356" rx="24" />
      <rect className="install-mock-ink" x="96" y="20" width="48" height="11" rx="5.5" opacity="0.85" />
      {children}
    </svg>
  );
}

/** Étape 1 — barre du bas de Safari avec le bouton Partager mis en avant. */
function ToolbarMock() {
  return (
    <Phone>
      {/* Fausse page */}
      <rect className="install-mock-soft" x="30" y="46" width="30" height="30" rx="9" />
      <rect className="install-mock-soft" x="68" y="50" width="120" height="9" rx="4.5" />
      <rect className="install-mock-soft" x="68" y="64" width="80" height="8" rx="4" />
      <rect className="install-mock-soft" x="30" y="92" width="180" height="46" rx="12" />
      <rect className="install-mock-soft" x="30" y="148" width="180" height="46" rx="12" />
      <rect className="install-mock-soft" x="30" y="204" width="110" height="40" rx="12" />

      {/* Barre d'outils Safari (bas) */}
      <line className="install-mock-line" x1="16" y1="320" x2="224" y2="320" strokeWidth="1" />
      {/* Précédent / suivant */}
      <path className="install-mock-stroke" d="M37 338l-5 5 5 5" strokeWidth="2" />
      <path className="install-mock-stroke" d="M55 338l5 5-5 5" strokeWidth="2" />
      {/* Barre d'adresse */}
      <rect className="install-mock-soft" x="72" y="332" width="84" height="22" rx="11" />
      <text className="install-mock-muted" x="114" y="347" fontSize="9" textAnchor="middle">
        marienour.work
      </text>
      {/* Onglets */}
      <rect className="install-mock-stroke" x="206" y="335" width="7" height="7" rx="1.5" strokeWidth="1.6" />
      <rect className="install-mock-stroke" x="210" y="339" width="7" height="7" rx="1.5" strokeWidth="1.6" />

      {/* Bouton Partager (cible) : carré + flèche vers le haut */}
      <g className="ios-target-glow">
        <path
          className="install-mock-stroke"
          d="M179 345v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9"
          strokeWidth="2"
        />
        <path className="install-mock-stroke" d="M184 348v-9M184 338l-3 3M184 338l3 3" strokeWidth="2" />
      </g>
      <rect className="ios-pulse-ring" x="173" y="332" width="22" height="26" rx="7" />
    </Phone>
  );
}

/** Étape 2 — feuille de partage, ligne « Sur l'écran d'accueil » mise en avant. */
function SheetMock() {
  return (
    <Phone>
      {/* Page estompée derrière */}
      <rect className="install-mock-soft" x="30" y="46" width="150" height="9" rx="4.5" opacity="0.5" />
      <rect className="install-mock-soft" x="30" y="62" width="100" height="8" rx="4" opacity="0.5" />

      {/* Feuille de partage */}
      <rect className="install-phone-frame" x="20" y="86" width="200" height="282" rx="22" strokeWidth="1" />
      <rect className="install-mock-muted" x="106" y="96" width="28" height="4" rx="2" />

      {/* En-tête : icône + nom du site */}
      <rect className="install-mock-accent" x="32" y="110" width="30" height="30" rx="8" opacity="0.85" />
      <text className="install-mock-ink" x="70" y="122" fontSize="11" fontWeight="600">
        MarieNour
      </text>
      <text className="install-mock-muted" x="70" y="135" fontSize="9">
        marienour.work
      </text>

      {/* Cercles d'apps (estompés) */}
      <circle className="install-mock-soft" cx="46" cy="166" r="13" />
      <circle className="install-mock-soft" cx="86" cy="166" r="13" />
      <circle className="install-mock-soft" cx="126" cy="166" r="13" />
      <circle className="install-mock-soft" cx="166" cy="166" r="13" />
      <line className="install-mock-line" x1="32" y1="190" x2="208" y2="190" strokeWidth="1" />

      {/* Liste d'actions */}
      <text className="install-mock-ink" x="40" y="213" fontSize="10">
        Copier
      </text>
      <line className="install-mock-line" x1="32" y1="226" x2="208" y2="226" strokeWidth="0.8" />
      <text className="install-mock-ink" x="40" y="248" fontSize="10">
        Ajouter aux favoris
      </text>
      <line className="install-mock-line" x1="32" y1="261" x2="208" y2="261" strokeWidth="0.8" />

      {/* Ligne cible : « Sur l'écran d'accueil » + carré avec un + */}
      <g className="ios-target-glow">
        <text className="install-mock-ink" x="40" y="285" fontSize="10" fontWeight="600">
          Sur l'écran d'accueil
        </text>
        <rect className="install-mock-stroke" x="182" y="275" width="18" height="18" rx="5" strokeWidth="1.8" />
        <path className="install-mock-stroke" d="M191 280v8M187 284h8" strokeWidth="1.8" />
      </g>
      <rect className="ios-pulse-ring" x="30" y="270" width="180" height="28" rx="9" />
    </Phone>
  );
}

/** Étape 3 — boîte de confirmation, bouton « Ajouter » mis en avant. */
function ConfirmMock() {
  return (
    <Phone>
      <rect className="install-phone-frame" x="24" y="64" width="192" height="150" rx="16" strokeWidth="1" />
      {/* Barre du haut : Annuler · titre · Ajouter */}
      <text className="install-mock-muted" x="38" y="87" fontSize="9">
        Annuler
      </text>
      <text className="install-mock-ink" x="116" y="87" fontSize="8" fontWeight="600" textAnchor="middle">
        Écran d'accueil
      </text>
      <g className="ios-target-glow">
        <text className="install-mock-accent-ink" x="201" y="87" fontSize="10" fontWeight="700" textAnchor="end">
          Ajouter
        </text>
      </g>
      <rect className="ios-pulse-ring" x="173" y="75" width="37" height="18" rx="6" />
      <line className="install-mock-line" x1="24" y1="100" x2="216" y2="100" strokeWidth="0.8" />

      {/* Corps : icône + nom + url */}
      <rect className="install-mock-accent" x="40" y="120" width="42" height="42" rx="11" opacity="0.9" />
      <path d="M61 141c.6-4.5 1.8-5.7 6.5-6.3-4.7-.6-5.9-1.8-6.5-6.3-.6 4.5-1.8 5.7-6.5 6.3 4.7.6 5.9 1.8 6.5 6.3Z" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      <rect className="install-mock-soft" x="94" y="124" width="100" height="14" rx="4" />
      <text className="install-mock-ink" x="100" y="135" fontSize="10" fontWeight="600">
        MarieNour
      </text>
      <text className="install-mock-muted" x="94" y="156" fontSize="9">
        marienour.work
      </text>
    </Phone>
  );
}

interface Step {
  n: string;
  badge: IconName;
  title: string;
  body: ReactNode;
  mock: ReactNode;
}

const IOS_STEPS: Step[] = [
  {
    n: "Étape 1",
    badge: "share",
    title: "Touche « Partager »",
    body: (
      <>
        Tout en bas de Safari, touche l'icône <strong>Partager</strong> — le carré surmonté d'une
        flèche vers le haut.
      </>
    ),
    mock: <ToolbarMock />,
  },
  {
    n: "Étape 2",
    badge: "plus",
    title: "« Sur l'écran d'accueil »",
    body: (
      <>
        Fais défiler le menu qui s'ouvre, puis touche <strong>« Sur l'écran d'accueil »</strong>.
      </>
    ),
    mock: <SheetMock />,
  },
  {
    n: "Étape 3",
    badge: "check",
    title: "Touche « Ajouter »",
    body: (
      <>
        Vérifie le nom <strong>MarieNour</strong> en haut, puis touche <strong>« Ajouter »</strong>.
        L'icône apparaît sur ton écran d'accueil 🎉
      </>
    ),
    mock: <ConfirmMock />,
  },
];

/** Case « ne plus me proposer l'installation » (n'affecte que l'invite auto). */
function SkipBox() {
  const [checked, setChecked] = useState(ls(LS_DISMISSED) === "1");
  return (
    <label className="install-skip muted small">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          setChecked(e.target.checked);
          lsSet(LS_DISMISSED, e.target.checked ? "1" : "0");
        }}
      />
      Ne plus me proposer l'installation
    </label>
  );
}

function InstallModal({ env, onClose }: { env: Env; onClose: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const native = canInstall(); // recalculé à l'ouverture (peut arriver après le 1er rendu)

  const mode: "guard-ios" | "guard-android" | "native" | "ios-steps" | "android-manual" | "desktop-manual" =
    env.iosBlocked
      ? "guard-ios"
      : env.androidInApp
      ? "guard-android"
      : native
      ? "native"
      : env.platform === "ios"
      ? "ios-steps"
      : env.platform === "android"
      ? "android-manual"
      : "desktop-manual";

  // Échap pour fermer, flèches ←/→ pour naviguer entre les étapes iOS.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (mode === "ios-steps") {
        if (e.key === "ArrowRight") setStep((s) => Math.min(IOS_STEPS.length - 1, s + 1));
        if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, mode]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      toast.push("Adresse copiée ✓");
    } catch {
      toast.push("Copie impossible — note : marienour.work");
    }
  };

  const doNativeInstall = async () => {
    const ok = await promptInstall();
    onClose();
    if (ok) toast.push("C'est parti, MarieNour s'installe ✓");
  };

  const title =
    mode === "guard-ios" || mode === "guard-android"
      ? "Ouvre-moi dans le bon navigateur"
      : "Installer MarieNour";

  let body: ReactNode;
  let footer: ReactNode;

  if (mode === "guard-ios" || mode === "guard-android") {
    const ios = mode === "guard-ios";
    body = (
      <div className="col gap-4">
        <div className="install-guard-hero">
          <span className="install-guard-icon">
            <Icon name="globe" size={34} strokeWidth={1.5} />
          </span>
        </div>
        <p className="install-lead" style={{ textAlign: "center" }}>
          {ios && env.browser === "inapp" ? (
            <>
              Tu es dans le navigateur intégré d'une autre app. D'ici, impossible d'ajouter MarieNour à
              l'écran d'accueil. Touche le menu <strong>(•••)</strong> en haut, puis{" "}
              <strong>« Ouvrir dans Safari »</strong> — le guide repartira tout seul.
            </>
          ) : ios ? (
            <>
              Sur iPhone, seul <strong>Safari</strong> sait ajouter MarieNour à l'écran d'accueil. Copie
              l'adresse, ouvre <strong>Safari</strong> et colle-la — je t'attends.
            </>
          ) : (
            <>
              Tu es dans le navigateur intégré d'une autre app. Ouvre le menu <strong>(•••)</strong>, puis{" "}
              <strong>« Ouvrir dans Chrome »</strong> pour pouvoir installer MarieNour.
            </>
          )}
        </p>
        <button className="btn btn-primary btn-block" onClick={copyUrl}>
          <Icon name="link" size={16} /> Copier l'adresse
        </button>
        <SkipBox />
      </div>
    );
    footer = (
      <button className="btn btn-soft btn-block" onClick={onClose}>
        J'ai compris
      </button>
    );
  } else if (mode === "native") {
    body = (
      <div className="col gap-4">
        <p className="install-lead">
          Ton navigateur peut installer MarieNour <strong>en un clic</strong> : un accès plein écran,
          rapide, et même hors-ligne. Gratuit, sans aucun store.
        </p>
        <button className="btn btn-primary btn-block" onClick={doNativeInstall}>
          <Icon name="download" size={16} /> Installer maintenant
        </button>
        <SkipBox />
      </div>
    );
    footer = (
      <button className="btn btn-soft btn-block" onClick={onClose}>
        Plus tard
      </button>
    );
  } else if (mode === "android-manual") {
    body = (
      <div className="col gap-4">
        <p className="install-lead">
          Ajoute MarieNour à ton écran d'accueil pour l'ouvrir comme une vraie app — gratuit, sans store.
        </p>
        <div className="install-tip">
          <Icon name="dots" size={18} />
          <span>
            Ouvre le menu <strong>⋮</strong> de Chrome (en haut à droite), puis{" "}
            <strong>« Installer l'application »</strong>.
          </span>
        </div>
        <SkipBox />
      </div>
    );
    footer = (
      <button className="btn btn-soft btn-block" onClick={onClose}>
        J'ai compris
      </button>
    );
  } else if (mode === "desktop-manual") {
    body = (
      <div className="col gap-4">
        <p className="install-lead">
          Installe MarieNour sur ton ordinateur pour l'ouvrir dans sa propre fenêtre, comme un logiciel.
        </p>
        <div className="install-tip">
          <Icon name="download" size={18} />
          <span>
            Clique sur l'icône <strong>d'installation</strong> à droite de la barre d'adresse (ou menu{" "}
            <strong>⋮</strong> › « Installer MarieNour »).
          </span>
        </div>
        <SkipBox />
      </div>
    );
    footer = (
      <button className="btn btn-soft btn-block" onClick={onClose}>
        J'ai compris
      </button>
    );
  } else {
    // ios-steps : le guide pas à pas
    const s = IOS_STEPS[step];
    const last = step === IOS_STEPS.length - 1;
    body = (
      <div className="col gap-4">
        <p className="install-lead muted">
          Ajoute MarieNour à ton écran d'accueil : elle s'ouvre alors en <strong>plein écran</strong>,
          comme une vraie app — <strong>gratuitement</strong>, sans App Store, et même hors-ligne.
        </p>
        <div className="install-mock">{s.mock}</div>
        <div className="install-step-head">
          <span className="install-step-badge">
            <Icon name={s.badge} size={22} strokeWidth={1.7} />
          </span>
          <div className="col" style={{ gap: 2 }}>
            <span className="install-step-n">{s.n}</span>
            <span className="install-step-title">{s.title}</span>
          </div>
        </div>
        <p className="install-step-body muted">{s.body}</p>
        <SkipBox />
      </div>
    );
    footer = (
      <div className="install-foot" style={{ width: "100%" }}>
        <button
          className="btn btn-soft btn-sm"
          onClick={() => setStep((v) => Math.max(0, v - 1))}
          disabled={step === 0}
        >
          <Icon name="arrowLeft" size={15} /> Précédent
        </button>
        <div className="install-dots" role="tablist" aria-label="Étapes">
          {IOS_STEPS.map((_, i) => (
            <button
              key={i}
              className={`install-dot${i === step ? " active" : ""}`}
              onClick={() => setStep(i)}
              aria-label={`Étape ${i + 1}`}
              aria-selected={i === step}
            />
          ))}
        </div>
        {last ? (
          <button className="btn btn-primary btn-sm" onClick={onClose}>
            <Icon name="check" size={15} /> Terminé
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => setStep((v) => v + 1)}>
            Suivant <Icon name="arrowRight" size={15} />
          </button>
        )}
      </div>
    );
  }

  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal install-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-icon btn-soft" onClick={onClose} aria-label="Fermer">
            <Icon name="close" size={16} />
          </button>
        </div>
        {body}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: "var(--space-5)" }}>
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Bouton « Installer » (barre latérale) + invite automatique une seule fois sur
    mobile. Masqué quand l'app tourne déjà en mode installé. */
export default function InstallApp() {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const env = useMemo(detectEnv, []);

  // Re-rendu quand l'invite native devient disponible (beforeinstallprompt).
  useEffect(() => onInstallChange(() => force((n) => n + 1)), []);

  // Invite automatique : une fois, sur mobile, après l'intro, si non refusée.
  useEffect(() => {
    if (isStandalone() || env.platform === "desktop") return;
    if (ls(LS_DISMISSED) === "1" || ls(LS_AUTOSHOWN) === "1") return;
    if (ls(LS_INTRO_HIDDEN) !== "1") return; // on attend que l'intro soit passée
    const t = setTimeout(() => {
      lsSet(LS_AUTOSHOWN, "1");
      setOpen(true);
    }, 1600);
    return () => clearTimeout(t);
  }, [env.platform]);

  if (isStandalone()) return null;

  return (
    <>
      <button className="btn btn-soft btn-sm grow" onClick={() => setOpen(true)}>
        <Icon name="download" size={15} /> Installer
      </button>
      {open && <InstallModal env={env} onClose={() => setOpen(false)} />}
    </>
  );
}
