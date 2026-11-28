/// <reference types="bun" />
import { expect, test } from "bun:test";
import {
  DEFAULT_TIERS,
  describeTiers,
  nextTier,
  parseTiers,
  salesReleaseTarget,
  tierReleasePct,
  validateTiers,
} from "./budget-brake";

test("tier lookup follows the 2027 budget brake table", () => {
  expect(tierReleasePct(DEFAULT_TIERS, null)).toBe(0);
  expect(tierReleasePct(DEFAULT_TIERS, 78)).toBe(0);
  expect(tierReleasePct(DEFAULT_TIERS, 84.99)).toBe(0);
  expect(tierReleasePct(DEFAULT_TIERS, 85)).toBe(40);
  expect(tierReleasePct(DEFAULT_TIERS, 89.9)).toBe(40);
  expect(tierReleasePct(DEFAULT_TIERS, 90)).toBe(75);
  expect(tierReleasePct(DEFAULT_TIERS, 100)).toBe(100);
  expect(tierReleasePct(DEFAULT_TIERS, 130)).toBe(100);
});

test("release target mirrors database formula", () => {
  expect(salesReleaseTarget(10_000_000, 3_000_000, 0)).toBe(3_000_000);
  expect(salesReleaseTarget(10_000_000, 3_000_000, 40)).toBe(5_800_000);
  expect(salesReleaseTarget(10_000_000, 3_000_000, 100)).toBe(10_000_000);
  expect(salesReleaseTarget(1_000, 1_500, 50)).toBe(1_000);
});

test("next tier hint", () => {
  expect(nextTier(DEFAULT_TIERS, 80)?.min_pct).toBe(85);
  expect(nextTier(DEFAULT_TIERS, 86)?.min_pct).toBe(90);
  expect(nextTier(DEFAULT_TIERS, 100)).toBeNull();
  expect(nextTier(DEFAULT_TIERS, null)?.min_pct).toBe(85);
});

test("tier validation matches database trigger", () => {
  expect(validateTiers(DEFAULT_TIERS)).toBeNull();
  expect(validateTiers([{ min_pct: 85, release_pct: 50 }, { min_pct: 90, release_pct: 40 }])).toMatch(/harus naik/);
  expect(validateTiers([{ min_pct: 85, release_pct: 50 }, { min_pct: 85, release_pct: 60 }])).toMatch(/tidak boleh sama/);
  expect(validateTiers([{ min_pct: 85, release_pct: 150 }])).toMatch(/0–100/);
});

test("parse and describe", () => {
  expect(parseTiers("x")).toEqual(DEFAULT_TIERS);
  expect(parseTiers([{ min_pct: 90, release_pct: 75 }, { min_pct: "85", release_pct: "40" }])).toEqual([
    { min_pct: 85, release_pct: 40 },
    { min_pct: 90, release_pct: 75 },
  ]);
  expect(describeTiers(DEFAULT_TIERS)[0]).toBe("< 85%: dana ditahan belum bisa dikeluarkan");
  expect(describeTiers(DEFAULT_TIERS)[3]).toBe("≥ 100%: dibuka 100% dari dana ditahan");
});
