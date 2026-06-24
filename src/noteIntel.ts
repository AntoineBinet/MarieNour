// ─────────────────────────────────────────────────────────────────────────────
// Intelligence des notes — « rendre les notes intelligentes »
//
// Analyse le texte d'une note (titre + corps) et en déduit des ACTIONS
// pertinentes : planifier une activité (Événements), ajouter une dépense ou un
// revenu (Mes finances / le « portefeuille »), transformer en liste de courses,
// préparer un voyage, enregistrer une recette, garder une inspiration, relancer
// un ami, lancer un sondage…
//
// Le moteur est volontairement EXHAUSTIF : plus de 150 déclencheurs (mots-clés
// et motifs) regroupés par intention, plus des extracteurs d'entités (montant,
// date, heure, lieu, lien) qui pré-remplissent le formulaire cible. Tout est
// hors-ligne, déterministe et sans appel réseau.
//
// Chaque suggestion sait vers quelle page elle mène (`route`) et, si la page
// cible supporte le pré-remplissage, embarque une charge `prefill` + `target`
// (voir compose.ts).
// ─────────────────────────────────────────────────────────────────────────────
import type { IconName } from "./components/Icon";
import type { ComposeTarget } from "./compose";

export type IntentKind =
  | "finance"
  | "event"
  | "list"
  | "trip"
  | "recipe"
  | "inspiration"
  | "friend"
  | "poll";

export interface NoteSuggestion {
  kind: IntentKind;
  /** Texte du bouton/chip. */
  label: string;
  /** Phrase courte expliquant l'action proposée. */
  hint: string;
  icon: IconName;
  route: string;
  /** Page supportant le pré-remplissage (sinon simple navigation). */
  target?: ComposeTarget;
  prefill?: Record<string, unknown>;
  /** Score de confiance (tri + seuil). */
  score: number;
  /** Mots détectés (info-bulle / debug). */
  matched: string[];
}

interface NoteLike {
  title?: string | null;
  body?: string | null;
}

// ── Groupes de déclencheurs ─────────────────────────────────────────────────
// `strong` = preuve décisive (poids 2). `soft` = indice (poids 1).
// Le seuil de déclenchement est de 2 → un mot fort suffit, deux mots faibles
// aussi, ou un mot faible + un bonus d'entité (montant, date, lien…).
interface IntentGroup {
  kind: IntentKind;
  strong: string[];
  soft: string[];
}

const GROUPS: IntentGroup[] = [
  // ── 💰 Finances / portefeuille (dépense ou revenu) ──────────────────────
  {
    kind: "finance",
    strong: [
      "facture", "factures", "loyer", "abonnement", "abonnements", "impôt", "impôts",
      "assurance", "mutuelle", "remboursement", "rembourser", "salaire", "virement",
      "dépense", "dépenses", "dépenser", "budget", "épargne", "épargner", "économiser",
      "mensualité", "prélèvement", "prélèvements", "acompte", "caution", "crédit",
    ],
    soft: [
      "payer", "paiement", "régler", "acheter", "achat", "essence", "carburant",
      "courses", "resto", "restau", "restaurant", "cadeau", "cadeaux", "taxe",
      "électricité", "edf", "gaz", "internet", "forfait", "téléphone", "banque",
      "prêt", "ticket", "addition", "pourboire", "prix", "coûte", "coûter", "tarif",
      "devis", "euro", "euros", "balles", "prime", "paie", "revenu", "revenus",
      "retrait", "distributeur", "netflix", "spotify", "amazon",
    ],
  },
  // ── 🎉 Événements / activité / sortie ───────────────────────────────────
  {
    kind: "event",
    strong: [
      "soirée", "anniversaire", "anniv", "fête", "apéro", "apéritif", "evg", "evjf",
      "mariage", "crémaillère", "réservation", "réserver", "rendez-vous", "rdv",
      "concert", "festival", "spectacle", "vernissage", "baptême",
    ],
    soft: [
      "fêter", "dîner", "diner", "déjeuner", "brunch", "barbecue", "bbq",
      "pique-nique", "picnic", "ciné", "cinéma", "théâtre", "expo", "exposition",
      "musée", "sortie", "sortir", "réunion", "inviter", "invitation", "organiser",
      "prévoir", "planifier", "after", "clubbing", "bowling", "karaoké", "match",
      "balade", "randonnée", "rando", "visite", "atelier", "séance", "verre",
      "drink", "fiançailles", "gala", "soirée-jeux",
    ],
  },
  // ── 🧾 Listes / courses / à faire ───────────────────────────────────────
  {
    kind: "list",
    strong: [
      "liste", "courses", "checklist", "to-do", "todo", "à faire", "packing",
      "ne pas oublier",
    ],
    soft: [
      "penser à", "ramener", "valise", "à emporter", "à ramener", "tâches",
      "cocher", "fournitures", "matériel", "pharmacie", "droguerie", "papeterie",
      "pain", "lait", "oeufs", "œufs", "épicerie", "supermarché", "à prendre",
      "faire le plein", "préparer le sac",
    ],
  },
  // ── ✈️ Voyages ──────────────────────────────────────────────────────────
  {
    kind: "trip",
    strong: [
      "voyage", "vacances", "road trip", "roadtrip", "road-trip", "escapade",
      "séjour", "itinéraire", "croisière", "week-end à", "weekend à",
    ],
    soft: [
      "voyager", "trip", "hôtel", "hotel", "airbnb", "auberge", "gîte", "camping",
      "vol", "avion", "train", "billet", "billets", "destination", "partir",
      "visiter", "escale", "location de voiture", "passeport", "réserver un hôtel",
    ],
  },
  // ── 🍳 Recettes ─────────────────────────────────────────────────────────
  {
    kind: "recipe",
    strong: [
      "recette", "recettes", "ingrédients", "ingrédient", "marinade",
    ],
    soft: [
      "cuisine", "cuisiner", "plat", "gâteau", "gateau", "cuire", "cuisson",
      "mélanger", "préparation", "four", "pâte", "sauce", "dessert", "entrée",
      "portions", "fouetter", "mijoter", "éplucher", "assaisonner", "pour 4 personnes",
    ],
  },
  // ── 💡 Inspiration / à lire / liens ─────────────────────────────────────
  {
    kind: "inspiration",
    strong: [
      "inspiration", "moodboard", "à lire", "à regarder", "à voir",
    ],
    soft: [
      "idée déco", "déco", "article", "vidéo", "video", "youtube", "pinterest",
      "blog", "référence", "podcast", "playlist", "tendance", "tenue", "outfit",
      "tutoriel", "astuce",
    ],
  },
  // ── 🤝 Amis / relances ──────────────────────────────────────────────────
  {
    kind: "friend",
    strong: ["rappeler à", "relancer", "prendre des nouvelles"],
    soft: ["appeler", "contacter", "téléphoner", "copain", "copine", "amie"],
  },
  // ── 🗳️ Sondages ─────────────────────────────────────────────────────────
  {
    kind: "poll",
    strong: ["sondage", "à débattre"],
    soft: ["voter", "choisir entre", "on choisit", "plutôt", "option a", "option b"],
  },
];

// ── Méta par intention (libellé, icône, route, page préremplissable) ────────
const META: Record<
  IntentKind,
  { label: string; hint: string; icon: IconName; route: string; target?: ComposeTarget }
> = {
  finance: {
    label: "Ajouter au portefeuille",
    hint: "On dirait une dépense ou un revenu — ouvrir Mes finances ?",
    icon: "wallet",
    route: "/finances",
    target: "finance",
  },
  event: {
    label: "Planifier l'activité",
    hint: "Ça ressemble à une sortie — créer l'événement ?",
    icon: "confetti",
    route: "/evenements",
    target: "event",
  },
  list: {
    label: "Transformer en liste",
    hint: "Plein de choses à cocher — en faire une checklist ?",
    icon: "lists",
    route: "/listes",
    target: "list",
  },
  trip: {
    label: "Préparer le voyage",
    hint: "Une escapade en vue — ouvrir Voyages ?",
    icon: "trips",
    route: "/voyages",
    target: "trip",
  },
  recipe: {
    label: "Enregistrer la recette",
    hint: "Une recette à garder — ouvrir Recettes ?",
    icon: "recipes",
    route: "/recettes",
  },
  inspiration: {
    label: "Garder l'inspiration",
    hint: "À garder sous le coude — ouvrir Inspiration ?",
    icon: "inspiration",
    route: "/inspiration",
  },
  friend: {
    label: "Voir mes amis",
    hint: "Quelqu'un à recontacter — ouvrir Amis ?",
    icon: "friends",
    route: "/amis",
  },
  poll: {
    label: "Lancer un sondage",
    hint: "Un choix à trancher à plusieurs — créer un sondage ?",
    icon: "polls",
    route: "/amis",
  },
};

// ── Extracteurs d'entités ───────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10,
  décembre: 11, decembre: 11,
};
const WEEKDAYS: Record<string, number> = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
};

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Renvoie un montant détecté (nombre) ou null. */
export function extractAmount(text: string): number | null {
  const m =
    text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euros?|balles?)/i) ||
    text.match(/(?:€|eur)\s*(\d+(?:[.,]\d{1,2})?)/i);
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

/** Renvoie une heure « HH:MM » détectée ou null. */
export function extractTime(text: string): string | null {
  const m = text.match(/\b(\d{1,2})\s*[h:]\s*(\d{2})?\b/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

/** Tente d'extraire une date (ISO) à partir d'expressions FR. */
export function extractDate(text: string, today = new Date()): string | null {
  const t = text.toLowerCase();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (/\baujourd['’]?hui\b/.test(t)) return toISO(base);
  if (/\bapr[èe]s-?demain\b/.test(t)) {
    base.setDate(base.getDate() + 2);
    return toISO(base);
  }
  if (/\bdemain\b/.test(t)) {
    base.setDate(base.getDate() + 1);
    return toISO(base);
  }
  // « ce week-end » / « ce weekend » → prochain samedi.
  if (/\bce\s+week-?end\b/.test(t)) {
    const delta = (6 - base.getDay() + 7) % 7 || 7;
    base.setDate(base.getDate() + delta);
    return toISO(base);
  }
  // Jour de la semaine nommé → prochaine occurrence.
  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      const delta = (dow - base.getDay() + 7) % 7 || 7;
      base.setDate(base.getDate() + delta);
      return toISO(base);
    }
  }
  // « 12 juin », « 3 mars 2026 ».
  const named = t.match(
    /\b(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(?:\s+(\d{4}))?/,
  );
  if (named) {
    const day = Number(named[1]);
    const month = MONTHS[named[2]];
    let year = named[3] ? Number(named[3]) : today.getFullYear();
    const d = new Date(year, month, day);
    if (!named[3] && d < base) year += 1;
    return toISO(new Date(year, month, day));
  }
  // « 12/06 », « 12/06/2025 », « 12-06-2025 ».
  const numeric = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    let year = numeric[3] ? Number(numeric[3]) : today.getFullYear();
    if (year < 100) year += 2000;
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    const d = new Date(year, month, day);
    if (!numeric[3] && d < base) return toISO(new Date(year + 1, month, day));
    return toISO(d);
  }
  return null;
}

/** Premier lien http(s) trouvé, ou null. */
export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s)]+/i);
  return m ? m[0] : null;
}

/** Lieu (« à Rome », « au Cap Ferret »…) ou null. */
export function extractPlace(text: string): string | null {
  const m = text.match(
    /(?:^|[^\p{L}])(?:à|au|aux|en|vers)\s+(\p{Lu}[\p{L}'’-]+(?:[ -]\p{Lu}[\p{L}'’-]+)?)/u,
  );
  return m ? m[1].trim() : null;
}

/** Heuristique « ça ressemble à une liste d'items ». */
export function looksLikeList(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const bulletLines = lines.filter((l) => /^([-*•·–]|\d+[.)]|\[ ?\])\s+/.test(l)).length;
  if (bulletLines >= 2) return true;
  if (lines.length >= 3) return true;
  // « pain, lait, œufs, beurre » : énumération sur une ligne.
  const firstLine = lines[0] ?? "";
  if ((firstLine.match(/,/g)?.length ?? 0) >= 2) return true;
  return false;
}

// ── Utilitaires de titre ────────────────────────────────────────────────────
function firstLine(text: string): string {
  const l = text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? "";
  return l.replace(/^([-*•·–]|\d+[.)]|\[ ?\])\s+/, "");
}
function shortTitle(note: NoteLike): string {
  const raw = (note.title?.trim() || firstLine(note.body ?? "")).trim();
  return raw.length > 70 ? raw.slice(0, 67).trimEnd() + "…" : raw;
}

function mapEventKind(t: string): string {
  if (/\banniv/.test(t)) return "birthday";
  if (/\bmariage\b/.test(t)) return "wedding";
  if (/\bevjf\b/.test(t)) return "evjf";
  if (/\bevg\b/.test(t)) return "evg";
  if (/\bap[ée]ro|ap[ée]ritif\b/.test(t)) return "aperitif";
  if (/\bd[îi]ner|d[ée]jeuner|brunch|repas\b/.test(t)) return "dinner";
  if (/\bweek-?end\b/.test(t)) return "weekend";
  return "party";
}

function isIncome(t: string): boolean {
  return /\b(salaire|paie|prime|revenu|revenus|remboursement|remboursé|virement re[çc]u|encaiss)/.test(t);
}

// ── Construction des charges de pré-remplissage ─────────────────────────────
function buildPrefill(
  kind: IntentKind,
  note: NoteLike,
  haystack: string,
  ents: { amount: number | null; date: string | null; time: string | null; place: string | null },
): Record<string, unknown> | undefined {
  const title = shortTitle(note);
  switch (kind) {
    case "event":
      return {
        title,
        kind: mapEventKind(haystack),
        start_date: ents.date ?? "",
        start_time: ents.time ?? "",
        location: ents.place ?? "",
        description: note.body?.trim() ?? "",
      };
    case "finance":
      return {
        type: isIncome(haystack) ? "income" : "expense",
        amount: ents.amount != null ? String(ents.amount) : "",
        payee: title,
        note: note.body?.trim() ?? note.title?.trim() ?? "",
      };
    case "list":
      return {
        title: title || "Ma liste",
        kind: "checklist",
        emoji: /\bcourse|épicerie|supermarch|pain|lait|œuf|oeuf/.test(haystack)
          ? "🛒"
          : /\bvalise|packing|emporter|voyage/.test(haystack)
            ? "🧳"
            : "✅",
      };
    case "trip":
      return {
        title: title || ents.place || "Mon voyage",
        destination: ents.place ?? "",
        start_date: ents.date ?? "",
      };
    default:
      return undefined;
  }
}

// ── Analyse principale ──────────────────────────────────────────────────────
export function analyzeNote(note: NoteLike): NoteSuggestion[] {
  const title = (note.title ?? "").trim();
  const body = (note.body ?? "").trim();
  if (!title && !body) return [];
  const haystack = `${title}\n${body}`.toLowerCase();

  // Entités (calculées une fois).
  const ents = {
    amount: extractAmount(haystack),
    date: extractDate(haystack),
    time: extractTime(haystack),
    place: extractPlace(`${title}\n${body}`),
  };
  const url = extractUrl(haystack);
  const listish = looksLikeList(body || title);

  // Score par intention.
  const scores = new Map<IntentKind, { score: number; matched: string[] }>();
  const bump = (kind: IntentKind, by: number, label: string) => {
    const cur = scores.get(kind) ?? { score: 0, matched: [] };
    cur.score += by;
    if (label && !cur.matched.includes(label)) cur.matched.push(label);
    scores.set(kind, cur);
  };

  for (const g of GROUPS) {
    for (const term of g.strong) if (haystack.includes(term)) bump(g.kind, 2, term);
    for (const term of g.soft) if (haystack.includes(term)) bump(g.kind, 1, term);
  }

  // Bonus d'entités (rendent une intention plus crédible).
  if (ents.amount != null) bump("finance", 3, `${ents.amount} €`);
  if (ents.date) {
    bump("event", 2, "date");
    bump("trip", 1, "date");
  }
  if (ents.time) bump("event", 1, "heure");
  if (ents.place) bump("trip", 1, ents.place);
  if (url) bump("inspiration", 2, "lien");
  if (listish) bump("list", 2, "énumération");

  const THRESHOLD = 2;
  const out: NoteSuggestion[] = [];
  for (const [kind, { score, matched }] of scores) {
    if (score < THRESHOLD) continue;
    const meta = META[kind];
    const prefill = buildPrefill(kind, note, haystack, ents);
    out.push({
      kind,
      label: meta.label,
      hint: meta.hint,
      icon: meta.icon,
      route: meta.route,
      target: meta.target,
      prefill,
      score,
      matched,
    });
  }

  // Tri par score décroissant, puis on garde les 3 plus pertinentes.
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 3);
}

/** Nombre total de déclencheurs (mots-clés) reconnus — pour info/diagnostic. */
export const TRIGGER_COUNT = GROUPS.reduce((n, g) => n + g.strong.length + g.soft.length, 0);
