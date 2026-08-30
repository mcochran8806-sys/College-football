import { obsAuthString } from './sha256';

/**
 * Minimal obs-websocket v5 client.
 *
 * Only what the deck needs: connect, authenticate, send requests. No event
 * subscription — the deck asks for state rather than listening for it, which
 * keeps reconnection logic trivial on a phone that sleeps constantly.
 */

export type ObsStatus = 'idle' | 'connecting' | 'connected' | 'error';

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
