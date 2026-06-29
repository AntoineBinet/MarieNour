import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, timingSafeEqualStr } from "../server/auth";

describe("hashPassword / verifyPassword (PBKDF2)", () => {
  it("vérifie un mot de passe correct et rejette un mauvais", async () => {
    const { hash, salt } = await hashPassword("hunter2");
    expect(hash).toMatch(/^[0-9a-f]+$/);
    expect(salt).toMatch(/^[0-9a-f]+$/);
    expect(await verifyPassword("hunter2", hash, salt)).toBe(true);
    expect(await verifyPassword("hunter3", hash, salt)).toBe(false);
  });

  it("deux hash du même mot de passe diffèrent (sel aléatoire)", async () => {
    const a = await hashPassword("samepass");
    const b = await hashPassword("samepass");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    // mais chacun se vérifie avec son propre sel
    expect(await verifyPassword("samepass", a.hash, a.salt)).toBe(true);
    expect(await verifyPassword("samepass", b.hash, b.salt)).toBe(true);
  });
});

describe("timingSafeEqualStr", () => {
  it("compare correctement (égalité, différence, longueurs)", () => {
    expect(timingSafeEqualStr("secret", "secret")).toBe(true);
    expect(timingSafeEqualStr("secret", "secreT")).toBe(false);
    expect(timingSafeEqualStr("secret", "secretX")).toBe(false);
    expect(timingSafeEqualStr("", "")).toBe(true);
  });
});
