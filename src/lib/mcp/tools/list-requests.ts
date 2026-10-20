import { defineTool, ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser } from '../supabase';

export default defineTool({
  name: 'list_requests',
  title: 'List expense requests',
  description: 'Read a page of expense request summaries allowed by the signed-in user’s permissions; excludes beneficiary and attachment data.',
  inputSchema: {
    status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'paid', 'settled', 'rejected', 'cancelled']).optional().describe('Optional request status filter.'),
    division_id: z.string().uuid().optional().describe('Optional division ID, subject to your access permissions.'),
    offset: z.number().int().min(0).max(10000).default(0).describe('Number of records to skip.'),
    limit: z.number().int().min(1).max(50).default(20).describe('Maximum number of summaries to return.'),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, division_id, offset, limit }, ctx) => {
    const { client, divisionId, crossDivision } = await supabaseForUser(ctx);
    if (!crossDivision && (!divisionId || (division_id && division_id !== divisionId))) throw new ToolError('This division is not accessible.');
    let query = client.from('requests').select('id,request_number,division_id,category_id,description,amount,status,created_at', { count: 'exact' }).order('created_at', { ascending: false }).order('id');
    const division = crossDivision ? division_id : divisionId;
    if (division) query = query.eq('division_id', division);
    if (status) query = query.eq('status', status);
    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw new ToolError('Could not read requests. Please try again.');
    const rows = (data ?? []).map(row => ({ id: row.id as string, number: row.request_number as string, division_id: row.division_id as string, category_id: row.category_id as string, description: row.description as string, amount_idr: Number(row.amount), status: row.status as string, created_at: row.created_at as string }));
    return { content: [{ type: 'text', text: rows.length ? rows.map(row => `${row.number}: ${row.status}, IDR ${row.amount_idr} — ${row.description}`).join('\n') : 'No accessible requests match this filter.' }], structuredContent: { rows, total: count ?? 0, offset } };
  },
});