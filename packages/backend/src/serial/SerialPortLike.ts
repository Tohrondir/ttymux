import { EventEmitter } from 'node:events';
import { SerialPort } from 'serialport';
import type { SerialSettings } from '@ttymux/shared';

/**
 * Minimal surface of `serialport`'s SerialPort that SerialManager depends
 * on. Abstracted so tests can inject a mock instead of touching hardware.
 */
export interface SerialPortLike extends EventEmitter {
  readonly isOpen: boolean;
  open(callback: (err: Error | null) => void): void;
  write(data: Buffer, callback?: (err: Error | null | undefined) => void): boolean;
  close(callback?: (err: Error | null) => void): void;
}

export type SerialPortFactory = (path: string, settings: SerialSettings) => SerialPortLike;

export const createRealSerialPort: SerialPortFactory = (path, settings) => {
  return new SerialPort({
    path,
    baudRate: settings.baudRate,
    dataBits: settings.dataBits,
    stopBits: settings.stopBits,
    parity: settings.parity,
    rtscts: settings.flowControl === 'rts/cts',
    xon: settings.flowControl === 'xon/xoff',
    xoff: settings.flowControl === 'xon/xoff',
    autoOpen: false,
  }) as unknown as SerialPortLike;
};
