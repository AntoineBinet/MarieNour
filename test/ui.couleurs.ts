// Lecteur de jetons de couleur de src/styles.css, pour vérifier les contrastes.
//
// Ce n'est pas un moteur CSS : il ne connaît que les règles posées sur <html>
// (`:root`, `html`, `[data-x="y"]`, `:not([data-x])`), ce qui suffit pour les
// jetons (`--bg`, `--muted`, `--accent-strong`…). Il résout `var()`,
// `color-mix(in srgb, …)` et la syntaxe de couleur relative
// `oklch(from <couleur> min(l, N) c h)` utilisée pour l'accent personnalisé.
// Pur (aucun DOM) : exécuté par vitest ET par `node --experimental-strip-types`
// pour produire le tableau des contrastes du rapport.

export type RGBA = { r: number; g: number; b: number; a: number }; // 0..1

/* ── Couleurs ───────────────────────────────────────────────────────────── */
export function hex(s: string): RGBA {
  let h = s.trim().replace(/^#/, "");
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) throw new Error(`couleur illisible : ${s}`);
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
}
export function toHex(c: RGBA): string {
  const f = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${f(c.r)}${f(c.g)}${f(c.b)}`;
}
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const delin = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
export function luminance(c: RGBA): number {
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}
/** Rapport de contraste WCAG 2.x (couleurs opaques). */
export function contrast(a: RGBA, b: RGBA): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** Pose `top` (éventuellement translucide) sur `bottom` (opaque). */
export function over(top: RGBA, bottom: RGBA): RGBA {
  const a = top.a;
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}
/** color-mix(in srgb, A p1, B p2) : alpha prémultiplié, comme le navigateur. */
export function mix(a: RGBA, p1: number, b: RGBA, p2: number): RGBA {
  let s = p1 + p2;
  let mult = 1;
  if (s < 1) mult = s;
  if (s === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const q1 = p1 / s;
  const q2 = p2 / s;
  const alpha = a.a * q1 + b.a * q2;
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const ch = (k: "r" | "g" | "b") => (a[k] * a.a * q1 + b[k] * b.a * q2) / alpha;
  return { r: ch("r"), g: ch("g"), b: ch("b"), a: alpha * mult };
}

/* ── OKLCH (couleur relative de l'accent personnalisé) ──────────────────── */
function toOklab(c: RGBA): [number, number, number] {
  const r = lin(c.r), g = lin(c.g), b = lin(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromOklabLinear(L: number, A: number, B: number): [number, number, number] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
export function oklch(c: RGBA): { l: number; c: number; h: number } {
  const [L, A, B] = toOklab(c);
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
}
/** OKLCH → sRGB avec réduction de chroma tant que la couleur sort du gamut
 *  (ce que fait le navigateur, CSS Color 4 : la clarté est conservée). */
export function fromOklch(l: number, c: number, h: number): RGBA {
  const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  let lo = 0;
  let hi = c;
  let rgb = fromOklabLinear(l, c * Math.cos(h), c * Math.sin(h));
  if (!inGamut(rgb)) {
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const t = fromOklabLinear(l, mid * Math.cos(h), mid * Math.sin(h));
      if (inGamut(t)) lo = mid;
      else hi = mid;
    }
    rgb = fromOklabLinear(l, lo * Math.cos(h), lo * Math.sin(h));
  }
  const cl = (v: number) => delin(Math.min(1, Math.max(0, v)));
  return { r: cl(rgb[0]), g: cl(rgb[1]), b: cl(rgb[2]), a: 1 };
}

/* ── Lecture de la feuille ──────────────────────────────────────────────── */
export interface Regle {
  selecteur: string;
  contexte: string[]; // @media / @supports englobants (texte brut)
  decl: Record<string, string>; // propriétés personnalisées seulement
  ordre: number;
}

export function lireRegles(css: string): Regle[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Regle[] = [];
  let ordre = 0;
  const parse = (txt: string, ctx: string[]) => {
    let i = 0;
    while (i < txt.length) {
      const open = txt.indexOf("{", i);
      if (open < 0) break;
      const prelude = txt.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < txt.length && depth > 0) {
        if (txt[j] === "{") depth++;
        else if (txt[j] === "}") depth--;
        j++;
      }
      const body = txt.slice(open + 1, j - 1);
      i = j;
      // Déclarations sans bloc avant le prélude (ex. « @import …; ») : on saute.
      const pre = prelude.includes(";") ? prelude.slice(prelude.lastIndexOf(";") + 1).trim() : prelude;
      if (pre.startsWith("@media") || pre.startsWith("@supports")) {
        parse(body, [...ctx, pre]);
      } else if (pre.startsWith("@")) {
        continue; // @keyframes, @font-face…
      } else {
        const decl: Record<string, string> = {};
        for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) decl[m[1]] = m[2].trim();
        if (Object.keys(decl).length) out.push({ selecteur: pre, contexte: ctx, decl, ordre: ordre++ });
      }
    }
  };
  parse(src, []);
  return out;
}

export interface Etat {
  theme: "light" | "dark" | null; // null = avant theme.ts (aucun data-theme)
  accent?: string; // preset (terracotta = pas de règle dédiée) ou "custom"
  accentCustom?: string; // couleur libre posée en ligne sur <html>
  design?: "graphite" | "editorial";
  contrast?: boolean;
  motion?: "off" | "on";
  bg?: "plain" | "warm" | "cool" | "dawn" | "mesh"; // ambiance de fond (data-bg)
  osDark?: boolean; // prefers-color-scheme: dark
  relative?: boolean; // le navigateur comprend oklch(from …)
}

function attrs(e: Etat): Record<string, string> {
  const a: Record<string, string> = {};
  if (e.theme) a["data-theme"] = e.theme;
  a["data-accent"] = e.accent ?? "terracotta";
  if (e.design) a["data-design"] = e.design;
  if (e.contrast) a["data-contrast"] = "high";
  if (e.motion) a["data-motion"] = e.motion;
  if (e.bg) a["data-bg"] = e.bg;
  return a;
}

/** Spécificité (b, c) d'un sélecteur composé portant sur <html>, ou null s'il
 *  vise autre chose (descendant, classe…). */
function specHtml(sel: string, at: Record<string, string>): [number, number] | null | false {
  let s = sel.trim();
  let b = 0;
  let c = 0;
  let ok = true;
  const atom = (t: string): boolean => {
    let m: RegExpMatchArray | null;
    if ((m = /^\[([\w-]+)(?:="([^"]*)")?\]/.exec(t))) {
      b++;
      return m[2] === undefined ? m[1] in at : at[m[1]] === m[2];
    }
    throw new Error("atome");
  };
  while (s.length) {
    let m: RegExpMatchArray | null;
    if ((m = /^:root/.exec(s))) {
      b++;
      s = s.slice(m[0].length);
    } else if ((m = /^html/.exec(s))) {
      c++;
      s = s.slice(m[0].length);
    } else if ((m = /^:not\((\[[^\]]+\])\)/.exec(s))) {
      try {
        if (atom(m[1])) ok = false;
      } catch {
        return null;
      }
      s = s.slice(m[0].length);
    } else if ((m = /^\[[^\]]+\]/.exec(s))) {
      if (!atom(m[0])) ok = false;
      s = s.slice(m[0].length);
    } else return null;
  }
  return ok ? [b, c] : false;
}

function contexteActif(ctx: string[], e: Etat): boolean {
  return ctx.every((c) => {
    const t = c.replace(/\s+/g, " ");
    if (/prefers-color-scheme: dark/.test(t)) return !!e.osDark;
    if (/prefers-color-scheme: light/.test(t)) return !e.osDark;
    if (/oklch\(from/.test(t)) return !!e.relative;
    return false; // autres médias (largeur, survol…) : pas de jetons de couleur
  });
}

/** Valeurs brutes des propriétés personnalisées pour un état donné. */
export function jetons(regles: Regle[], e: Etat): Record<string, string> {
  const at = attrs(e);
  const actifs: { spec: [number, number]; ordre: number; decl: Record<string, string> }[] = [];
  for (const r of regles) {
    if (!contexteActif(r.contexte, e)) continue;
    let best: [number, number] | null = null;
    for (const part of r.selecteur.split(",")) {
      const sp = specHtml(part, at);
      if (sp && (!best || sp[0] > best[0] || (sp[0] === best[0] && sp[1] > best[1]))) best = sp;
    }
    if (best) actifs.push({ spec: best, ordre: r.ordre, decl: r.decl });
  }
  actifs.sort((x, y) => x.spec[0] - y.spec[0] || x.spec[1] - y.spec[1] || x.ordre - y.ordre);
  const out: Record<string, string> = {};
  for (const a of actifs) Object.assign(out, a.decl);
  if (e.accent === "custom" && e.accentCustom) out["--accent"] = e.accentCustom; // style en ligne
  return out;
}

/* ── Évaluation d'une valeur de couleur ─────────────────────────────────── */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function couleur(valeur: string, tok: Record<string, string>, pile: string[] = []): RGBA {
  const v = valeur.trim();
  let m: RegExpMatchArray | null;
  if (/^#[0-9a-f]+$/i.test(v)) return hex(v);
  if (v === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (v === "white") return hex("#fff");
  if (v === "black") return hex("#000");
  if ((m = /^rgba?\(([^)]+)\)$/.exec(v))) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p[3] ?? 1 };
  }
  if ((m = /^var\((--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(v))) {
    const nom = m[1];
    if (pile.includes(nom)) throw new Error(`cycle ${pile.join(" > ")} > ${nom}`);
    if (nom in tok) return couleur(tok[nom], tok, [...pile, nom]);
    if (m[2]) return couleur(m[2], tok, pile);
    throw new Error(`jeton non défini : ${nom}`);
  }
  if ((m = /^color-mix\(\s*in srgb\s*,([\s\S]+)\)$/.exec(v))) {
    const [a, b] = splitArgs(m[1]);
    const pa = /^([\s\S]+?)\s+([\d.]+)%$/.exec(a);
    const pb = /^([\s\S]+?)\s+([\d.]+)%$/.exec(b);
    const ca = couleur(pa ? pa[1] : a, tok, pile);
    const cb = couleur(pb ? pb[1] : b, tok, pile);
    let p1 = pa ? +pa[2] / 100 : NaN;
    let p2 = pb ? +pb[2] / 100 : NaN;
    if (isNaN(p1) && isNaN(p2)) p1 = p2 = 0.5;
    else if (isNaN(p1)) p1 = 1 - p2;
    else if (isNaN(p2)) p2 = 1 - p1;
    return mix(ca, p1, cb, p2);
  }
  if ((m = /^oklch\(\s*from\s+([\s\S]+?)\s+((?:min|max)\(\s*l\s*,\s*[\d.]+\s*\)|l)\s+c\s+h\s*\)$/.exec(v))) {
    const base = couleur(m[1], tok, pile);
    const o = oklch(base);
    let l = o.l;
    const f = /^(min|max)\(\s*l\s*,\s*([\d.]+)\s*\)$/.exec(m[2]);
    if (f) l = f[1] === "min" ? Math.min(l, +f[2]) : Math.max(l, +f[2]);
    return fromOklch(l, o.c, o.h);
  }
  throw new Error(`valeur non gérée : ${v}`);
}

/** Jeton résolu en couleur. */
export function jeton(tok: Record<string, string>, nom: string): RGBA {
  if (!(nom in tok)) throw new Error(`jeton absent : ${nom}`);
  return couleur(tok[nom], tok, [nom]);
}

/* ── Matrice des états à vérifier ───────────────────────────────────────── */
export const ACCENTS = [
  "terracotta", "plum", "sage", "ocean", "berry", "rose", "amber", "teal", "indigo", "forest", "coral", "slate",
];
/** Couleurs libres « au pire raisonnable » : les teintes vives du sélecteur
 *  (dégradé conique de Personnalisation), le jaune, le cyan, le blanc et le noir. */
export const CUSTOMS = [
  "#e35d5b", "#f3c14a", "#58c46c", "#4aa3e3", "#9a6ae0", "#ffcc00", "#00ffff", "#ffffff", "#000000",
  "#ff2d55", "#2b7a3d", "#888888", "#c8694b",
];
export const DESIGNS: (undefined | "graphite" | "editorial")[] = [undefined, "graphite", "editorial"];
export const THEMES: ("light" | "dark")[] = ["light", "dark"];

export const AMBIANCES: (undefined | "plain" | "warm" | "cool" | "dawn" | "mesh")[] = [
  undefined, "plain", "warm", "cool", "dawn", "mesh",
];

/** Fonds sur lesquels du texte de page peut se poser directement : le fond de
 *  l'app et ses surfaces, plus, sous une ambiance [data-bg], le point le plus
 *  chargé de chaque dégradé. Les taches de « mesh » ne se recouvrent pas
 *  (centres aux quatre coins, transparentes à 70 % de leur rayon) : chacune
 *  est prise seule. */
export function fondsDePage(tok: Record<string, string>, ambiance?: string): Record<string, RGBA> {
  const c = (n: string) => jeton(tok, n);
  const bg = c("--bg");
  const bg2 = c("--bg-2");
  const t = (col: RGBA, p: number): RGBA => ({ ...col, a: p });
  const out: Record<string, RGBA> = { "bg": bg, "bg-2": bg2, "surface": c("--surface"), "surface-2": c("--surface-2") };
  if (ambiance === "warm") out["warm"] = over(t(c("--accent"), 0.14), bg2);
  if (ambiance === "cool") out["cool"] = over(t(c("--sky"), 0.6), bg2);
  if (ambiance === "dawn") {
    out["dawn-accent"] = mix(c("--accent"), 0.12, bg, 0.88);
    out["dawn-blush"] = mix(c("--blush"), 0.5, bg, 0.5);
  }
  if (ambiance === "mesh") {
    out["mesh-accent"] = over(t(c("--accent"), 0.18), bg);
    out["mesh-sky"] = over(t(c("--sky"), 0.55), bg);
    out["mesh-lilac"] = over(t(c("--lilac"), 0.55), bg);
    out["mesh-butter"] = over(t(c("--butter"), 0.55), bg);
  }
  return out;
}
