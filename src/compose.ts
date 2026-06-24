// Passe-plat « composer depuis ailleurs » : un écran (ex. Notes) prépare un
// brouillon prérempli, navigue vers la page cible (ex. Événements) qui, au
// montage, récupère ce brouillon et ouvre directement son formulaire de
// création déjà garni. Stocké en sessionStorage pour survivre à la navigation
// sans polluer l'URL ni l'historique.

export type ComposeTarget = "list" | "event" | "finance" | "trip" | "recipe";

export interface ComposePayload {
  target: ComposeTarget;
  prefill: Record<string, unknown>;
  /** Note d'origine, pour proposer de la supprimer une fois convertie. */
  sourceNoteId?: string;
  /** Libellé court de la source (toast/contexte). */
  sourceLabel?: string;
}

const KEY = "mn_compose";

export function setCompose(payload: ComposePayload): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* sessionStorage indisponible → on ignore, la nav reste fonctionnelle */
  }
}

/**
 * Récupère (et consomme) un brouillon destiné à `target`. Renvoie `null` si
 * aucun brouillon en attente ou s'il vise une autre page. Consommé une seule
 * fois : un rechargement ne rouvre pas le formulaire.
 */
export function takeCompose(target: ComposeTarget): ComposePayload | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let payload: ComposePayload | null = null;
  try {
    payload = JSON.parse(raw) as ComposePayload;
  } catch {
    payload = null;
  }
  if (!payload || payload.target !== target) return null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return payload;
}

export function clearCompose(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
