// Moteur d'apparence — source de vérité unique pour TOUTE la personnalisation
// visuelle (thème clair/sombre, couleur d'accent y compris personnalisée,
// typographie, arrondis, densité, ambiance de fond, accessibilité).
//
// Les préférences « officielles » d'un membre vivent côté serveur (user.prefs,
// synchronisées entre appareils). Pour éviter un « flash » au démarrage avant
// que la session ne soit chargée, on garde une copie locale (localStorage) de la
// dernière apparence appliquée et on la repose dès le premier rendu.

import type { FontChoice, ThemeMode, UserPrefs } from "@shared/types";

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
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", THEME_COLORS[theme]);
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
  syncMetaThemeColor(theme);

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
  setAttr(root, "data-motion", prefs.reduce_motion ? "off" : null);

  current = { accent: app.accent || "terracotta", prefs };
  if (persist) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(current));
    } catch {
      /* stockage indisponible : on ignore */
    }
  }
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
