import { createClient } from '@supabase/supabase-js';
import { ToolError, type ToolContext } from '@lovable.dev/mcp-js';

type RuntimeGlobals = typeof globalThis & {
  Deno?: { env?: { get?: (name: string) => string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};
function runtimeEnv(name: string): string | undefined {
  const runtime = globalThis as RuntimeGlobals;
  return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name];
}
function configuredEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = runtimeEnv(name)?.trim();
    if (value) return value;
  }
  return undefined;
}
function supabaseProjectUrl(): string {
  const url = configuredEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL']);
  if (!url) throw new Error('Database URL is required');
  return url;
}
function supabasePublishableKey(): string {
  const direct = configuredEnv(['SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY']);
  if (direct) return direct;
  const keyset = runtimeEnv('SUPABASE_PUBLISHABLE_KEYS');
  if (keyset) {
    try {
      const parsed: unknown = JSON.parse(keyset);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const keys = parsed as Record<string, unknown>;
        const key = [keys.default, ...Object.values(keys)].find((v): v is string => typeof v === 'string' && v.trim().startsWith('sb_publishable_'))?.trim();
        if (key) return key;
      }
    } catch { /* Legacy key can still be available. */ }
  }
  const legacy = configuredEnv(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']);
  if (legacy) return legacy;
  throw new Error('Database public key is required');
}
export async function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!ctx.isAuthenticated() || !token) throw new ToolError('Sign in to use Budget Expense tools.');
  const client = createClient(supabaseProjectUrl(), supabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [profileResult, sessionResult, rolesResult] = await Promise.all([
    client.from('profiles').select('division_id,is_active').eq('id', ctx.getUserId()).maybeSingle(),
    client.rpc('check_session_valid'),
    client.from('user_roles').select('role').eq('user_id', ctx.getUserId()),
  ]);
  if (profileResult.error || sessionResult.error || rolesResult.error || !profileResult.data?.is_active || sessionResult.data !== true) {
    throw new ToolError('Your account or session cannot access this app. Sign in again or contact your administrator.');
  }
  const roles = (rolesResult.data ?? []).map(row => row.role as string);
  const crossDivision = roles.some(role => ['super_admin', 'finance', 'executive'].includes(role));
  return { client, divisionId: profileResult.data.division_id as string | null, crossDivision };
}