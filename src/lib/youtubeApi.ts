/**
 * Loader for the YouTube IFrame Player API.
 *
 * The API installs a single global (`window.YT`) and calls one global callback
 * when it's ready, so loading is deduped through a module-level promise —
 * mounting the player twice must not inject the script twice.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let pending: Promise<any> | null = null;

export function loadYouTubeApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;

  pending = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load the YouTube IFrame API'));
    document.head.appendChild(script);

    // A TV that loses DNS mid-load would otherwise hang here forever.
    setTimeout(() => reject(new Error('YouTube IFrame API load timed out')), 20_000);
  });

  return pending;
}

/** Player states, from the IFrame API. */
export const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

/**
 * IFrame error codes worth distinguishing.
 *
 * 101 and 150 are the same condition reported two ways: the uploader has
 * disabled embedding. On a wall of network highlight clips this happens
 * constantly — several times an hour — so it is a routine skip, not an error
 * state. 2 and 5 are malformed id / HTML5 playback failure; also skip.
 */
export const PlayerError = {
  INVALID_PARAM: 2,
  HTML5_ERROR: 5,
  NOT_FOUND: 100,
  EMBED_DISABLED_A: 101,
  EMBED_DISABLED_B: 150,
} as const;

export function isSkippableError(code: number): boolean {
  return (
    code === PlayerError.EMBED_DISABLED_A ||
    code === PlayerError.EMBED_DISABLED_B ||
    code === PlayerError.NOT_FOUND ||
    code === PlayerError.INVALID_PARAM ||
    code === PlayerError.HTML5_ERROR
  );
}
