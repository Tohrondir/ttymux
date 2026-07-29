import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogWriter } from '../src/logging/LogWriter.js';

describe('LogWriter log file listing/streaming', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ttymux-logwriter-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns only the current file when no rotation has happened', () => {
    writeFileSync(join(dir, 'p1.log'), 'hello');

    const writer = new LogWriter({ enabled: true, directory: dir, maxSizeMb: 10, maxFiles: 5 });

    expect(writer.listExistingLogFiles('p1')).toEqual([join(dir, 'p1.log')]);
  });

  it('orders rotated files oldest first, current file last', () => {
    writeFileSync(join(dir, 'p1.log.3'), 'oldest\n');
    writeFileSync(join(dir, 'p1.log.2'), 'middle\n');
    writeFileSync(join(dir, 'p1.log.1'), 'newer\n');
    writeFileSync(join(dir, 'p1.log'), 'current\n');

    const writer = new LogWriter({ enabled: true, directory: dir, maxSizeMb: 10, maxFiles: 5 });

    expect(writer.listExistingLogFiles('p1')).toEqual([
      join(dir, 'p1.log.3'),
      join(dir, 'p1.log.2'),
      join(dir, 'p1.log.1'),
      join(dir, 'p1.log'),
    ]);
  });

  it('skips gaps in the rotation sequence rather than stopping early', () => {
    // .log.2 missing entirely -- shouldn't cause .log.1/.log to be skipped too.
    writeFileSync(join(dir, 'p1.log.3'), 'oldest\n');
    writeFileSync(join(dir, 'p1.log.1'), 'newer\n');
    writeFileSync(join(dir, 'p1.log'), 'current\n');

    const writer = new LogWriter({ enabled: true, directory: dir, maxSizeMb: 10, maxFiles: 5 });

    expect(writer.listExistingLogFiles('p1')).toEqual([join(dir, 'p1.log.3'), join(dir, 'p1.log.1'), join(dir, 'p1.log')]);
  });

  it('createLogReadStream concatenates files in chronological order', async () => {
    writeFileSync(join(dir, 'p1.log.1'), 'first\n');
    writeFileSync(join(dir, 'p1.log'), 'second\n');

    const writer = new LogWriter({ enabled: true, directory: dir, maxSizeMb: 10, maxFiles: 5 });
    const result = writer.createLogReadStream('p1');
    expect(result).toBeDefined();
    expect(result?.filename).toBe('p1.log');

    const chunks: Buffer[] = [];
    for await (const chunk of result!.stream) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe('first\nsecond\n');
  });

  it('returns undefined when nothing has been logged for this port', () => {
    const writer = new LogWriter({ enabled: true, directory: dir, maxSizeMb: 10, maxFiles: 5 });
    expect(writer.createLogReadStream('never-seen')).toBeUndefined();
  });

  it('sanitizes path-unsafe characters in the filename', () => {
    const writer = new LogWriter({ enabled: true, directory: dir, maxSizeMb: 10, maxFiles: 5 });
    expect(writer.getLogFileName('path:/dev/ttyUSB0')).toBe('path__dev_ttyUSB0.log');
  });
});
