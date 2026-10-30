export interface RetryStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sorted(value: any): any {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]));
  return value;
}

// Store only a replay pointer. The backend ledger owns operation state and results.
export async function bulkScheduleRequestId(userId: string, payload: unknown, storage: RetryStorage): Promise<string> {
  if (!uuid.test(userId)) throw new Error('Sign in before bulk scheduling.');
  const canonical = JSON.stringify(sorted(JSON.parse(JSON.stringify(payload))));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const key = `adtool:calendar-bulk:v1:${userId}:${fingerprint}`;
  try {
    const existing = storage.getItem(key);
    if (existing !== null) {
      if (!uuid.test(existing)) throw new Error('Invalid saved request ID');
      return existing;
    }
    const requestId = crypto.randomUUID();
    storage.setItem(key, requestId);
    if (storage.getItem(key) !== requestId) throw new Error('Request ID was not saved');
    return requestId;
  } catch { throw new Error('Allow browser session storage so bulk-scheduling retries can be recovered safely.'); }
}
