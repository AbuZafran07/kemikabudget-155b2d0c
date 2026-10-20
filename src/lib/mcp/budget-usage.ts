export type LedgerEntry = { division_budget_id: string; entry_type: string; amount: number; reference_type: string; reference_id: string };
export function ledgerTotals(entries: LedgerEntry[]) {
  let commitment = 0;
  let actual = 0;
  for (const entry of entries) {
    if (!['cash_advance', 'settlement'].includes(entry.reference_type)) continue;
    if (entry.entry_type === 'commitment_add') commitment += Number(entry.amount);
    if (entry.entry_type === 'commitment_release') commitment -= Number(entry.amount);
    if (entry.entry_type === 'actual_add') actual += Number(entry.amount);
    if (entry.entry_type === 'actual_release') actual -= Number(entry.amount);
  }
  return { commitment_idr: commitment, ca_actual_idr: actual };
}
export function requestUsage(movements: { movement_type: string; amount: number }[]) {
  return movements.reduce((sum, row) => sum + (row.movement_type === 'deduction' ? Number(row.amount) : row.movement_type === 'reversal' ? -Number(row.amount) : 0), 0);
}