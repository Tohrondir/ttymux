import { EventEmitter } from 'node:events';
import type { PortConnectionStatus, PortId, SerialSettings } from '@ttymux/shared';
import { DEFAULT_SERIAL_SETTINGS } from '@ttymux/shared';
import type { PortDescriptor } from '../registry/discovery.js';
import { computeBackoffDelay, DEFAULT_BACKOFF_OPTIONS, type BackoffOptions } from './backoff.js';
import { RingBuffer } from './RingBuffer.js';
import { createRealSerialPort, type SerialPortFactory } from './SerialPortLike.js';

interface ManagedPortState {
  descriptor: PortDescriptor;
  settings: SerialSettings;
  status: PortConnectionStatus;
  errorMessage?: string;
  ringBuffer: RingBuffer;
  handle?: import('./SerialPortLike.js').SerialPortLike;
  attempt: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  present: boolean;
  lastSeenAt?: string;
}

export interface SerialManagerOptions {
  scrollbackBytes?: number;
  portFactory?: SerialPortFactory;
  backoffOptions?: BackoffOptions;
  defaultSettings?: (portId: PortId) => SerialSettings;
}

export interface SerialManager {
  on(event: 'data', listener: (portId: PortId, chunk: Buffer) => void): this;
  on(event: 'status', listener: (portId: PortId, status: PortConnectionStatus, errorMessage?: string) => void): this;
}

/**
 * Owns one managed connection per port. Transport-agnostic: knows nothing
 * about HTTP/WebSocket, only emits typed data/status events. Auto-opens as
 * soon as a port is discovered so scrollback/logging accumulate even before
 * any viewer attaches, and retries with backoff on unexpected drops.
 */
export class SerialManager extends EventEmitter {
  private readonly ports = new Map<PortId, ManagedPortState>();
  private readonly scrollbackBytes: number;
  private readonly portFactory: SerialPortFactory;
  private readonly backoffOptions: BackoffOptions;
  private readonly defaultSettingsFor: (portId: PortId) => SerialSettings;

  constructor(opts: SerialManagerOptions = {}) {
    super();
    this.scrollbackBytes = opts.scrollbackBytes ?? 200_000;
    this.portFactory = opts.portFactory ?? createRealSerialPort;
    this.backoffOptions = opts.backoffOptions ?? DEFAULT_BACKOFF_OPTIONS;
    this.defaultSettingsFor = opts.defaultSettings ?? (() => DEFAULT_SERIAL_SETTINGS);
  }

  handlePortAdded(descriptor: PortDescriptor): void {
    let managed = this.ports.get(descriptor.id);
    if (!managed) {
      managed = {
        descriptor,
        settings: this.defaultSettingsFor(descriptor.id),
        status: 'connecting',
        ringBuffer: new RingBuffer(this.scrollbackBytes),
        attempt: 0,
        present: true,
      };
      this.ports.set(descriptor.id, managed);
    } else {
      managed.descriptor = descriptor;
      managed.present = true;
      if (managed.handle?.isOpen) {
        // Already connected under this id — nothing to do unless the OS path changed.
        return;
      }
    }
    this.clearReconnectTimer(managed);
    managed.attempt = 0;
    this.attemptOpen(descriptor.id);
  }

  handlePortRemoved(portId: PortId): void {
    const managed = this.ports.get(portId);
    if (!managed) return;
    managed.present = false;
    managed.lastSeenAt = new Date().toISOString();
    this.clearReconnectTimer(managed);
    this.closeHandle(managed, { intentional: true });
    this.setStatus(portId, managed, 'offline');
  }

  write(portId: PortId, data: Buffer): boolean {
    const managed = this.ports.get(portId);
    if (!managed?.handle?.isOpen) return false;
    managed.handle.write(data);
    return true;
  }

  changeSettings(portId: PortId, partial: Partial<SerialSettings>): boolean {
    const managed = this.ports.get(portId);
    if (!managed) return false;
    managed.settings = { ...managed.settings, ...partial };
    if (managed.handle?.isOpen) {
      this.clearReconnectTimer(managed);
      this.closeHandle(managed, { intentional: true });
      managed.attempt = 0;
      this.attemptOpen(portId);
    }
    return true;
  }

  getScrollback(portId: PortId): Buffer {
    return this.ports.get(portId)?.ringBuffer.read() ?? Buffer.alloc(0);
  }

  getSettings(portId: PortId): SerialSettings | undefined {
    return this.ports.get(portId)?.settings;
  }

  getStatus(portId: PortId): { status: PortConnectionStatus; errorMessage?: string; lastSeenAt?: string } | undefined {
    const managed = this.ports.get(portId);
    if (!managed) return undefined;
    return { status: managed.status, errorMessage: managed.errorMessage, lastSeenAt: managed.lastSeenAt };
  }

  getDescriptor(portId: PortId): PortDescriptor | undefined {
    return this.ports.get(portId)?.descriptor;
  }

  /** All port ids ever seen, including ones currently offline (unplugged but remembered). */
  listKnownIds(): PortId[] {
    return [...this.ports.keys()];
  }

  stop(): void {
    for (const [portId, managed] of this.ports) {
      this.clearReconnectTimer(managed);
      this.closeHandle(managed, { intentional: true });
      void portId;
    }
  }

  private attemptOpen(portId: PortId): void {
    const managed = this.ports.get(portId);
    if (!managed || !managed.present) return;

    this.setStatus(portId, managed, 'connecting');

    let handle;
    try {
      handle = this.portFactory(managed.descriptor.path, managed.settings);
    } catch (err) {
      this.handleOpenFailure(portId, managed, err as Error);
      return;
    }
    managed.handle = handle;

    handle.open((err) => {
      if (err) {
        this.handleOpenFailure(portId, managed, err);
        return;
      }

      managed.attempt = 0;
      this.setStatus(portId, managed, 'online');

      handle.on('data', (chunk: Buffer) => {
        managed.ringBuffer.append(chunk);
        this.emit('data', portId, chunk);
      });

      handle.on('error', (dataErr: Error) => {
        this.handleUnexpectedDrop(portId, managed, dataErr);
      });

      handle.on('close', () => {
        if (managed.status === 'online') {
          this.handleUnexpectedDrop(portId, managed);
        }
      });
    });
  }

  private handleOpenFailure(portId: PortId, managed: ManagedPortState, err: Error): void {
    this.setStatus(portId, managed, 'error', err.message);
    this.scheduleReconnect(portId, managed);
  }

  private handleUnexpectedDrop(portId: PortId, managed: ManagedPortState, err?: Error): void {
    if (!managed.present) return; // handled by handlePortRemoved already
    this.setStatus(portId, managed, 'error', err?.message ?? 'Connection dropped unexpectedly');
    this.scheduleReconnect(portId, managed);
  }

  private scheduleReconnect(portId: PortId, managed: ManagedPortState): void {
    managed.attempt += 1;
    const delay = computeBackoffDelay(managed.attempt, this.backoffOptions);
    managed.reconnectTimer = setTimeout(() => {
      if (managed.present) this.attemptOpen(portId);
    }, delay);
    managed.reconnectTimer.unref?.();
  }

  private clearReconnectTimer(managed: ManagedPortState): void {
    if (managed.reconnectTimer) {
      clearTimeout(managed.reconnectTimer);
      managed.reconnectTimer = undefined;
    }
  }

  private closeHandle(managed: ManagedPortState, _opts: { intentional: boolean }): void {
    const handle = managed.handle;
    managed.handle = undefined;
    if (handle?.isOpen) {
      handle.removeAllListeners();
      handle.close(() => {});
    } else {
      handle?.removeAllListeners();
    }
  }

  private setStatus(portId: PortId, managed: ManagedPortState, status: PortConnectionStatus, errorMessage?: string): void {
    managed.status = status;
    managed.errorMessage = errorMessage;
    this.emit('status', portId, status, errorMessage);
  }
}
