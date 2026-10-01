/* MarieNour · src/fx/core.ts : le cœur de la couche d'effets.
   --------------------------------------------------------------------------
   Porté de Vinyles (anim.js, vol.js, feuille.js, flux.js, scene.js,
   vivant.js) et adapté à React. Ce fichier est PUR AU CHARGEMENT : aucun
   accès à `window` ni à `document` au niveau du module, seulement dans les
   fonctions. Il s'importe donc sous vitest (environnement node) pour tester
   le ressort, les clés d'images et les petits calculs.

   Les règles qui portent toute la couche (contrat docs/DESIGN-FX.md §3) :

   1. UN SEUL ARBITRE DU MOUVEMENT. `reduit()` est relu à CHAQUE geste :
      `html[data-motion="off"]` dit oui, `html[data-motion="on"]` dit non,
      sinon c'est l'appareil (`prefers-reduced-motion`). Aucun module ne lit
      le média lui-même (sauf scene, qui veut savoir ce que demande
      l'appareil pour proposer « Toujours »).
   2. RIEN N'EST TENU À LA FIN. Une animation WAAPI ne garde jamais
      `fill: forwards` ni `both` : elle finit sur l'état que la feuille de
      style donne déjà, puis elle est ANNULÉE pour sortir de
      `document.getAnimations()` (c'est ce que les tests attendent).
   3. LE GESTE D'ABORD. Aucune action n'attend une animation : on ne fait
      jamais `await` sur une animation.
   4. CE QUE FX PEUT ÉCRIRE. Des animations, des éléments qu'il crée, des
      nœuds que React a DÉJÀ retirés (fantômes), des `data-fx-*` et des
      `--fx-*` sur des nœuds React. Jamais `classList` ni `style.transform`
      sur un nœud dont React calcule la classe ou le style.
   5. UNE LECTURE DE GÉOMÉTRIE PAR GESTE, jamais dans une boucle. */

/* ── 1 · Le vocabulaire ─────────────────────────────────────────────────── */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Les durées (ms) relues des jetons `--fx-dur-*` de fx.css ; ces valeurs
 *  sont les replis (sous node, ou si la feuille n'est pas chargée). */
export const DUR: { xs: number; s: number; m: number; l: number } = { xs: 160, s: 260, m: 420, l: 700 };

/** Les courbes relues des jetons `--fx-ease-*`. `spring` vaut ici le repli
 *  sans `linear()` : la feuille pose la vraie courbe de ressort là où le
 *  navigateur la connaît. */
export const EASE: { out: string; inOut: string; spring: string } = {
  out: "cubic-bezier(.2, .7, .2, 1)",
  inOut: "cubic-bezier(.65, 0, .35, 1)",
  spring: "cubic-bezier(.34, 1.3, .64, 1)",
};

let jetonsLus = false;

/** Relit UNE fois les jetons de fx.css (une seule lecture de style
 *  calculé). Sans document ou sans feuille, les replis restent. */
export function lireJetons(): void {
  if (jetonsLus || typeof document === "undefined" || typeof getComputedStyle !== "function") return;
  try {
    const cs = getComputedStyle(document.documentElement);
    const dur = (nom: string) => parseFloat(cs.getPropertyValue(nom));
    const lus = { xs: dur("--fx-dur-xs"), s: dur("--fx-dur-s"), m: dur("--fx-dur-m"), l: dur("--fx-dur-l") };
    // Rien de lu : la feuille n'est pas encore là, on réessaiera.
    if (!(lus.m > 0)) return;
    (Object.keys(lus) as Array<keyof typeof lus>).forEach((k) => {
      if (lus[k] > 0) DUR[k] = lus[k];
    });
    const out = cs.getPropertyValue("--fx-ease-out").trim();
    const inOut = cs.getPropertyValue("--fx-ease-in-out").trim();
    const spring = cs.getPropertyValue("--fx-ease-spring").trim();
    if (out) EASE.out = out;
    if (inOut) EASE.inOut = inOut;
    if (spring) EASE.spring = spring;
    jetonsLus = true;
  } catch {
    /* sans feuille : les replis */
  }
}

export function maintenant(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

/* ── 2 · L'arbitre du mouvement ─────────────────────────────────────────── */

/** Vrai quand rien ne doit bouger. Relu à chaque geste : le réglage peut
 *  changer pendant la séance. Sans document (tests sous node), rien ne bouge. */
export function reduit(): boolean {
  if (typeof document === "undefined" || !document.documentElement) return true;
  const m = document.documentElement.getAttribute("data-motion");
  if (m === "off") return true;
  if (m === "on") return false;
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Vrai quand on peut animer cet élément maintenant. */
export function peut(el: Element | null | undefined): el is Element {
  return !!el && typeof (el as Element).animate === "function" && !reduit();
}

/* ── 3 · Le ressort ─────────────────────────────────────────────────────── */

export interface PasRessort {
  offset: number;
  valeur: number;
}
export interface Ressort {
  duree: number;
  pas: PasRessort[];
}
export interface OptionsRessort {
  /** Raideur (masse 1). 170 par défaut. */
  raideur?: number;
  /** Amortissement (0..1, borné à .999). .72 par défaut : environ 4 % de dépassement. */
  zeta?: number;
  /** Nombre d'intervalles : `pas + 1` images clés. 40 par défaut. */
  pas?: number;
  /** Durée imposée (ms) ; sinon calculée sur l'enveloppe de l'amortissement. */
  duree?: number;
  /** Vitesse de départ (unités par milliseconde), pour un geste lâché. */
  vitesse?: number;
}

/**
 * Un oscillateur amorti (masse 1) échantillonné en images clés : la position
 * part de `depuis` (avec la vitesse `vitesse`, unités par ms) et se pose sur
 * `vers`. La DERNIÈRE image clé est exactement la cible. Sans vitesse, c'est
 * le ressort d'anim.js de Vinyles ; avec, celui de feuille.js pour un geste
 * lâché. Le navigateur interpole entre les pas (`easing: "linear"`).
 */
export function ressort(depuis: number, vers: number, o: OptionsRessort = {}): Ressort {
  const k = o.raideur && o.raideur > 0 ? o.raideur : 170;
  const z = Math.min(Math.max(o.zeta && o.zeta > 0 ? o.zeta : 0.72, 0.05), 0.999);
  const n = Math.max(2, Math.round(o.pas && o.pas > 0 ? o.pas : 40));
  const w0 = Math.sqrt(k);
  const wd = w0 * Math.sqrt(1 - z * z);
  const duree = o.duree && o.duree > 0 ? Math.round(o.duree) : Math.round(1000 * (4.6 / (z * w0)) * 0.9);
  const x0 = depuis - vers;
  const b = ((o.vitesse ?? 0) * 1000 + z * w0 * x0) / wd;
  const pas: PasRessort[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * (duree / 1000);
    const x = i === n ? 0 : Math.exp(-z * w0 * t) * (x0 * Math.cos(wd * t) + b * Math.sin(wd * t));
    pas.push({ offset: i / n, valeur: vers + x });
  }
  return { duree, pas };
}

/** La valeur d'un ressort échantillonné à une progression (0..1) : pour
 *  reprendre un mouvement interrompu là où il en est, sans saut. */
export function valeurA(pas: PasRessort[], progression: number): number {
  if (!pas || !pas.length) return 0;
  const o = Number.isFinite(progression) ? Math.min(1, Math.max(0, progression)) : 1;
  if (o <= pas[0].offset) return pas[0].valeur;
  for (let i = 1; i < pas.length; i++) {
    if (pas[i].offset >= o) {
      const a = pas[i - 1];
      const b = pas[i];
      const f = (o - a.offset) / Math.max(1e-9, b.offset - a.offset);
      return a.valeur + (b.valeur - a.valeur) * f;
    }
  }
  return pas[pas.length - 1].valeur;
}

/** Où en est une animation (0..1), 1 si on ne sait pas. */
export function progressionDe(a: Animation | null | undefined): number {
  if (!a) return 1;
  try {
    const t = Number(a.currentTime ?? 0);
    const d = Number(a.effect?.getComputedTiming().duration ?? 0);
    return d > 0 ? Math.min(1, Math.max(0, t / d)) : 1;
  } catch {
    return 1;
  }
}

/* ── 4 · Jouer sans rien tenir ──────────────────────────────────────────── */

type Cles = Keyframe[] | PropertyIndexedKeyframes;

/** Une animation qui ne tient rien à la fin (`fill` forcé à `none`, ou
 *  `backwards` pour un départ différé) et appelle `fin` UNE fois, qu'elle
 *  finisse (`true`) ou qu'on l'annule (`false`). Quand on ne peut pas animer
 *  (moins de mouvement, élément absent), `fin(false)` est appelée tout de
 *  suite et la fonction rend `null` : l'état final est déjà là. */
export function lancer(
  el: Element | null | undefined,
  kf: Cles,
  opts: KeyframeAnimationOptions = {},
  fin?: (fini: boolean) => void,
): Animation | null {
  let fait = false;
  const finir = (ok: boolean) => {
    if (fait) return;
    fait = true;
    if (fin) {
      try {
        fin(ok);
      } catch {
        /* un rappel qui lève ne casse pas l'animation */
      }
    }
  };
  if (!peut(el)) {
    finir(false);
    return null;
  }
  lireJetons();
  let a: Animation;
  try {
    a = el.animate(kf, { ...opts, fill: opts.fill === "backwards" ? "backwards" : "none" });
  } catch {
    finir(false);
    return null;
  }
  a.addEventListener("finish", () => {
    finir(true);
    // Annulée à la fin : elle sort de getAnimations() et ne tient rien.
    try {
      a.cancel();
    } catch {
      /* rien */
    }
  });
  a.addEventListener("cancel", () => finir(false));
  return a;
}

/** `lancer` sans rappel. */
export function jouer(el: Element | null | undefined, kf: Cles, opts: KeyframeAnimationOptions = {}): Animation | null {
  return lancer(el, kf, opts);
}

/** Annule une animation (ou rien) sans jamais lever. */
export function annuler(a: Animation | null | undefined): void {
  if (!a) return;
  try {
    a.cancel();
  } catch {
    /* rien */
  }
}

function arr(v: number, n = 2): number {
  const k = Math.pow(10, n);
  return Math.round(v * k) / k;
}

/* ── 5 · Les entrées ────────────────────────────────────────────────────── */

export type Axe = "x" | "y";

export interface OptionsEntree extends OptionsRessort {
  /** Transform posé AVANT la translation (dans la même image clé). */
  prefixe?: string;
  /** Transform posé APRÈS la translation. */
  suffixe?: string;
}

/** Les images clés d'une entrée en ressort : une translation sur un axe, de
 *  `depuisPx` à 0, et une opacité qui arrive plus vite que la position. La
 *  dernière image clé est `translate…(0px)` et `opacity: 1`. */
export function clesEntree(axe: Axe, depuisPx: number, o: OptionsEntree = {}): { kf: Keyframe[]; duree: number } {
  const r = ressort(depuisPx, 0, o);
  const kf = r.pas.map((p) => {
    const v = arr(p.valeur);
    const tr = axe === "x" ? `translateX(${v}px)` : `translateY(${v}px)`;
    return {
      offset: p.offset,
      transform: `${o.prefixe ? o.prefixe + " " : ""}${tr}${o.suffixe ? " " + o.suffixe : ""}`,
      opacity: Math.min(1, arr(p.offset * 3.2, 4)),
    };
  });
  return { kf, duree: r.duree };
}

/**
 * Une entrée en ressort qui S'AJOUTE au transform que la feuille donne déjà
 * (`composite: "add"`) : une feuille centrée par `translate(-50%, -50%)`, un
 * toast, une barre en `translateZ(0)`. Deux animations : l'opacité en
 * remplacement (ajoutée à 1, elle ne bougerait plus), le transform en ajout.
 * Rend l'animation du transform.
 */
export function entreeComposee(
  el: Element | null | undefined,
  axe: Axe,
  depuisPx: number,
  o: OptionsEntree = {},
): Animation | null {
  if (!peut(el)) return null;
  const e = clesEntree(axe, depuisPx, o);
  const opacites = e.kf.map((k) => ({ offset: k.offset, opacity: k.opacity }));
  const transforms = e.kf.map((k) => ({ offset: k.offset, transform: k.transform }));
  jouer(el, opacites, { duration: e.duree, easing: "linear" });
  return jouer(el, transforms, { duration: e.duree, easing: "linear", composite: "add" });
}

/* ── 6 · Les rectangles (vol d'un élément partagé) ──────────────────────── */

/** Le rectangle d'un élément connecté (à l'écran, en px CSS). */
export function boite(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** Le transform qui pose un calque dessiné à la taille `base` sur le
 *  rectangle `r` (origine du transform : son coin haut gauche). */
export function poser(r: Rect, base: { w: number; h: number }): string {
  const bw = base.w || 1;
  const bh = base.h || 1;
  return `translate(${arr(r.x)}px, ${arr(r.y)}px) scale(${arr(r.w / bw, 4)}, ${arr(r.h / bh, 4)})`;
}

/** Le plus grand des deux rectangles : la taille à laquelle dessiner un
 *  calque qui vole (réduit, il reste net ; agrandi, il flouterait). */
export function plusGrand(a: Rect, b: Rect): { w: number; h: number } {
  return a.w * a.h >= b.w * b.h ? { w: a.w, h: a.h } : { w: b.w, h: b.h };
}

export interface OptionsVol extends OptionsRessort {
  /** Étire l'échantillonnage (ms) sans changer la physique : le ressort se
   *  pose plus tôt dans la fenêtre et y reste, pour finir avec une autre
   *  animation. */
  min?: number;
}

/** Les images clés d'un vol de `de` vers `vers` (position et taille
 *  interpolées ensemble), en ressort. Premier transform = `de`, dernier =
 *  `vers`. Ressort par défaut 170 / .8 sur 48 pas. */
export function cles(de: Rect, vers: Rect, base: { w: number; h: number }, o: OptionsVol = {}): { kf: Keyframe[]; duree: number } {
  const physique: OptionsRessort = { raideur: o.raideur ?? 170, zeta: o.zeta ?? 0.8, pas: o.pas ?? 48, vitesse: o.vitesse };
  let r = ressort(1, 0, physique);
  if (o.min && o.min > r.duree) r = ressort(1, 0, { ...physique, duree: Math.round(o.min) });
  const kf = r.pas.map((p) => {
    const v = p.valeur;
    return {
      offset: p.offset,
      transform: poser(
        { x: vers.x + (de.x - vers.x) * v, y: vers.y + (de.y - vers.y) * v, w: vers.w + (de.w - vers.w) * v, h: vers.h + (de.h - vers.h) * v },
        base,
      ),
    };
  });
  return { kf, duree: r.duree };
}

/* ── 7 · Les conteneurs de fx ───────────────────────────────────────────── */

/** Deux plans : `bas` (#mn-fx, au-dessus de l'app et sous les modales) et
 *  `haut` (#mn-fx-haut, au-dessus de tout : un vol vers la visionneuse, le
 *  fantôme d'un toast). Échelle complète dans fx.css. */
export type Plan = "bas" | "haut";
const ID_PLAN: Record<Plan, string> = { bas: "mn-fx", haut: "mn-fx-haut" };

/** Le conteneur des fantômes, éclats, pétales et voiles : créé s'il manque
 *  (frère de #root, après #mn-couches), toujours inerte et caché aux
 *  technologies d'assistance. */
export function conteneurFx(plan: Plan = "bas"): HTMLElement | null {
  if (typeof document === "undefined" || !document.body) return null;
  let el = document.getElementById(ID_PLAN[plan]);
  if (!el) {
    el = document.createElement("div");
    el.id = ID_PLAN[plan];
    const apres = plan === "bas" ? document.getElementById("mn-couches") || document.getElementById("root") : null;
    if (apres && apres.parentNode) apres.parentNode.insertBefore(el, apres.nextSibling);
    else document.body.appendChild(el);
  }
  if (el.getAttribute("aria-hidden") !== "true") el.setAttribute("aria-hidden", "true");
  if (!el.hasAttribute("inert")) el.setAttribute("inert", "");
  return el;
}

/* ── 8 · Fantômes et clones ─────────────────────────────────────────────── */

/** Défilement de chaque zone défilante, gardé au fil de l'eau (écouteur de
 *  capture posé par `installer`) : un nœud retiré puis remis dans le
 *  document repart en haut, et le fantôme d'une feuille doit montrer ce
 *  qu'on avait sous les yeux. */
const defilements: WeakMap<Element, { t: number; l: number }> = new WeakMap();

function surDefilement(ev: Event) {
  const t = ev.target;
  if (!t || (t as Node).nodeType !== 1) return;
  const el = t as Element;
  defilements.set(el, { t: el.scrollTop, l: el.scrollLeft });
}

const ATTRS_RETIRES = ["id", "name", "autofocus", "aria-live", "role", "tabindex", "autoplay", "for", "form"];

function desarmerUn(n: Element) {
  for (const a of ATTRS_RETIRES) if (n.hasAttribute(a)) n.removeAttribute(a);
  const data: string[] = [];
  for (let i = 0; i < n.attributes.length; i++) {
    const nom = n.attributes[i].name;
    if (nom.startsWith("data-")) data.push(nom);
  }
  for (const a of data) n.removeAttribute(a);
  if (n instanceof HTMLMediaElement) {
    try {
      n.muted = true;
      n.pause();
    } catch {
      /* rien */
    }
  }
}

/** Une copie ou un fantôme n'est qu'une image : ni identifiant, ni nom, ni
 *  rôle, ni place au clavier, ni `data-*` (aucun module ne doit le prendre
 *  pour un nœud de l'app), inerte et caché aux technologies d'assistance. */
export function desarmer(noeud: Element): void {
  desarmerUn(noeud);
  const tous = noeud.querySelectorAll("*");
  for (let i = 0; i < tous.length && i < 4000; i++) desarmerUn(tous[i]);
  noeud.setAttribute("inert", "");
  noeud.setAttribute("aria-hidden", "true");
  noeud.setAttribute("data-fx-fantome", "");
  const s = (noeud as HTMLElement).style;
  if (s) s.pointerEvents = "none";
}

/** Une copie profonde d'un nœud VIVANT, avec ce qui n'est pas un attribut :
 *  valeurs saisies, cases cochées, dessins d'un canvas, défilements. Le
 *  nœud d'origine n'est ni déplacé ni modifié. */
export function cloner<T extends Element>(source: T): T {
  const copie = source.cloneNode(true) as T;
  const a = [source as Element, ...Array.from(source.querySelectorAll("*"))];
  const b = [copie as Element, ...Array.from(copie.querySelectorAll("*"))];
  for (let i = 0; i < a.length && i < b.length && i < 4000; i++) {
    const s = a[i];
    const c = b[i];
    if (s instanceof HTMLInputElement && c instanceof HTMLInputElement) {
      c.value = s.value;
      c.checked = s.checked;
    } else if (s instanceof HTMLTextAreaElement && c instanceof HTMLTextAreaElement) {
      c.value = s.value;
    } else if (s instanceof HTMLSelectElement && c instanceof HTMLSelectElement) {
      c.selectedIndex = s.selectedIndex;
    } else if (s instanceof HTMLCanvasElement && c instanceof HTMLCanvasElement) {
      try {
        c.getContext("2d")?.drawImage(s, 0, 0);
      } catch {
        /* canvas teinté : vide */
      }
    }
    if (s.scrollTop || s.scrollLeft) defilements.set(c, { t: s.scrollTop, l: s.scrollLeft });
    else {
      const d = defilements.get(s);
      if (d) defilements.set(c, d);
    }
  }
  return copie;
}

function rendreDefilements(noeud: Element) {
  const tous = [noeud, ...Array.from(noeud.querySelectorAll("*"))];
  for (let i = 0; i < tous.length && i < 4000; i++) {
    const d = defilements.get(tous[i]);
    if (!d) continue;
    try {
      tous[i].scrollTop = d.t;
      tous[i].scrollLeft = d.l;
    } catch {
      /* rien */
    }
  }
}

function dansApp(n: Element): boolean {
  return !!n.closest("#root, #mn-couches");
}

/** Une fonction de retrait, qui porte aussi le nœud posé (le nœud reçu, ou
 *  sa copie quand il était encore dans l'app). */
export type Retrait = (() => void) & { readonly noeud: Element | null };

/**
 * Fait d'un nœud un FANTÔME : un nœud que React vient de retirer (il est à
 * nous), ou un clone. Désarmé (cf. `desarmer`), posé en position fixe à son
 * rectangle dans le conteneur de fx, ses défilements rendus. Un nœud encore
 * vivant dans l'app n'est JAMAIS déplacé : on en pose une copie.
 * Rend la fonction qui le retire (et annule ses animations).
 */
export function fantome(noeud: Element, rect?: Rect | null, plan: Plan = "bas"): Retrait {
  let el: Element = noeud;
  let r = rect ?? null;
  if (noeud.isConnected) {
    if (!r) r = boite(noeud);
    if (dansApp(noeud)) el = cloner(noeud);
  }
  const fabriquer = (pose: Element | null): Retrait => {
    const f = () => {
      try {
        el.getAnimations({ subtree: true }).forEach((a) => annuler(a));
      } catch {
        /* rien */
      }
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    return Object.defineProperty(f, "noeud", { value: pose, enumerable: true }) as Retrait;
  };
  desarmer(el);
  const hote = conteneurFx(plan);
  // Sans rectangle utilisable, rien n'est posé (`noeud` vaut null).
  if (!hote || !r || !(r.w > 0) || !(r.h > 0)) return fabriquer(null);
  const s = (el as HTMLElement).style;
  if (s) {
    s.position = "fixed";
    s.left = `${arr(r.x)}px`;
    s.top = `${arr(r.y)}px`;
    s.right = "auto";
    s.bottom = "auto";
    s.width = `${arr(r.w)}px`;
    s.height = `${arr(r.h)}px`;
    s.maxWidth = "none";
    s.maxHeight = "none";
    s.minWidth = "0";
    s.minHeight = "0";
    s.margin = "0";
    s.boxSizing = "border-box";
  }
  hote.appendChild(el);
  rendreDefilements(el);
  return fabriquer(el);
}

/* ── 9 · FLIP ───────────────────────────────────────────────────────────── */

/** Les rectangles d'une liste d'éléments (une seule lecture de géométrie). */
export function releverRects(els: Iterable<Element>): Map<Element, Rect> {
  const m = new Map<Element, Rect>();
  for (const el of els) if (el.isConnected) m.set(el, boite(el));
  return m;
}

export interface OptionsFlip extends OptionsRessort {
  /** Anime aussi la taille (scale autour du centre). Non par défaut. */
  taille?: boolean;
  /** En deçà (px), un élément ne bouge pas. 0,5 par défaut. */
  seuil?: number;
}

const flips: WeakMap<Element, Animation> = new WeakMap();

/**
 * First/Last/Invert/Play : `avant` donne les rectangles relevés AVANT le
 * changement (au geste, en capture) ; les rectangles d'après sont lus ici,
 * en une fois ; chaque élément part de sa place d'avant et glisse vers la
 * nouvelle en ressort, en `composite: "add"` (un transform posé par l'app
 * reste). Un FLIP en cours sur un élément est annulé avant la mesure (le
 * rectangle d'avant le contenait déjà). Rend les animations lancées.
 */
export function flip(elements: Iterable<Element>, avant: Map<Element, Rect>, o: OptionsFlip = {}): Animation[] {
  if (reduit()) return [];
  const els = Array.from(elements).filter((el) => avant.has(el) && el.isConnected);
  for (const el of els) {
    annuler(flips.get(el));
    flips.delete(el);
  }
  const apres = releverRects(els);
  const r = ressort(1, 0, { raideur: o.raideur ?? 220, zeta: o.zeta ?? 0.82, pas: o.pas, duree: o.duree });
  const seuil = o.seuil ?? 0.5;
  const out: Animation[] = [];
  for (const el of els) {
    const a = avant.get(el);
    const b = apres.get(el);
    if (!a || !b || !(b.w > 0) || !(b.h > 0)) continue;
    const dx = a.x + a.w / 2 - (b.x + b.w / 2);
    const dy = a.y + a.h / 2 - (b.y + b.h / 2);
    const sx = o.taille && a.w > 0 ? a.w / b.w : 1;
    const sy = o.taille && a.h > 0 ? a.h / b.h : 1;
    if (Math.abs(dx) < seuil && Math.abs(dy) < seuil && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;
    const kf = r.pas.map((p) => {
      const v = p.valeur;
      const tr = `translate(${arr(dx * v)}px, ${arr(dy * v)}px)`;
      return {
        offset: p.offset,
        transform: o.taille ? `${tr} scale(${arr(1 + (sx - 1) * v, 4)}, ${arr(1 + (sy - 1) * v, 4)})` : tr,
      };
    });
    const an = jouer(el, kf, { duration: r.duree, easing: "linear", composite: "add" });
    if (an) {
      flips.set(el, an);
      out.push(an);
    }
  }
  return out;
}

/* ── 10 · Le geste frais ────────────────────────────────────────────────── */

/** react-query re-rend une liste au refetch, sans geste : un module ne
 *  rejoue un mouvement de liste que si un vrai geste vient d'avoir lieu. */
let dernierGeste = -1e12;

export function noterGeste(): void {
  dernierGeste = maintenant();
}

/** Vrai si un geste (pointeur, clavier, molette, doigt qui glisse) a été
 *  relevé il y a moins de `ms` millisecondes (600 par défaut). */
export function gesteFrais(ms = 600): boolean {
  return maintenant() - dernierGeste < ms;
}

function surGeste(ev: Event) {
  const t = ev.target as Element | null;
  // L'interrupteur haptique n'est pas un geste du membre.
  if (t && typeof t.closest === "function" && t.closest(".fx-haptique")) return;
  noterGeste();
}

/* ── 11 · Le toucher (haptique) ─────────────────────────────────────────── */

let commutateur: { label: HTMLLabelElement; input: HTMLInputElement } | null = null;

function tactile(): boolean {
  try {
    return (navigator.maxTouchPoints || 0) > 0 || matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

function peutVibrer(): boolean {
  try {
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function" && tactile();
  } catch {
    return false;
  }
}

/* Safari connaît l'interrupteur sur Mac, où il ne vibre pas : sans écran
   tactile, on ne clique rien. */
function peutCommuter(): boolean {
  try {
    return tactile() && typeof HTMLInputElement === "function" && "switch" in HTMLInputElement.prototype;
  } catch {
    return false;
  }
}

/* L'interrupteur d'iPhone (Safari 17.4+) : une étiquette et sa case, hors
   de l'écran (jamais `display: none`), hors de tout formulaire et du
   parcours clavier. Les clics, `input` et `change` de synthèse s'arrêtent à
   l'étiquette : les écouteurs de l'app en bouillonnement ne les voient
   jamais. Ceux posés en CAPTURE sur le document, eux, les voient passer :
   d'où la bascule différée (`plusTard`) et le filtre `.fx-haptique` dans
   tout écouteur de capture qui retient un état. */
function obtenirCommutateur() {
  if (commutateur && commutateur.label.isConnected) return commutateur;
  if (typeof document === "undefined" || !document.body) return null;
  const label = document.createElement("label");
  label.className = "fx-haptique";
  label.setAttribute("aria-hidden", "true");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  label.appendChild(input);
  for (const t of ["click", "input", "change"]) label.addEventListener(t, (ev) => ev.stopPropagation());
  document.body.appendChild(label);
  commutateur = { label, input };
  return commutateur;
}

function basculer(): boolean {
  const h = obtenirCommutateur();
  if (!h) return false;
  const avant = document.activeElement as HTMLElement | null;
  try {
    h.label.click();
  } catch {
    return false;
  }
  // Le focus n'est jamais volé : un clic d'étiquette le donne à sa case.
  if (document.activeElement !== avant) {
    try {
      if (avant && avant !== document.body && typeof avant.focus === "function") avant.focus({ preventScroll: true });
      else h.input.blur();
    } catch {
      /* rien */
    }
  }
  return true;
}

/* Hors de la distribution du clic qui l'a provoquée : le vrai clic finit
   son trajet d'abord. WebKit prête l'activation à un minuteur court. */
function plusTard(delai = 0): boolean {
  try {
    setTimeout(basculer, delai);
    return true;
  } catch {
    return false;
  }
}

function vibrer(motif: number | number[]): boolean {
  try {
    return navigator.vibrate(motif) !== false;
  } catch {
    return false;
  }
}

/** Le retour haptique : Android par `navigator.vibrate`, iPhone par la
 *  bascule d'un interrupteur caché. Rien sur un écran sans toucher. */
export const haptique = Object.freeze({
  /** Un tic : un onglet, une case, une carte qu'on ouvre. */
  tic(leger = false): boolean {
    if (peutVibrer()) return vibrer(leger ? 5 : 9);
    if (peutCommuter()) return plusTard(0);
    return false;
  },
  /** Un succès : deux touches, la seconde plus appuyée. */
  succes(): boolean {
    if (peutVibrer()) return vibrer([10, 55, 18]);
    if (peutCommuter()) {
      const ok = plusTard(0);
      plusTard(90);
      return ok;
    }
    return false;
  },
});

/* ── 12 · Petits calculs partagés ───────────────────────────────────────── */

const RE_ENTIER = /^(0|[1-9]\d{0,8})((?:[\s\u00a0\u202f]*(?:\/[\s\u00a0\u202f]*(?:0|[1-9]\d{0,8})|%))?)$/;

/** Un entier, et seulement un entier : « 42 », « 12 / 200 », « 6 % ». Un
 *  montant (« 12,50 € »), une date (« 12/09 » : un compte n'a pas de zéro en
 *  tête) ou un texte ne comptent pas. La suite (« / 200 », « % ») est rendue
 *  telle quelle. */
export function lireEntier(texte: unknown): { valeur: number; suite: string } | null {
  const t = String(texte === null || texte === undefined ? "" : texte).trim();
  const m = RE_ENTIER.exec(t);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  if (!Number.isFinite(v)) return null;
  return { valeur: v, suite: m[2] || "" };
}

/** Un générateur pseudo-aléatoire déterministe (mulberry32). */
function hasard(graine: number): () => number {
  let a = (Math.floor(Math.abs(graine)) + 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Eclat {
  dx: number;
  dy: number;
  rot: number;
  pic: number;
  delai: number;
}

export interface OptionsGerbe {
  /** Distance minimale (px). 18 par défaut. */
  dMin?: number;
  /** Distance maximale (px). 30 par défaut. */
  dMax?: number;
  /** Angle du premier éclat (degrés, -90 = vers le haut). */
  depart?: number;
}

/** Les directions d'une gerbe de `n` éclats, réparties sur le cercle avec un
 *  léger écart, une distance entre `dMin` et `dMax`, une rotation alternée.
 *  DÉTERMINISTE : la même graine rend la même gerbe (au même geste, le même
 *  dessin ; dans un test, la même assertion). */
export function gerbe(n: number, graine = 0, o: OptionsGerbe = {}): Eclat[] {
  const nb = Math.max(0, Math.min(64, Math.floor(n)));
  const dMin = o.dMin ?? 18;
  const dMax = Math.max(dMin, o.dMax ?? 30);
  const depart = o.depart ?? -90;
  const alea = hasard(graine);
  const out: Eclat[] = [];
  for (let i = 0; i < nb; i++) {
    const decale = (alea() - 0.5) * 10;
    const angle = depart + i * (360 / nb) + decale;
    const t = nb > 1 ? ((i * 5) % nb) / (nb - 1) : 0.5;
    const dist = dMin + (dMax - dMin) * t;
    const rad = (angle * Math.PI) / 180;
    out.push({
      dx: arr(Math.cos(rad) * dist, 1),
      dy: arr(Math.sin(rad) * dist, 1),
      rot: (i % 2 ? 1 : -1) * Math.round(12 + alea() * 16),
      pic: arr(0.95 + alea() * 0.21, 2),
      delai: nb > 1 ? Math.round((50 * i) / (nb - 1)) : 0,
    });
  }
  return out;
}

/** Le décalage horizontal d'un éclat gardé dans l'emprise de son bouton :
 *  le centre du bouton plus sa demi-largeur et 4 px, moins la demi-emprise
 *  de l'éclat à son plus grand (sa demi-taille, agrandie de son pic et de sa
 *  boîte tournée). Empêche une gerbe de mordre sur les boutons voisins. */
export function borneContenue(dx: number, demiLargeur: number, taille: number, pic = 1, rot = 0): number {
  const rad = (Math.abs(rot) * Math.PI) / 180;
  const demi = (taille || 0) * (pic || 1) * (Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad)));
  const lim = Math.max(0, demiLargeur + 4 - demi);
  return Math.max(-lim, Math.min(lim, dx));
}

/* ── 13 · Installation ──────────────────────────────────────────────────── */

const CAPTURE: AddEventListenerOptions = { capture: true, passive: true };
const GESTES = ["pointerdown", "keydown", "wheel", "touchmove"];

/** Pose les écouteurs du cœur (geste frais, défilements) et relit les
 *  jetons. Idempotent par l'appelant (index.ts). Rend l'arrêt. */
export function installer(): () => void {
  if (typeof document === "undefined") return () => {};
  lireJetons();
  for (const t of GESTES) document.addEventListener(t, surGeste, CAPTURE);
  document.addEventListener("scroll", surDefilement, CAPTURE);
  return () => {
    for (const t of GESTES) document.removeEventListener(t, surGeste, CAPTURE);
    document.removeEventListener("scroll", surDefilement, CAPTURE);
    if (commutateur && commutateur.label.parentNode) commutateur.label.parentNode.removeChild(commutateur.label);
    commutateur = null;
    jetonsLus = false;
  };
}

/** L'objet public du cœur (débogage et tests ; jamais appelé par l'app). */
export const api = Object.freeze({ reduit, gesteFrais, haptique, DUR, EASE, conteneurFx });
