import { obsAuthString } from './sha256';

/**
 * Minimal obs-websocket v5 client.
 *
 * Only what the deck needs: connect, authenticate, send requests. No event
 * subscription — the deck asks for state rather than listening for it, which
 * keeps reconnection logic trivial on a phone that sleeps constantly.
 */

export type ObsStatus = 'idle' | 'connecting' | 'connected' | 'error';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Pending {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export class ObsClient {
  private socket: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private nextId = 1;
  /** sceneItemId lookups are stable for a session; resolving costs a round trip. */
  private itemIds = new Map<string, number>();
  /** Pre-silence levels, so restoring a source returns it to its own volume. */
  private volumes = new Map<string, number>();

  status: ObsStatus = 'idle';
  error: string | null = null;
  onChange: (() => void) | null = null;

  private set(status: ObsStatus, error: string | null = null) {
    this.status = status;
    this.error = error;
    this.onChange?.();
  }

  connect(host: string, port: number, password: string): void {
    this.disconnect();
    this.set('connecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(`ws://${host}:${port}`);
    } catch (err) {
      this.set('error', String(err));
      return;
    }
    this.socket = socket;

    socket.onerror = () => {
      // The browser deliberately withholds the reason for a failed ws
      // connection, so this message has to cover every likely cause.
      this.set(
        'error',
        'Could not reach OBS. Check the IP and port, that the WebSocket server is enabled, and that this page is on http rather than https.',
      );
    };

    socket.onclose = () => {
      if (this.status !== 'error') this.set('idle');
      this.itemIds.clear();
    };

    socket.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }

      // Hello -> Identify
      if (msg.op === 0) {
        const auth = msg.d?.authentication;
        const payload: any = { rpcVersion: 1, eventSubscriptions: 0 };
        if (auth) {
          if (!password) {
            this.set('error', 'OBS requires a password. Copy it from Tools -> WebSocket Server Settings -> Show Connect Info.');
            socket.close();
            return;
          }
          payload.authentication = obsAuthString(password, auth.salt, auth.challenge);
        }
        socket.send(JSON.stringify({ op: 1, d: payload }));
        return;
      }

      // Identified
      if (msg.op === 2) {
        this.set('connected');
        return;
      }

      // RequestResponse
      if (msg.op === 7) {
        const { requestId, requestStatus, responseData } = msg.d ?? {};
        const waiter = this.pending.get(requestId);
        if (!waiter) return;
        this.pending.delete(requestId);
        if (requestStatus?.result) waiter.resolve(responseData ?? {});
        else waiter.reject(new Error(requestStatus?.comment ?? 'Request failed'));
      }
    };
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.pending.clear();
    this.itemIds.clear();
    // Levels are deliberately kept: a phone that slept mid-break still knows
    // what to restore when it wakes up and reconnects.
  }

  request<T = any>(requestType: string, requestData?: unknown): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Not connected to OBS'));
    }
    const requestId = String(this.nextId++);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      // A phone that sleeps mid-request would otherwise leak the promise.
      setTimeout(() => {
        if (this.pending.delete(requestId)) reject(new Error(`${requestType} timed out`));
      }, 6000);
    });
  }

  /** Current program scene — source visibility is per scene, so this is needed first. */
  async currentScene(): Promise<string> {
    const r = await this.request<any>('GetCurrentProgramScene');
    return r.sceneName ?? r.currentProgramSceneName;
  }

  private async sceneItemId(scene: string, source: string): Promise<number> {
    const key = `${scene}::${source}`;
    const cached = this.itemIds.get(key);
    if (cached !== undefined) return cached;
    const r = await this.request<{ sceneItemId: number }>('GetSceneItemId', {
      sceneName: scene,
      sourceName: source,
    });
    this.itemIds.set(key, r.sceneItemId);
    return r.sceneItemId;
  }

  async setSourceVisible(source: string, visible: boolean): Promise<void> {
    const scene = await this.currentScene();
    const sceneItemId = await this.sceneItemId(scene, source);
    await this.request('SetSceneItemEnabled', {
      sceneName: scene,
      sceneItemId,
      sceneItemEnabled: visible,
    });
  }

  async isSourceVisible(source: string): Promise<boolean | null> {
    try {
      const scene = await this.currentScene();
      const sceneItemId = await this.sceneItemId(scene, source);
      const r = await this.request<{ sceneItemEnabled: boolean }>('GetSceneItemEnabled', {
        sceneName: scene,
        sceneItemId,
      });
      return r.sceneItemEnabled;
    } catch {
      // A source missing from the current scene is not an error worth shouting
      // about — the button simply shows an unknown state.
      return null;
    }
  }

  /**
   * Mute or unmute an audio input.
   *
   * Inputs are global, not per scene, so unlike scene items this needs no
   * scene lookup. Throws if the input does not exist — callers that treat a
   * missing music source as "not set up yet" should catch it.
   */
  async setInputMute(input: string, muted: boolean): Promise<void> {
    await this.request('SetInputMute', { inputName: input, inputMuted: muted });
  }

  /**
   * Silence or restore an audio input — for real, including what you hear.
   *
   * Mute alone is not enough. It cuts the source from the stream, but audio
   * monitoring is a separate branch of the pipeline, so on a rig where the
   * speakers are fed by monitoring the source stays audible while OBS shows it
   * muted. Dropping the volume to zero closes that branch too, and the mute
   * still carries the state that the UI reads back.
   *
   * The prior level is remembered rather than assumed, so a source running at
   * half volume comes back at half volume instead of jumping to full.
   */
  async setInputSilenced(input: string, silenced: boolean): Promise<void> {
    if (silenced) {
      try {
        const v = await this.request<{ inputVolumeMul: number }>('GetInputVolume', {
          inputName: input,
        });
        if (v.inputVolumeMul > 0) this.volumes.set(input, v.inputVolumeMul);
      } catch {
        // Losing the old level is survivable; failing to silence is not.
      }
      await this.request('SetInputVolume', { inputName: input, inputVolumeMul: 0 });
      await this.setInputMute(input, true);
    } else {
      await this.setInputMute(input, false);
      await this.request('SetInputVolume', {
        inputName: input,
        inputVolumeMul: this.volumes.get(input) ?? 1,
      });
    }
  }

  async isInputMuted(input: string): Promise<boolean | null> {
    try {
      const r = await this.request<{ inputMuted: boolean }>('GetInputMute', {
        inputName: input,
      });
      return r.inputMuted;
    } catch {
      return null;
    }
  }

  /**
   * Saves the replay buffer and plays it back through a Media Source, then
   * hides it again — the corner-box instant replay.
   *
   * OBS writes the clip asynchronously and offers no completion signal we can
   * read without subscribing to events, so the new file is identified by
   * watching the last-replay path change rather than by guessing at a delay.
   */
  async playReplay(mediaSource: string, maxSeconds = 180): Promise<void> {
    // Note the current clip first: on a rig that saves replays all afternoon,
    // the path is the only thing distinguishing this save from the last one.
    let previous: string | null = null;
    try {
      const r = await this.request<{ savedReplayPath: string }>('GetLastReplayBufferReplay');
      previous = r.savedReplayPath ?? null;
    } catch {
      // Nothing saved yet this session, which is fine — any path is new.
    }

    const status = await this.request<{ outputActive: boolean }>('GetReplayBufferStatus');
    if (!status.outputActive) {
      await this.request('StartReplayBuffer');
      throw new Error('Replay buffer was off — started it. Give it a moment, then press again.');
    }

    await this.request('SaveReplayBuffer');
    const path = await this.waitForNewReplay(previous);

    await this.request('SetInputSettings', {
      inputName: mediaSource,
      inputSettings: { local_file: path, is_local_file: true },
      overlay: true,
    });

    await this.setSourceVisible(mediaSource, true);
    try {
      await this.request('TriggerMediaInputAction', {
        inputName: mediaSource,
        mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
      });
    } catch {
      // Sources set to restart when they become active manage without this.
    }

    try {
      await this.waitForMediaEnd(mediaSource, maxSeconds);
    } finally {
      // Hide it whatever happened: a replay box stuck on screen over live
      // play is far worse than one that ends early.
      await this.setSourceVisible(mediaSource, false).catch(() => {});
    }
  }

  private async waitForNewReplay(previous: string | null, timeoutMs = 10000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await delay(300);
      try {
        const r = await this.request<{ savedReplayPath: string }>('GetLastReplayBufferReplay');
        if (r.savedReplayPath && r.savedReplayPath !== previous) return r.savedReplayPath;
      } catch {
        // Keep asking; the request fails until the first clip exists.
      }
    }
    throw new Error('Replay saved, but OBS did not report the file in time.');
  }

  private async waitForMediaEnd(mediaSource: string, maxSeconds: number): Promise<void> {
    const deadline = Date.now() + maxSeconds * 1000;
    let seenPlaying = false;
    while (Date.now() < deadline) {
      await delay(400);
      let state: string;
      try {
        const r = await this.request<{ mediaState: string }>('GetMediaInputStatus', {
          inputName: mediaSource,
        });
        state = r.mediaState ?? '';
      } catch {
        return;
      }
      if (state === 'OBS_MEDIA_STATE_PLAYING') {
        seenPlaying = true;
        continue;
      }
      // Opening and buffering are on the way to playing, and the states before
      // the first frame look identical to the states after the last one — so
      // only treat a non-playing state as the end once playback has begun.
      if (seenPlaying && state !== 'OBS_MEDIA_STATE_OPENING' && state !== 'OBS_MEDIA_STATE_BUFFERING') {
        return;
      }
    }
  }

  /** Saves the replay buffer, starting it first if it is not running. */
  async saveReplay(): Promise<void> {
    const status = await this.request<{ outputActive: boolean }>('GetReplayBufferStatus');
    if (!status.outputActive) {
      await this.request('StartReplayBuffer');
      throw new Error('Replay buffer was off — started it. Press again to save.');
    }
    await this.request('SaveReplayBuffer');
  }
}
