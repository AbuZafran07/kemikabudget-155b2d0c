import { defineTool } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { usageData } from '../usage-data';
import { readPages } from '../read-pages';
import { ledgerTotals, requestUsage } from '../budget-usage';

export default defineTool({
  name: 'summarize_person_usage',
  title: 'Budget usage attributed to each requester',
  description: 'Read request budget charges net of reversals and CA actuals/commitments per recorded requester and historical transaction division. This is attribution, not a personal budget allowance; excludes medical claims and unattributed adjustments.',
  inputSchema: {
    period_id: z.string().uuid().describe('Required fiscal period ID from list_budget_reference.'),
    division_id: z.string().uuid().optional().describe('Optional accessible transaction division ID.'),
    requester_id: z.string().uuid().optional().describe('Optional requester ID from a prior summary; never grants additional access.'),
    offset: z.number().int().min(0).max(10000).default(0).describe('Number of person/division summary rows to skip.'),
    limit: z.number().int().min(1).max(50).default(20).describe('Maximum person/division summary rows to return.'),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ period_id, division_id, requester_id, offset, limit }, ctx) => {
    const { client, division, budgets, ledger } = await usageData(ctx, period_id, division_id);
    const [requests, advances] = await Promise.all([
      readPages((from, to) => {
        let q = client.from('requests').select('id,requester_id,division_id,period_id').eq('period_id', period_id).order('id');
        if (division) q = q.eq('division_id', division);
        return q.range(from, to);
      }),
      readPages((from, to) => {
        let q = client.from('cash_advances').select('id,requester_id,division_id,period_id').eq('period_id', period_id).order('id');
        if (division) q = q.eq('division_id', division);
        return q.range(from, to);
      }),
    ]);
    const settlements = [];
    const caIds = advances.map(c => c.id as string);
    for (let i = 0; i < caIds.length; i += 100) {
      const ids = caIds.slice(i, i + 100);
      settlements.push(...await readPages((from, to) => client.from('cash_advance_settlements').select('id,cash_advance_id').in('cash_advance_id', ids).order('id').range(from, to)));
    }
    const movements = [];
    const budgetIds = budgets.map(b => b.id as string);
    for (let i = 0; i < budgetIds.length; i += 100) {
      const ids = budgetIds.slice(i, i + 100);
      movements.push(...await readPages((from, to) => client.from('budget_movements').select('request_id,division_budget_id,movement_type,amount').in('division_budget_id', ids).not('request_id', 'is', null).order('id').range(from, to)));
    }
    const caMap = new Map(advances.map(c => [c.id as string, c]));
    const requestMap = new Map(requests.map(r => [r.id as string, r]));
    const settlementMap = new Map(settlements.map(s => [s.id as string, s.cash_advance_id as string]));
    const attributedLedger = ledger.map(e => {
      const caId = e.reference_type === 'cash_advance' ? e.reference_id : settlementMap.get(e.reference_id);
      return { entry: e, owner: caId ? caMap.get(caId) : undefined };
    });
    const owners = new Map([...requests, ...advances].map(r => [`${r.requester_id}:${r.division_id}`, { requester_id: r.requester_id as string, division_id: r.division_id as string }]));
    const allRows = [...owners.values()].map(owner => {
      const matches = (r: { requester_id: unknown; division_id: unknown } | undefined) => r?.requester_id === owner.requester_id && r?.division_id === owner.division_id;
      const request_used_idr = requestUsage(movements.filter(m => m.request_id && matches(requestMap.get(m.request_id as string))));
      const ca = ledgerTotals(attributedLedger.filter(e => matches(e.owner)).map(e => e.entry));
      return { ...owner, request_used_idr, ca_actual_idr: ca.ca_actual_idr, ca_commitment_idr: ca.commitment_idr, attributed_used_idr: request_used_idr + ca.ca_actual_idr };
    }).filter(r => (!requester_id || r.requester_id === requester_id) && (r.request_used_idr !== 0 || r.ca_actual_idr !== 0 || r.ca_commitment_idr !== 0)).sort((a, b) => b.attributed_used_idr - a.attributed_used_idr || a.requester_id.localeCompare(b.requester_id) || a.division_id.localeCompare(b.division_id));
    const page = allRows.slice(offset, offset + limit);
    const names = page.length ? await readPages((from, to) => client.from('profiles_secure').select('id,full_name').in('id', page.map(r => r.requester_id)).order('id').range(from, to)) : [];
    const nameMap = new Map(names.map(p => [p.id as string, p.full_name as string | null]));
    const rows = page.map(r => ({ ...r, requester_name: nameMap.get(r.requester_id) ?? null }));
    const unattributedMovements = movements.filter(m => !m.request_id || !requestMap.has(m.request_id as string));
    return {
      content: [{ type: 'text', text: 'Per-person usage is attributed to the recorded requester, not beneficiary. Request charges are net of budget reversals; CA actuals net of revision reversals. Commitments are separate, not added to used. No medical or bank data. Personal totals may differ from division usage due to medical funding and unattributed corrections; missing names remain undisclosed.' }],
      structuredContent: {
        period_id, rows, total: allRows.length, offset,
        unattributed_request_movements_idr: requestUsage(unattributedMovements),
        unattributed_ca: ledgerTotals(attributedLedger.filter(e => !e.owner).map(e => e.entry)),
        recorded_division_used_idr: budgets.reduce((sum, b) => sum + Number(b.used_amount), 0),
        attributed_used_idr: allRows.reduce((sum, r) => sum + r.attributed_used_idr, 0),
        totals_scope: requester_id ? 'Filtered requester within accessible divisions' : 'All accessible person/division rows, before output pagination',
      },
    };
  },
});