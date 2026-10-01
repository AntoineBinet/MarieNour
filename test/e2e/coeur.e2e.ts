// Le cœur et le montage de la couche d'effets, dans l'app réelle : ce sur quoi
// les huit modules de la vague 2 s'appuient sans pouvoir le modifier. Les
// outils sont pris dans window.MnFx (objets publics de débogage), et les
// nœuds de test sont posés dans #mn-couches (observé par le montage, jamais
// dans un nœud que React possède).

import type { Browser, BrowserContext, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actif, BUREAU, contexte, haptiques, IPHONE, lancer, posee, simulerAndroid, simulerIphone, url } from "./aides";

type Fx = {
  core: Record<string, (...a: never[]) => unknown> & { DUR: Record<string, number>; haptique: { tic(l?: boolean): boolean; succes(): boolean } };
  montage: Record<string, (...a: never[]) => unknown>;
};

describe.skipIf(!actif)("cœur et montage de la couche d'effets", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await lancer();
  });
  afterAll(async () => {
    await browser?.close();
  });

  async function ouvrir(o: Parameters<typeof contexte>[1] = {}, prep?: (ctx: BrowserContext) => Promise<void>): Promise<Page> {
    const ctx = await contexte(browser, o);
    if (prep) await prep(ctx);
    const page = await ctx.newPage();
    await page.goto(url("/"));
    await posee(page);
    return page;
  }

  it("jouer ne tient rien : fill forcé à none, l'animation sort de getAnimations à la fin", async () => {
    const page = await ouvrir();
    const r = await page.evaluate(async () => {
      const c = (window.MnFx as unknown as Fx).core;
      const el = document.createElement("div");
      el.style.cssText = "position:fixed;left:10px;top:10px;width:40px;height:40px";
      document.getElementById("mn-couches")!.appendChild(el);
      const a = (c.jouer as (e: Element, k: Keyframe[], o: object) => Animation)(el, [{ opacity: 0 }, { opacity: 1 }], {
        duration: 80,
        fill: "forwards",
      });
      const fill = a.effect!.getComputedTiming().fill;
      await new Promise((ok) => setTimeout(ok, 250));
      const reste = el.getAnimations().length;
      el.remove();
      return { fill, reste };
    });
    expect(r.fill).toBe("none");
    expect(r.reste).toBe(0);
    await page.context().close();
  });

  it("lancer appelle fin une fois : vrai à la fin, faux à l'annulation, faux tout de suite sous « moins de mouvement »", async () => {
    const page = await ouvrir();
    const r = await page.evaluate(async () => {
      const c = (window.MnFx as unknown as Fx).core;
      const lancerFx = c.lancer as (e: Element, k: Keyframe[], o: object, f: (ok: boolean) => void) => Animation | null;
      const el = document.createElement("div");
      el.style.cssText = "position:fixed;left:10px;top:10px;width:40px;height:40px";
      document.getElementById("mn-couches")!.appendChild(el);
      const fins: string[] = [];
      lancerFx(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 60 }, (ok) => fins.push(`fin:${ok}`));
      await new Promise((ok) => setTimeout(ok, 220));
      const a = lancerFx(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 2000 }, (ok) => fins.push(`annule:${ok}`));
      a!.cancel();
      await new Promise((ok) => setTimeout(ok, 50));
      const html = document.documentElement;
      const avant = html.getAttribute("data-motion");
      html.setAttribute("data-motion", "off");
      const sync: string[] = [];
      const nul = lancerFx(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 60 }, (ok) => sync.push(`reduit:${ok}`));
      if (avant === null) html.removeAttribute("data-motion");
      else html.setAttribute("data-motion", avant);
      el.remove();
      return { fins, sync, nul: nul === null };
    });
    expect(r.fins).toEqual(["fin:true", "annule:false"]);
    expect(r.sync).toEqual(["reduit:false"]);
    expect(r.nul).toBe(true);
    await page.context().close();
  });

  it("entreeComposee s'ajoute au transform posé par la feuille (composite add)", async () => {
    const page = await ouvrir();
    const r = await page.evaluate(() => {
      const c = (window.MnFx as unknown as Fx).core;
      const el = document.createElement("div");
      el.style.cssText = "position:fixed;left:200px;top:100px;width:100px;height:40px;transform:translateX(-50%)";
      document.getElementById("mn-couches")!.appendChild(el);
      (c.entreeComposee as (e: Element, axe: string, px: number) => Animation)(el, "y", 40);
      const anims = el.getAnimations();
      for (const a of anims) {
        a.pause();
        a.currentTime = 0;
      }
      const m = new DOMMatrix(getComputedStyle(el).transform);
      const res = {
        n: anims.length,
        composites: anims.map((a) => (a.effect as KeyframeEffect).composite).sort(),
        tx: m.m41,
        ty: m.m42,
        opacite: getComputedStyle(el).opacity,
      };
      for (const a of anims) a.cancel();
      el.remove();
      return res;
    });
    expect(r.n).toBe(2);
    expect(r.composites).toEqual(["add", "replace"]);
    expect(r.tx).toBeCloseTo(-50, 0);
    expect(r.ty).toBeCloseTo(40, 0);
    expect(r.opacite).toBe("0");
    await page.context().close();
  });

  it("surveiller : entrée à l'image suivante, sortie avec le dernier rectangle, ni l'une ni l'autre pour un déplacement", async () => {
    const page = await ouvrir();
    await page.evaluate(() => {
      const m = (window.MnFx as unknown as Fx).montage;
      const w = window as unknown as { __j: unknown[]; __off: () => void };
      w.__j = [];
      w.__off = (m.surveiller as (s: string, v: object) => () => void)(".banc-x", {
        entre: (el: HTMLElement) => w.__j.push(["entre", el.dataset.k]),
        sort: (el: HTMLElement, parent: Node | null, rect: { x: number; w: number } | null) =>
          // Le rectangle n'est vérifié que pour « a » (relevé attendu) : pour les
          // autres, le premier rappel de l'IntersectionObserver peut ou non être passé.
          w.__j.push(
            el.dataset.k === "a"
              ? ["sort", "a", rect ? Math.round(rect.x) : null, rect ? Math.round(rect.w) : null, !!parent?.isConnected]
              : ["sort", el.dataset.k, !!parent?.isConnected],
          ),
      });
      const a = document.createElement("div");
      a.className = "banc-x";
      a.dataset.k = "a";
      a.style.cssText = "position:fixed;left:30px;top:120px;width:50px;height:20px";
      document.getElementById("mn-couches")!.appendChild(a);
    });
    await page.waitForFunction(() => (window as unknown as { __j: unknown[] }).__j.length === 1);
    await page.waitForTimeout(120); // premier rappel de l'IntersectionObserver : le relevé
    const r = await page.evaluate(async () => {
      const w = window as unknown as { __j: unknown[]; __off: () => void };
      const couches = document.getElementById("mn-couches")!;
      const a = couches.querySelector<HTMLElement>(".banc-x")!;
      const temoin = document.createElement("div");
      couches.appendChild(temoin);
      couches.insertBefore(a, temoin.nextSibling); // déplacé : retiré puis remis
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      const apresDeplacement = w.__j.length;
      a.remove();
      // Un sous-arbre masqué par Suspense (display:none en ligne) n'entre ni ne sort.
      const cache = document.createElement("div");
      cache.style.display = "none";
      const b = document.createElement("div");
      b.className = "banc-x";
      b.dataset.k = "b";
      cache.appendChild(b);
      couches.appendChild(cache);
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      cache.remove();
      // Un conteneur visible : ses deux éléments entrent, puis sortent avec lui.
      const boite = document.createElement("div");
      for (const k of ["c", "d"]) {
        const e = document.createElement("div");
        e.className = "banc-x";
        e.dataset.k = k;
        e.style.cssText = "height:10px";
        boite.appendChild(e);
      }
      couches.appendChild(boite);
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      boite.remove();
      await Promise.resolve(); // le rappel du montage passe avant la désinscription
      w.__off();
      const apres = document.createElement("div");
      apres.className = "banc-x";
      apres.dataset.k = "z";
      couches.appendChild(apres);
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      apres.remove();
      temoin.remove();
      return { apresDeplacement, journal: w.__j };
    });
    expect(r.apresDeplacement).toBe(1);
    expect(r.journal).toEqual([
      ["entre", "a"],
      ["sort", "a", 30, 50, true],
      ["entre", "c"],
      ["entre", "d"],
      ["sort", "c", false],
      ["sort", "d", false],
    ]);
    await page.context().close();
  });

  it("observerAttributs prévient d'un changement d'attribut, avec l'ancienne valeur, jusqu'à l'arrêt", async () => {
    const page = await ouvrir();
    const r = await page.evaluate(async () => {
      const m = (window.MnFx as unknown as Fx).montage;
      const el = document.createElement("button");
      el.setAttribute("aria-expanded", "false");
      document.getElementById("mn-couches")!.appendChild(el);
      const vus: string[] = [];
      const stop = (m.observerAttributs as (e: Element, a: string[], cb: (n: string, e: Element, ancien: string | null) => void) => () => void)(
        el,
        ["aria-expanded"],
        (nom, cible, ancien) => vus.push(`${nom}:${ancien}->${cible.getAttribute(nom)}`),
      );
      el.setAttribute("aria-expanded", "true");
      el.setAttribute("title", "ignoré");
      await Promise.resolve();
      stop();
      el.setAttribute("aria-expanded", "false");
      await Promise.resolve();
      el.remove();
      return vus;
    });
    expect(r).toEqual(["aria-expanded:false->true"]);
    await page.context().close();
  });

  it("le relevé suit le défilement, y compris quand le corps est verrouillé (feuille ouverte)", async () => {
    const page = await ouvrir();
    const r = await page.evaluate(async () => {
      const m = (window.MnFx as unknown as Fx).montage;
      const rects: Array<{ y: number } | null> = [];
      const off = (m.surveiller as (s: string, v: object) => () => void)(".banc-r", {
        sort: (_el: Element, _p: Node, rect: { y: number } | null) => rects.push(rect ? { y: Math.round(rect.y) } : null),
      });
      const couches = document.getElementById("mn-couches")!;
      const espace = document.createElement("div");
      espace.style.height = "3000px";
      couches.appendChild(espace);
      window.scrollTo({ top: 300, behavior: "instant" });
      const poser = () => {
        const el = document.createElement("div");
        el.className = "banc-r";
        el.style.cssText = `position:absolute;left:20px;top:${window.scrollY + 200}px;width:40px;height:40px`;
        couches.appendChild(el);
        return el;
      };
      const attendre = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
      // 1. Défilement de 100 px après le relevé : le rectangle remonte de 100.
      let el = poser();
      await attendre(150);
      window.scrollTo({ top: 400, behavior: "instant" });
      await attendre(50);
      el.remove();
      await attendre(20); // le rappel du montage passe AVANT la suite
      // 2. Corps verrouillé comme lockBodyScroll (position fixe, top négatif) :
      //    scrollY retombe à 0, l'élément n'a pas bougé à l'écran.
      el = poser();
      await attendre(150);
      const y = window.scrollY;
      const s = document.body.style;
      s.position = "fixed";
      s.top = `-${y}px`;
      s.left = "0";
      s.right = "0";
      s.width = "100%";
      const ecran = Math.round(el.getBoundingClientRect().top);
      const scrollVerrouille = window.scrollY;
      el.remove();
      await attendre(20); // le rappel du montage passe pendant que le corps est verrouillé
      s.position = s.top = s.left = s.right = s.width = "";
      window.scrollTo({ top: y, behavior: "instant" });
      off();
      espace.remove();
      return { rects, ecran, scrollVerrouille };
    });
    expect(r.rects[0]?.y).toBe(100);
    expect(r.ecran).toBe(200);
    expect(r.scrollVerrouille).toBe(0);
    expect(r.rects[1]?.y).toBe(200);
    await page.context().close();
  });

  it("fantome : désarmé, posé à son rectangle dans #mn-fx, sans rejouer ses animations CSS, retiré proprement", async () => {
    const page = await ouvrir();
    const r = await page.evaluate(() => {
      const c = (window.MnFx as unknown as Fx).core;
      const couches = document.getElementById("mn-couches")!;
      const el = document.createElement("div");
      el.id = "banc-f";
      el.setAttribute("role", "dialog");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-live", "polite");
      el.dataset.state = "open";
      el.style.cssText = "position:fixed;left:40px;top:60px;width:120px;height:80px;animation:spin 1s linear infinite";
      const bouton = document.createElement("button");
      bouton.id = "banc-b";
      bouton.textContent = "ok";
      el.appendChild(bouton);
      couches.appendChild(el);
      const rect = el.getBoundingClientRect();
      const r0 = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
      el.remove(); // comme React
      const retrait = (c.fantome as (n: Element, r: object) => (() => void) & { noeud: Element | null })(el, r0);
      const pose = el.getBoundingClientRect();
      const res = {
        noeudEstLui: retrait.noeud === el,
        parent: el.parentElement?.id,
        id: el.id,
        role: el.getAttribute("role"),
        tabindex: el.getAttribute("tabindex"),
        ariaLive: el.getAttribute("aria-live"),
        dataState: el.getAttribute("data-state"),
        fantome: el.hasAttribute("data-fx-fantome"),
        inert: el.hasAttribute("inert"),
        cache: el.getAttribute("aria-hidden"),
        boutonId: bouton.id,
        pose: [pose.left, pose.top, pose.width, pose.height].map(Math.round),
        animationsCss: el.getAnimations().length,
        pointeur: getComputedStyle(el).pointerEvents,
      };
      retrait();
      const fx = document.getElementById("mn-fx");
      return { ...res, retire: !el.isConnected, fxVide: !fx || fx.childElementCount === 0 };
    });
    expect(r.noeudEstLui).toBe(true);
    expect(r.parent).toBe("mn-fx");
    expect([r.id, r.role, r.tabindex, r.ariaLive, r.dataState, r.boutonId]).toEqual(["", null, null, null, null, ""]);
    expect(r.fantome && r.inert).toBe(true);
    expect(r.cache).toBe("true");
    expect(r.pose).toEqual([40, 60, 120, 80]);
    expect(r.animationsCss).toBe(0);
    expect(r.pointeur).toBe("none");
    expect(r.retire && r.fxVide).toBe(true);
    await page.context().close();
  });

  it("fantome d'un nœud ENCORE dans l'app : on pose une copie, l'original ne bouge pas", async () => {
    const page = await ouvrir();
    const r = await page.evaluate(() => {
      const c = (window.MnFx as unknown as Fx).core;
      const couches = document.getElementById("mn-couches")!;
      const el = document.createElement("div");
      el.id = "banc-vivant";
      el.style.cssText = "position:fixed;left:10px;top:10px;width:50px;height:50px;overflow:auto";
      const champ = document.createElement("input");
      champ.value = "tapé";
      el.appendChild(champ);
      couches.appendChild(el);
      champ.value = "tapé puis modifié";
      const retrait = (c.fantome as (n: Element) => (() => void) & { noeud: Element | null })(el);
      const copie = retrait.noeud as HTMLElement;
      const res = {
        originalEnPlace: el.parentElement === couches && el.id === "banc-vivant",
        copieAilleurs: copie !== el && copie.parentElement?.id === "mn-fx",
        valeur: (copie.querySelector("input") as HTMLInputElement).value,
      };
      retrait();
      el.remove();
      return res;
    });
    expect(r.originalEnPlace).toBe(true);
    expect(r.copieAilleurs).toBe(true);
    expect(r.valeur).toBe("tapé puis modifié");
    await page.context().close();
  });

  it("flip : chaque élément part de sa place d'avant et glisse en composite add, rien ne reste à la fin", async () => {
    const page = await ouvrir();
    const r = await page.evaluate(async () => {
      const c = (window.MnFx as unknown as Fx).core;
      const couches = document.getElementById("mn-couches")!;
      const boite = document.createElement("div");
      boite.style.cssText = "position:fixed;left:0;top:100px;width:100px";
      const enfants = [0, 1, 2].map((i) => {
        const e = document.createElement("div");
        e.style.cssText = "height:30px";
        e.dataset.i = String(i);
        boite.appendChild(e);
        return e;
      });
      couches.appendChild(boite);
      const avant = (c.releverRects as (e: Element[]) => Map<Element, { y: number }>)(enfants);
      for (const e of [...enfants].reverse()) boite.appendChild(e); // 2, 1, 0
      const anims = (c.flip as (e: Element[], a: Map<Element, unknown>) => Animation[])(enfants, avant);
      for (const a of anims) {
        a.pause();
        a.currentTime = 0;
      }
      const yDepart = enfants.map((e) => Math.round(e.getBoundingClientRect().top));
      const composites = anims.map((a) => (a.effect as KeyframeEffect).composite);
      for (const a of anims) a.play();
      await new Promise((ok) => setTimeout(ok, 900));
      const reste = boite.getAnimations({ subtree: true }).length;
      const yFin = enfants.map((e) => Math.round(e.getBoundingClientRect().top));
      boite.remove();
      return { n: anims.length, yDepart, yFin, composites, reste };
    });
    expect(r.n).toBe(2); // celui du milieu ne bouge pas
    expect(r.yDepart).toEqual([100, 130, 160]);
    expect(r.yFin).toEqual([160, 130, 100]);
    expect(r.composites).toEqual(["add", "add"]);
    expect(r.reste).toBe(0);
    await page.context().close();
  });

  it("le geste frais dure 600 ms", async () => {
    const page = await ouvrir({ appareil: BUREAU });
    const frais = () => page.evaluate(() => ((window.MnFx as unknown as Fx).core.gesteFrais as () => boolean)());
    await page.waitForTimeout(700);
    expect(await frais()).toBe(false);
    await page.keyboard.press("Shift");
    expect(await frais()).toBe(true);
    await page.waitForTimeout(700);
    expect(await frais()).toBe(false);
    await page.context().close();
  });

  it("haptique sur iPhone : l'interrupteur bascule hors de la distribution du clic, sans fuite ni vol du focus", async () => {
    const page = await ouvrir({ appareil: IPHONE }, simulerIphone);
    const r = await page.evaluate(async () => {
      const c = (window.MnFx as unknown as Fx).core;
      const champ = document.createElement("input");
      champ.style.cssText = "position:fixed;left:10px;top:10px";
      document.getElementById("mn-couches")!.appendChild(champ);
      champ.focus();
      const tic = c.haptique.tic();
      const pendant = (window as unknown as { __mnHaptique: { commutations: number } }).__mnHaptique.commutations;
      await new Promise((ok) => setTimeout(ok, 30));
      const succes = c.haptique.succes();
      await new Promise((ok) => setTimeout(ok, 200));
      const focus = document.activeElement === champ;
      const label = document.querySelector(".fx-haptique");
      const horsEcran = label ? label.getBoundingClientRect().right <= 0 : false;
      champ.remove();
      return { tic, succes, pendant, focus, horsEcran, dansBody: label?.parentElement === document.body };
    });
    const h = await haptiques(page);
    expect(r.tic).toBe(true);
    expect(r.succes).toBe(true);
    expect(r.pendant).toBe(0); // différé : jamais pendant l'appel
    expect(h.commutations).toBe(3);
    expect(h.fuites).toBe(0);
    expect(r.focus).toBe(true);
    expect(r.horsEcran && r.dansBody).toBe(true);
    await page.context().close();
  });

  it("haptique sur Android vibre, et rien sur un écran sans toucher", async () => {
    const tel = await ouvrir({ appareil: IPHONE }, simulerAndroid);
    await tel.evaluate(() => {
      const h = (window.MnFx as unknown as Fx).core.haptique;
      h.tic();
      h.tic(true);
      h.succes();
    });
    expect((await haptiques(tel)).vibrations).toEqual([9, 5, [10, 55, 18]]);
    await tel.context().close();

    const bureau = await ouvrir({ appareil: BUREAU });
    expect(await bureau.evaluate(() => (window.MnFx as unknown as Fx).core.haptique.tic())).toBe(false);
    expect(await bureau.evaluate(() => document.querySelector(".fx-haptique"))).toBeNull();
    await bureau.context().close();
  });

  it("les jetons de fx.css sont relus par le cœur", async () => {
    const page = await ouvrir();
    const r = await page.evaluate(() => {
      const c = (window.MnFx as unknown as Fx).core as unknown as { DUR: Record<string, number>; EASE: Record<string, string> };
      return { dur: { ...c.DUR }, spring: c.EASE.spring };
    });
    expect(r.dur).toEqual({ xs: 160, s: 260, m: 420, l: 700 });
    expect(r.spring).toMatch(/^linear\(/);
    await page.context().close();
  });
});
