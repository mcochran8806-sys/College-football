import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PickerTeam } from '../../shared/types';
import { usePoll } from '../hooks/usePoll';
import { getTeams } from '../lib/api';
import { favoritesParam, favoritesFromUrl, rememberFavorites } from '../lib/favorites';
import { LEAGUE_SETTINGS } from '../../config';
import { LEAGUES, resolveLeague } from '../../shared/leagues/index';
import type { LeagueId } from '../../shared/leagues/types';
import { normalizeText } from '../lib/teamAliases';

/**
 * Favorite-team picker.
 *
 * This page is not a TV screen — it's meant for a phone or laptop. It doesn't
 * save anything to a server, because there isn't one to save to: it builds a
 * URL. That URL is the setting. Bookmark it on each TV and the choice survives
 * anything the TV browser does to its own storage.
 */
export default function Settings() {
  // Which league you're picking for. Starts from ?league= but is switchable
  // here — this page is the one place you'd want to set up both TVs at once.
  const [leagueId, setLeagueId] = useState<LeagueId>(() => {
    try {
      return resolveLeague(new URLSearchParams(window.location.search).get('league')).id;
    } catch {
      return 'cfb';
    }
  });
  const league = LEAGUES[leagueId];

  // The team list changes about once a year, so one fetch is plenty.
  const loadTeams = useCallback(() => getTeams(leagueId), [leagueId]);
  const { data, updatedAt } = usePoll(loadTeams, 6 * 60 * 60 * 1000);
  const teams = useMemo(() => data?.teams ?? [], [data]);

  const [selected, setSelected] = useState<string[]>(() => {
    const fromUrl = favoritesFromUrl();
    return fromUrl.length > 0 ? fromUrl : [...LEAGUE_SETTINGS.cfb.favorites];
  });

  // Switching leagues swaps in that league's defaults rather than carrying
  // college teams into an NFL URL, which would silently match nothing.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSelected([...LEAGUE_SETTINGS[leagueId].favorites]);
    setFilter('');
  }, [leagueId]);
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  // OBS ticker options. Defaults mirror TICKER in config.ts, and anything left
  // at its default is omitted from the generated URL to keep it short — these
  // get typed into an OBS dialog by hand.
  const [tickerStyle, setTickerStyle] = useState<'scroll' | 'flip'>('scroll');
  const [tickerSpeed, setTickerSpeed] = useState(70);
  const [tickerSolid, setTickerSolid] = useState(false);
  const [tickerUpcoming, setTickerUpcoming] = useState(true);
  const [tickerFinal, setTickerFinal] = useState(true);
  const [tickerHeight, setTickerHeight] = useState(90);

  // Auto commercial-break overlay options.
  const [brkHalftime, setBrkHalftime] = useState(true);
  const [brkQuarters, setBrkQuarters] = useState(true);
  const [brkScores, setBrkScores] = useState(true);

  // Mirror to storage as you go, so opening the bare URL on THIS device
  // remembers. The generated URL is still what makes it stick on a TV.
  useEffect(() => {
    rememberFavorites(selected, league);
  }, [selected, league]);

  const selectedSet = useMemo(
    () => new Set(selected.map((s) => normalizeText(s))),
    [selected],
  );

  const isSelected = (team: PickerTeam) =>
    selectedSet.has(normalizeText(team.location)) ||
    selectedSet.has(normalizeText(team.displayName)) ||
    selectedSet.has(normalizeText(team.shortDisplayName)) ||
    selectedSet.has(normalizeText(team.abbreviation));

  function toggle(team: PickerTeam) {
    // Store the school name rather than the abbreviation: it survives ESPN
    // changing an abbreviation, and it's what a person recognizes in a URL.
    const label = team.location || team.shortDisplayName;
    setSelected((prev) =>
      isSelected(team)
        ? prev.filter(
            (t) =>
              ![team.location, team.displayName, team.shortDisplayName, team.abbreviation]
                .map(normalizeText)
                .includes(normalizeText(t)),
          )
        : [...prev, label],
    );
  }

  const visible = useMemo(() => {
    const q = normalizeText(filter);
    if (!q) return teams;
    return teams.filter((t) =>
      [t.displayName, t.shortDisplayName, t.location, t.nickname, t.abbreviation]
        .some((f) => normalizeText(f ?? '').includes(q)),
    );
  }, [teams, filter]);

  /**
   * Group by conference. 138 teams in one alphabetical run means hunting for
   * Georgia somewhere between Fresno State and Hawai'i; grouped, you go
   * straight to the SEC. Teams whose conference couldn't be read fall into a
   * trailing "Other" group rather than disappearing.
   */
  const groups = useMemo(() => {
    const byConference = new Map<string, PickerTeam[]>();
    for (const team of visible) {
      const key = team.conference ?? 'Other';
      const list = byConference.get(key);
      if (list) list.push(team);
      else byConference.set(key, [team]);
    }
    return [...byConference.entries()]
      .map(([name, list]) => ({ name, teams: list }))
      .sort((a, b) => {
        if (a.name === 'Other') return 1;
        if (b.name === 'Other') return -1;
        return a.name.localeCompare(b.name);
      });
  }, [visible]);

  const filterRef = useRef<HTMLInputElement | null>(null);

  // Land in the filter box so you can start typing a team name immediately.
  useEffect(() => {
    filterRef.current?.focus();
  }, []);

  function onFilterKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setFilter('');
      return;
    }
    // Enter picks the single obvious result, so "geo tech" + Enter just works.
    if (e.key === 'Enter' && visible.length > 0) {
      e.preventDefault();
      toggle(visible[0]);
      setFilter('');
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // The default league sends no param, keeping the college URLs short.
  const parts = [
    leagueId === 'cfb' ? '' : `league=${leagueId}`,
    favoritesParam(selected).replace(/^\?/, ''),
  ].filter(Boolean);
  const param = parts.length > 0 ? `?${parts.join('&')}` : '';
  const scoreboardUrl = `${origin}/${param}`;
  const wallUrl = `${origin}/highlights${param}`;

  const tickerUrl = (() => {
    const p = [...parts];
    if (tickerStyle !== 'scroll') p.push(`style=${tickerStyle}`);
    if (tickerSpeed !== 70) p.push(`speed=${tickerSpeed}`);
    if (tickerSolid) p.push('bg=solid');
    if (!tickerUpcoming) p.push('upcoming=false');
    if (!tickerFinal) p.push('final=false');
    return `${origin}/ticker${p.length > 0 ? `?${p.join('&')}` : ''}`;
  })();

  const breakUrl = (() => {
    const p = [...parts];
    if (!brkHalftime) p.push('halftime=false');
    if (!brkQuarters) p.push('quarters=false');
    if (!brkScores) p.push('scores=false');
    return `${origin}/break${p.length > 0 ? `?${p.join('&')}` : ''}`;
  })();

  // The manual source: always on, auto-detection off, toggled by an OBS hotkey.
  const breakManualUrl = `${origin}/break${
    parts.length > 0 ? `?${parts.join('&')}&force=1` : '?force=1'
  }`;

  async function copy(url: string, label: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied('Copy failed — select the text manually');
      setTimeout(() => setCopied(null), 3000);
    }
  }

  return (
    <div className="settings-screen min-h-full bg-field-950 px-6 py-10 text-field-100">
      <div className="mx-auto max-w-5xl">
        <header className="pb-8">
          <div className="flex flex-wrap items-center gap-3 pb-4">
            {(Object.keys(LEAGUES) as LeagueId[]).map((id) => (
              <button
                key={id}
                onClick={() => setLeagueId(id)}
                className={
                  'rounded-full px-5 py-2 text-lg font-semibold transition-colors ' +
                  (id === leagueId
                    ? 'bg-close text-field-950'
                    : 'border border-field-700 text-field-300 hover:border-field-500 hover:bg-field-850')
                }
              >
                {LEAGUES[id].label}
              </button>
            ))}
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Pick your teams</h1>
          <p className="max-w-2xl pt-3 text-lg leading-relaxed text-field-500">
            Favorites sort to the top of the scoreboard, get polled for scoring plays,
            and interrupt the highlight wall with a score card. Each league has its own
            list. Choose them here, then
            point each TV at the URL below — that link <em>is</em> the setting, so it
            survives a TV clearing its own storage.
          </p>
        </header>

        {/* Selection summary + generated URLs, sticky so it stays reachable
            while you scroll a long team list. */}
        <section className="sticky top-0 z-10 -mx-2 rounded-2xl border border-field-700 bg-field-900/95 p-5 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 pb-4">
            <span className="pr-1 text-lg font-semibold text-field-300">
              {selected.length} selected
            </span>
            {selected.length === 0 && (
              <span className="text-lg text-field-500">
                None — the TVs will fall back to the defaults in config.ts.
              </span>
            )}
            {selected.map((name) => (
              <button
                key={name}
                onClick={() => setSelected((prev) => prev.filter((t) => t !== name))}
                className="group flex items-center gap-2 rounded-full bg-close/20 px-3 py-1 text-base font-medium text-close hover:bg-close/30"
                title="Remove"
              >
                {name}
                <span className="text-close/60 group-hover:text-close">✕</span>
              </button>
            ))}
            {selected.length > 0 && (
              <button
                onClick={() => setSelected([])}
                className="ml-auto text-base text-field-500 underline hover:text-field-300"
              >
                Clear all
              </button>
            )}
          </div>

          <UrlRow label="Scoreboard TV" url={scoreboardUrl} onCopy={() => copy(scoreboardUrl, 'Scoreboard')} />
          <UrlRow label="Highlight wall" url={wallUrl} onCopy={() => copy(wallUrl, 'Highlight wall')} />

          <p className="pt-3 text-base text-field-500">
            {copied ? (
              <span className="text-live">{copied} URL copied</span>
            ) : (
              <>
                Typing this on a Fire Stick remote? The short <code className="text-field-300">?f=</code>{' '}
                form is deliberate — every character counts on an on-screen keyboard.
              </>
            )}
          </p>
        </section>

        {/* ---- OBS ticker builder ------------------------------------- */}
        {/* scroll-mt clears the sticky summary box above, so jumping here does
            not land the heading underneath it. */}
        <section
          id="obs-ticker"
          className="mt-8 scroll-mt-64 rounded-2xl border border-field-800 bg-field-900 p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3 pb-1">
            <h2 className="text-2xl font-bold tracking-tight">OBS score ticker</h2>
            <span className="text-base text-field-500">
              Add as a Browser Source, {`1920 × ${tickerHeight}`}
            </span>
          </div>
          <p className="max-w-2xl pb-5 text-base leading-relaxed text-field-500">
            Uses the teams selected above. The page is transparent, so it composites
            over whatever is beneath it in your scene — leave OBS's Custom CSS at its
            default.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Choice
              label="Style"
              value={tickerStyle}
              options={[
                { value: 'scroll', label: 'Crawl' },
                { value: 'flip', label: 'One at a time' },
              ]}
              onChange={(v) => setTickerStyle(v as 'scroll' | 'flip')}
            />
            <Choice
              label="Background"
              value={tickerSolid ? 'solid' : 'transparent'}
              options={[
                { value: 'transparent', label: 'Transparent' },
                { value: 'solid', label: 'Filled bar' },
              ]}
              onChange={(v) => setTickerSolid(v === 'solid')}
            />
            <Choice
              label="Show"
              value={`${tickerUpcoming ? 'u' : ''}${tickerFinal ? 'f' : ''}` || 'live'}
              options={[
                { value: 'uf', label: 'Everything' },
                { value: 'u', label: 'No finals' },
                { value: 'live', label: 'Live only' },
              ]}
              onChange={(v) => {
                setTickerUpcoming(v === 'uf' || v === 'u');
                setTickerFinal(v === 'uf');
              }}
            />

            <Slider
              label="Crawl speed"
              value={tickerSpeed}
              min={30}
              max={160}
              step={5}
              suffix=" px/sec"
              disabled={tickerStyle === 'flip'}
              onChange={setTickerSpeed}
            />
            <Slider
              label="Source height"
              value={tickerHeight}
              min={50}
              max={180}
              step={10}
              suffix=" px"
              onChange={setTickerHeight}
            />
          </div>

          <div className="pt-5">
            <UrlRow label="OBS Browser Source" url={tickerUrl} onCopy={() => copy(tickerUrl, 'Ticker')} />
          </div>

          {/* Live preview at the real source height. The checkerboard makes
              transparency visible the way OBS's canvas would. */}
          <div className="pt-4">
            <div className="pb-2 text-base text-field-500">
              Preview at {tickerHeight}px — the checkerboard is what shows through
            </div>
            <div
              className="w-full overflow-hidden rounded-lg"
              style={{
                height: tickerHeight,
                backgroundColor: '#2f3a2f',
                backgroundImage:
                  'linear-gradient(45deg, #26302a 25%, transparent 25%), linear-gradient(-45deg, #26302a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #26302a 75%), linear-gradient(-45deg, transparent 75%, #26302a 75%)',
                backgroundSize: '18px 18px',
                backgroundPosition: '0 0, 0 9px, 9px -9px, -9px 0px',
              }}
            >
              <iframe
                key={tickerUrl + tickerHeight}
                src={tickerUrl}
                title="OBS ticker preview"
                className="h-full w-full border-0"
              />
            </div>
          </div>
        </section>

        {/* ---- Auto commercial-break overlay --------------------------- */}
        <section
          id="obs-break"
          className="mt-8 scroll-mt-64 rounded-2xl border border-field-800 bg-field-900 p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3 pb-1">
            <h2 className="text-2xl font-bold tracking-tight">Auto break scoreboard</h2>
            <span className="text-base text-field-500">Browser Source, full canvas size</span>
          </div>
          <p className="max-w-2xl pb-5 text-base leading-relaxed text-field-500">
            Sits in your scene permanently and shows nothing until the game data says a
            break is likely, then fades a full scoreboard in and back out on its own.
            No scene switching needed. It watches your first in-progress favorite —
            triggering on all sixty games would leave it up permanently.
          </p>

          <div className="flex flex-wrap gap-2 pb-5">
            <Toggle label="Halftime" on={brkHalftime} onChange={setBrkHalftime} />
            <Toggle label="End of quarter" on={brkQuarters} onChange={setBrkQuarters} />
            <Toggle label="After a score" on={brkScores} onChange={setBrkScores} />
          </div>

          <UrlRow
            label="Auto overlay"
            url={breakUrl}
            onCopy={() => copy(breakUrl, 'Break overlay')}
          />
          <UrlRow
            label="Manual (hotkey)"
            url={breakManualUrl}
            onCopy={() => copy(breakManualUrl, 'Manual scoreboard')}
          />

          <div className="mt-4 rounded-xl border border-field-800 bg-field-950 p-4 text-base leading-relaxed text-field-500">
            <div className="pb-2 font-semibold text-field-300">Hotkeys, in OBS</div>
            Add both URLs as Browser Sources at your full canvas size. Leave{' '}
            <span className="text-field-300">Shutdown source when not visible</span>{' '}
            <em>unchecked</em> on the auto one — it needs to keep running to notice a
            break. Then in <span className="text-field-300">Settings → Hotkeys</span>:
            <ul className="list-disc space-y-1 py-2 pl-6">
              <li>
                <span className="text-field-300">Hide “Auto overlay”</span> — ends a break
                early. It remembers, so it will not pop back up for the same one.
              </li>
              <li>
                <span className="text-field-300">Show “Auto overlay”</span> — resumes
                automatic breaks.
              </li>
              <li>
                <span className="text-field-300">Show / Hide “Manual”</span> — force the
                scoreboard up any time, regardless of what the game is doing.
              </li>
            </ul>
            Keep the manual source hidden by default and above the auto one in the list.
          </div>
        </section>

        <section className="pt-8">
          <input
            ref={filterRef}
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={onFilterKeyDown}
            placeholder="Type a team name, then press Enter — Esc clears"
            className="w-full rounded-xl border border-field-700 bg-field-900 px-5 py-4 text-xl text-field-100 outline-none placeholder:text-field-500 focus:border-field-500"
          />

          <div className="flex items-baseline justify-between px-1 pt-4 text-base text-field-500">
            <span>
              {teams.length === 0
                ? updatedAt
                  ? 'No teams returned — ESPN may be unreachable. You can still type names into the URL by hand.'
                  : 'Loading teams…'
                : `${visible.length} of ${teams.length} teams`}
            </span>
            {data?.mock && <span className="text-close">MOCK DATA</span>}
          </div>

          {/* Jump links — one click to any conference instead of scrolling. */}
          {!filter && groups.length > 1 && (
            <div className="flex flex-wrap gap-2 pt-4">
              {groups.map((g) => (
                <a
                  key={g.name}
                  href={`#conf-${encodeURIComponent(g.name)}`}
                  className="rounded-full border border-field-800 px-3 py-1 text-base text-field-300 hover:border-field-500 hover:bg-field-850"
                >
                  {g.name}
                  <span className="pl-1.5 text-field-500">{g.teams.length}</span>
                </a>
              ))}
            </div>
          )}

          {groups.map((group) => (
            <section
              key={group.name}
              id={`conf-${encodeURIComponent(group.name)}`}
              className="scroll-mt-64 pt-8"
            >
              <h3 className="pb-3 text-xl font-semibold uppercase tracking-[0.15em] text-field-500">
                {group.name}
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {group.teams.map((team) => {
                  const on = isSelected(team);
                  return (
                    <button
                      key={team.id}
                      onClick={() => toggle(team)}
                      aria-pressed={on}
                      className={
                        'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ' +
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-close ' +
                        (on
                          ? 'border-close bg-close/15'
                          : 'border-field-800 bg-field-900 hover:border-field-700 hover:bg-field-850')
                      }
                    >
                      {team.logo && (
                        <img
                          src={team.logo}
                          alt=""
                          className="h-9 w-9 shrink-0 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.visibility = 'hidden';
                          }}
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-semibold">{team.location}</span>
                        <span className="block truncate text-sm text-field-500">{team.nickname}</span>
                      </span>
                      {on && <span className="shrink-0 text-xl text-close">✓</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </section>

        <footer className="py-10 text-base leading-relaxed text-field-500">
          Nothing here is saved to a server. The URL carries the setting; this browser
          also remembers your last pick as a convenience, but the TVs never depend on
          that. To change the defaults permanently, edit{' '}
          <code className="text-field-300">LEAGUE_SETTINGS.{leagueId}.favorites</code> in{' '}
          <code className="text-field-300">config.ts</code>.
        </footer>
      </div>
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={
        'rounded-lg px-4 py-2 text-base font-medium transition-colors ' +
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-close ' +
        (on
          ? 'bg-close text-field-950'
          : 'border border-field-700 text-field-500 hover:border-field-500 hover:bg-field-850')
      }
    >
      {on ? '✓ ' : ''}
      {label}
    </button>
  );
}

/** A compact segmented control — clearer than a <select> at a glance. */
function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="pb-2 text-base text-field-500">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={
              'rounded-lg px-3 py-2 text-base font-medium transition-colors ' +
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-close ' +
              (o.value === value
                ? 'bg-close text-field-950'
                : 'border border-field-700 text-field-300 hover:border-field-500 hover:bg-field-850')
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className={disabled ? 'opacity-40' : ''}>
      <div className="flex items-baseline justify-between pb-2 text-base text-field-500">
        <span>{label}</span>
        <span className="text-field-300">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-close"
      />
    </div>
  );
}

function UrlRow({ label, url, onCopy }: { label: string; url: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-36 shrink-0 text-base text-field-500">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-lg bg-field-950 px-3 py-2 text-base text-field-300">
        {url}
      </code>
      <button
        onClick={onCopy}
        className="shrink-0 rounded-lg border border-field-700 px-4 py-2 text-base font-medium hover:border-field-500 hover:bg-field-850"
      >
        Copy
      </button>
    </div>
  );
}
