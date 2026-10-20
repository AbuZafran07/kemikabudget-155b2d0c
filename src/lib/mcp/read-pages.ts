import { ToolError } from '@lovable.dev/mcp-js';
// Refuse oversized results rather than silently reporting incomplete totals.
export async function readPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset <= 20000; offset += 500) {
    const { data, error } = await fetchPage(offset, offset + 499);
    if (error) throw new ToolError('Could not read the complete report. Please try again.');
    if (offset === 20000 && data?.length) throw new ToolError('Report is too large. Select a narrower division or period.');
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
  return rows;
}