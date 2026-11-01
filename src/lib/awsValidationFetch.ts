import { isAwsEmailAuthRequest } from './awsEmailAuth';
import { isCanonicalMediaReadUri } from './mediaReadContract';
import { isCanonicalPlannerReadUri } from './plannerReadContract';
import { isCanonicalCalendarReadUri } from './calendarReadContract';
const TABLES = new Set(['profiles', 'user_roles', 'workspaces', 'workspace_members']);
/** Browser compatibility guard for the limited validation build, not server authorization. */
export function createAwsValidationFetch(fetcher: typeof fetch, backend: string): typeof fetch {
  const configured = new URL(backend);
  const origin = configured.origin;
  if (!['https://api-prod.useadtool.ai','http://127.0.0.1:4174'].includes(origin) || configured.username || configured.password || configured.pathname !== '/' || configured.search || configured.hash) {
    throw new Error('An approved AWS backend origin is required.');
  }
  return async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== origin) throw new Error('AWS validation cannot contact another backend.');
    const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const uri = url.pathname + url.search;
    const table = url.pathname.split('/').pop() ?? '';
    const calendar = method === 'GET' && (isCanonicalCalendarReadUri(uri) || isCanonicalPlannerReadUri(uri));
    const rest = calendar || url.pathname === `/rest/v1/${table}` && TABLES.has(table) && ['GET', 'HEAD'].includes(method) && ['', '?select=*'].includes(url.search);
    const auth = isAwsEmailAuthRequest(uri,method) || method === 'GET' && uri === '/auth/v1/user' || method === 'POST' && [
      '/auth/v1/token?grant_type=password', '/auth/v1/token?grant_type=refresh_token',
      '/auth/v1/logout', '/auth/v1/logout?scope=local', '/auth/v1/logout?scope=global',
    ].includes(uri);
    const catalog = method === 'GET' && uri === '/functions/v1/pricing-catalog' || method === 'POST' && uri === '/functions/v1/get-video-templates';
    const billing = method === 'POST' && ['/functions/v1/create-checkout','/functions/v1/ai-video-purchase-credits','/functions/v1/ai-video-verify-purchase'].includes(uri);
    const draft = method === 'POST' && ['/functions/v1/calendar-create-draft','/functions/v1/calendar-edit-draft','/functions/v1/calendar-delete-draft','/functions/v1/planner-upsert-weekplan','/functions/v1/planner-upsert-blocks','/functions/v1/planner-to-calendar'].includes(uri);
    if (!rest && !auth && !catalog && !draft && !billing && !isCanonicalMediaReadUri(uri,method)) throw new Error('This request is outside the AWS validation scope.');
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (headers.has('Content-Profile') || headers.has('Accept-Profile') && (!rest || headers.get('Accept-Profile') !== 'public')) {
      throw new Error('Schema overrides are unavailable in AWS validation.');
    }
    if (isAwsEmailAuthRequest(uri,method) && headers.has('Content-Type')) {
      if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(headers.get('Content-Type')!)) throw new Error('AWS account recovery requires JSON.');
      headers.set('Content-Type','application/json');
    }
    headers.delete('Accept-Profile');
    for (const name of ['Cookie','Range','Range-Unit','Prefer','X-HTTP-Method-Override','X-Method-Override']) headers.delete(name);
    return fetcher(input, { ...init, headers, credentials: 'omit', redirect: 'error' });
  };
}
