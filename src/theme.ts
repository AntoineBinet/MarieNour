// Gestion du thème clair/sombre — source de vérité unique.
// Au premier lancement, on suit la préférence système ; ensuite le choix de
// l'utilisateur est mémorisé. On synchronise aussi la couleur de la barre d'état
// (meta theme-color) avec le thème réel, même si l'utilisateur force l'inverse
// de son système (utile sur iPhone en mode standalone/PWA).

export type Theme = "light" | "dark";

const STORAGE_KEY = "mn_theme";
const THEME_COLORS: Record<Theme, string> = { light: "#f6efe7", dark: "#1d1916" };

export function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function currentTheme(): Theme {
  return (document.documentElement.getAttribute("data-theme") as Theme) || "light";
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

export function applyTheme(theme: Theme, persist = true) {
  document.documentElement.setAttribute("data-theme", theme);
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* stockage indisponible : on ignore */
    }
  }
  syncMetaThemeColor(theme);
}

/** À appeler une fois au démarrage (avant le rendu React). */
export function initTheme() {
  let saved: Theme | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
  } catch {
    /* ignore */
  }
  applyTheme(saved ?? (systemPrefersDark() ? "dark" : "light"), false);

  // Tant que l'utilisateur n'a pas choisi explicitement, on suit le système.
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", (e) => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (!stored) applyTheme(e.matches ? "dark" : "light", false);
  });
}
