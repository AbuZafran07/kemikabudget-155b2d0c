/// <reference types="bun" />
import { expect, test } from "bun:test";
import {
  DEFAULT_CA_POLICY,
  addDays,
  checkActivityDates,
  diffDays,
  earliestActivityStart,
  formatIsoDate,
  getSettlementDeadline,
  jakartaToday,
} from "./ca-policy";

const today = "2026-11-26";

test("date helpers are timezone-safe", () => {
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  expect(diffDays("2026-12-10", "2026-11-26")).toBe(14);
  expect(formatIsoDate("2026-12-10")).toBe("10-12-2026");
  // 2026-11-26 17:30 UTC is already 2026-11-27 in Jakarta (UTC+7)
  expect(jakartaToday(new Date("2026-11-26T17:30:00Z"))).toBe("2026-11-27");
});

test("lead time: H-14 allowed, H-13 rejected, disabled rule allows", () => {
  expect(earliestActivityStart(DEFAULT_CA_POLICY, today)).toBe("2026-12-10");
  expect(checkActivityDates("2026-12-10", "2026-12-12", DEFAULT_CA_POLICY, "id", today).ok).toBe(true);
  const late = checkActivityDates("2026-12-09", "2026-12-12", DEFAULT_CA_POLICY, "id", today);
  expect(late.ok).toBe(false);
  expect(late.submitDeadline).toBe("2026-11-25");
  expect(checkActivityDates("2026-12-09", "2026-12-12", { ...DEFAULT_CA_POLICY, enforce_lead_time: false }, "id", today).ok).toBe(true);
});

test("activity dates required and ordered", () => {
  expect(checkActivityDates(null, "2026-12-12", DEFAULT_CA_POLICY, "id", today).ok).toBe(false);
  expect(checkActivityDates("2026-12-12", "2026-12-11", DEFAULT_CA_POLICY, "id", today).ok).toBe(false);
});

test("settlement deadline states", () => {
  const paid = { status: "paid", activity_end_date: "2026-11-18" }; // due 2026-11-25
  expect(getSettlementDeadline(paid, [], DEFAULT_CA_POLICY, today)).toEqual({ state: "overdue", dueDate: "2026-11-25", daysOverdue: 1 });
  expect(getSettlementDeadline({ ...paid, activity_end_date: "2026-11-19" }, [], DEFAULT_CA_POLICY, today).state).toBe("due_today");
  expect(getSettlementDeadline({ ...paid, activity_end_date: "2026-11-20" }, [], DEFAULT_CA_POLICY, today).state).toBe("pending");
  expect(getSettlementDeadline(paid, [{ status: "draft" }, { status: "rejected" }], DEFAULT_CA_POLICY, today).state).toBe("overdue");
  expect(getSettlementDeadline(paid, [{ status: "submitted" }], DEFAULT_CA_POLICY, today).state).toBe("reported");
  expect(getSettlementDeadline({ ...paid, status: "settled" }, [], DEFAULT_CA_POLICY, today).state).toBe("reported");
  expect(getSettlementDeadline({ ...paid, status: "approved" }, [], DEFAULT_CA_POLICY, today).state).toBe("not_applicable");
  expect(getSettlementDeadline({ status: "paid", activity_end_date: null }, [], DEFAULT_CA_POLICY, today).state).toBe("not_applicable");
});
