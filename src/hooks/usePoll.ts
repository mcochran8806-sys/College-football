import { useEffect, useRef, useState } from 'react';

export interface PollState<T> {
  data: T | null;
  error: Error | null;
  /** epoch ms of the last successful load, null before the first one. */
  updatedAt: number | null;
  /** Consecutive failures. The header dims the freshness dot once this is > 0. */
  failures: number;
}

/**
 * Poll an endpoint forever.
 *
 * Built for a display that runs unattended for twelve hours, so:
 *  - a failed poll keeps the last good data on screen rather than blanking it
 *  - failures back off (up to 4x) instead of hammering a struggling upstream
 *  - the timer is re-armed after each settle, so a slow response can't stack
 *    overlapping requests
 *  - the tab regaining visibility triggers an immediate refresh
 */
export function usePoll<T>(loader: () => Promise<T>, intervalMs: number): PollState<T> {
  const [state, setState] = useState<PollState<T>>({
    data: null,
    error: null,
    updatedAt: null,
    failures: 0,
  });

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const run = async () => {
      try {
        const data = await loaderRef.current();
        if (cancelled) return;
        failures = 0;
        setState({ data, error: null, updatedAt: Date.now(), failures: 0 });
      } catch (err) {
        if (cancelled) return;
        failures += 1;
        console.error('[poll] failed:', err);
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err : new Error(String(err)),
          failures,
        }));
      } finally {
        if (!cancelled) {
          const backoff = Math.min(4, 2 ** Math.max(0, failures - 1));
          timer = setTimeout(run, intervalMs * backoff);
        }
      }
    };

    run();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        run();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return state;
}

/** Seconds since a timestamp, ticking once a second. */
export function useSecondsSince(timestamp: number | null): number | null {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (timestamp === null) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / 1000));
}
