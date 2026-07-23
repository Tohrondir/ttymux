import type { ConsoleServerMessage, PortId, ViewerInfo, WriteTokenState } from '@ttymux/shared';

export interface ClientHandle {
  clientId: string;
  displayName?: string;
  send(message: ConsoleServerMessage): void;
}

interface ConsoleState {
  viewers: Map<string, ClientHandle & { connectedAt: string }>;
  writeToken: WriteTokenState;
}

export interface ControlResult {
  granted: boolean;
  reason?: string;
}

/**
 * Per-console viewer tracking and write-token arbitration. Transport-agnostic:
 * callers hand it a small `ClientHandle` (send callback) rather than a raw
 * WebSocket, so a future non-serial transport could reuse it unchanged.
 */
export class SessionHub {
  private readonly consoles = new Map<PortId, ConsoleState>();

  attach(portId: PortId, client: ClientHandle): void {
    const state = this.getOrCreate(portId);
    state.viewers.set(client.clientId, { ...client, connectedAt: new Date().toISOString() });
    this.broadcastViewers(portId);
  }

  detach(portId: PortId, clientId: string): void {
    const state = this.consoles.get(portId);
    if (!state) return;
    state.viewers.delete(clientId);
    if (state.writeToken.holder === clientId) {
      this.clearWriteToken(state);
      this.broadcastWriteToken(portId);
    }
    this.broadcastViewers(portId);
  }

  requestControl(portId: PortId, clientId: string): ControlResult {
    const state = this.getOrCreate(portId);
    if (state.writeToken.holder && state.writeToken.holder !== clientId) {
      return { granted: false, reason: `Console is controlled by ${state.writeToken.holderName ?? 'another user'}` };
    }
    const client = state.viewers.get(clientId);
    state.writeToken.holder = clientId;
    state.writeToken.holderName = client?.displayName;
    state.writeToken.since = new Date().toISOString();
    this.broadcastWriteToken(portId);
    return { granted: true };
  }

  releaseControl(portId: PortId, clientId: string): void {
    const state = this.consoles.get(portId);
    if (!state || state.writeToken.holder !== clientId) return;
    this.clearWriteToken(state);
    this.broadcastWriteToken(portId);
  }

  setFreeForAll(portId: PortId, enabled: boolean): void {
    const state = this.getOrCreate(portId);
    state.writeToken.freeForAll = enabled;
    this.broadcastWriteToken(portId);
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
      clientId: v.clientId,
      displayName: v.displayName,
      connectedAt: v.connectedAt,
      isWriter: state.writeToken.holder === v.clientId,
    }));
  }

  getViewerCount(portId: PortId): number {
    return this.consoles.get(portId)?.viewers.size ?? 0;
  }

  fanOutData(portId: PortId, chunk: Buffer): void {
    const state = this.consoles.get(portId);
    if (!state || state.viewers.size === 0) return;
    const message: ConsoleServerMessage = { type: 'output', dataBase64: chunk.toString('base64') };
    for (const viewer of state.viewers.values()) viewer.send(message);
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
    for (const viewer of state.viewers.values()) viewer.send(message);
  }

  private broadcastWriteToken(portId: PortId): void {
    const state = this.consoles.get(portId);
    if (!state) return;
    const message: ConsoleServerMessage = { type: 'writerChanged', writeToken: this.getWriteTokenState(portId) };
    for (const viewer of state.viewers.values()) viewer.send(message);
    this.broadcastViewers(portId);
  }
}
