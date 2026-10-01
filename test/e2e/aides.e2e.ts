// Le banc vérifie ses propres aides : les lots de la vague 2 s'appuient dessus
// pour mesurer leurs effets, une aide qui ment ferait passer un test pour de
// mauvaises raisons.

import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actif, appels, auRepos, contexte, enregistrer, figerProchain, degeler, glisser, IPHONE, lancer, posee, taper, url } from "./aides";

describe.skipIf(!actif)("les aides du banc navigateur", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await lancer();
  });
  afterAll(async () => {
    await browser?.close();
  });

  async function ouvrir(enregistre = false): Promise<Page> {
    const ctx = await contexte(browser, { appareil: IPHONE });
    if (enregistre) await enregistrer(ctx);
    const page = await ctx.newPage();
    await page.goto(url("/"));
    await posee(page);
    return page;
  }

  it("auRepos attend la fin, et nomme ce qui bouge encore", async () => {
    const page = await ouvrir();
    await page.evaluate(() => {
      const el = document.createElement("div");
      el.className = "banc-boucle";
      document.getElementById("mn-couches")!.appendChild(el);
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
    });
    await auRepos(page); // une animation finie n'empêche pas le repos
    await page.evaluate(() => {
      document.querySelector(".banc-boucle")!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1000, iterations: Infinity });
    });
    await expect(auRepos(page, { delai: 300 })).rejects.toThrow(/banc-boucle/);
    // Marquée comme ambiance, la même boucle ne gêne plus.
    await page.evaluate(() => {
      const el = document.querySelector(".banc-boucle")!;
      el.className = "banc-boucle fx-ambiant";
    });
    await auRepos(page, { delai: 300 });
    await page.context().close();
  });

  it("l'enregistreur voit chaque appel à animate, avec composite et fill", async () => {
    const page = await ouvrir(true);
    await page.evaluate(() => {
      const c = (window.MnFx as unknown as { core: { entreeComposee(el: Element, axe: string, px: number): Animation } }).core;
      const el = document.createElement("div");
      el.className = "banc-entree";
      el.style.cssText = "position:fixed;left:0;top:0;width:20px;height:20px";
      document.getElementById("mn-couches")!.appendChild(el);
      c.entreeComposee(el, "y", 20);
    });
    const a = (await appels(page)).filter((x) => x.cible.includes("banc-entree"));
    expect(a).toHaveLength(2);
    expect(a.map((x) => x.composite).sort()).toEqual(["add", "replace"]);
    expect(a.every((x) => x.fill === "none")).toBe(true);
    expect(a.map((x) => x.proprietes.join()).sort()).toEqual(["opacity", "transform"]);
    await page.context().close();
  });

  it("figerProchain met en pause le prochain élément qui entre, degeler le relance", async () => {
    const page = await ouvrir();
    await figerProchain(page, ".banc-vol");
    const etat = await page.evaluate(async () => {
      const el = document.createElement("div");
      el.className = "banc-vol";
      document.getElementById("mn-couches")!.appendChild(el);
      await new Promise((ok) => setTimeout(ok, 0)); // le rappel de l'observateur
      const a = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      return { fige: (window as unknown as { __mnFige?: Element }).__mnFige === el, etat: a.playState };
    });
    expect(etat).toEqual({ fige: true, etat: "paused" });
    await degeler(page);
    await auRepos(page, { delai: 1500 });
    await page.context().close();
  });

  it("taper et glisser envoient de vrais évènements tactiles", async () => {
    const page = await ouvrir();
    await page.evaluate(() => {
      const w = window as unknown as { __touches: string[] };
      w.__touches = [];
      // Une surface de test au-dessus de l'app : un tap n'ouvre rien, un glissé ne défile pas.
      const surface = document.createElement("div");
      surface.style.cssText = "position:fixed;inset:0;z-index:100000;touch-action:none";
      document.getElementById("mn-couches")!.appendChild(surface);
      for (const t of ["touchstart", "touchmove", "touchend"]) {
        document.addEventListener(t, () => w.__touches.push(t), { capture: true, passive: true });
      }
    });
    await taper(page, 100, 300);
    await glisser(page, { x: 100, y: 300 }, { x: 100, y: 500 }, { pas: 4, duree: 80 });
    const t = await page.evaluate(() => (window as unknown as { __touches: string[] }).__touches);
    expect(t[0]).toBe("touchstart");
    expect(t[1]).toBe("touchend");
    expect(t.filter((x) => x === "touchmove").length).toBeGreaterThanOrEqual(4);
    expect(t.at(-1)).toBe("touchend");
    await page.context().close();
  });
});
