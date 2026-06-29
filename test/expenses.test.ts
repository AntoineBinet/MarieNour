import { describe, expect, it } from "vitest";
import { computeShares, computeBalances, computeSettlePlan } from "../server/routes/expenses";

const sum = (xs: { amount: number }[]) => Math.round(xs.reduce((s, x) => s + x.amount, 0) * 100) / 100;

describe("computeShares", () => {
  const members = [
    { id: "a", weight: 1 },
    { id: "b", weight: 1 },
    { id: "c", weight: 1 },
  ];

  it("partage égal : la somme vaut exactement le montant (reliquat absorbé)", () => {
    const shares = computeShares(10, "equal", members, []);
    expect(shares).toHaveLength(3);
    expect(sum(shares)).toBe(10); // 3,33 + 3,33 + 3,34
    // chaque part proche de 10/3
    for (const s of shares) expect(Math.abs(s.amount - 10 / 3)).toBeLessThan(0.02);
  });

  it("montants explicites : respectés tels quels", () => {
    const shares = computeShares(10, "amounts", members, [
      { member_id: "a", value: 7 },
      { member_id: "b", value: 3 },
    ]);
    expect(shares).toEqual([
      { member_id: "a", amount: 7 },
      { member_id: "b", amount: 3 },
    ]);
  });

  it("pondération (shares) : répartit au prorata des poids, somme exacte", () => {
    const shares = computeShares(10, "shares", members, [
      { member_id: "a", value: 1 },
      { member_id: "b", value: 3 },
    ]);
    expect(sum(shares)).toBe(10);
    const a = shares.find((s) => s.member_id === "a")!;
    const b = shares.find((s) => s.member_id === "b")!;
    expect(a.amount).toBeCloseTo(2.5, 2);
    expect(b.amount).toBeCloseTo(7.5, 2);
    expect(shares.find((s) => s.member_id === "c")).toBeUndefined(); // poids 0 = exclu
  });

  it("montant non divisible : pas de centime perdu (12,01 / 3)", () => {
    const shares = computeShares(12.01, "equal", members, []);
    expect(sum(shares)).toBe(12.01);
  });
});

describe("computeBalances", () => {
  it("calcule payé / dû / solde", () => {
    const balances = computeBalances({
      members: [{ id: "a" }, { id: "b" }],
      expenses: [{ payer_id: "a", amount: 10 }],
      shares: [
        { member_id: "a", amount: 5 },
        { member_id: "b", amount: 5 },
      ],
      settlements: [],
    });
    const a = balances.find((b) => b.member_id === "a")!;
    const b = balances.find((x) => x.member_id === "b")!;
    expect(a).toMatchObject({ paid: 10, owed: 5, balance: 5 });
    expect(b).toMatchObject({ paid: 0, owed: 5, balance: -5 });
    // la somme des soldes est nulle (conservation)
    expect(Math.round((a.balance + b.balance) * 100) / 100).toBe(0);
  });

  it("intègre les remboursements (settlements)", () => {
    const balances = computeBalances({
      members: [{ id: "a" }, { id: "b" }],
      expenses: [{ payer_id: "a", amount: 10 }],
      shares: [
        { member_id: "a", amount: 5 },
        { member_id: "b", amount: 5 },
      ],
      settlements: [{ from_id: "b", to_id: "a", amount: 5 }],
    });
    // après remboursement de b vers a, tout est équilibré
    for (const x of balances) expect(x.balance).toBe(0);
  });
});

describe("computeSettlePlan", () => {
  it("propose le transfert minimal qui solde tout le monde", () => {
    const plan = computeSettlePlan([
      { member_id: "a", paid: 10, owed: 5, balance: 5 },
      { member_id: "b", paid: 0, owed: 5, balance: -5 },
    ]);
    expect(plan).toEqual([{ from_id: "b", to_id: "a", amount: 5 }]);
  });

  it("trois personnes : le plan rééquilibre exactement", () => {
    const plan = computeSettlePlan([
      { member_id: "a", paid: 30, owed: 10, balance: 20 },
      { member_id: "b", paid: 0, owed: 10, balance: -10 },
      { member_id: "c", paid: 0, owed: 10, balance: -10 },
    ]);
    // chaque débiteur rembourse, le total transféré = 20
    const total = plan.reduce((s, p) => s + p.amount, 0);
    expect(Math.round(total * 100) / 100).toBe(20);
    for (const step of plan) expect(step.to_id).toBe("a");
  });
});
