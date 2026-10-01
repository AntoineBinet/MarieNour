// Verrou de lisibilité : lit les jetons de src/styles.css et vérifie les couples
// texte / fond critiques dans tous les états d'apparence (thème, accent, pack
// d'interface, contraste renforcé, ambiance de fond). Un jeton retouché qui
// repasse sous le seuil fait tomber ce test. Seuils : 4,5:1 pour du texte,
// 3:1 pour un élément graphique (barre, anneau, coche).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCENTS,
  AMBIANCES,
  CUSTOMS,
  DESIGNS,
  THEMES,
  contrast,
  fondsDePage,
  hex,
  jeton,
  jetons,
  lireRegles,
  mix,
  over,
  toHex,
  type Etat,
  type RGBA,
} from "./ui.couleurs";

const CSS = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const R = lireRegles(CSS);

const TEXTE = 4.5;
const GRAPHIQUE = 3;

/** Tous les états « normaux » (accents prédéfinis). */
function* etats(): Generator<Etat> {
  for (const theme of THEMES)
    for (const design of DESIGNS)
      for (const accent of ACCENTS) for (const hc of [false, true]) yield { theme, design, accent, contrast: hc };
}
const nom = (e: Etat) =>
  `${e.theme}/${e.design ?? "default"}/${e.accent}${e.accentCustom ? `(${e.accentCustom})` : ""}${e.contrast ? "/hc" : ""}${e.bg ? `/bg=${e.bg}` : ""}${e.relative ? "/rel" : ""}`;

/** Collecte les échecs plutôt que de s'arrêter au premier (rapport lisible). */
function verifier(cas: { label: string; a: RGBA; b: RGBA; min: number }[]) {
  const echecs = cas
    .map((c) => ({ ...c, r: contrast(c.a, c.b) }))
    .filter((c) => c.r < c.min)
    .map((c) => `${c.label} : ${toHex(c.a)} sur ${toHex(c.b)} = ${c.r.toFixed(2)} (< ${c.min})`);
  expect(echecs, echecs.slice(0, 12).join("\n")).toEqual([]);
}

describe("jetons de lisibilité (styles.css)", () => {
  it("la feuille est lue (règles et jetons de base présents)", () => {
    const tok = jetons(R, { theme: "light" });
    for (const n of ["--bg", "--surface", "--muted", "--accent-strong", "--on-accent", "--money-in", "--money-out", "--sage-strong"]) {
      expect(tok[n], n).toBeTruthy();
    }
  });

  it("les jetons fantômes sont définis (--sage-ink = --money-in, --radius-2)", () => {
    for (const theme of THEMES) {
      const tok = jetons(R, { theme });
      expect(toHex(jeton(tok, "--sage-ink"))).toBe(toHex(jeton(tok, "--money-in")));
      expect(tok["--radius-2"]).toBeTruthy();
    }
  });

  it("--muted tient 4,5:1 sur tout fond de page (thèmes, packs, contraste, ambiances, accents)", () => {
    const cas: { label: string; a: RGBA; b: RGBA; min: number }[] = [];
    for (const e of etats())
      for (const bg of AMBIANCES) {
        const st = { ...e, bg };
        const tok = jetons(R, st);
        const muted = jeton(tok, "--muted");
        const ink2 = jeton(tok, "--ink-2");
        for (const [k, f] of Object.entries(fondsDePage(tok, bg))) {
          cas.push({ label: `${nom(st)} muted/${k}`, a: muted, b: f, min: TEXTE });
          cas.push({ label: `${nom(st)} ink-2/${k}`, a: ink2, b: f, min: TEXTE });
        }
      }
    verifier(cas);
  });

  it("--on-accent sur --accent-strong tient 4,5:1 pour chaque accent prédéfini (et au survol)", () => {
    const cas: { label: string; a: RGBA; b: RGBA; min: number }[] = [];
    for (const e of etats()) {
      const tok = jetons(R, e);
      const fond = jeton(tok, "--accent-strong");
      const encre = jeton(tok, "--on-accent");
      // Survol du bouton principal : l'accent fort glisse de 10 % vers l'encre
      // de page (plus sombre en clair, plus clair en sombre).
      const survol = mix(fond, 0.9, jeton(tok, "--ink"), 0.1);
      cas.push({ label: `${nom(e)} bouton`, a: encre, b: fond, min: TEXTE });
      cas.push({ label: `${nom(e)} bouton survolé`, a: encre, b: survol, min: TEXTE });
    }
    verifier(cas);
  });

  it("--on-accent sur --accent-strong tient 4,5:1 pour un accent personnalisé (couleur relative et repli)", () => {
    const cas: { label: string; a: RGBA; b: RGBA; min: number }[] = [];
    for (const theme of THEMES)
      for (const c of CUSTOMS)
        for (const relative of [true, false]) {
          // Le repli color-mix ne vise que les couleurs « raisonnables » (un
          // accent blanc ou noir n'a de sens qu'avec la couleur relative).
          if (!relative && (c === "#ffffff" || c === "#000000")) continue;
          const e: Etat = { theme, accent: "custom", accentCustom: c, relative };
          const tok = jetons(R, e);
          cas.push({ label: `${nom(e)}`, a: jeton(tok, "--on-accent"), b: jeton(tok, "--accent-strong"), min: TEXTE });
        }
    verifier(cas);
  });

  it("--accent-ink (liens, puces sélectionnées) tient 4,5:1 sur la surface, le fond et le lavis d'accent", () => {
    const cas: { label: string; a: RGBA; b: RGBA; min: number }[] = [];
    for (const e of etats()) {
      const tok = jetons(R, e);
      const ink = jeton(tok, "--accent-ink");
      const surface = jeton(tok, "--surface");
      const accent = jeton(tok, "--accent");
      cas.push({ label: `${nom(e)} accent-ink/surface`, a: ink, b: surface, min: TEXTE });
      cas.push({ label: `${nom(e)} accent-ink/bg`, a: ink, b: jeton(tok, "--bg"), min: TEXTE });
      cas.push({ label: `${nom(e)} accent-ink/lavis16`, a: ink, b: over({ ...accent, a: 0.16 }, surface), min: TEXTE });
    }
    verifier(cas);
  });

  it("--ok, --danger, --money-in et --money-out tiennent 4,5:1 sur les fonds des cartes et de page", () => {
    const cas: { label: string; a: RGBA; b: RGBA; min: number }[] = [];
    for (const theme of THEMES)
      for (const design of DESIGNS) {
        const e: Etat = { theme, design };
        const tok = jetons(R, e);
        for (const t of ["--ok", "--danger", "--money-in", "--money-out"])
          for (const f of ["--surface", "--surface-2", "--bg", "--bg-2"])
            cas.push({ label: `${nom(e)} ${t}/${f}`, a: jeton(tok, t), b: jeton(tok, f), min: TEXTE });
      }
    verifier(cas);
  });

  it("les pastels forts tiennent 3:1 sur la piste (--surface-2) et sur la carte (--surface)", () => {
    const cas: { label: string; a: RGBA; b: RGBA; min: number }[] = [];
    for (const theme of THEMES)
      for (const design of DESIGNS) {
        const e: Etat = { theme, design };
        const tok = jetons(R, e);
        for (const p of ["sand", "sage", "sky", "blush", "lilac", "butter"])
          for (const f of ["--surface-2", "--surface"])
            cas.push({ label: `${nom(e)} --${p}-strong/${f}`, a: jeton(tok, `--${p}-strong`), b: jeton(tok, f), min: GRAPHIQUE });
      }
    verifier(cas);
  });

  it("bouton d'action destructrice (alerte au bureau) : --on-danger sur --danger-strong tient 4,5:1", () => {
    const cas: { label: string; a: RGBA; b: RGBA; min: number }[] = [];
    for (const theme of THEMES)
      for (const design of DESIGNS) {
        const e: Etat = { theme, design };
        const tok = jetons(R, e);
        const fond = jeton(tok, "--danger-strong");
        cas.push({ label: `${nom(e)} danger-strong`, a: jeton(tok, "--on-danger"), b: fond, min: TEXTE });
        cas.push({ label: `${nom(e)} danger-strong survolé`, a: jeton(tok, "--on-danger"), b: mix(fond, 0.88, hex("#000"), 0.12), min: TEXTE });
      }
    verifier(cas);
  });

  it("l'île des toasts : texte 4,5:1, icônes de type 3:1, dans les deux thèmes", () => {
    const cas: { label: string; a: RGBA; b: RGBA; min: number }[] = [];
    for (const theme of THEMES) {
      const tok = jetons(R, { theme });
      const fond = jeton(tok, "--island-bg");
      cas.push({ label: `${theme} island texte`, a: jeton(tok, "--island-ink"), b: fond, min: TEXTE });
      cas.push({ label: `${theme} island texte secondaire`, a: jeton(tok, "--island-ink-2"), b: fond, min: TEXTE });
      for (const k of ["--island-ok", "--island-danger", "--island-info"])
        cas.push({ label: `${theme} ${k}`, a: jeton(tok, k), b: fond, min: GRAPHIQUE });
      cas.push({ label: `${theme} action`, a: jeton(tok, "--island-action"), b: fond, min: TEXTE });
    }
    verifier(cas);
  });

  it("avant theme.ts, un appareil en sombre reçoit déjà le fond et l'encre sombres (pas de flash crème)", () => {
    const sombre = jetons(R, { theme: null, osDark: true });
    expect(toHex(jeton(sombre, "--bg"))).toBe("#1d1916");
    expect(contrast(jeton(sombre, "--ink"), jeton(sombre, "--bg"))).toBeGreaterThan(10);
    const clair = jetons(R, { theme: null, osDark: false });
    expect(toHex(jeton(clair, "--bg"))).toBe("#f6efe7");
    // Une fois data-theme posé, c'est lui qui décide, quel que soit l'appareil.
    const forceClair = jetons(R, { theme: "light", osDark: true });
    expect(toHex(jeton(forceClair, "--bg"))).toBe("#f6efe7");
  });

  it("le lecteur reconnaît les couleurs (garde-fou de l'outil lui-même)", () => {
    expect(contrast(hex("#000"), hex("#fff"))).toBeCloseTo(21, 5);
    expect(contrast(hex("#777"), hex("#fff"))).toBeCloseTo(4.48, 2);
  });
});
