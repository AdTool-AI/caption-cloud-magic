/**
 * Shared caller authentication for user-facing Edge Functions.
 *
 * Normal path: the caller's Supabase user JWT (unchanged behaviour).
 * Internal path: the service-role key plus an explicit `x-agent-user-id`
 * header — used only by server-side agent workers (e.g. campaign auto-retry)
 * that must act as a known user without holding a user JWT. A user token can
 * never take this path because the service key never leaves the server.
 */

// deno-lint-ignore no-explicit-any
export async function resolveRequestUser(
  req: Request,
  anonClient: { auth: { getUser: (jwt: string) => Promise<{ data: { user: any } }> } },
  // deno-lint-ignore no-explicit-any
): Promise<any | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const internalUser = req.headers.get('x-agent-user-id') ?? '';
  if (serviceKey && jwt === serviceKey && /^[0-9a-f-]{36}$/i.test(internalUser)) {
    return { id: internalUser };
  }
  const { data } = await anonClient.auth.getUser(jwt);
  return data?.user ?? null;
}
