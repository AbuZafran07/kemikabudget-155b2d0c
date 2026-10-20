import { ToolError, type ToolContext } from '@lovable.dev/mcp-js';
import { supabaseForUser } from './supabase';
import { readPages } from './read-pages';

export async function usageData(ctx: ToolContext, periodId: string, requestedDivision?: string) {
  const access = await supabaseForUser(ctx);
  const { client, divisionId, crossDivision } = access;
  if (!crossDivision && (!divisionId || (requestedDivision && requestedDivision !== divisionId))) throw new ToolError('This division is not accessible.');
  const division = crossDivision ? requestedDivision : divisionId;
  const budgets = await readPages((from, to) => {
    let q = client.from('division_budgets').select('id,division_id,category_id,period_id,allocated_amount,used_amount').eq('period_id', periodId).order('id');
    if (division) q = q.eq('division_id', division);
    return q.range(from, to);
  });
  const budgetIds = budgets.map(b => b.id as string);
  const ledger = [];
  for (let i = 0; i < budgetIds.length; i += 100) {
    const ids = budgetIds.slice(i, i + 100);
    ledger.push(...await readPages((from, to) => client.from('budget_ledger').select('division_budget_id,entry_type,amount,reference_type,reference_id').in('division_budget_id', ids).in('reference_type', ['cash_advance', 'settlement']).order('id').range(from, to)));
  }
  return { ...access, division, budgets, ledger };
}