import { EventEmitter } from 'node:events';
import type { ConsoleServerMessage, PortId, PortInfo, ViewerInfo, WriteTokenState } from '@ttymux/shared';

export interface ClientHandle {
  clientId: string;
  displayName?: string;
  send(message: ConsoleServerMessage): void;
}

interface ViewerEntry {
  client: ClientHandle;
  connectedAt: string;
}

interface ConsoleState {
  viewers: Map<string, ViewerEntry>;
  writeToken: WriteTokenState;
}

export interface ControlResult {
  granted: boolean;
  reason?: string;
}

export interface SessionHub {
  /** Fires whenever viewer count or write-token state changes for a console — the dashboard's live view hooks in here. */
  on(event: 'changed', listener: (portId: PortId) => void): this;
}

/**
 * Per-console viewer tracking and write-token arbitration. Transport-agnostic:
 * callers hand it a small `ClientHandle` (send callback) rather than a raw
 * WebSocket, so a future non-serial transport could reuse it unchanged.
 */
export class SessionHub extends EventEmitter {
  private readonly consoles = new Map<PortId, ConsoleState>();

  attach(portId: PortId, client: ClientHandle): void {
    const state = this.getOrCreate(portId);
    const isFirstViewer = state.viewers.size === 0;
    state.viewers.set(client.clientId, { client, connectedAt: new Date().toISOString() });

    // The first person to open an unclaimed console gets control automatically
    // — no point making a lone viewer click "take control" on their own console.
    if (isFirstViewer && state.writeToken.holder === null && !state.writeToken.freeForAll) {
      state.writeToken.holder = client.clientId;
      state.writeToken.holderName = client.displayName;
      state.writeToken.since = new Date().toISOString();
    }

    // Always send full write-token state on attach (rather than only on
    // change) so a newly joined viewer has authoritative state immediately,
    // instead of inferring it from the partial `writer` summary on `status`.
    this.broadcastWriteToken(portId);
    this.emit('changed', portId);
  }

  detach(portId: PortId, clientId: string): void {
    const state = this.consoles.get(portId);
    if (!state) return;
    state.viewers.delete(clientId);
    if (state.writeToken.holder === clientId) {
      this.clearWriteToken(state);
      this.broadcastWriteToken(portId);
    } else {
      this.broadcastViewers(portId);
    }
    this.emit('changed', portId);
  }

  requestControl(portId: PortId, clientId: string): ControlResult {
    const state = this.getOrCreate(portId);
    if (state.writeToken.holder && state.writeToken.holder !== clientId) {
      return { granted: false, reason: `Console is controlled by ${state.writeToken.holderName ?? 'another user'}` };
    }
    const client = state.viewers.get(clientId)?.client;
    state.writeToken.holder = clientId;
    state.writeToken.holderName = client?.displayName;
    state.writeToken.since = new Date().toISOString();
    this.broadcastWriteToken(portId);
    this.emit('changed', portId);
    return { granted: true };
  }

  releaseControl(portId: PortId, clientId: string): void {
    const state = this.consoles.get(portId);
    if (!state || state.writeToken.holder !== clientId) return;
    this.clearWriteToken(state);
    this.broadcastWriteToken(portId);
    this.emit('changed', portId);
  }

  setFreeForAll(portId: PortId, enabled: boolean): void {
    const state = this.getOrCreate(portId);
    state.writeToken.freeForAll = enabled;
    this.broadcastWriteToken(portId);
    this.emit('changed', portId);
  }

  /** Off by default: a client may only write while holding the token, unless free-for-all is enabled. */
  canWrite(portId: PortId, clientId: string): boolean {
    const state = this.consoles.get(portId);
    if (!state) return false;
    return state.writeToken.freeForAll || state.writeToken.holder === clientId;
  }

  getWriteTokenState(portId: PortId): WriteTokenState {
    return { ...this.getOrCreate(portId).writeToken };
  }

  getViewers(portId: PortId): ViewerInfo[] {
    const state = this.consoles.get(portId);
    if (!state) return [];
    return [...state.viewers.values()].map((v) => ({
      clientId: v.client.clientId,
      displayName: v.client.displayName,
      connectedAt: v.connectedAt,
      isWriter: state.writeToken.holder === v.client.clientId,
    }));
  }

  getViewerCount(portId: PortId): number {
    return this.consoles.get(portId)?.viewers.size ?? 0;
  }

  fanOutData(portId: PortId, chunk: Buffer): void {
    const state = this.consoles.get(portId);
    if (!state || state.viewers.size === 0) return;
    const message: ConsoleServerMessage = { type: 'output', dataBase64: chunk.toString('base64') };
    for (const viewer of state.viewers.values()) viewer.client.send(message);
  }

  broadcastStatus(portId: PortId, port: PortInfo): void {
    const state = this.consoles.get(portId);
    if (!state) return;
    const message: ConsoleServerMessage = { type: 'status', port };
    for (const viewer of state.viewers.values()) viewer.client.send(message);
  }

  private getOrCreate(portId: PortId): ConsoleState {
    let state = this.consoles.get(portId);
    if (!state) {
      state = { viewers: new Map(), writeToken: { holder: null, freeForAll: false } };
      this.consoles.set(portId, state);
    }
    return state;
  }

  private clearWriteToken(state: ConsoleState): void {
    state.writeToken.holder = null;
    state.writeToken.holderName = undefined;
    state.writeToken.since = undefined;
  }

  private broadcastViewers(portId: PortId): void {
    const state = this.consoles.get(portId);
    if (!state) return;
    const message: ConsoleServerMessage = { type: 'viewers', viewers: this.getViewers(portId) };
    for (const viewer of state.viewers.values()) viewer.client.send(message);
  }

  private broadcastWriteToken(portId: PortId): void {
    const state = this.consoles.get(portId);
    if (!state) return;
    const message: ConsoleServerMessage = { type: 'writerChanged', writeToken: this.getWriteTokenState(portId) };
    for (const viewer of state.viewers.values()) viewer.client.send(message);
    this.broadcastViewers(portId);
  }
}
