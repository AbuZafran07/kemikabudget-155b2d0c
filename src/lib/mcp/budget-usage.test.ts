/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { ledgerTotals, requestUsage } from './budget-usage';
test('revised realization reverses old actual without doubling the replacement', () => {
  const base = { division_budget_id: 'budget', reference_type: 'settlement', reference_id: 'old' };
  expect(ledgerTotals([
    { ...base, entry_type: 'actual_add', amount: 20990773 },
    { ...base, entry_type: 'actual_release', amount: 20990773 },
    { ...base, reference_id: 'new', entry_type: 'actual_add', amount: 20000733 },
  ]).ca_actual_idr).toBe(20000733);
});
test('commitment is separate from actual expense and medical funding', () => {
  const base = { division_budget_id: 'budget', reference_type: 'cash_advance', reference_id: 'ca' };
  expect(ledgerTotals([
    { ...base, entry_type: 'commitment_add', amount: 1000000 },
    { ...base, reference_type: 'settlement', entry_type: 'commitment_release', amount: 1000000 },
    { ...base, reference_type: 'settlement', entry_type: 'actual_add', amount: 800000 },
    { ...base, reference_type: 'medical_budget', entry_type: 'actual_add', amount: 500000 },
  ])).toEqual({ commitment_idr: 0, ca_actual_idr: 800000 });
});
test('request usage restores partial-payment refund once', () => {
  expect(requestUsage([{ movement_type: 'deduction', amount: 500000 }, { movement_type: 'reversal', amount: 200000 }])).toBe(300000);
});