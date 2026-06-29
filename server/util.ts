// Petits utilitaires partagés côté serveur.

export function uid(): string {
  return crypto.randomUUID();
}

export function now(): number {
  return Date.now();
}

/** Parse une colonne JSON stockée en TEXT, avec valeur de repli. */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const VISIBILITIES = ["private", "friends", "public", "shared"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export function cleanVisibility(v: unknown): Visibility {
  return VISIBILITIES.includes(v as never) ? (v as Visibility) : "private";
}

/** Normalise une liste d'ids d'amis avec qui partager (déduplique, borne, ignore
 *  le vide). Renvoie `null` si l'entrée n'est pas un tableau (= « ne pas toucher »). */
export function cleanSharedWith(v: unknown, max = 200): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    const id = str(raw, 60).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/** Tronque/normalise une chaîne entrante. */
export function str(v: unknown, max = 5000): string {
  if (v == null) return "";
  return String(v).slice(0, max);
}

export function bool(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

export function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Builder de mise à jour partielle (UPDATE … SET). Remplace le couple
 *  `fields: string[]` / `values: unknown[]` réécrit dans une douzaine de routes.
 *  L'appelant calcule la valeur ; le builder accumule colonne + valeur dans
 *  l'ordre d'appel (donc l'ordre des binds est préservé). Les binds du WHERE se
 *  passent APRÈS : `.bind(...p.values(), id, me)`. */
export class PatchSet {
  private cols: string[] = [];
  private vals: unknown[] = [];

  /** Ajoute « col = ? » avec sa valeur. */
  set(col: string, value: unknown): this {
    this.cols.push(`${col} = ?`);
    this.vals.push(value);
    return this;
  }

  /** Ajoute « col = ? » seulement si `value !== undefined` (champ absent du corps). */
  setIf(col: string, value: unknown): this {
    if (value !== undefined) this.set(col, value);
    return this;
  }

  /** Aucun champ à mettre à jour ? */
  get empty(): boolean {
    return this.cols.length === 0;
  }

  /** Nombre de colonnes posées. */
  get size(): number {
    return this.cols.length;
  }

  /** Fragment SQL « col1 = ?, col2 = ? ». */
  clause(): string {
    return this.cols.join(", ");
  }

  /** Valeurs des colonnes, dans l'ordre des `set` (à étaler avant les binds du WHERE). */
  values(): unknown[] {
    return this.vals;
  }
}

/* ── Sécurité des médias (uploads & service binaire) ─────────────────────────
 * Empêche le « XSS stocké via fichier » : un fichier uploadé puis servi depuis
 * l'origine du site avec un Content-Type exécutable (text/html, image/svg+xml)
 * s'exécuterait dans le contexte de marienour.work. On filtre à l'upload ET au
 * service. Logique pure (aucune API runtime) → vaut pour les deux runtimes. */

const MEDIA_TYPE_RE = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/;

/** Normalise un Content-Type entrant : minuscules, sans paramètres, validé. */
function normMime(v: unknown): string {
  const s = str(v, 120).toLowerCase().split(";")[0].trim();
  return MEDIA_TYPE_RE.test(s) ? s : "";
}

/** Un upload « image » est-il acceptable ? (type vide toléré : certains
 *  navigateurs ne le renseignent pas — on ne bloque que les types EXPLICITEMENT
 *  non-image, comme le fait déjà l'avatar). */
export function isImageUpload(type: unknown): boolean {
  const v = normMime(type);
  return v === "" || v.startsWith("image/");
}

/** Un upload « image ou vidéo » est-il acceptable ? (idem, type vide toléré). */
export function isImageOrVideoUpload(type: unknown): boolean {
  const v = normMime(type);
  return v === "" || v.startsWith("image/") || v.startsWith("video/");
}

/** Content-Type SÛR à renvoyer « inline ». Seuls image/* (hors SVG), video/* et
 *  audio/* sont servis tels quels ; tout le reste (HTML, SVG, inconnu…) devient
 *  application/octet-stream (téléchargé, jamais interprété par le navigateur). */
export function safeServedContentType(ct: unknown): string {
  const v = normMime(ct);
  if (!v || v === "image/svg+xml") return "application/octet-stream";
  if (v.startsWith("image/") || v.startsWith("video/") || v.startsWith("audio/")) return v;
  return "application/octet-stream";
}

/** Bloque (best-effort, sans DNS — compatible Workers) les hôtes qui pointent
 *  vers le réseau interne / métadonnées cloud, pour limiter la SSRF sur les
 *  aperçus de lien. Ne couvre pas le DNS-rebinding (hôte public résolvant en IP
 *  privée), mais arrête les cas directs (IP littérale privée, localhost, .local,
 *  endpoint de métadonnées 169.254.169.254). */
export function isBlockedPreviewHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (!h || h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h === "metadata") return true;

  // IPv4 littérale ?
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const o = m.slice(1).map(Number);
    if (o.some((n) => n > 255)) return true;
    const [a, b] = o;
    if (a === 0 || a === 127 || a === 10) return true; // this-host, loopback, privé
    if (a === 169 && b === 254) return true; // link-local + métadonnées cloud
    if (a === 192 && b === 168) return true; // privé
    if (a === 172 && b >= 16 && b <= 31) return true; // privé
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }

  // IPv6 littérale ? (loopback, ULA fc00::/7, link-local fe80::/10, v4-mapped)
  if (h.includes(":")) {
    const x = h.replace(/^\[|\]$/g, "");
    if (x === "::1" || x === "::") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(x)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(x)) return true;
    if (x.startsWith("::ffff:")) return true;
  }
  return false;
}

/** Génère un handle simple à partir d'un nom/email. */
export function slugifyHandle(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 20) || "user"
  );
}
