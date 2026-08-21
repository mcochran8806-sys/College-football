import { useEffect, useRef } from 'react';
import { PlayerState, isSkippableError, loadYouTubeApi } from '../lib/youtubeApi';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  videoId: string | null;
  /** Unlocked by the tap-to-start gesture; until then we stay muted. */
  audioUnlocked: boolean;
  onEnded: () => void;
  /** Embedding disabled (101/150) and friends — skip, don't stall. */
  onUnplayable: (code: number) => void;
  /** Pause/resume for score-card interstitials. */
  paused: boolean;
}

/**
 * One long-lived YouTube player. The video is swapped with loadVideoById
 * rather than by remounting the component — tearing an iframe down and
 * building a new one for every clip leaks memory on TV browsers and adds a
 * visible black flash between videos.
 */
export default function YouTubeStage({ videoId, audioUnlocked, onEnded, onUnplayable, paused }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const currentIdRef = useRef<string | null>(null);

  // Callbacks change identity on every render; the player is created once, so
  // it reads them through refs instead of being rebuilt.
  const onEndedRef = useRef(onEnded);
  const onUnplayableRef = useRef(onUnplayable);
  onEndedRef.current = onEnded;
  onUnplayableRef.current = onUnplayable;

  useEffect(() => {
    let disposed = false;

    loadYouTubeApi()
      .then((YT) => {
        if (disposed || !hostRef.current) return;

        playerRef.current = new YT.Player(hostRef.current, {
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            // Browsers only allow autoplay while muted; the tap-to-start
            // overlay unmutes us once a real gesture has happened.
            mute: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            iv_load_policy: 3,
          },
          events: {
            onReady: (e: any) => {
              readyRef.current = true;
              e.target.mute();
              if (currentIdRef.current) e.target.loadVideoById(currentIdRef.current);
            },
            onStateChange: (e: any) => {
              if (e.data === PlayerState.ENDED) onEndedRef.current();
            },
            onError: (e: any) => {
              const code = Number(e?.data);
              // 101/150 fire several times an hour in normal operation —
              // network accounts disable embedding on plenty of their own
              // clips. Either way the response is the same: move on.
              console.warn(
                `[wall] player error ${code}` +
                  (isSkippableError(code) ? ' (expected, skipping)' : ' (unexpected, skipping)'),
              );
              onUnplayableRef.current(code);
            },
          },
        });
      })
      .catch((err) => {
        console.error('[wall] IFrame API unavailable:', err);
        // Treat it as an unplayable clip so the wall falls through to score
        // cards rather than sitting on a black screen.
        onUnplayableRef.current(-1);
      });

    return () => {
      disposed = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* the API throws if it was never fully constructed; nothing to do */
      }
      playerRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // Swap the loaded video.
  useEffect(() => {
    currentIdRef.current = videoId;
    if (!videoId || !readyRef.current || !playerRef.current) return;
    try {
      playerRef.current.loadVideoById(videoId);
    } catch (err) {
      console.error('[wall] loadVideoById failed:', err);
      onUnplayableRef.current(-1);
    }
  }, [videoId]);

  // Audio unlock.
  useEffect(() => {
    if (!readyRef.current || !playerRef.current) return;
    try {
      if (audioUnlocked) {
        playerRef.current.unMute();
        playerRef.current.setVolume(100);
      } else {
        playerRef.current.mute();
      }
    } catch {
      /* ignore — player not ready yet, the onReady handler covers it */
    }
  }, [audioUnlocked]);

  // Score-card interstitial pause/resume.
  useEffect(() => {
    if (!readyRef.current || !playerRef.current) return;
    try {
      if (paused) playerRef.current.pauseVideo();
      else playerRef.current.playVideo();
    } catch {
      /* ignore */
    }
  }, [paused]);

  return <div ref={hostRef} className="h-full w-full" />;
}
