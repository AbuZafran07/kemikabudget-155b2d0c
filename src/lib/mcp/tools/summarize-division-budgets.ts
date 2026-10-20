import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { usageData } from '../usage-data';
import { ledgerTotals } from '../budget-usage';

export default defineTool({
  name: 'summarize_division_budgets',
  title: 'Budget usage by division and category',
  description: 'Read full-period allocated, recorded used, remaining and outstanding CA commitments by accessible division/category. Used is not cash paid; commitments are shown separately.',
  inputSchema: {
    period_id: z.string().uuid().describe('Fiscal period ID from list_budget_reference; required to avoid combining years.'),
    division_id: z.string().uuid().optional().describe('Optional accessible division ID; omit for all accessible divisions.'),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ period_id, division_id }, ctx) => {
    const { budgets, ledger } = await usageData(ctx, period_id, division_id);
    const categories = budgets.map(b => {
      const { commitment_idr, ca_actual_idr } = ledgerTotals(ledger.filter(e => e.division_budget_id === b.id));
      return { budget_id: b.id as string, division_id: b.division_id as string, category_id: b.category_id as string, allocated_idr: Number(b.allocated_amount), used_idr: Number(b.used_amount), remaining_idr: Number(b.allocated_amount) - Number(b.used_amount), commitment_idr, available_after_commitment_idr: Number(b.allocated_amount) - Number(b.used_amount) - commitment_idr, ca_actual_idr };
    });
    const divisions = [...new Set(categories.map(b => b.division_id))].map(id => {
      const group = categories.filter(b => b.division_id === id);
      const sum = (key: 'allocated_idr' | 'used_idr' | 'commitment_idr') => group.reduce((s, b) => s + b[key], 0);
      const allocated = sum('allocated_idr'), used = sum('used_idr'), commitment = sum('commitment_idr');
      return { division_id: id, allocated_idr: allocated, used_idr: used, remaining_idr: allocated - used, commitment_idr: commitment, available_after_commitment_idr: allocated - used - commitment };
    });
    return { content: [{ type: 'text', text: 'Recorded budget usage by division. Remaining = allocation minus recorded usage; availability additionally subtracts outstanding CA commitments. Medical funding allocations may be included in recorded usage, not individual medical claims.' }], structuredContent: { period_id, divisions, categories } };
  },
});