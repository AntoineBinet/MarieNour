// Le socle de la couche d'effets, dans un vrai navigateur : la couche est
// installée et ne casse rien, l'arbitre du mouvement dit la même chose que le
// réglage du membre et que l'appareil, la page de personnalisation propose les
// trois choix hors du pli des réglages avancés.

import type { Browser, Page } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  actif,
  api,
  BUREAU,
  contexte,
  erreurs,
  IPHONE,
  IPHONE_SE,
  lancer,
  pasDeDebordement,
  posee,
  poserPrefs,
  url,
} from "./aides";

const MODULES = ["eclosion", "navigation", "verre", "feuille", "flux", "vivant", "vol", "scene"];

describe.skipIf(!actif)("socle de la couche d'effets", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await lancer();
  });
  afterAll(async () => {
    await browser?.close();
  });
  afterEach(async () => {
    await poserPrefs({ motion: null });
  });

  async function ouvrir(chemin: string, o: Parameters<typeof contexte>[1] = {}): Promise<Page> {
    const ctx = await contexte(browser, o);
    const page = await ctx.newPage();
    await page.goto(url(chemin));
    await posee(page);
    return page;
  }

  it("window.MnFx porte le cœur et les huit modules, tous figés", async () => {
    const page = await ouvrir("/");
    const etat = await page.evaluate(() => {
      const fx = window.MnFx ?? {};
      return {
        cles: Object.keys(fx),
        fige: Object.isFrozen(fx),
        modulesFiges: Object.values(fx).every((m) => Object.isFrozen(m)),
        installe: !!window.__mnFx,
      };
    });
    expect(etat.installe).toBe(true);
    expect(etat.fige).toBe(true);
    expect(etat.modulesFiges).toBe(true);
    for (const m of ["core", "montage", ...MODULES]) expect(etat.cles, m).toContain(m);
    await page.context().close();
  });

  it("les conteneurs de couches sont frères de #root, dans l'ordre", async () => {
    const page = await ouvrir("/");
    const ordre = await page.evaluate(() => Array.from(document.body.children).map((e) => e.id).filter(Boolean));
    expect(ordre.indexOf("root")).toBeGreaterThanOrEqual(0);
    expect(ordre.indexOf("mn-couches")).toBe(ordre.indexOf("root") + 1);
    await page.context().close();
  });

  for (const [motion, attendu] of [
    ["system", null],
    ["reduce", "off"],
    ["always", "on"],
  ] as const) {
    it(`le réglage « ${motion} » pose data-motion=${attendu ?? "(rien)"}`, async () => {
      await poserPrefs({ motion });
      const page = await ouvrir("/");
      expect(await page.evaluate(() => document.documentElement.getAttribute("data-motion"))).toBe(attendu);
      expect(await page.evaluate(() => window.MNMotion?.mode())).toBe(motion);
      await page.context().close();
    });
  }

  it("l'ancien booléen reduce_motion est toujours compris", async () => {
    await poserPrefs({ reduce_motion: true });
    const moi = await api<{ user: { prefs: Record<string, unknown> } }>("GET", "/auth/me");
    expect(moi.user.prefs.motion).toBe("reduce");
    const page = await ouvrir("/");
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-motion"))).toBe("off");
    await page.context().close();
  });

  it("l'arbitre : l'appareil décide en « système », le membre sinon, et le cœur dit pareil", async () => {
    const cas: Array<[string, "reduce" | "no-preference", boolean]> = [
      ["system", "reduce", true],
      ["system", "no-preference", false],
      ["always", "reduce", false],
      ["reduce", "no-preference", true],
    ];
    for (const [motion, appareil, attendu] of cas) {
      await poserPrefs({ motion });
      const page = await ouvrir("/", { mouvement: appareil });
      const lu = await page.evaluate(() => ({
        theme: window.MNMotion?.reduit(),
        coeur: (window.MnFx?.core as { reduit?: () => boolean } | undefined)?.reduit?.(),
      }));
      expect(lu.theme, `${motion} / appareil ${appareil}`).toBe(attendu);
      expect(lu.coeur, `${motion} / appareil ${appareil} (cœur)`).toBe(attendu);
      await page.context().close();
    }
  });

  it("MNMotion.reduit() relit l'appareil à chaque appel et onChange prévient", async () => {
    const page = await ouvrir("/", { mouvement: "no-preference" });
    await page.evaluate(() => {
      const w = window as unknown as { __mnChangements: boolean[] };
      w.__mnChangements = [];
      window.MNMotion?.onChange((_m, r) => w.__mnChangements.push(r));
    });
    expect(await page.evaluate(() => window.MNMotion?.reduit())).toBe(false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await page.evaluate(() => window.MNMotion?.reduit())).toBe(true);
    await page.waitForFunction(() => (window as unknown as { __mnChangements: boolean[] }).__mnChangements.length > 0);
    expect(await page.evaluate(() => (window as unknown as { __mnChangements: boolean[] }).__mnChangements.at(-1))).toBe(true);
    await page.context().close();
  });

  for (const [nom, appareil, theme] of [
    ["iPhone clair", IPHONE, "light"],
    ["iPhone sombre", IPHONE, "dark"],
    ["bureau clair", BUREAU, "light"],
  ] as const) {
    it(`aucune erreur console sur l'accueil (${nom})`, async () => {
      const ctx = await contexte(browser, { appareil, theme });
      const page = await ctx.newPage();
      const e = erreurs(page);
      await page.goto(url("/"));
      await posee(page);
      expect(e.page).toEqual([]);
      expect(e.console).toEqual([]);
      await ctx.close();
    });
  }

  it("tant que les modules sont des bouchons, la couche ne pose rien dans l'app", async () => {
    const page = await ouvrir("/");
    const bouchons = await page.evaluate((mods) => mods.every((m) => (window.MnFx?.[m] as { bouchon?: boolean } | undefined)?.bouchon === true), MODULES);
    if (!bouchons) return; // un lot de la vague 2 a rempli un module : ses propres tests prennent le relais
    const etat = await page.evaluate(() => {
      const dataFx: string[] = [];
      for (const el of Array.from(document.querySelectorAll("#root *, #mn-couches *"))) {
        for (const a of Array.from(el.attributes)) if (a.name.startsWith("data-fx")) dataFx.push(`${el.tagName}[${a.name}]`);
      }
      const fx = document.getElementById("mn-fx");
      return {
        dataFx,
        fxVide: !fx || fx.childElementCount === 0,
        waapi: document.getAnimations().filter((a) => !(a as CSSAnimation).animationName && !(a as CSSTransition).transitionProperty).length,
      };
    });
    expect(etat.dataFx).toEqual([]);
    expect(etat.fxVide).toBe(true);
    expect(etat.waapi).toBe(0);
    await page.context().close();
  });

  describe("la page de personnalisation", () => {
    it("les trois choix sont hors du pli, et Toujours s'applique tout de suite puis s'enregistre", async () => {
      const page = await ouvrir("/personnalisation", { mouvement: "reduce" });
      const groupe = page.getByRole("group", { name: "Animations" });
      await expect.poll(() => groupe.isVisible()).toBe(true);
      for (const nom of ["Comme l'appareil", "Réduites", "Toujours"]) {
        expect(await groupe.getByRole("button", { name: new RegExp(nom) }).isVisible(), nom).toBe(true);
      }
      // L'appareil réduit et le membre suit l'appareil : la note le dit.
      const note = page.getByText("Ton appareil demande de réduire les animations. Choisis Toujours pour les garder ici.");
      expect(await note.isVisible()).toBe(true);
      // Pas de tiret cadratin dans la section (règle typographique du contrat).
      const section = await groupe.locator("xpath=ancestor::section[1]").innerText();
      expect(section).toContain("Confort");
      expect(section.includes("\u2014")).toBe(false);

      await groupe.getByRole("button", { name: /Toujours/ }).click();
      expect(await page.evaluate(() => document.documentElement.getAttribute("data-motion"))).toBe("on");
      expect(await groupe.getByRole("button", { name: /Toujours/ }).getAttribute("aria-pressed")).toBe("true");
      expect(await note.isVisible()).toBe(false);
      await expect
        .poll(async () => (await api<{ user: { prefs: Record<string, unknown> } }>("GET", "/auth/me")).user.prefs.motion, { timeout: 5000 })
        .toBe("always");

      await groupe.getByRole("button", { name: /Réduites/ }).click();
      expect(await page.evaluate(() => document.documentElement.getAttribute("data-motion"))).toBe("off");
      await expect
        .poll(async () => (await api<{ user: { prefs: Record<string, unknown> } }>("GET", "/auth/me")).user.prefs.motion, { timeout: 5000 })
        .toBe("reduce");
      await page.context().close();
    });

    it("ne déborde pas à 320 px", async () => {
      const page = await ouvrir("/personnalisation", { appareil: IPHONE_SE });
      expect(await pasDeDebordement(page)).toEqual([]);
      await page.context().close();
    });
  });
});
