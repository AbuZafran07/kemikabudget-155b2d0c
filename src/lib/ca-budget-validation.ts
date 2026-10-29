export interface CaBudgetOption {
  id: string;
  code: string;
  name: string;
  remaining: number;
}

export function checkCaBudget(
  items: { category_id: string; amount: number }[],
  categories: CaBudgetOption[],
  ready: boolean,
) {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (item.category_id && Number.isFinite(item.amount) && item.amount > 0) {
      totals.set(item.category_id, (totals.get(item.category_id) || 0) + item.amount);
    }
  }
  const rows = Array.from(totals, ([id, needed]) => {
    const category = categories.find((cat) => cat.id === id);
    return { id, name: category?.name || "Pos tidak tersedia", needed,
      available: category?.remaining ?? 0, missing: !category,
      shortage: Math.max(0, needed - (category?.remaining ?? 0)) };
  });
  return { rows, blocked: !ready || rows.some((row) => row.missing || row.shortage > 0) };
}