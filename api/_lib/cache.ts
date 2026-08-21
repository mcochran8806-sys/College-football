/**
 * Process-local TTL cache with stale-on-error fallback and in-flight
 * coalescing.
 *
 * Scope caveat, stated plainly: this Map lives in one warm serverless
 * instance. Vercel may run several instances concurrently, so this alone does
 * not guarantee "one upstream call per TTL" across the whole deployment. Two
 * things close that gap:
 *
 *   1. The `Cache-Control: s-maxage=...` header we set on every response — the
 *      Vercel edge cache is what actually collapses N television sets polling
 *      into one origin invocation.
 *   2. `inflight` below, so a cold instance hit by several simultaneous
 *      requests makes exactly one upstream call rather than one per request.
 */

interface Entry<T> {
  value: T;
  at: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export interface CacheResult<T> {
  value: T;
  /** True when the upstream call failed and this is the last known good copy. */
  stale: boolean;
  ageMs: number;
  fetchedAt: string;
}

/**
 * Return a cached value, refreshing it when older than ttlMs.
 *
 * On upstream failure with a previous value present, that value is returned
 * with stale=true instead of throwing. Only a failure with nothing cached
 * propagates.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<CacheResult<T>> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;

  if (hit && now - hit.at < ttlMs) {
    return { value: hit.value, stale: false, ageMs: now - hit.at, fetchedAt: new Date(hit.at).toISOString() };
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    try {
      const value = await existing;
      return { value, stale: false, ageMs: 0, fetchedAt: new Date().toISOString() };
    } catch {
      // fall through to the stale path below
    }
  }

  if (!existing) {
    const p = loader()
      .then((value) => {
        store.set(key, { value, at: Date.now() });
        return value;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, p);

    try {
      const value = await p;
      return { value, stale: false, ageMs: 0, fetchedAt: new Date().toISOString() };
    } catch (err) {
      if (!hit) throw err;
      console.error(`[cache] refresh failed for "${key}", serving stale:`, err);
    }
  }

  const fallback = store.get(key) as Entry<T> | undefined;
  if (!fallback) throw new Error(`No cached value for "${key}"`);
  return {
    value: fallback.value,
    stale: true,
    ageMs: Date.now() - fallback.at,
    fetchedAt: new Date(fallback.at).toISOString(),
  };
}

/** Direct peek, used by the quota-exhausted path in the highlights function. */
export function peek<T>(key: string): CacheResult<T> | null {
  const hit = store.get(key) as Entry<T> | undefined;
  if (!hit) return null;
  return {
    value: hit.value,
    stale: true,
    ageMs: Date.now() - hit.at,
    fetchedAt: new Date(hit.at).toISOString(),
  };
}

export function put<T>(key: string, value: T): void {
  store.set(key, { value, at: Date.now() });
}
