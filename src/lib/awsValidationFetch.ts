import { isCanonicalCalendarReadUri } from './calendarReadContract';
const TABLES = new Set(['profiles', 'user_roles', 'workspaces', 'workspace_members']);
/** Browser compatibility guard for the limited validation build, not server authorization. */
export function createAwsValidationFetch(fetcher: typeof fetch, backend: string): typeof fetch {
  const origin = new URL(backend).origin;
  return async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== origin) throw new Error('AWS validation cannot contact another backend.');
    const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const uri = url.pathname + url.search;
    const table = url.pathname.split('/').pop() ?? '';
    const calendar = method === 'GET' && isCanonicalCalendarReadUri(uri);
    const rest = calendar || url.pathname === `/rest/v1/${table}` && TABLES.has(table) && ['GET', 'HEAD'].includes(method) && ['', '?select=*'].includes(url.search);
    const auth = method === 'GET' && uri === '/auth/v1/user' || method === 'POST' && [
      '/auth/v1/token?grant_type=password', '/auth/v1/token?grant_type=refresh_token',
      '/auth/v1/logout', '/auth/v1/logout?scope=local', '/auth/v1/logout?scope=global',
    ].includes(uri);
    const catalog = method === 'GET' && uri === '/functions/v1/pricing-catalog' || method === 'POST' && uri === '/functions/v1/get-video-templates';
    if (!rest && !auth && !catalog) throw new Error('This request is outside the AWS validation scope.');
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (headers.has('Content-Profile') || headers.has('Accept-Profile') && (!rest || headers.get('Accept-Profile') !== 'public')) {
      throw new Error('Schema overrides are unavailable in AWS validation.');
    }
    headers.delete('Accept-Profile');
    for (const name of ['Cookie','Range','Range-Unit','Prefer','X-HTTP-Method-Override','X-Method-Override']) headers.delete(name);
    return fetcher(input, { ...init, headers, credentials: 'omit', redirect: 'error' });
  };
}
