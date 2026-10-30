/** Selected by the Vite build configuration, never by an authenticated user's input. */
export const isAwsTestBackend = import.meta.env.VITE_BACKEND_TARGET === 'aws-test';
export function awsTestAuthStorageKey(url: string): string {
  return 'adtool-aws-test-' + new URL(url).hostname.toLowerCase() + '-auth';
}
