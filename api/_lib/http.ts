/**
 * Upstream fetch helpers. ESPN's undocumented endpoints reject or throttle
 * obviously-automated clients, so we present as a normal desktop browser.
 */

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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

export async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://www.espn.com/',
      },
    });
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

/** Never let an API key reach a log line. */
export function redact(url: string): string {
  return url.replace(/([?&]key=)[^&]+/gi, '$1REDACTED');
}
