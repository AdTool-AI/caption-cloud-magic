// Build-time validation only. Browser configuration contains the public anon key.
export function resolveAwsTestConfig(env, now = Date.now()) {
  const raw = env.VITE_AWS_TEST_SUPABASE_URL?.trim();
  const key = env.VITE_AWS_TEST_SUPABASE_ANON_KEY?.trim();
  if (!raw || !key) throw new Error('AWS test build requires VITE_AWS_TEST_SUPABASE_URL and VITE_AWS_TEST_SUPABASE_ANON_KEY; legacy values are never used as fallback.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('AWS test API URL must be an HTTPS origin.'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !host.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
      /(^|\.)(supabase\.co|lovable\.app|lovableproject\.com)$/.test(host) ||
      /(^|\.)(example\.(com|org|net)|invalid|local|internal|test)$/.test(host) || host.includes('replace') || host.startsWith('['))
    throw new Error('AWS test API must use its own reachable HTTPS origin, without a path, credentials or a legacy/cloud/local placeholder hostname.');
  if (url.origin !== 'https://api-prod.useadtool.ai') throw new Error('This checkout builds only for https://api-prod.useadtool.ai.');
  let claims;
  try {
    const parts = key.split('.');
    if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (header.alg !== 'HS256' || claims.role !== 'anon' || typeof claims.exp !== 'number' || claims.exp * 1000 <= now)
      throw new Error();
  } catch { throw new Error('AWS test build requires the self-hosted public anon JWT. Service-role, user, expired or malformed keys are not accepted.'); }
  return {url: url.origin, anonKey: key, storageKey: 'adtool-aws-test-' + host + '-auth'};
}
