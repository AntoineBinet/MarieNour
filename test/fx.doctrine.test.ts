import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// La doctrine de la couche d'effets (docs/DESIGN-FX.md §3), vérifiée en LISANT
// les fichiers, commentaires retirés : ce qu'un relecteur oublierait de
// vérifier à chaque lot. Patron des tests de doctrine de Vinyles.

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(RACINE, "src");
const FX = join(SRC, "fx");

/** Les modules d'effets, dans l'ordre d'installation fixé par le contrat. */
const MODULES = ["eclosion", "navigation", "verre", "feuille", "flux", "vivant", "vol", "scene"];
/** Les fichiers du socle (pas des modules). */
const SOCLE = ["index", "core", "montage"];

function lire(chemin: string): string {
  return readFileSync(chemin, "utf8");
}

function fichiers(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) out.push(...fichiers(p, ext));
    else if (ext.test(nom)) out.push(p);
  }
  return out;
}

/**
 * Retire les commentaires d'un source TS (`//`, bloc) en respectant les
 * chaînes (simples, doubles, gabarits) et les expressions régulières
 * littérales. Les chaînes restent : une interdiction écrite dans un texte
 * compte (un `"forwards"` en chaîne est un `fill` qui attend son heure).
 */
export function sansCommentaires(src: string): string {
  let out = "";
  let i = 0;
  let precedent = ""; // dernier caractère significatif émis
  const avantRegex = "(,=:[!&|?{};+-*%<>~^";
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      const fin = src.indexOf("*/", i + 2);
      const bloc = src.slice(i, fin < 0 ? src.length : fin + 2);
      out += bloc.replace(/[^\n]/g, " ");
      i = fin < 0 ? src.length : fin + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      precedent = c;
      continue;
    }
    if (c === "/" && (precedent === "" || avantRegex.includes(precedent))) {
      // Une expression régulière littérale : jusqu'au « / » non échappé hors classe.
      let j = i + 1;
      let classe = false;
      while (j < src.length && src[j] !== "\n") {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "[") classe = true;
        else if (src[j] === "]") classe = false;
        else if (src[j] === "/" && !classe) break;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      precedent = "/";
      continue;
    }
    out += c;
    if (!/\s/.test(c)) precedent = c;
    i++;
  }
  return out;
}

function sansCommentairesCss(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

const tsFx = fichiers(FX, /\.ts$/);
const cssFx = fichiers(FX, /\.css$/);
const codeFx = new Map(tsFx.map((f) => [f, sansCommentaires(lire(f))]));

/** La ligne (1-indexée) d'un index dans un texte. */
function ligne(texte: string, index: number): number {
  return texte.slice(0, index).split("\n").length;
}

function violations(texte: string, re: RegExp): string[] {
  const out: string[] = [];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = g.exec(texte))) out.push(`l.${ligne(texte, m.index)} « ${m[0]} »`);
  return out;
}

describe("le lecteur de commentaires", () => {
  it("retire les commentaires et garde les chaînes et les regex", () => {
    const t = sansCommentaires('const a = "// pas un commentaire"; // vrai\nconst r = /\\/\\*x/; /* bloc */ b();');
    expect(t).toContain('"// pas un commentaire"');
    expect(t).not.toContain("vrai");
    expect(t).not.toContain("bloc");
    expect(t).toContain("b();");
    expect(t).toContain("/\\/\\*x/");
  });
});

describe("la couche est posée par-dessus l'app", () => {
  it("les huit modules et le socle sont là, chacun avec sa feuille", () => {
    for (const m of MODULES) {
      expect(existsSync(join(FX, `${m}.ts`)), `${m}.ts`).toBe(true);
      expect(existsSync(join(FX, `${m}.css`)), `${m}.css`).toBe(true);
      const code = codeFx.get(join(FX, `${m}.ts`)) ?? "";
      expect(code, `${m}.ts importe sa feuille`).toMatch(new RegExp(`import\\s*["']\\./${m}\\.css["']`));
    }
    for (const s of SOCLE) expect(existsSync(join(FX, `${s}.ts`)), `${s}.ts`).toBe(true);
    expect(existsSync(join(FX, "fx.css"))).toBe(true);
  });

  it("aucun fichier inattendu dans src/fx", () => {
    const attendus = new Set([...MODULES, ...SOCLE].map((n) => `${n}.ts`).concat(MODULES.map((n) => `${n}.css`), ["fx.css"]));
    const presents = readdirSync(FX).filter((n) => !statSync(join(FX, n)).isDirectory());
    const inconnus = presents.filter((n) => !attendus.has(n));
    expect(inconnus, "un nouveau fichier de fx doit entrer dans le contrat").toEqual([]);
  });

  it("index.ts installe le cœur, le montage, puis les modules dans l'ordre fixe", () => {
    const code = codeFx.get(join(FX, "index.ts")) ?? "";
    const ordre = [...code.matchAll(/\[\s*"(\w+)"\s*,\s*(\w+)\s*\]/g)].map((m) => m[1]);
    expect(ordre).toEqual(MODULES);
    for (const m of MODULES) expect(code).toMatch(new RegExp(`import \\* as ${m} from "\\./${m}"`));
    expect(code).toMatch(/import\s*"\.\/fx\.css"/);
    const coeur = code.indexOf('installer("core"');
    const montage = code.indexOf('installer("montage"');
    const modules = code.indexOf("for (const [nom, m] of MODULES)");
    expect(coeur).toBeGreaterThan(0);
    expect(montage).toBeGreaterThan(coeur);
    expect(modules).toBeGreaterThan(montage);
    expect(code).toContain("window.__mnFx");
    expect(code).toContain("import.meta.hot");
  });

  it("src/main.tsx est le SEUL fichier hors de src/fx qui importe la couche", () => {
    const importeurs: string[] = [];
    for (const f of fichiers(SRC, /\.(ts|tsx)$/)) {
      if (f.startsWith(FX + "/") || f === FX) continue;
      const code = sansCommentaires(lire(f));
      const specs = [...code.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g)].map((m) => m[1]);
      for (const s of specs) {
        if (!s.startsWith(".")) continue;
        const cible = resolve(dirname(f), s);
        if (cible === FX || cible.startsWith(FX + "/")) importeurs.push(relative(RACINE, f));
      }
    }
    expect([...new Set(importeurs)]).toEqual(["src/main.tsx"]);
  });

  it("main.tsx démarre la couche après l'apparence et avant le premier rendu", () => {
    const code = sansCommentaires(lire(join(SRC, "main.tsx")));
    const apparence = code.indexOf("initAppearance();");
    const fx = code.indexOf("demarrerFx();");
    const rendu = code.indexOf("createRoot(");
    expect(apparence).toBeGreaterThan(0);
    expect(fx).toBeGreaterThan(apparence);
    expect(rendu).toBeGreaterThan(fx);
  });

  it("aucune page ni aucun composant n'importe la couche", () => {
    for (const dir of ["pages", "components", "widgets"]) {
      const d = join(SRC, dir);
      if (!existsSync(d)) continue;
      for (const f of fichiers(d, /\.(ts|tsx)$/)) {
        expect(sansCommentaires(lire(f)), relative(RACINE, f)).not.toMatch(/["'][./]*fx(\/[^"']*)?["']/);
      }
    }
  });
});

describe("ce que fx n'a pas le droit de faire", () => {
  it("ni innerHTML, ni outerHTML, ni insertAdjacentHTML, ni fetch, ni eval, ni new Function", () => {
    const interdits = /\b(innerHTML|outerHTML|insertAdjacentHTML)\b|\bfetch\s*\(|\beval\s*\(|\bnew\s+Function\b/;
    for (const [f, code] of codeFx) expect(violations(code, interdits), relative(RACINE, f)).toEqual([]);
  });

  it("rien n'est tenu à la fin : jamais fill forwards ni both", () => {
    const tenu = /fill\s*:\s*["'`](forwards|both)["'`]|["'`]forwards["'`]/;
    for (const [f, code] of codeFx) expect(violations(code, tenu), relative(RACINE, f)).toEqual([]);
    const tenuCss = /animation-fill-mode\s*:\s*(forwards|both)|animation\s*:[^;]*\b(forwards|both)\b/;
    for (const f of cssFx) expect(violations(sansCommentairesCss(lire(f)), tenuCss), relative(RACINE, f)).toEqual([]);
  });

  it("jamais classList : l'état d'un nœud de l'app passe par data-fx-* ou --fx-*", () => {
    // React recalcule `className` à chaque rendu : une classe ajoutée disparaît
    // (mesuré). Les éléments créés par fx reçoivent leur classe à la création,
    // en une fois, et seulement une classe de fx (`className = "fx-…"`).
    const classes = /\.classList\s*\.\s*(add|remove|toggle|replace)\s*\(|setAttribute\s*\(\s*["'`]class["'`]|\.className\s*\+=/;
    const affectation = /\.className\s*=(?!=)(?!\s*["'`]fx-)/;
    for (const [f, code] of codeFx) {
      expect(violations(code, classes), relative(RACINE, f)).toEqual([]);
      expect(violations(code, affectation), relative(RACINE, f)).toEqual([]);
    }
  });

  it("seuls core et scene lisent prefers-reduced-motion", () => {
    for (const [f, code] of codeFx) {
      const nom = relative(FX, f);
      if (nom === "core.ts" || nom === "scene.ts") continue;
      expect(code, nom).not.toMatch(/prefers-reduced-motion/);
    }
    for (const f of cssFx) {
      // Une feuille de fx ne tranche pas non plus le mouvement par le média :
      // c'est l'arbitre qui décide (data-motion, puis l'appareil).
      expect(sansCommentairesCss(lire(f)), relative(RACINE, f)).not.toMatch(/prefers-reduced-motion/);
    }
  });
});

describe("le contrat d'un module", () => {
  for (const m of MODULES) {
    it(`${m} : importe l'arbitre, exporte installer() et un api figé`, () => {
      const code = codeFx.get(join(FX, `${m}.ts`)) ?? "";
      expect(code).toMatch(/import\s*\{[^}]*\b(reduit|peut)\b[^}]*\}\s*from\s*["']\.\/core["']/);
      expect(code).toMatch(/export\s+function\s+installer\s*\(\s*\)\s*:\s*\(\)\s*=>\s*void/);
      expect(code).toMatch(/export\s+const\s+api\s*=\s*Object\.freeze\(/);
    });
  }

  it("le cœur est pur au chargement : aucun accès à window ou document hors des fonctions", () => {
    // Vérifié pour de vrai par test/fx.core.test.ts, qui l'importe sous node ;
    // ici, on interdit en plus toute instruction de premier niveau qui touche
    // au DOM (une ligne non indentée qui le nomme).
    for (const nom of ["core.ts", "montage.ts"]) {
      const code = codeFx.get(join(FX, nom)) ?? "";
      const premierNiveau = code.split("\n").filter((l) => /^[^\s}]/.test(l) && !/^(export\s+)?(function|interface|type|async function)\b/.test(l));
      const fautes = premierNiveau.filter((l) => /\b(window|document|navigator|matchMedia|getComputedStyle)\b/.test(l));
      expect(fautes, nom).toEqual([]);
    }
  });
});

describe("le module se charge sous node", () => {
  it("index.ts s'importe, démarre sans DOM sans lever, et liste les modules dans l'ordre", async () => {
    const fx = await import("../src/fx/index");
    expect(fx.MODULES.map(([n]) => n)).toEqual(MODULES);
    expect(() => fx.demarrerFx()).not.toThrow();
    for (const [, m] of fx.MODULES) {
      expect(typeof m.installer).toBe("function");
      expect(Object.isFrozen(m.api)).toBe(true);
    }
  });
});
