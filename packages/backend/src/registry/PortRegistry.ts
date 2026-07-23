import { EventEmitter } from 'node:events';
import type { PortId } from '@ttymux/shared';
import { listRawPorts, type PortDescriptor } from './discovery.js';

export type PortLister = () => Promise<PortDescriptor[]>;

export interface PortRegistry {
  on(event: 'added', listener: (descriptor: PortDescriptor) => void): this;
  on(event: 'removed', listener: (portId: PortId) => void): this;
  off(event: 'added' | 'removed', listener: (...args: any[]) => void): this;
}

/**
 * Discovers serial ports and watches for hotplug changes by polling
 * `serialport`'s list() call, since there is no single cross-platform
 * (Linux/macOS/Windows) OS-level hotplug notification API available to us.
 */
export class PortRegistry extends EventEmitter {
  private known = new Map<PortId, PortDescriptor>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private polling = false;

  constructor(
    private readonly pollIntervalMs = 2000,
    private readonly lister: PortLister = listRawPorts,
  ) {
    super();
  }

  async start(): Promise<void> {
    await this.poll();
    this.timer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  list(): PortDescriptor[] {
    return [...this.known.values()];
  }

  get(portId: PortId): PortDescriptor | undefined {
    return this.known.get(portId);
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const current = await this.lister();
      const currentIds = new Set(current.map((d) => d.id));

      for (const id of this.known.keys()) {
        if (!currentIds.has(id)) {
          this.known.delete(id);
          this.emit('removed', id);
        }
      }

      for (const descriptor of current) {
        const previous = this.known.get(descriptor.id);
        if (!previous || previous.path !== descriptor.path) {
          this.known.set(descriptor.id, descriptor);
          this.emit('added', descriptor);
        }
      }
    } finally {
      this.polling = false;
    }
  }
}
