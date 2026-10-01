// Moteur d'apparence — source de vérité unique pour TOUTE la personnalisation
// visuelle (thème clair/sombre, couleur d'accent y compris personnalisée,
// typographie, arrondis, densité, ambiance de fond, accessibilité).
//
// Les préférences « officielles » d'un membre vivent côté serveur (user.prefs,
// synchronisées entre appareils). Pour éviter un « flash » au démarrage avant
// que la session ne soit chargée, on garde une copie locale (localStorage) de la
// dernière apparence appliquée et on la repose dès le premier rendu.

import type { FontChoice, MotionMode, ThemeMode, UserPrefs } from "@shared/types";
import { motionOf } from "@shared/types";

export type Theme = "light" | "dark";

/** Apparence = couleur d'accent (clé de preset ou 'custom') + préférences. */
export interface Appearance {
  accent: string;
  prefs: UserPrefs;
}

const CACHE_KEY = "mn_appearance";
const THEME_COLORS: Record<Theme, string> = { light: "#f6efe7", dark: "#1d1916" };

// Polices proposées (le « défaut » retire l'override pour laisser la police de
// base définie dans styles.css : Fraunces pour les titres, Inter pour le corps).
const FONT_STACKS: Record<Exclude<FontChoice, "default">, string> = {
  serif: '"Fraunces", Georgia, Cambria, "Times New Roman", serif',
  sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Quicksand, Verdana, system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  humanist: 'Optima, Candara, "Segoe UI", "Gill Sans", system-ui, sans-serif',
};

let current: Appearance = { accent: "terracotta", prefs: {} };

export function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

/** Mode de thème → thème réellement appliqué. */
export function resolveMode(mode: ThemeMode | undefined): Theme {
  if (mode === "light" || mode === "dark") return mode;
  return systemPrefersDark() ? "dark" : "light";
}

/** Thème réel actuellement appliqué (pour le bouton de bascule). */
export function resolvedTheme(): Theme {
  return (document.documentElement.getAttribute("data-theme") as Theme) || "light";
}

/** Construit une apparence à partir d'un utilisateur connecté. */
export function appearanceFromUser(u: { accent?: string; prefs?: UserPrefs } | null | undefined): Appearance {
  return { accent: u?.accent || "terracotta", prefs: u?.prefs || {} };
}

function syncMetaThemeColor(theme: Theme) {
  // Couleur de fond RÉELLE : tient compte des packs design (graphite, editorial…)
  // et des ambiances [data-bg], pas seulement du thème clair/sombre. On lit --bg
  // calculé sur <html> après application des attributs data-* ; repli sur la table
  // figée si la variable n'est pas encore résolue (feuille CSS pas chargée).
  let color = "";
  try {
    color = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  } catch {
    /* getComputedStyle indisponible : on garde le repli */
  }
  if (!color) color = THEME_COLORS[theme];

  // Balise « maîtresse » SANS attribut media : une fois le JS chargé elle prime
  // sur les deux balises statiques light/dark. On la place en tête des balises
  // theme-color pour gagner selon l'algorithme « premier match » du HTML.
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    const first = document.querySelector('meta[name="theme-color"]');
    if (first && first.parentNode) first.parentNode.insertBefore(meta, first);
    else document.head.appendChild(meta);
  }
  meta.setAttribute("content", color);
}

function setAttr(root: HTMLElement, name: string, value: string | null | undefined) {
  if (value) root.setAttribute(name, value);
  else root.removeAttribute(name);
}

function setFont(root: HTMLElement, varName: string, choice: FontChoice | undefined) {
  if (choice && choice !== "default") root.style.setProperty(varName, FONT_STACKS[choice]);
  else root.style.removeProperty(varName);
}

/**
 * Applique une apparence complète à <html> et (par défaut) la met en cache pour
 * un premier rendu sans flash au prochain démarrage.
 */
export function applyAppearance(app: Appearance, persist = true) {
  const root = document.documentElement;
  const prefs = app.prefs || {};

  const theme = resolveMode(prefs.theme_mode);
  root.setAttribute("data-theme", theme);
  // Aligne les contrôles natifs iOS (pickers date/heure, select, clavier,
  // scrollbars, autofill) sur le thème FORCÉ in-app, même si l'appareil est
  // réglé à l'inverse — sinon blocs clairs au milieu d'une UI sombre.
  root.style.colorScheme = theme;

  // Style d'interface global (« pack » coordonné). 'default' = pas d'attribut.
  setAttr(root, "data-design", prefs.design && prefs.design !== "default" ? prefs.design : null);

  // Couleur d'accent : preset (via data-accent) ou couleur libre (var inline).
  if (app.accent === "custom" && prefs.accent_custom) {
    root.setAttribute("data-accent", "custom");
    root.style.setProperty("--accent", prefs.accent_custom);
  } else {
    root.setAttribute("data-accent", app.accent || "terracotta");
    root.style.removeProperty("--accent");
  }

  setFont(root, "--font-display", prefs.font_display);
  setFont(root, "--font-body", prefs.font_body);

  if (prefs.font_scale && prefs.font_scale !== 1) root.style.setProperty("--font-scale", String(prefs.font_scale));
  else root.style.removeProperty("--font-scale");

  setAttr(root, "data-radius", prefs.radius && prefs.radius !== "soft" ? prefs.radius : null);
  setAttr(root, "data-density", prefs.density && prefs.density !== "cozy" ? prefs.density : null);
  setAttr(root, "data-bg", prefs.background && prefs.background !== "default" ? prefs.background : null);
  setAttr(root, "data-contrast", prefs.contrast ? "high" : null);
  // Mouvement : « reduce » coupe tout (off), « always » le garde même si
  // l'appareil demande moins d'animations (on), « system » suit l'appareil
  // (pas d'attribut). Lu par styles.css et par l'arbitre de src/fx/core.ts.
  const motion = motionOf(prefs);
  setAttr(root, "data-motion", motion === "reduce" ? "off" : motion === "always" ? "on" : null);

  // En dernier : la couleur de la barre d'état reflète le fond réel une fois
  // TOUS les attributs (design, ambiance de fond) appliqués.
  syncMetaThemeColor(theme);

  const avant = motionOf(current.prefs);
  current = { accent: app.accent || "terracotta", prefs };
  installerMotion();
  if (motion !== avant) prevenirMotion();
  if (persist) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(current));
    } catch {
      /* stockage indisponible : on ignore */
    }
  }
}

/* ── Le mouvement, lisible par tout le monde (window.MNMotion) ───────────── */

export interface MNMotionApi {
  /** Le réglage du membre : « system », « reduce » ou « always ». */
  mode(): MotionMode;
  /** Vrai quand rien ne doit bouger : relu à CHAQUE appel (le réglage et
   *  l'appareil peuvent changer pendant la séance). */
  reduit(): boolean;
  /** Prévient quand le mode ou la demande de l'appareil change ; rend la
   *  désinscription. */
  onChange(cb: (mode: MotionMode, reduit: boolean) => void): () => void;
}

declare global {
  interface Window {
    MNMotion?: MNMotionApi;
  }
}

const REDUCED_MQ = "(prefers-reduced-motion: reduce)";
const motionCbs = new Set<(mode: MotionMode, reduit: boolean) => void>();

/** L'appareil demande-t-il moins d'animations ? */
export function deviceReducesMotion(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.(REDUCED_MQ).matches;
  } catch {
    return false;
  }
}

/** Le mode de mouvement actuellement appliqué. */
export function motionMode(): MotionMode {
  return motionOf(current.prefs);
}

/** Vrai quand rien ne doit bouger (réglage du membre, sinon l'appareil). */
export function motionReduced(): boolean {
  const m = motionMode();
  if (m === "reduce") return true;
  if (m === "always") return false;
  return deviceReducesMotion();
}

function prevenirMotion() {
  const m = motionMode();
  const r = motionReduced();
  for (const cb of motionCbs) {
    try {
      cb(m, r);
    } catch {
      /* un abonné qui lève ne prive pas les autres */
    }
  }
}

let motionInstalled = false;
function installerMotion() {
  if (motionInstalled || typeof window === "undefined") return;
  motionInstalled = true;
  window.MNMotion = Object.freeze({
    mode: motionMode,
    reduit: motionReduced,
    onChange(cb: (mode: MotionMode, reduit: boolean) => void) {
      motionCbs.add(cb);
      return () => {
        motionCbs.delete(cb);
      };
    },
  });
  // La demande de l'appareil peut changer pendant la séance.
  window.matchMedia?.(REDUCED_MQ).addEventListener?.("change", prevenirMotion);
}

/** Bascule rapide clair/sombre — renvoie le nouveau mode (à persister côté serveur). */
export function toggleThemeMode(): ThemeMode {
  const next: ThemeMode = resolvedTheme() === "dark" ? "light" : "dark";
  applyAppearance({ accent: current.accent, prefs: { ...current.prefs, theme_mode: next } });
  return next;
}

/** À appeler une seule fois au démarrage (avant le rendu React). */
export function initAppearance() {
  let cached: Appearance | null = null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) cached = JSON.parse(raw) as Appearance;
  } catch {
    /* ignore */
  }
  applyAppearance(cached ?? { accent: "terracotta", prefs: {} }, false);

  // Tant que le mode est « système », on suit les changements de l'appareil.
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (!current.prefs.theme_mode || current.prefs.theme_mode === "system") {
      applyAppearance(current, false);
    }
  });
}
