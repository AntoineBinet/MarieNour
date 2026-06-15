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

export const VISIBILITIES = ["private", "friends", "public"] as const;
export function cleanVisibility(v: unknown): "private" | "friends" | "public" {
  return VISIBILITIES.includes(v as never) ? (v as "private") : "private";
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
