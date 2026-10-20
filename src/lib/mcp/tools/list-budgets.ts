import { defineTool, ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser } from '../supabase';

export default defineTool({
  name: 'list_budgets',
  title: 'List division budgets',
  description: 'Read allocated, used and remaining division budgets within the signed-in user’s permissions, optionally filtered by period.',
  inputSchema: {
    division_id: z.string().uuid().optional().describe('Optional accessible division ID.'),
    period_id: z.string().uuid().optional().describe('Optional budget period ID.'),
    offset: z.number().int().min(0).max(10000).default(0).describe('Number of records to skip.'),
    limit: z.number().int().min(1).max(50).default(20).describe('Maximum number of budget rows to return.'),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ division_id, period_id, offset, limit }, ctx) => {
    const { client, divisionId, crossDivision } = await supabaseForUser(ctx);
    if (!crossDivision && (!divisionId || (division_id && division_id !== divisionId))) throw new ToolError('This division is not accessible.');
    let query = client.from('division_budgets').select('id,division_id,category_id,period_id,allocated_amount,used_amount', { count: 'exact' }).order('id');
    const division = crossDivision ? division_id : divisionId;
    if (division) query = query.eq('division_id', division);
    if (period_id) query = query.eq('period_id', period_id);
    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw new ToolError('Could not read budgets. Please try again.');
    const rows = (data ?? []).map(row => ({ id: row.id as string, division_id: row.division_id as string, category_id: row.category_id as string, period_id: row.period_id as string, allocated_idr: Number(row.allocated_amount), used_idr: Number(row.used_amount), remaining_idr: Number(row.allocated_amount) - Number(row.used_amount) }));
    return { content: [{ type: 'text', text: rows.length ? rows.map(row => `${row.id}: allocated IDR ${row.allocated_idr}, used IDR ${row.used_idr}, remaining IDR ${row.remaining_idr}`).join('\n') : 'No accessible budgets match this filter.' }], structuredContent: { rows, total: count ?? 0, offset } };
  },
});