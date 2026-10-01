// Aides du banc navigateur de MarieNour, portées des tests de Vinyles
// (tests/test_vinyles_navigateur.py et fx*_navigateur.py) : lancer Chromium,
// un contexte connecté (iPhone ou bureau, thème et mouvement forcés), attendre
// le REPOS au lieu de photographier, figer une animation pour la mesurer,
// enregistrer les appels à `animate`, simuler l'iPhone (interrupteur haptique)
// et le toucher, vérifier qu'aucune page ne déborde.
//
// Toujours la forme FONCTION dans page.evaluate / waitForFunction (jamais une
// expression en chaîne : la CSP la refuserait ailleurs, cf. Vinyles).

import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { inject } from "vitest";

/** Le binaire Chromium à piloter ; sans lui, les tests se sautent. */
export const CHROMIUM = process.env.MN_CHROMIUM ?? "";
export const actif = CHROMIUM !== "";

export function base(): string {
  return inject("mnBase");
}
export function jeton(): string {
  return inject("mnToken");
}
export function url(chemin = "/"): string {
  return base() + (chemin.startsWith("/") ? chemin : `/${chemin}`);
}

export async function lancer(): Promise<Browser> {
  return chromium.launch({ executablePath: CHROMIUM, headless: true });
}

/* ── Appareils ─────────────────────────────────────────────────────────── */

export const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

export const IPHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: IPHONE_UA,
} as const;

export const IPHONE_SE = { ...IPHONE, viewport: { width: 320, height: 568 } } as const;

export const BUREAU = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
} as const;

type Appareil = typeof IPHONE | typeof IPHONE_SE | typeof BUREAU;

export interface OptionsContexte {
  /** IPHONE (390 × 844), IPHONE_SE (320 × 568) ou BUREAU (1280 × 800). */
  appareil?: Appareil;
  /** Thème forcé, sans toucher aux préférences stockées. */
  theme?: "light" | "dark";
  /** Ce que l'APPAREIL demande (prefers-reduced-motion). */
  mouvement?: "reduce" | "no-preference";
  /** Connecté au compte admin de test (oui par défaut). */
  connecte?: boolean;
  /** Préférences injectées dans la réponse de GET /api/auth/me. */
  prefs?: Record<string, unknown>;
  /** Laisse les écrans de premier lancement (bienvenue, installation). */
  premierLancement?: boolean;
}

/**
 * Un contexte prêt : thème et mouvement émulés, session admin posée, écrans de
 * premier lancement masqués, service worker bloqué (rien en cache entre deux
 * versions), polices Google servies vides (le réseau d'un banc n'a pas à les
 * atteindre ; le rendu retombe sur les polices de repli).
 */
export async function contexte(browser: Browser, o: OptionsContexte = {}): Promise<BrowserContext> {
  const appareil = o.appareil ?? IPHONE;
  const theme = o.theme ?? "light";
  const ctx = await browser.newContext({
    ...appareil,
    colorScheme: theme,
    reducedMotion: o.mouvement ?? "no-preference",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    serviceWorkers: "block",
  });
  if (o.connecte !== false) {
    await ctx.addCookies([{ name: "mn_session", value: jeton(), url: base(), httpOnly: true, sameSite: "Lax" }]);
  }
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
  await ctx.addInitScript(
    ({ theme, premier, prefs }) => {
      try {
        if (!premier) {
          localStorage.setItem("mn_hide_intro", "1");
          localStorage.setItem("mn.install.dismissed", "1");
        }
        let cache: { accent?: string; prefs?: Record<string, unknown> } = {};
        try {
          cache = JSON.parse(localStorage.getItem("mn_appearance") || "{}") || {};
        } catch {
          cache = {};
        }
        cache.accent = cache.accent || "terracotta";
        cache.prefs = { ...(cache.prefs || {}), ...(prefs || {}), theme_mode: theme };
        localStorage.setItem("mn_appearance", JSON.stringify(cache));
      } catch {
        /* stockage indisponible */
      }
    },
    { theme, premier: !!o.premierLancement, prefs: o.prefs ?? null },
  );
  // Le thème réel vient de /api/auth/me : on le force dans la réponse.
  await ctx.route(
    (u) => u.pathname === "/api/auth/me",
    async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const resp = await route.fetch();
      let json: { user?: { prefs?: Record<string, unknown> } } | null = null;
      try {
        json = await resp.json();
      } catch {
        return route.fulfill({ response: resp });
      }
      if (json && json.user) json.user.prefs = { ...(json.user.prefs || {}), ...(o.prefs || {}), theme_mode: theme };
      return route.fulfill({ response: resp, json });
    },
  );
  return ctx;
}

/* ── API (côté node, avec la session de test) ──────────────────────────── */

export async function api<T = unknown>(methode: string, chemin: string, corps?: unknown): Promise<T> {
  const r = await fetch(`${base()}/api${chemin}`, {
    method: methode,
    headers: { cookie: `mn_session=${jeton()}`, ...(corps === undefined ? {} : { "content-type": "application/json" }) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${methode} ${chemin} → ${r.status} ${texte.slice(0, 200)}`);
  return (texte ? JSON.parse(texte) : null) as T;
}

/** Pose des préférences du compte de test (PATCH /api/auth/me). */
export async function poserPrefs(prefs: Record<string, unknown>): Promise<void> {
  await api("PATCH", "/auth/me", { prefs });
}

/* ── Erreurs de la page ────────────────────────────────────────────────── */

export interface Erreurs {
  console: string[];
  page: string[];
}

/** Collecte les erreurs console (de notre origine) et les exceptions. */
export function erreurs(page: Page): Erreurs {
  const out: Erreurs = { console: [], page: [] };
  const hote = new URL(base()).host;
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const src = m.location()?.url || "";
    let externe = false;
    try {
      externe = !!src && new URL(src).host !== hote;
    } catch {
      externe = false;
    }
    if (!externe) out.console.push(m.text().slice(0, 400));
  });
  page.on("pageerror", (e) => out.page.push(String(e?.message ?? e).slice(0, 400)));
  return out;
}

/* ── Attendre le repos ─────────────────────────────────────────────────── */

/** Ce qui n'empêche pas le repos : les boucles d'ambiance marquées et les
 *  chargements (squelettes, images qui arrivent). */
export const AMBIANCE = ".fx-ambiant, .is-loading, .skeleton, .sk-line";

/** Les animations en cours (ou en pause) hors ambiance, décrites. À passer à
 *  page.evaluate. */
export function animationsHorsAmbiance(ambiance: string): string[] {
  const decrire = (el: Element | null) => {
    if (!el) return "?";
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}` : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  return document
    .getAnimations()
    .filter((a) => a.playState === "running" || a.playState === "paused" || a.pending)
    .filter((a) => {
      const t = (a.effect as KeyframeEffect | null)?.target ?? null;
      return !(t && t.closest(ambiance));
    })
    .map((a) => {
      const e = a.effect as KeyframeEffect | null;
      const nom = (a as CSSAnimation).animationName || (a as CSSTransition).transitionProperty || a.id || "waapi";
      return `${decrire(e?.target ?? null)}${e?.pseudoElement ?? ""} (${nom}, ${a.playState})`;
    });
}

/** Attend que plus rien ne bouge (hors ambiance). Le message liste ce qui
 *  bouge encore : un instantané sous charge prendrait une entrée tardive pour
 *  une boucle oubliée. */
export async function auRepos(page: Page, { delai = 6000 } = {}): Promise<void> {
  const fin = Date.now() + delai;
  let reste: string[] = [];
  while (Date.now() < fin) {
    reste = await page.evaluate(animationsHorsAmbiance, AMBIANCE);
    if (!reste.length) return;
    await page.waitForTimeout(60);
  }
  throw new Error(`Toujours en mouvement après ${delai} ms : ${reste.join(" ; ")}`);
}

/** Attend la page posée : réseau calme, polices, plus de spinner, repos. */
export async function posee(page: Page): Promise<void> {
  try {
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
  } catch {
    /* une requête lente ne bloque pas */
  }
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForFunction(() => !document.querySelector(".spinner"), null, { timeout: 10_000 }).catch(() => {});
  await auRepos(page);
}

/* ── Figer une animation pour la mesurer ───────────────────────────────── */

/**
 * Met en pause les animations du PROCHAIN élément qui correspond à
 * `selecteur` (dès son entrée dans le document, et celles qu'il recevra
 * ensuite) : un vol de 400 ms peut être fini avant la mesure. Lire ensuite
 * `window.__mnFige` (l'élément figé) ; `degeler(page)` relance tout.
 */
export async function figerProchain(page: Page, selecteur: string): Promise<void> {
  await page.evaluate((sel) => {
    const w = window as unknown as { __mnFige?: Element | null; __mnFigeArret?: () => void };
    w.__mnFige = null;
    w.__mnFigeArret?.();
    const pauser = (el: Element) => {
      for (const a of el.getAnimations({ subtree: true })) a.pause();
    };
    const origine = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      const a = origine.apply(this, args);
      if (w.__mnFige && (w.__mnFige === this || w.__mnFige.contains(this))) a.pause();
      return a;
    };
    const mo = new MutationObserver((recs) => {
      if (w.__mnFige) return;
      for (const r of recs) {
        for (const n of Array.from(r.addedNodes)) {
          if (n.nodeType !== 1) continue;
          const el = n as Element;
          const cible = el.matches(sel) ? el : el.querySelector(sel);
          if (cible) {
            w.__mnFige = cible;
            pauser(cible);
            return;
          }
        }
      }
    });
    mo.observe(document, { childList: true, subtree: true });
    w.__mnFigeArret = () => {
      mo.disconnect();
      Element.prototype.animate = origine;
    };
  }, selecteur);
}

/** Relance toutes les animations en pause et retire le gel. */
export async function degeler(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __mnFige?: Element | null; __mnFigeArret?: () => void };
    w.__mnFigeArret?.();
    w.__mnFige = null;
    for (const a of document.getAnimations()) if (a.playState === "paused") a.play();
  });
}

/** Met TOUTES les animations en pause (pour une capture d'une image). */
export async function geler(page: Page): Promise<number> {
  return page.evaluate(() => {
    const as = document.getAnimations();
    for (const a of as) a.pause();
    return as.length;
  });
}

/* ── Enregistrer les appels à animate ──────────────────────────────────── */

export interface Appel {
  cible: string;
  proprietes: string[];
  composite: string;
  fill: string;
  pseudo: string;
  duree: number;
}

/** À poser AVANT le chargement (contexte) : journalise chaque appel à
 *  Element.prototype.animate dans `window.__mnAnims`. */
export async function enregistrer(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    const w = window as unknown as { __mnAnims: unknown[] };
    w.__mnAnims = [];
    const origine = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, kf: Keyframe[] | PropertyIndexedKeyframes | null, opts?: number | KeyframeAnimationOptions) {
      try {
        const o = typeof opts === "object" && opts ? opts : {};
        const cles = Array.isArray(kf) ? kf : kf ? [kf] : [];
        const props = new Set<string>();
        for (const k of cles) for (const p of Object.keys(k)) if (!["offset", "easing", "composite"].includes(p)) props.add(p);
        const id = this.id ? `#${this.id}` : "";
        const cls = typeof this.className === "string" && this.className ? `.${this.className.trim().split(/\s+/).join(".")}` : "";
        w.__mnAnims.push({
          cible: `${this.tagName.toLowerCase()}${id}${cls}`,
          proprietes: [...props],
          composite: o.composite ?? "replace",
          fill: o.fill ?? "auto",
          pseudo: o.pseudoElement ?? "",
          duree: typeof opts === "number" ? opts : Number(o.duration ?? 0),
        });
      } catch {
        /* l'enregistreur ne casse jamais l'app */
      }
      return origine.call(this, kf, opts);
    };
  });
}

export async function appels(page: Page): Promise<Appel[]> {
  return page.evaluate(() => (window as unknown as { __mnAnims?: Appel[] }).__mnAnims ?? []);
}

export async function viderAppels(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __mnAnims?: unknown[] }).__mnAnims = [];
  });
}

/* ── L'iPhone et Android simulés ───────────────────────────────────────── */

/**
 * L'iPhone simulé (Chromium ne connaît ni l'interrupteur `switch` ni l'absence
 * de `vibrate`) : `HTMLInputElement.prototype.switch` existe, `vibrate` n'existe
 * pas, et on compte les clics reçus par l'interrupteur haptique (`commutations`)
 * et ceux qui auraient fui vers l'app (`fuites` : un écouteur en
 * bouillonnement sur le document ne doit jamais les voir).
 */
export async function simulerIphone(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    try {
      Object.defineProperty(HTMLInputElement.prototype, "switch", {
        configurable: true,
        get() {
          return this.hasAttribute("switch");
        },
        set(v: boolean) {
          if (v) this.setAttribute("switch", "");
          else this.removeAttribute("switch");
        },
      });
    } catch {
      /* déjà là */
    }
    try {
      delete (Navigator.prototype as unknown as { vibrate?: unknown }).vibrate;
    } catch {
      /* rien */
    }
    const w = window as unknown as { __mnHaptique: { commutations: number; fuites: number } };
    w.__mnHaptique = { commutations: 0, fuites: 0 };
    // Une bascule = le clic que l'étiquette relaie à SA case (vu en capture).
    document.addEventListener(
      "click",
      (ev) => {
        const t = ev.target as Element | null;
        if (t && t.matches && t.matches(".fx-haptique input")) w.__mnHaptique.commutations += 1;
      },
      true,
    );
    document.addEventListener("click", (ev) => {
      const t = ev.target as Element | null;
      if (t && t.closest && t.closest(".fx-haptique")) w.__mnHaptique.fuites += 1;
    });
  });
}

/** Android simulé : `navigator.vibrate` journalise ses motifs. */
export async function simulerAndroid(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    const w = window as unknown as { __mnVibrations: Array<number | number[]> };
    w.__mnVibrations = [];
    Object.defineProperty(Navigator.prototype, "vibrate", {
      configurable: true,
      value(motif: number | number[]) {
        w.__mnVibrations.push(motif);
        return true;
      },
    });
  });
}

export async function haptiques(page: Page): Promise<{ commutations: number; fuites: number; vibrations: Array<number | number[]> }> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __mnHaptique?: { commutations: number; fuites: number };
      __mnVibrations?: Array<number | number[]>;
    };
    return {
      commutations: w.__mnHaptique?.commutations ?? 0,
      fuites: w.__mnHaptique?.fuites ?? 0,
      vibrations: w.__mnVibrations ?? [],
    };
  });
}

/* ── Le toucher (CDP) ──────────────────────────────────────────────────── */

/** Un tap au doigt (vrais évènements tactiles, pas une souris). */
export async function taper(page: Page, x: number, y: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const p = [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: p });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Un glissé au doigt de `de` à `vers`, en `pas` étapes sur `duree` ms. */
export async function glisser(
  page: Page,
  de: { x: number; y: number },
  vers: { x: number; y: number },
  { pas = 12, duree = 240 } = {},
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number, y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(de.x, de.y) });
  for (let i = 1; i <= pas; i++) {
    const t = i / pas;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: point(de.x + (vers.x - de.x) * t, de.y + (vers.y - de.y) * t),
    });
    await page.waitForTimeout(duree / pas);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/* ── Débordement ───────────────────────────────────────────────────────── */

/** Rien ne dépasse à droite de l'écran (la page ne défile pas de côté).
 *  Rend les éléments les plus externes qui dépassent (vide = bien). */
export async function pasDeDebordement(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const largeur = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= largeur + 1) return [];
    const out: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const r = el.getBoundingClientRect();
      if (r.right <= largeur + 1 || r.width === 0) continue;
      const parent = el.parentElement;
      if (parent && parent.getBoundingClientRect().right > largeur + 1) continue;
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
      out.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} (droite ${Math.round(r.right)} > ${largeur})`);
      if (out.length >= 8) break;
    }
    return out.length ? out : [`scrollWidth ${document.documentElement.scrollWidth} > ${largeur}`];
  });
}
