/* MarieNour · src/fx/montage.ts : le montage paresseux de la couche d'effets.
   --------------------------------------------------------------------------
   Vinyles montait ses effets sur un DOM statique à identifiants. Ici les
   nœuds naissent et meurent avec React : on les OBSERVE. Un seul
   MutationObserver (childList, subtree) sur #root et #mn-couches, et un
   registre `surveiller(selecteur, { entre, sort })` :

   - les ENTRÉES sont regroupées par requestAnimationFrame (une image après
     le commit de React, quand la mise en page est faite) ;
   - les SORTIES sont traitées DANS le rappel même : une image plus tard, le
     fantôme arriverait après un trou. Le nœud vient d'être retiré, il n'a
     plus de géométrie : on passe son dernier rectangle connu (le RELEVÉ) ;
   - un nœud DÉPLACÉ (retiré puis remis dans le même lot, la façon dont
     React réordonne une liste à clés) n'est ni une sortie ni une entrée ;
   - un nœud que Suspense MASQUE (`style.display = "none"`) n'est pas parti :
     ni entrée, ni sortie.

   Le relevé est paresseux : un IntersectionObserver suit les éléments
   surveillés qui ont un `sort` (son premier rappel donne leur rectangle,
   gratuitement), et à chaque geste (pointeur, clavier, en capture : AVANT
   que React ne change l'écran) on remesure ceux qui sont près de l'écran,
   bornés. Une lecture de géométrie par geste, jamais dans une boucle. */

import { boite, maintenant, type Rect } from "./core";

/** Le rectangle relevé d'un élément, ramené au défilement courant ; `age` =
 *  millisecondes depuis la mesure (à un module de juger s'il est frais). */
export interface RectReleve extends Rect {
  age: number;
}

export interface Veilleur {
  /** Un élément qui correspond au sélecteur vient d'entrer (une image après
   *  le commit). */
  entre?(el: Element): void;
  /** Un élément qui correspond au sélecteur vient d'être retiré par React.
   *  `ancienParent` : le parent d'où il a été retiré (pour un descendant
   *  d'un nœud retiré, son parent détaché ; s'il n'est plus dans le
   *  document, c'est tout le conteneur qui est parti). `rect` : son dernier
   *  rectangle connu, ou null. */
  sort?(el: Element, ancienParent: Node | null, rect: RectReleve | null): void;
  /** Appelle aussi `entre` pour les éléments déjà présents au moment de
   *  l'inscription (rechargement à chaud). Non par défaut. */
  actuels?: boolean;
}

interface Inscription {
  sel: string;
  v: Veilleur;
}

const MAX_PAR_LOT = 200; // éléments examinés par sélecteur et par nœud ajouté ou retiré
const MAX_RELEVE = 96; // éléments remesurés à chaque geste

const inscriptions = new Set<Inscription>();
const enAttente = new Set<Element>();
const releves: WeakMap<Element, { r: Rect; sx: number; sy: number; fixe: boolean; t: number }> = new WeakMap();
const proches = new Set<Element>();
const observateursAttributs = new Set<MutationObserver>();

let mo: MutationObserver | null = null;
let io: IntersectionObserver | null = null;
let raf = 0;
let installe = false;

/* ── Défilement et rectangles ──────────────────────────────────────────── */

/** Le défilement réel de la page, y compris quand le corps est verrouillé
 *  par position fixe (`lockBodyScroll` de ui.tsx : `top: -Ypx`, et
 *  `scrollY` vaut alors 0 alors que le contenu n'a pas bougé). */
function defilement(): { x: number; y: number } {
  let x = window.scrollX || 0;
  let y = window.scrollY || 0;
  const b = document.body?.style;
  if (b && b.position === "fixed") {
    x += -(parseFloat(b.left) || 0);
    y += -(parseFloat(b.top) || 0);
  }
  return { x, y };
}

/** Vrai si l'élément vit dans un contexte fixe (lui ou un ancêtre en
 *  `position: fixed`) : son rectangle ne suit pas le défilement. Une
 *  chaîne d'`offsetParent` qui s'arrête ailleurs que sur le corps de la
 *  page désigne un ancêtre fixe. */
function enContexteFixe(el: Element): boolean {
  let h: Element | null = el;
  while (h && !(h instanceof HTMLElement)) h = h.parentElement;
  if (!h) return false;
  let p = h as HTMLElement;
  for (let i = 0; i < 40; i++) {
    const suivant = p.offsetParent as HTMLElement | null;
    if (!suivant) break;
    p = suivant;
  }
  return p !== document.body && p !== document.documentElement;
}

function garder(el: Element, r: Rect) {
  if (!(r.w > 0) || !(r.h > 0)) return;
  const d = defilement();
  releves.set(el, { r, sx: d.x, sy: d.y, fixe: enContexteFixe(el), t: maintenant() });
}

/** Le dernier rectangle connu d'un élément surveillé (ou null), ramené au
 *  défilement courant s'il n'est pas dans un contexte fixe. */
export function dernierRect(el: Element): RectReleve | null {
  const g = releves.get(el);
  if (!g) return null;
  let { x, y } = g.r;
  if (!g.fixe) {
    const d = defilement();
    x -= d.x - g.sx;
    y -= d.y - g.sy;
  }
  return { x, y, w: g.r.w, h: g.r.h, age: maintenant() - g.t };
}

function surIntersection(entrees: IntersectionObserverEntry[]) {
  for (const e of entrees) {
    const el = e.target;
    if (e.isIntersecting) proches.add(el);
    else proches.delete(el);
    const b = e.boundingClientRect;
    garder(el, { x: b.left, y: b.top, w: b.width, h: b.height });
  }
}

function suivre(el: Element) {
  if (io) io.observe(el);
}

function lacher(el: Element) {
  proches.delete(el);
  if (io) io.unobserve(el);
}

/** Au geste, en capture (avant React) : remesure ce qui est près de
 *  l'écran. Une lecture de géométrie, bornée. */
function surGeste(ev: Event) {
  const t = ev.target as Element | null;
  if (t && typeof t.closest === "function" && t.closest(".fx-haptique")) return;
  if (!proches.size) return;
  let n = 0;
  const lot: Element[] = [];
  for (const el of proches) {
    if (n++ >= MAX_RELEVE) break;
    if (el.isConnected) lot.push(el);
    else proches.delete(el);
  }
  const mesures = lot.map((el) => [el, boite(el)] as const);
  for (const [el, r] of mesures) garder(el, r);
}

/* ── Masquage par Suspense ─────────────────────────────────────────────── */

/** Vrai si le nœud ou un ancêtre est masqué par un `display: none` posé en
 *  ligne (la façon dont Suspense cache un sous-arbre en attente). */
function masque(n: Node | null): boolean {
  for (let p: Node | null = n, i = 0; p && i < 200; p = p.parentNode, i++) {
    const s = (p as HTMLElement).style;
    if (s && s.display === "none") return true;
  }
  return false;
}

/* ── Le rappel unique ──────────────────────────────────────────────────── */

function correspondances(racine: Element, sel: string): Element[] {
  const out: Element[] = [];
  try {
    if (racine.matches(sel)) out.push(racine);
    const dedans = racine.querySelectorAll(sel);
    for (let i = 0; i < dedans.length && out.length < MAX_PAR_LOT; i++) out.push(dedans[i]);
  } catch {
    /* sélecteur refusé : rien */
  }
  return out;
}

function oublier(racine: Element) {
  if (!io) return;
  lacher(racine);
  const dedans = racine.querySelectorAll("*");
  for (let i = 0; i < dedans.length && i < 2000; i++) if (proches.has(dedans[i])) lacher(dedans[i]);
}

function surMutations(recs: MutationRecord[]) {
  const retires: Array<[Element, Node]> = [];
  const retiresTous = new Set<Node>();
  const ajoutes: Element[] = [];
  for (const rec of recs) {
    if (rec.type !== "childList") continue;
    rec.removedNodes.forEach((n) => {
      retiresTous.add(n);
      if (n.nodeType === 1) retires.push([n as Element, rec.target]);
    });
    rec.addedNodes.forEach((n) => {
      if (n.nodeType === 1) ajoutes.push(n as Element);
    });
  }

  // Les sorties d'abord, dans le rappel même.
  for (const [n, cible] of retires) {
    if (n.isConnected) continue; // déplacé : React a réordonné
    if (masque(n) || masque(cible)) {
      oublier(n);
      continue;
    }
    for (const ins of inscriptions) {
      if (!ins.v.sort) continue;
      for (const el of correspondances(n, ins.sel)) {
        try {
          ins.v.sort(el, el === n ? cible : el.parentNode, dernierRect(el));
        } catch (e) {
          avertir(e);
        }
      }
    }
    oublier(n);
  }

  // Les entrées, regroupées à l'image suivante.
  for (const n of ajoutes) {
    if (retiresTous.has(n) && n.isConnected) continue; // déplacé
    enAttente.add(n);
  }
  if (enAttente.size && !raf) raf = requestAnimationFrame(vider);
}

function vider() {
  raf = 0;
  const lot = Array.from(enAttente).filter((n) => n.isConnected && !masque(n));
  enAttente.clear();
  if (!lot.length) return;
  for (const ins of inscriptions) {
    const vus = new Set<Element>();
    for (const racine of lot) for (const el of correspondances(racine, ins.sel)) vus.add(el);
    for (const el of vus) {
      if (ins.v.sort) suivre(el);
      if (!ins.v.entre) continue;
      try {
        ins.v.entre(el);
      } catch (e) {
        avertir(e);
      }
    }
  }
}

function avertir(e: unknown) {
  // Un module qui lève ne casse ni l'app ni les autres modules.
  if (typeof console !== "undefined") console.warn("[fx] rappel en erreur", e);
}

/* ── L'API du registre ─────────────────────────────────────────────────── */

function racines(): Element[] {
  return ["root", "mn-couches"].map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
}

/** S'inscrire aux entrées et sorties des éléments qui correspondent à
 *  `selecteur` (dans #root et #mn-couches). Rend la désinscription. Un
 *  sélecteur invalide lève tout de suite (une faute de frappe ne doit pas
 *  rester silencieuse). */
export function surveiller(selecteur: string, v: Veilleur): () => void {
  if (typeof document !== "undefined") document.createDocumentFragment().querySelector(selecteur);
  const ins: Inscription = { sel: selecteur, v };
  inscriptions.add(ins);
  if (installe && (v.actuels || v.sort)) {
    const existants: Element[] = [];
    for (const r of racines()) {
      const dedans = r.querySelectorAll(selecteur);
      for (let i = 0; i < dedans.length && existants.length < MAX_PAR_LOT; i++) {
        if (!masque(dedans[i])) existants.push(dedans[i]);
      }
    }
    for (const el of existants) {
      if (v.sort) suivre(el);
      if (v.actuels && v.entre) {
        try {
          v.entre(el);
        } catch (e) {
          avertir(e);
        }
      }
    }
  }
  return () => {
    inscriptions.delete(ins);
  };
}

/** Observe des attributs d'UN élément (classe posée par NavLink,
 *  `aria-expanded`, `data-page`…). Rend l'arrêt ; tout s'arrête aussi avec
 *  le montage. */
export function observerAttributs(
  el: Element,
  attrs: string[],
  cb: (nom: string, el: Element, ancien: string | null) => void,
): () => void {
  const o = new MutationObserver((recs) => {
    for (const r of recs) {
      if (!r.attributeName) continue;
      try {
        cb(r.attributeName, el, r.oldValue);
      } catch (e) {
        avertir(e);
      }
    }
  });
  o.observe(el, { attributes: true, attributeFilter: attrs, attributeOldValue: true });
  observateursAttributs.add(o);
  return () => {
    o.disconnect();
    observateursAttributs.delete(o);
  };
}

/** Le conteneur des couches (portails React : modales, palette, toasts…),
 *  frère de #root. Créé s'il manque, jamais déplacé s'il existe. */
export function couches(): HTMLElement | null {
  if (typeof document === "undefined" || !document.body) return null;
  let el = document.getElementById("mn-couches");
  if (el) return el;
  el = document.createElement("div");
  el.id = "mn-couches";
  const root = document.getElementById("root");
  if (root && root.parentNode) root.parentNode.insertBefore(el, root.nextSibling);
  else document.body.appendChild(el);
  return el;
}

const CAPTURE: AddEventListenerOptions = { capture: true, passive: true };

/** Pose l'observateur unique et le relevé. Rend l'arrêt, qui débranche
 *  tout et vide le registre. */
export function installer(): () => void {
  if (typeof document === "undefined" || installe) return () => {};
  couches();
  mo = new MutationObserver(surMutations);
  for (const r of racines()) mo.observe(r, { childList: true, subtree: true });
  if (typeof IntersectionObserver === "function") {
    io = new IntersectionObserver(surIntersection, { rootMargin: "300px 0px" });
  }
  document.addEventListener("pointerdown", surGeste, CAPTURE);
  document.addEventListener("keydown", surGeste, CAPTURE);
  installe = true;
  return () => {
    installe = false;
    mo?.disconnect();
    mo = null;
    io?.disconnect();
    io = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    enAttente.clear();
    proches.clear();
    for (const o of observateursAttributs) o.disconnect();
    observateursAttributs.clear();
    inscriptions.clear();
    document.removeEventListener("pointerdown", surGeste, CAPTURE);
    document.removeEventListener("keydown", surGeste, CAPTURE);
  };
}

/** L'état du montage, pour les tests et le débogage. */
export function etat() {
  return { installe, inscriptions: inscriptions.size, proches: proches.size, attributs: observateursAttributs.size };
}

/** L'objet public du montage (débogage et tests ; jamais appelé par l'app). */
export const api = Object.freeze({ etat, surveiller, observerAttributs, dernierRect, couches });
