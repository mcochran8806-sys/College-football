import { FAVORITE_TEAMS } from '../../config';

/**
 * Where the favorites list comes from, in priority order:
 *
 *   1. ?favorites= (or the short ?f=) in the URL  — the source of truth
 *   2. localStorage — a convenience mirror, never load-bearing
 *   3. FAVORITE_TEAMS in config.ts — always present
 *
 * The URL wins because it's the only one of the three that survives a TV
 * browser clearing its storage, and because it lets the two screens run
 * different favorites if you want that. Per the brief, storage is treated as
 * disposable: every access is wrapped, and losing it costs you nothing but a
 * fallback to the config defaults.
 */

const STORAGE_KEY = 'cfb.favorites.v1';

/** Both spellings work. ?f= exists because typing a URL on a TV remote is
 *  miserable and every character counts. */
const PARAMS = ['favorites', 'f'];

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => decodeURIComponent(s).trim())
    .filter((s) => s.length > 0)
    .slice(0, 25); // sanity bound; nobody has 25 favorite teams
}

export function favoritesFromUrl(search = window.location.search): string[] {
  try {
    const params = new URLSearchParams(search);
    for (const key of PARAMS) {
      const value = params.get(key);
      if (value !== null) return parseList(value);
    }
  } catch {
    /* malformed query string — fall through to the next source */
  }
  return [];
}

function favoritesFromStorage(): string[] {
  try {
    return parseList(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Private mode, disabled storage, quota weirdness — all expected on a TV.
    return [];
  }
}

export function rememberFavorites(teams: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, teams.join(','));
  } catch {
    /* best effort only; the URL is what actually carries the setting */
  }
}

export interface ResolvedFavorites {
  teams: string[];
  source: 'url' | 'storage' | 'config';
}

export function resolveFavorites(): ResolvedFavorites {
  const fromUrl = favoritesFromUrl();
  if (fromUrl.length > 0) {
    // Mirror it so a later visit to the bare URL on this device still works.
    rememberFavorites(fromUrl);
    return { teams: fromUrl, source: 'url' };
  }

  const fromStorage = favoritesFromStorage();
  if (fromStorage.length > 0) return { teams: fromStorage, source: 'storage' };

  return { teams: [...FAVORITE_TEAMS], source: 'config' };
}

/** Build the query string for a set of favorites. Uses the short key. */
export function favoritesParam(teams: string[]): string {
  if (teams.length === 0) return '';
  return `?f=${teams.map((t) => encodeURIComponent(t)).join(',')}`;
}
