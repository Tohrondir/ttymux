import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortDescriptor } from '../src/registry/discovery.js';
import { SerialManager } from '../src/serial/SerialManager.js';
import { createMockPortFactory } from './mocks/MockSerialPort.js';

const BACKOFF = { initialDelayMs: 100, maxDelayMs: 10_000, factor: 2, jitterRatio: 0 };

function descriptor(overrides: Partial<PortDescriptor> = {}): PortDescriptor {
  return { id: 'test-port', path: '/dev/mock0', stableId: true, ...overrides };
}

describe('SerialManager reconnect/backoff', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens successfully on discovery and reports online status', () => {
    const mock = createMockPortFactory();
    const sm = new SerialManager({ portFactory: mock.factory, backoffOptions: BACKOFF });
    const statuses: string[] = [];
    sm.on('status', (_id, status) => statuses.push(status));

    sm.handlePortAdded(descriptor());

    expect(statuses).toEqual(['connecting', 'online']);
    expect(sm.getStatus('test-port')?.status).toBe('online');
  });

  it('retries with exponential backoff after open failures, then succeeds', () => {
    const mock = createMockPortFactory(['fail', 'fail']);
    const sm = new SerialManager({ portFactory: mock.factory, backoffOptions: BACKOFF });

    sm.handlePortAdded(descriptor());
    expect(sm.getStatus('test-port')?.status).toBe('error');
    expect(mock.created).toHaveLength(1);

    vi.advanceTimersByTime(99);
    expect(mock.created).toHaveLength(1);

    vi.advanceTimersByTime(1); // 100ms total => attempt 2
    expect(mock.created).toHaveLength(2);
    expect(sm.getStatus('test-port')?.status).toBe('error');

    vi.advanceTimersByTime(199);
    expect(mock.created).toHaveLength(2);

    vi.advanceTimersByTime(1); // +200ms => attempt 3, queue exhausted => succeeds
    expect(mock.created).toHaveLength(3);
    expect(sm.getStatus('test-port')?.status).toBe('online');
  });

  it('schedules a reconnect after an unexpected drop while online', () => {
    const mock = createMockPortFactory();
    const sm = new SerialManager({ portFactory: mock.factory, backoffOptions: BACKOFF });

    sm.handlePortAdded(descriptor());
    expect(sm.getStatus('test-port')?.status).toBe('online');

    mock.created[0].emit('error', new Error('usb glitch'));
    expect(sm.getStatus('test-port')?.status).toBe('error');
    expect(mock.created).toHaveLength(1);

    vi.advanceTimersByTime(100);
    expect(mock.created).toHaveLength(2);
    expect(sm.getStatus('test-port')?.status).toBe('online');
  });

  it('cancels a pending reconnect and marks offline when the device is unplugged', () => {
    const mock = createMockPortFactory(['fail']);
    const sm = new SerialManager({ portFactory: mock.factory, backoffOptions: BACKOFF });

    sm.handlePortAdded(descriptor());
    expect(sm.getStatus('test-port')?.status).toBe('error');

    sm.handlePortRemoved('test-port');
    expect(sm.getStatus('test-port')?.status).toBe('offline');

    vi.advanceTimersByTime(10_000);
    expect(mock.created).toHaveLength(1);
    expect(sm.getStatus('test-port')?.status).toBe('offline');
  });

  it('resets the attempt counter and reconnects immediately on replug', () => {
    const mock = createMockPortFactory(['fail']);
    const sm = new SerialManager({ portFactory: mock.factory, backoffOptions: BACKOFF });

    sm.handlePortAdded(descriptor());
    expect(sm.getStatus('test-port')?.status).toBe('error');
    sm.handlePortRemoved('test-port');

    sm.handlePortAdded(descriptor());

    expect(mock.created).toHaveLength(2);
    expect(sm.getStatus('test-port')?.status).toBe('online');
  });

  it('forwards writes only while online and buffers scrollback from device data', () => {
    const mock = createMockPortFactory();
    const sm = new SerialManager({ portFactory: mock.factory, backoffOptions: BACKOFF, scrollbackBytes: 1024 });

    sm.handlePortAdded(descriptor());
    const port = mock.created[0];

    expect(sm.write('test-port', Buffer.from('hello'))).toBe(true);
    expect(port.written[0]?.toString()).toBe('hello');

    port.emit('data', Buffer.from('device says hi'));
    expect(sm.getScrollback('test-port').toString()).toBe('device says hi');

    sm.handlePortRemoved('test-port');
    expect(sm.write('test-port', Buffer.from('nope'))).toBe(false);
  });

  it('seeds scrollback from disk the first time a port is seen, ahead of any live data', () => {
    const mock = createMockPortFactory();
    const sm = new SerialManager({
      portFactory: mock.factory,
      backoffOptions: BACKOFF,
      scrollbackBytes: 1024,
      scrollbackSeed: (portId) => (portId === 'test-port' ? Buffer.from('from disk\n') : undefined),
    });

    sm.handlePortAdded(descriptor());
    expect(sm.getScrollback('test-port').toString()).toBe('from disk\n');

    mock.created[0].emit('data', Buffer.from('live data\n'));
    expect(sm.getScrollback('test-port').toString()).toBe('from disk\nlive data\n');
  });

  it('does not re-seed scrollback on a reconnect of an already-known port', () => {
    const mock = createMockPortFactory();
    const seed = vi.fn(() => Buffer.from('from disk\n'));
    const sm = new SerialManager({ portFactory: mock.factory, backoffOptions: BACKOFF, scrollbackSeed: seed });

    sm.handlePortAdded(descriptor());
    sm.handlePortRemoved('test-port');
    sm.handlePortAdded(descriptor());

    expect(seed).toHaveBeenCalledTimes(1);
  });
});
