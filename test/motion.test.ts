import { describe, expect, it } from "vitest";
import { mergePrefs, parsePrefs } from "../server/auth";
import { MOTION_MODES, motionOf } from "@shared/types";

// Le réglage du mouvement a trois états (« system », « reduce », « always »).
// L'ancien booléen `reduce_motion` reste LU (true vaut « reduce ») et reste
// d'accord avec `motion`, pour les clients d'avant qui ne lisent que lui.

describe("motionOf", () => {
  it("lit motion quand il est valide", () => {
    for (const m of MOTION_MODES) expect(motionOf({ motion: m })).toBe(m);
    expect(motionOf({ motion: "always", reduce_motion: true })).toBe("always");
  });
  it("retombe sur l'ancien booléen, puis sur l'appareil", () => {
    expect(motionOf({ reduce_motion: true })).toBe("reduce");
    expect(motionOf({ reduce_motion: false })).toBe("system");
    expect(motionOf({ motion: "vite" })).toBe("system");
    expect(motionOf({})).toBe("system");
    expect(motionOf(null)).toBe("system");
  });
});

describe("parsePrefs et le mouvement", () => {
  it("traduit l'ancien booléen en trois états", () => {
    expect(parsePrefs(JSON.stringify({ reduce_motion: true })).motion).toBe("reduce");
    expect(parsePrefs(JSON.stringify({ reduce_motion: false })).motion).toBeUndefined();
    expect(parsePrefs(JSON.stringify({ reduce_motion: true, motion: "always" })).motion).toBe("always");
  });
});

describe("mergePrefs et le mouvement", () => {
  it("accepte les trois états, refuse le reste", () => {
    expect(mergePrefs({}, { motion: "always" }).motion).toBe("always");
    expect(mergePrefs({}, { motion: "reduce" }).motion).toBe("reduce");
    expect(mergePrefs({}, { motion: "system" }).motion).toBe("system");
    expect(mergePrefs({ motion: "always" }, { motion: "vite" }).motion).toBe("always");
    expect(mergePrefs({ motion: "always" }, { motion: 3 }).motion).toBe("always");
  });

  it("garde le booléen d'accord quand motion change", () => {
    expect(mergePrefs({}, { motion: "reduce" }).reduce_motion).toBe(true);
    const toujours = mergePrefs({ reduce_motion: true, motion: "reduce" }, { motion: "always" });
    expect(toujours.motion).toBe("always");
    expect(toujours.reduce_motion).toBeUndefined();
    const raz = mergePrefs({ reduce_motion: true, motion: "reduce" }, { motion: null });
    expect(raz.motion).toBeUndefined();
    expect(raz.reduce_motion).toBeUndefined();
  });

  it("un client d'avant qui n'envoie que le booléen est compris", () => {
    expect(mergePrefs({}, { reduce_motion: true }).motion).toBe("reduce");
    expect(mergePrefs({ motion: "reduce", reduce_motion: true }, { reduce_motion: false }).motion).toBeUndefined();
    // Décocher l'ancien interrupteur ne retire pas « Toujours ».
    expect(mergePrefs({ motion: "always" }, { reduce_motion: false }).motion).toBe("always");
  });

  it("motion l'emporte quand les deux arrivent ensemble", () => {
    const p = mergePrefs({}, { motion: "always", reduce_motion: true });
    expect(p.motion).toBe("always");
    expect(motionOf(p)).toBe("always");
  });
});
