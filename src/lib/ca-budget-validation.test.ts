/// <reference types="bun" />
import { expect, test } from "bun:test";
import { checkCaBudget } from "./ca-budget-validation";
const categories = [{ id: "a", code: "A", name: "Travel", remaining: 1_000_000 }];
test("one million available accepts below and equal, rejects 1.5 million with 500000 shortage", () => {
  expect(checkCaBudget([{ category_id: "a", amount: 900_000 }], categories, true).blocked).toBe(false);
  expect(checkCaBudget([{ category_id: "a", amount: 1_000_000 }], categories, true).blocked).toBe(false);
  const result = checkCaBudget([{ category_id: "a", amount: 1_500_000 }], categories, true);
  expect(result.blocked).toBe(true);
  expect(result.rows[0]?.shortage).toBe(500_000);
});
test("same category totals all entered amounts even without descriptions", () => {
  expect(checkCaBudget([{ category_id: "a", amount: 700_000 }, { category_id: "a", amount: 600_000 }], categories, true).rows[0]?.shortage).toBe(300_000);
});
test("one insufficient category blocks a multi-category request", () => {
  expect(checkCaBudget([{ category_id: "a", amount: 500_000 }, { category_id: "b", amount: 100 }], [...categories, {id: "b", code: "B", name: "Other", remaining: 0}], true).blocked).toBe(true);
});
test("unavailable balances and missing division categories fail closed", () => {
  expect(checkCaBudget([{ category_id: "a", amount: 1 }], categories, false).blocked).toBe(true);
  expect(checkCaBudget([{ category_id: "other-division", amount: 1 }], categories, true).blocked).toBe(true);
});