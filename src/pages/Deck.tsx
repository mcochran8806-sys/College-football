import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { INTERVALS } from '../../config';
import { useFavorites } from '../hooks/useFavorites';
import { useLeague } from '../hooks/useLeague';
import { usePoll } from '../hooks/usePoll';
import { getScoreboard } from '../lib/api';
import { statusLine } from '../lib/format';
import { ObsClient } from '../lib/obsClient';
import { isFavorite } from '../lib/sortGames';
import type { Game } from '../../shared/types';

/**
 * Phone control surface — a Stream Deck for this setup.
 *
 * Must be served over plain http from your own machine. Browsers block ws://
 * from an https:// page, and obs-websocket does not speak TLS, so the Vercel
 * copy of this page cannot reach OBS. That is what `npm start` is for.
 */

const STORAGE_KEY = 'cfb.deck.v1';

interface Connection {
  host: string;
  port: string;
  password: string;
  autoSource: string;
  manualSource: string;
  gameAudioSource: string;
  musicSource: string;
}

const DEFAULTS: Connection = {
  host: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
  port: '4455',
  password: '',
  autoSource: 'Auto break',
  manualSource: 'Manual scoreboard',
  gameAudioSource: 'Game Audio',
  musicSource: 'Break music',
};

export default function Deck() {
  const league = useLeague();
  const { teams: favorites } = useFavorites(league);
  const loadScoreboard = useCallback(() => getScoreboard(league.id), [league]);
  const { data } = usePoll(loadScoreboard, INTERVALS.scoreboardPoll);

  const [conn, setConn] = useState<Connection>(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });
  const [showSetup, setShowSetup] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [, force] = useState(0);
  /**
   * Live mute state for the two audio inputs, or null when OBS has no input by
   * that name. Shown on the toggles, which makes it the first place to look
   * when the music does not come through: a name that is wrong reads "not
   * found", while a name that is right but silent means the problem is
   * downstream in OBS — routing or audio monitoring — not here.
   */
  const [audio, setAudio] = useState<{ game: boolean | null; music: boolean | null }>({
    game: null,
    music: null,
  });

  const client = useRef<ObsClient | null>(null);
  if (client.current === null) client.current = new ObsClient();
  const obs = client.current;
  const connected = obs.status === 'connected';

  useEffect(() => {
    obs.onChange = () => force((n) => n + 1);
    return () => {
      obs.onChange = null;
    };
  }, [obs]);

  // Connect on load, and reconnect when the phone wakes — a locked screen
  // drops the socket, and nobody wants to press a dead button at a touchdown.
  useEffect(() => {
    obs.connect(conn.host, Number(conn.port), conn.password);
    const onWake = () => {
      if (document.visibilityState === 'visible' && obs.status !== 'connected') {
        obs.connect(conn.host, Number(conn.port), conn.password);
      }
    };
    document.addEventListener('visibilitychange', onWake);
    return () => {
      document.removeEventListener('visibilitychange', onWake);
      obs.disconnect();
    };
  }, [obs, conn]);

  const say = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2600);
  };

  const gameInput = conn.gameAudioSource.trim();
  const musicInput = conn.musicSource.trim();

  const refreshAudio = useCallback(async () => {
    const game = gameInput ? await obs.isInputMuted(gameInput) : null;
    const music = musicInput ? await obs.isInputMuted(musicInput) : null;
    setAudio({ game, music });
  }, [obs, gameInput, musicInput]);

  // Read the real state whenever the socket comes up, so the toggles never
  // show a guess — including after the phone wakes and reconnects.
  useEffect(() => {
    if (!connected) {
      setAudio({ game: null, music: null });
      return;
    }
    void refreshAudio();
  }, [connected, refreshAudio]);

  const run = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
      say(label);
      // Haptic confirmation matters when you are not looking at the phone.
      navigator.vibrate?.(18);
    } catch (err) {
      say(err instanceof Error ? err.message : String(err));
    } finally {
      // Even a failed action may have half-applied, so re-read either way.
      if (connected) void refreshAudio();
    }
  };

  /**
   * One tap for the whole commercial routine: scoreboard up, game silenced,
   * music running — and the exact reverse coming back.
   *
   * Each step is attempted independently so a half-configured rig still does
   * what it can. A blank source name means "I do not have that, skip it",
   * which is what makes this degrade cleanly to a plain scoreboard toggle for
   * anyone who never set up the music lane.
   */
  const setBreakMode = async (on: boolean) => {
    const steps: Array<[string, () => Promise<void>]> = [];
    // Audio first — it is the change you actually notice in the room.
    if (gameInput) steps.push(['game audio', () => obs.setInputMute(gameInput, on)]);
    if (musicInput) steps.push(['music', () => obs.setInputMute(musicInput, !on)]);
    if (conn.manualSource.trim())
      steps.push(['scoreboard', () => obs.setSourceVisible(conn.manualSource.trim(), on)]);

    const failed: string[] = [];
    for (const [name, fn] of steps) {
      try {
        await fn();
      } catch {
        failed.push(name);
      }
    }

    if (failed.length === steps.length) {
      throw new Error(
        steps.length
          ? `Nothing worked — check the source names in setup (${failed.join(', ')}).`
          : 'No sources configured. Open setup and name them.',
      );
    }
    if (failed.length) {
      // Partial success is worth saying out loud: the rig looks half-switched
      // and the reason is almost always a name typed differently in OBS.
      throw new Error(`${on ? 'Commercial' : 'Back to game'} — but ${failed.join(' and ')} not found.`);
    }
  };

  const focusGame = useMemo<Game | null>(() => {
    const games = data?.games ?? [];
    const favs = games.filter((g) => isFavorite(g, favorites, league));
    return favs.find((g) => g.state === 'in') ?? favs[0] ?? null;
  }, [data, favorites, league]);

  return (
    <div className="settings-screen min-h-full bg-field-950 p-4 text-field-100">
      <div className="mx-auto max-w-md">
        <header className="flex items-center justify-between pb-3">
          <h1 className="text-2xl font-bold tracking-tight">Deck</h1>
          <button
            onClick={() => setShowSetup((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-field-700 px-3 py-1.5 text-sm"
          >
            <span
              className={
                'h-2.5 w-2.5 rounded-full ' +
                (connected
                  ? 'bg-live'
                  : obs.status === 'connecting'
                    ? 'bg-close'
                    : 'bg-redzone')
              }
            />
            {connected ? 'OBS' : obs.status === 'connecting' ? '…' : 'offline'}
          </button>
        </header>

        {/* --- live status ------------------------------------------------ */}
        <section className="mb-4 rounded-2xl border border-field-800 bg-field-900 p-4">
          {focusGame ? (
            <>
              <div className="flex items-center justify-between text-2xl font-bold">
                <span className="truncate">{focusGame.away.abbreviation}</span>
                <span className="tabular-nums">{focusGame.away.score ?? '–'}</span>
              </div>
              <div className="flex items-center justify-between pt-1 text-2xl font-bold">
                <span className="truncate">{focusGame.home.abbreviation}</span>
                <span className="tabular-nums">{focusGame.home.score ?? '–'}</span>
              </div>
              <div className="flex items-center justify-between pt-2 text-base text-field-500">
                <span>{statusLine(focusGame)}</span>
                {focusGame.situation?.isRedZone && (
                  <span className="font-bold text-redzone">RED ZONE</span>
                )}
              </div>
            </>
          ) : (
            <p className="text-base text-field-500">No favorite game on the slate.</p>
          )}
        </section>

        {/* --- buttons ----------------------------------------------------- */}
        <div className="grid grid-cols-2 gap-3">
          <DeckButton
            label="Commercial"
            hint="board up · music on"
            tone="primary"
            disabled={!connected}
            onPress={() => run('Commercial', () => setBreakMode(true))}
          />
          <DeckButton
            label="Back to Game"
            hint="board off · sound on"
            disabled={!connected}
            onPress={() => run('Back to game', () => setBreakMode(false))}
          />
          <DeckButton
            label="Game Audio"
            hint={audio.game === null ? 'not found' : audio.game ? 'muted' : 'on'}
            active={audio.game === true}
            disabled={!connected || audio.game === null}
            onPress={() =>
              run(audio.game ? 'Game audio on' : 'Game audio muted', () =>
                obs.setInputMute(gameInput, !audio.game),
              )
            }
          />
          <DeckButton
            label="Music"
            hint={audio.music === null ? 'not found' : audio.music ? 'off' : 'playing'}
            active={audio.music === false}
            disabled={!connected || audio.music === null}
            onPress={() =>
              run(audio.music ? 'Music on' : 'Music off', () =>
                obs.setInputMute(musicInput, !audio.music),
              )
            }
          />
          <DeckButton
            label="End Break"
            hint="stop auto early"
            disabled={!connected}
            onPress={() => run('Break ended', () => obs.setSourceVisible(conn.autoSource, false))}
          />
          <DeckButton
            label="Resume Auto"
            hint="re-arm breaks"
            disabled={!connected}
            onPress={() => run('Auto breaks on', () => obs.setSourceVisible(conn.autoSource, true))}
          />
        </div>

        <div className="pt-3">
          <DeckButton
            label="Save Replay"
            hint="keep the last 60s"
            tone="replay"
            wide
            disabled={!connected}
            onPress={() => run('Replay saved', () => obs.saveReplay())}
          />
        </div>

        {obs.error && !connected && (
          <p className="pt-4 text-sm leading-relaxed text-close">{obs.error}</p>
        )}

        {/* --- setup ------------------------------------------------------- */}
        {showSetup && (
          <section className="mt-5 rounded-2xl border border-field-800 bg-field-900 p-4">
            <h2 className="pb-3 text-lg font-semibold">Connection</h2>
            {(
              [
                ['host', 'OBS machine IP'],
                ['port', 'Port'],
                ['password', 'WebSocket password'],
                ['autoSource', 'Auto overlay source name'],
                ['manualSource', 'Manual scoreboard source name'],
                ['gameAudioSource', 'Game audio source name'],
                ['musicSource', 'Break music source name'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block pb-3">
                <span className="block pb-1 text-sm text-field-500">{label}</span>
                <input
                  value={conn[key]}
                  type={key === 'password' ? 'password' : 'text'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(e) => setConn((c) => ({ ...c, [key]: e.target.value }))}
                  className="w-full rounded-lg border border-field-700 bg-field-950 px-3 py-2 text-base outline-none focus:border-field-500"
                />
              </label>
            ))}
            <button
              onClick={() => {
                try {
                  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
                } catch {
                  /* private mode; the values still apply for this session */
                }
                obs.connect(conn.host, Number(conn.port), conn.password);
                setShowSetup(false);
              }}
              className="w-full rounded-lg bg-close py-3 text-base font-semibold text-field-950"
            >
              Save and reconnect
            </button>
            <p className="pt-3 text-sm leading-relaxed text-field-500">
              In OBS: <span className="text-field-300">Tools → WebSocket Server Settings</span> →
              enable it, then <span className="text-field-300">Show Connect Info</span> for the
              password. Source names must match exactly — copy them from the Sources and
              Audio Mixer panels. Leave a name blank to drop that step from the Commercial
              button.
            </p>
          </section>
        )}

        {toast && (
          <div className="pointer-events-none fixed inset-x-4 bottom-6 rounded-xl bg-field-800 px-4 py-3 text-center text-base shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function DeckButton({
  label,
  hint,
  onPress,
  disabled,
  tone,
  wide,
  active,
}: {
  label: string;
  hint: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'replay';
  wide?: boolean;
  /** Highlights the break-side state — game muted, or music playing. */
  active?: boolean;
}) {
  const base =
    tone === 'primary'
      ? 'bg-close text-field-950'
      : tone === 'replay'
        ? 'bg-live text-field-950'
        : active
          ? 'border-2 border-close bg-field-900 text-close'
          : 'border border-field-700 bg-field-900 text-field-100';

  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className={
        // Tall targets: this gets pressed without looking at it.
        `flex ${wide ? 'w-full' : ''} min-h-[5.5rem] flex-col items-center justify-center ` +
        `gap-1 rounded-2xl px-3 text-center transition-transform active:scale-95 ` +
        `disabled:opacity-40 ${base}`
      }
    >
      <span className="text-lg font-bold leading-tight">{label}</span>
      <span className="text-sm opacity-70">{hint}</span>
    </button>
  );
}
