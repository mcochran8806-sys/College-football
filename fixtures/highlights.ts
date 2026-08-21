/**
 * YouTube playlistItems.list-shaped fixture, served when MOCK=1.
 *
 * Titles are deliberately messy — the real ones are. They cover the cases the
 * matcher has to survive:
 *   - "Ole Miss" vs ESPN's "Mississippi"
 *   - "Texas A&M" written as "Texas AM"
 *   - "Pitt" for "Pittsburgh"
 *   - a bare "Miami" (ambiguous, must NOT match on that token alone)
 *   - emoji, pipes, years, "Extended Highlights"
 *   - a title matching only ONE team (must be rejected: two required)
 *   - videoId 'EMBEDBLOCKED' triggers IFrame error 150 handling in dev
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const now = Date.now();
const minsAgo = (m: number) => new Date(now - m * 60_000).toISOString();

function item(videoId: string, title: string, publishedAt: string, channelId: string, channelTitle: string): any {
  return {
    kind: 'youtube#playlistItem',
    id: `pi-${videoId}`,
    snippet: {
      publishedAt,
      channelId,
      channelTitle,
      title,
      description: 'Highlights',
      thumbnails: {
        medium: { url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, width: 320, height: 180 },
        high: { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, width: 480, height: 360 },
      },
      resourceId: { kind: 'youtube#video', videoId },
    },
    contentDetails: { videoId, videoPublishedAt: publishedAt },
  };
}

const ESPN_CH = 'UCiWLfSweyRNmLpgEHekhoAg';
const MOCK_SEC = 'UUMOCKSECNETWORK00000001';
const MOCK_ACC = 'UUMOCKACCDIGITAL00000001';

export const MOCK_HIGHLIGHT_ITEMS: any[] = [
  item('dQw4w9WgXcQ', '#2 Georgia Bulldogs vs #8 Alabama Crimson Tide | Full Game Highlights | 2025 College Football', minsAgo(6), ESPN_CH, 'ESPN College Football'),
  item('aqz-KE-bpKQ', 'Georgia Tech vs Clemson 🏈 Extended Highlights | ACC Football', minsAgo(14), MOCK_ACC, 'ACC Digital Network'),
  item('EMBEDBLOCKED', 'Ohio State at Michigan | Extended Highlights | Big Ten Football', minsAgo(19), ESPN_CH, 'ESPN College Football'),
  item('ScMzIvxBSi4', 'Ole Miss at LSU Highlights | SEC Football 2025', minsAgo(23), MOCK_SEC, 'SEC Network'),
  item('_OBlgSz8sSM', 'Texas AM vs. Texas | FULL GAME HIGHLIGHTS | 11/8/2025', minsAgo(31), MOCK_SEC, 'SEC Network'),
  item('C0DPdy98e4c', 'Notre Dame at Pitt — Highlights', minsAgo(44), ESPN_CH, 'ESPN College Football'),
  // Single-team title: must be rejected as a game match (falls to filler).
  item('YE7VzlLtp-4', 'Alabama Crimson Tide Top Plays of the Week 🔥', minsAgo(52), MOCK_SEC, 'SEC Network'),
  // Bare "Miami" is in AMBIGUOUS_TOKENS; "Florida State" carries this one.
  item('Ct6BUPvE2sM', 'Florida State vs Miami Hurricanes | Extended Highlights', minsAgo(58), MOCK_ACC, 'ACC Digital Network'),
  item('kJQP7kiw5Fk', 'App State vs Coastal Carolina | Sun Belt Highlights 2025', minsAgo(71), ESPN_CH, 'ESPN College Football'),
  // Generic filler — no game match at all.
  item('9bZkp7q19f0', 'Top 10 Plays of College Football Week 11 | ESPN CFB', minsAgo(88), ESPN_CH, 'ESPN College Football'),
];

/** Shaped like the playlistItems.list envelope. */
export function mockPlaylistResponse(playlistId: string, channelTitle: string): any {
  return {
    kind: 'youtube#playlistItemListResponse',
    pageInfo: { totalResults: MOCK_HIGHLIGHT_ITEMS.length, resultsPerPage: 10 },
    items: MOCK_HIGHLIGHT_ITEMS.map((it) => ({
      ...it,
      snippet: { ...it.snippet, channelTitle, playlistId },
    })),
  };
}
