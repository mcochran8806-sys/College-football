/**
 * Upstream fetch helpers.
 *
 * ============================ ON USER-AGENTS ============================
 * This deliberately does NOT send a browser User-Agent, which is the opposite
 * of what you'd expect for an undocumented endpoint.
 *
 * Measured from a Vercel function in iad1 against
 * site.api.espn.com/.../scoreboard?groups=80&limit=100:
 *
 *   no headers at all ................................. 200  (99 games)
 *   User-Agent: Chrome/126 ............................ 403  Access Denied
 *   UA + Accept + Accept-Language ..................... 403
 *   UA + Accept + Accept-Language + Referer ........... 403
 *   full browser set (Sec-Fetch-*, sec-ch-ua, Origin) . 403
 *
 * ESPN fronts this endpoint with Akamai. A datacenter IP that *claims* to be
 * Chrome is a textbook bot signature, so dressing the request up as a browser
 * is what gets it blocked; an honest, plain request sails through. Adding a
 * User-Agent here will take the whole dashboard down — the failure is a 403
 * with an HTML "Access Denied" body, not a JSON error.
 * ========================================================================
 */

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export async function fetchJson<T>(
  url: string,
  timeoutMs = 8000,
  headers: Record<string, string> = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new UpstreamError(
        `Upstream ${res.status} for ${redact(url)}`,
        res.status,
        body.slice(0, 500),
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new UpstreamError(`Upstream fetch failed for ${redact(url)}: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

const ESPN_PRIMARY_HOST = 'site.api.espn.com';
const ESPN_FALLBACK_HOST = 'site.web.api.espn.com';

/**
 * ESPN fetch with a host fallback.
 *
 * site.web.api.espn.com serves byte-identical payloads from a different edge
 * config, and in testing it answered 200 even to requests the primary host
 * rejected. If Akamai's policy on the primary shifts mid-season, this keeps
 * the dashboard alive without a redeploy.
 */
export async function fetchEspnJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  try {
    return await fetchJson<T>(url, timeoutMs);
  } catch (err) {
    const blocked = err instanceof UpstreamError && (err.status === 403 || err.status === 429);
    if (!blocked || !url.includes(ESPN_PRIMARY_HOST)) throw err;

    console.warn(
      `[espn] ${(err as UpstreamError).status} from ${ESPN_PRIMARY_HOST}, retrying via ${ESPN_FALLBACK_HOST}`,
    );
    return await fetchJson<T>(url.replace(ESPN_PRIMARY_HOST, ESPN_FALLBACK_HOST), timeoutMs);
  }
}

/** Never let an API key reach a log line. */
export function redact(url: string): string {
  return url.replace(/([?&]key=)[^&]+/gi, '$1REDACTED');
}
