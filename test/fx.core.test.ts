import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DUR,
  EASE,
  borneContenue,
  enMs,
  cles,
  clesEntree,
  conteneurFx,
  gerbe,
  gesteFrais,
  installer,
  lancer,
  lireEntier,
  peut,
  poser,
  progressionDe,
  reduit,
  ressort,
  valeurA,
} from "../src/fx/core";

// Le cœur de la couche d'effets est PUR au chargement : ce fichier l'importe
// sous node, sans document. Un accès à window ou à document au niveau du
// module ferait tomber l'import lui-même.

describe("ressort", () => {
  it("rend 41 pas par défaut, offsets de 0 à 1 strictement croissants", () => {
    const r = ressort(0, 100);
    expect(r.pas).toHaveLength(41);
    expect(r.pas[0].offset).toBe(0);
    expect(r.pas[40].offset).toBe(1);
    for (let i = 1; i < r.pas.length; i++) expect(r.pas[i].offset).toBeGreaterThan(r.pas[i - 1].offset);
  });

  it("part de son point de départ et finit EXACTEMENT sur la cible", () => {
    const r = ressort(12, -30);
    expect(r.pas[0].valeur).toBeCloseTo(12, 9);
    expect(r.pas[r.pas.length - 1].valeur).toBe(-30);
  });

  it("dépasse un peu sa cible, jamais beaucoup", () => {
    const r = ressort(0, 100);
    const max = Math.max(...r.pas.map((p) => p.valeur));
    expect(max).toBeGreaterThan(100);
    expect(max).toBeLessThanOrEqual(108);
    // Plus amorti, moins de dépassement.
    const doux = Math.max(...ressort(0, 100, { zeta: 0.9 }).pas.map((p) => p.valeur));
    expect(doux).toBeLessThan(max);
  });

  it("a une durée plausible, plus courte quand le ressort est plus raide", () => {
    const r = ressort(0, 1);
    expect(r.duree).toBeGreaterThanOrEqual(300);
    expect(r.duree).toBeLessThanOrEqual(700);
    expect(ressort(0, 1, { raideur: 400 }).duree).toBeLessThan(r.duree);
    expect(ressort(0, 1, { duree: 250 }).duree).toBe(250);
  });

  it("respecte le nombre de pas demandé", () => {
    expect(ressort(0, 1, { pas: 24 }).pas).toHaveLength(25);
  });

  it("part dans le sens de la vitesse du geste", () => {
    const vers0 = ressort(0, 0, { vitesse: 1.5 });
    expect(vers0.pas[1].valeur).toBeGreaterThan(0);
    const inverse = ressort(0, 0, { vitesse: -1.5 });
    expect(inverse.pas[1].valeur).toBeLessThan(0);
    // Un geste lâché vers la cible y arrive plus vite qu'au repos.
    const lache = ressort(100, 0, { vitesse: -1 });
    const repos = ressort(100, 0);
    expect(lache.pas[2].valeur).toBeLessThan(repos.pas[2].valeur);
    expect(lache.pas[lache.pas.length - 1].valeur).toBe(0);
  });

  it("borne un amortissement aberrant sans rendre NaN", () => {
    for (const zeta of [0, 1, 1.5, -2]) {
      const r = ressort(0, 1, { zeta });
      for (const p of r.pas) expect(Number.isFinite(p.valeur)).toBe(true);
      expect(r.pas[r.pas.length - 1].valeur).toBe(1);
    }
  });
});

describe("valeurA", () => {
  const pas = [
    { offset: 0, valeur: 10 },
    { offset: 0.5, valeur: 20 },
    { offset: 1, valeur: 0 },
  ];
  it("interpole entre les pas", () => {
    expect(valeurA(pas, 0)).toBe(10);
    expect(valeurA(pas, 0.25)).toBeCloseTo(15, 9);
    expect(valeurA(pas, 0.5)).toBe(20);
    expect(valeurA(pas, 0.75)).toBeCloseTo(10, 9);
    expect(valeurA(pas, 1)).toBe(0);
  });
  it("borne la progression et rend la fin quand elle est illisible", () => {
    expect(valeurA(pas, -3)).toBe(10);
    expect(valeurA(pas, 7)).toBe(0);
    expect(valeurA(pas, Number.NaN)).toBe(0);
    expect(valeurA([], 0.5)).toBe(0);
  });
  it("reprend un ressort là où il en est", () => {
    const r = ressort(0, 100);
    expect(valeurA(r.pas, 0)).toBeCloseTo(0, 9);
    expect(valeurA(r.pas, 1)).toBe(100);
    const mi = valeurA(r.pas, 0.3);
    expect(mi).toBeGreaterThan(0);
    expect(mi).toBeLessThan(110);
  });
  it("progressionDe rend 1 sans animation", () => {
    expect(progressionDe(null)).toBe(1);
  });
});

describe("clesEntree", () => {
  it("finit sur translate 0 et opacité 1, part transparent", () => {
    const e = clesEntree("y", 24);
    const der = e.kf[e.kf.length - 1];
    expect(der.transform).toBe("translateY(0px)");
    expect(der.opacity).toBe(1);
    expect(e.kf[0].opacity).toBe(0);
    expect(e.kf[0].transform).toBe("translateY(24px)");
    expect(e.duree).toBeGreaterThan(0);
  });
  it("sait l'axe horizontal, un préfixe et un suffixe", () => {
    const e = clesEntree("x", -16, { prefixe: "translateZ(0)", suffixe: "scale(1)" });
    expect(e.kf[0].transform).toBe("translateZ(0) translateX(-16px) scale(1)");
    expect(e.kf[e.kf.length - 1].transform).toBe("translateZ(0) translateX(0px) scale(1)");
  });
  it("l'opacité arrive avant la position", () => {
    const e = clesEntree("y", 30);
    const pleine = e.kf.findIndex((k) => k.opacity === 1);
    expect(pleine).toBeGreaterThan(0);
    expect(pleine).toBeLessThan(e.kf.length / 2);
  });
});

describe("clés de rectangles (vol)", () => {
  const de = { x: 10, y: 20, w: 50, h: 40 };
  const vers = { x: 0, y: 100, w: 300, h: 240 };
  const base = { w: 300, h: 240 };
  it("poser écrit translate puis scale depuis le coin haut gauche", () => {
    expect(poser(de, base)).toBe("translate(10px, 20px) scale(0.1667, 0.1667)");
    expect(poser(vers, base)).toBe("translate(0px, 100px) scale(1, 1)");
  });
  it("le premier transform est le départ, le dernier l'arrivée", () => {
    const k = cles(de, vers, base);
    expect(k.kf[0].transform).toBe(poser(de, base));
    expect(k.kf[k.kf.length - 1].transform).toBe(poser(vers, base));
    expect(k.kf).toHaveLength(49);
  });
  it("`min` étire la fenêtre sans changer l'arrivée", () => {
    const court = cles(de, vers, base);
    const long = cles(de, vers, base, { min: court.duree + 300 });
    expect(long.duree).toBe(court.duree + 300);
    expect(long.kf[long.kf.length - 1].transform).toBe(poser(vers, base));
  });
});

describe("lireEntier", () => {
  it("lit un entier et garde sa suite", () => {
    expect(lireEntier("42")).toEqual({ valeur: 42, suite: "" });
    expect(lireEntier(" 12 / 200 ")).toEqual({ valeur: 12, suite: " / 200" });
    expect(lireEntier("6 %")).toEqual({ valeur: 6, suite: " %" });
    expect(lireEntier("6\u202f%")).toEqual({ valeur: 6, suite: "\u202f%" });
    expect(lireEntier("0")).toEqual({ valeur: 0, suite: "" });
  });
  it("refuse un montant, une date, un texte", () => {
    for (const t of ["12,50 €", "1 800,00 €", "13.5", "12/09", "03/12", "007", "demain", "", null, undefined, "-3"]) {
      expect(lireEntier(t), String(t)).toBeNull();
    }
  });
});

describe("gerbe", () => {
  it("est déterministe pour une même graine", () => {
    expect(gerbe(7, 3)).toEqual(gerbe(7, 3));
    expect(gerbe(7, 3)).not.toEqual(gerbe(7, 4));
  });
  it("rend n éclats à distance bornée, délais de 0 à 50 ms", () => {
    const g = gerbe(5, 1, { dMin: 20, dMax: 40 });
    expect(g).toHaveLength(5);
    for (const e of g) {
      const d = Math.hypot(e.dx, e.dy);
      expect(d).toBeGreaterThanOrEqual(19.8);
      expect(d).toBeLessThanOrEqual(40.2);
      expect(Math.abs(e.rot)).toBeGreaterThanOrEqual(12);
      expect(Math.abs(e.rot)).toBeLessThanOrEqual(28);
    }
    expect(g[0].delai).toBe(0);
    expect(g[g.length - 1].delai).toBe(50);
  });
  it("borne le nombre d'éclats", () => {
    expect(gerbe(0)).toEqual([]);
    expect(gerbe(500)).toHaveLength(64);
  });
});

describe("borneContenue", () => {
  it("garde un éclat dans l'emprise de son bouton", () => {
    expect(borneContenue(100, 20, 8)).toBeLessThanOrEqual(16);
    expect(borneContenue(-100, 20, 8)).toBeGreaterThanOrEqual(-16);
    expect(borneContenue(5, 20, 8)).toBe(5);
  });
  it("tient compte du pic et de la rotation", () => {
    const droit = borneContenue(100, 20, 8, 1, 0);
    const tourne = borneContenue(100, 20, 8, 1.2, 45);
    expect(tourne).toBeLessThan(droit);
    expect(borneContenue(100, 2, 30)).toBe(0);
  });
});

describe("enMs", () => {
  it("lit les millisecondes et les secondes (le build minifie les jetons en secondes)", () => {
    expect(enMs("420ms")).toBe(420);
    expect(enMs(" .42s ")).toBe(420);
    expect(enMs("0.07s")).toBe(70);
    expect(enMs("1.5S")).toBe(1500);
    expect(enMs("160")).toBe(160);
    expect(Number.isNaN(enMs(""))).toBe(true);
    expect(Number.isNaN(enMs("vite"))).toBe(true);
  });
});

describe("sans document (node)", () => {
  it("rien ne bouge, rien ne lève", () => {
    expect(reduit()).toBe(true);
    expect(peut(null)).toBe(false);
    expect(conteneurFx()).toBeNull();
    expect(gesteFrais()).toBe(false);
    let fin: boolean | null = null;
    expect(lancer(null, [], {}, (f) => (fin = f))).toBeNull();
    expect(fin).toBe(false);
    const arret = installer();
    expect(typeof arret).toBe("function");
    arret();
  });
});

describe("parité des jetons fx.css et du code", () => {
  const css = readFileSync(new URL("../src/fx/fx.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  // Le premier bloc :root (hors @supports) porte les replis.
  const racine = /:root\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
  const jeton = (bloc: string, nom: string) => new RegExp(`${nom}\\s*:\\s*([^;]+);`).exec(bloc)?.[1].trim();
  const norm = (s: string | undefined) => (s ?? "").replace(/\s+/g, "");

  it("les durées", () => {
    expect(parseFloat(jeton(racine, "--fx-dur-xs") ?? "")).toBe(DUR.xs);
    expect(parseFloat(jeton(racine, "--fx-dur-s") ?? "")).toBe(DUR.s);
    expect(parseFloat(jeton(racine, "--fx-dur-m") ?? "")).toBe(DUR.m);
    expect(parseFloat(jeton(racine, "--fx-dur-l") ?? "")).toBe(DUR.l);
    for (const k of ["xs", "s", "m", "l"]) expect(jeton(racine, `--fx-dur-${k}`)).toMatch(/^\d+ms$/);
  });

  it("les courbes, et le repli du ressort", () => {
    expect(norm(jeton(racine, "--fx-ease-out"))).toBe(norm(EASE.out));
    expect(norm(jeton(racine, "--fx-ease-in-out"))).toBe(norm(EASE.inOut));
    expect(norm(jeton(racine, "--fx-ease-spring"))).toBe(norm(EASE.spring));
  });

  it("la courbe linear() est le ressort de core.ts", () => {
    const bloc = /@supports[^{]*linear[^{]*\{\s*:root\s*\{([\s\S]*?)\}\s*\}/.exec(css)?.[1] ?? "";
    const lin = /linear\(([^)]*)\)/.exec(jeton(bloc, "--fx-ease-spring") ?? "")?.[1];
    expect(lin, "linear() absent du bloc @supports").toBeTruthy();
    const valeurs = (lin ?? "").split(",").map((v) => parseFloat(v));
    const r = ressort(0, 1, { pas: valeurs.length - 1 });
    expect(valeurs).toHaveLength(r.pas.length);
    valeurs.forEach((v, i) => expect(Math.abs(v - r.pas[i].valeur), `pas ${i}`).toBeLessThan(0.0011));
  });

  it("l'échelle des plans de fx", () => {
    expect(Number(jeton(racine, "--fx-z-bas"))).toBeLessThan(100); // sous les modales
    expect(Number(jeton(racine, "--fx-z-bas"))).toBeGreaterThan(95); // au-dessus de l'app
    expect(Number(jeton(racine, "--fx-z-haut"))).toBeGreaterThan(400); // au-dessus de la visionneuse
  });
});
