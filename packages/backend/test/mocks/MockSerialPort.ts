import { EventEmitter } from 'node:events';
import type { SerialPortFactory, SerialPortLike } from '../../src/serial/SerialPortLike.js';

export class MockSerialPort extends EventEmitter implements SerialPortLike {
  isOpen = false;
  written: Buffer[] = [];

  constructor(private readonly failOpen: boolean) {
    super();
  }

  open(callback: (err: Error | null) => void): void {
    if (this.failOpen) {
      callback(new Error('mock open failure'));
      return;
    }
    this.isOpen = true;
    callback(null);
  }

  write(data: Buffer, callback?: (err: Error | null | undefined) => void): boolean {
    this.written.push(data);
    callback?.(undefined);
    return true;
  }

  close(callback?: (err: Error | null) => void): void {
    this.isOpen = false;
    callback?.(null);
  }
}

export type OpenOutcome = 'success' | 'fail';

/**
 * Each call consumes the next queued outcome (defaulting to 'success' once
 * the queue is exhausted), and every created instance is kept for
 * inspection/simulating device events (`data`, `error`, `close`).
 */
export function createMockPortFactory(openResults: OpenOutcome[] = []) {
  const created: MockSerialPort[] = [];
  let index = 0;

  const factory: SerialPortFactory = () => {
    const outcome = openResults[index] ?? 'success';
    index += 1;
    const port = new MockSerialPort(outcome === 'fail');
    created.push(port);
    return port;
  };

  return { factory, created };
}
