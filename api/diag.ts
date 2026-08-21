// TEMPORARY diagnostic endpoint. Removed once the ESPN 403 is resolved.
import type { ApiRequest, ApiResponse } from './_lib/types.js';

const UA_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const UA_NEW =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const SB = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=100';
const SB_WEB = 'https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=100';
const SB_CDN = 'https://cdn.espn.com/core/college-football/scoreboard?xhr=1&groups=80&limit=100';

const variants: Array<{ name: string; url: string; headers: Record<string, string> }> = [
  { name: '1-bare', url: SB, headers: {} },
  { name: '2-ua-only', url: SB, headers: { 'User-Agent': UA_CHROME } },
  {
    name: '3-ua-accept-lang',
    url: SB,
    headers: { 'User-Agent': UA_CHROME, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9' },
  },
  {
    name: '4-current-with-referer',
    url: SB,
    headers: {
      'User-Agent': UA_CHROME,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.espn.com/',
    },
  },
  {
    name: '5-full-browser-no-referer',
    url: SB,
    headers: {
      'User-Agent': UA_NEW,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      Connection: 'keep-alive',
    },
  },
  {
    name: '6-full-browser-referer-origin',
    url: SB,
    headers: {
      'User-Agent': UA_NEW,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      Origin: 'https://www.espn.com',
      Referer: 'https://www.espn.com/',
    },
  },
  { name: '7-site-web-host-bare', url: SB_WEB, headers: {} },
  { name: '8-site-web-host-ua', url: SB_WEB, headers: { 'User-Agent': UA_NEW } },
  { name: '9-cdn-core-bare', url: SB_CDN, headers: {} },
  { name: '10-cdn-core-ua', url: SB_CDN, headers: { 'User-Agent': UA_NEW } },
];

export default async function handler(_req: ApiRequest, res: ApiResponse): Promise<void> {
  const results = await Promise.all(
    variants.map(async (v) => {
      const started = Date.now();
      try {
        const r = await fetch(v.url, { headers: v.headers, signal: AbortSignal.timeout(9000) });
        const text = await r.text();
        let events: number | string = 'n/a';
        try {
          const j = JSON.parse(text);
          events = Array.isArray(j?.events)
            ? j.events.length
            : Array.isArray(j?.content?.sbData?.events)
              ? `cdn:${j.content.sbData.events.length}`
              : 'no-events-key';
        } catch {
          events = 'not-json';
        }
        return { name: v.name, status: r.status, ms: Date.now() - started, events, bytes: text.length };
      } catch (err) {
        return { name: v.name, status: 'THREW', ms: Date.now() - started, error: String(err).slice(0, 120) };
      }
    }),
  );
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ region: process.env.VERCEL_REGION ?? null, results });
}
