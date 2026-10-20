import { defineTool } from '@lovable.dev/mcp-js';
import { supabaseForUser } from '../supabase';
import { readPages } from '../read-pages';

export default defineTool({
  name: 'list_budget_reference',
  title: 'Find divisions, categories and budget periods',
  description: 'Find accessible division names and IDs, category names and fiscal periods for use in budget reports.',
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const { client, crossDivision, divisionId } = await supabaseForUser(ctx);
    const [divisions, periods, categories] = await Promise.all([
      readPages((from, to) => {
        let q = client.from('divisions').select('id,code,name').order('id');
        if (!crossDivision) q = q.eq('id', divisionId ?? '00000000-0000-0000-0000-000000000000');
        return q.range(from, to);
      }),
      readPages((from, to) => client.from('budget_periods').select('id,name,year,start_date,end_date,is_active,is_closed').order('id').range(from, to)),
      readPages((from, to) => client.from('cost_categories').select('id,code,name').order('id').range(from, to)),
    ]);
    return { content: [{ type: 'text', text: 'Accessible budget reference data. Use period IDs to request usage summaries.' }], structuredContent: { divisions: divisions.map(d => ({ id: d.id, code: d.code, name: d.name })), periods: periods.map(p => ({ ...p })), categories: categories.map(c => ({ ...c })) } };
  },
});