export function resolveAwsTestConfig(env: Record<string, string | undefined>, now?: number): {
  url: string; anonKey: string; storageKey: string;
};
