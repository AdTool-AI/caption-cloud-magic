import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export const AWS_BOOTSTRAP_TABLES = ['profiles', 'workspaces', 'workspace_members', 'user_roles'] as const;
export interface AwsBootstrapSummary {
  userId: string;
  tables: Array<{ name: typeof AWS_BOOTSTRAP_TABLES[number]; rowsReturned: number }>;
  pricingModels: number;
  visibleTemplates: number;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Initial two-account, unshared-workspace validation scope; never a global-role mapper. */
export async function readAwsBootstrap(client: SupabaseClient<Database>, session: Session): Promise<AwsBootstrapSummary> {
  const id = session?.user?.id;
  const token = session?.access_token;
  if (!id || !token) throw new Error('Sign in before running validation.');
  const verified = await client.auth.getUser(token);
  if (verified.error || verified.data.user?.id !== id) throw new Error('The current account could not be verified.');
  if (verified.data.user.factors?.some(factor => factor.status === 'verified')) throw new Error('MFA-enabled accounts are outside this initial validation scope.');

  const results = [];
  let workspaceIds = new Set<string>();
  for (const table of AWS_BOOTSTRAP_TABLES) {
    // Canonical select=* only: no embedding, computed fields, filters or schema override.
    const { data, error } = await client.from(table).select('*').setHeader('Authorization', `Bearer ${token}`);
    if (error || !Array.isArray(data) || data.length > 1000 || !data.every(object)) {
      throw new Error(`The ${table} read could not be validated.`);
    }
    const rows = data as unknown as Array<Record<string, unknown>>;
    if (table === 'profiles' && (rows.length !== 1 || rows[0].id !== id)) throw new Error('The profile response does not match this account.');
    if (table === 'workspaces') {
      if (!rows.length || rows.some(row => row.owner_id !== id || typeof row.id !== 'string')) throw new Error('The workspace response is outside the initial validation scope.');
      workspaceIds = new Set(rows.map(row => row.id as string));
    }
    if ((table === 'workspace_members' || table === 'user_roles') && rows.some(row => row.user_id !== id || !workspaceIds.has(row.workspace_id as string))) {
      throw new Error('The response includes rows outside this account’s initial workspace scope.');
    }
    results.push({ name: table, rowsReturned: rows.length });
  }
  const headers = { Authorization: `Bearer ${token}` };
  const pricing = await client.functions.invoke('pricing-catalog', { method: 'GET', headers });
  if (pricing.error || !object(pricing.data) || pricing.data.error || pricing.data.mock || !Array.isArray(pricing.data.models) || !pricing.data.models.length || pricing.data.models.length > 500 ||
    pricing.data.models.some(model => !object(model) || typeof model.id !== 'string' || ['sellEUR', 'sellUSD', 'listEUR', 'listUSD'].some(key => typeof model[key] !== 'number' || !Number.isFinite(model[key]) || (model[key] as number) < 0)) ||
    new Set(pricing.data.models.map(model => model.id)).size !== pricing.data.models.length) throw new Error('The pricing catalog could not be validated.');
  const templates = await client.functions.invoke('get-video-templates', { method: 'POST', headers, body: {} });
  if (templates.error || !object(templates.data) || templates.data.ok !== true || templates.data.error || templates.data.mock || !Array.isArray(templates.data.templates) || templates.data.templates.length > 1000 ||
    templates.data.templates.some(template => !object(template) || typeof template.id !== 'string') ||
    new Set(templates.data.templates.map(template => template.id)).size !== templates.data.templates.length) throw new Error('The template catalog could not be validated.');
  return { userId: id, tables: results, pricingModels: pricing.data.models.length, visibleTemplates: templates.data.templates.length };
}
