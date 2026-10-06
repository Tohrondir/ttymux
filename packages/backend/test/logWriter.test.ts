import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

  describe('readTail', () => {
    it('returns the whole file when it is smaller than the requested tail size', () => {
      writeFileSync(join(dir, 'p1.log'), 'hello');
      const writer = new LogWriter({ enabled: true, directory: dir, maxSizeMb: 10, maxFiles: 5 });

      expect(writer.readTail('p1', 100).toString()).toBe('hello');
    });

    it('returns only the last N bytes of the current file when it is larger than requested', () => {
      writeFileSync(join(dir, 'p1.log'), 'abcdefghij');
      const writer = new LogWriter({ enabled: true, directory: dir, maxSizeMb: 10, maxFiles: 5 });

      expect(writer.readTail('p1', 4).toString()).toBe('ghij');
    });

    it('reaches back into rotated files, oldest-needed first, when the current file alone is not enough', () => {
      writeFileSync(join(dir, 'p1.log.2'), 'oldest');
      writeFileSync(join(dir, 'p1.log.1'), 'middle');
      writeFileSync(join(dir, 'p1.log'), 'newest');
      const writer = new LogWriter({ enabled: true, directory: dir, maxSizeMb: 10, maxFiles: 5 });

      // "newest" (6) + "middle" (6) = 12, exactly enough; "oldest" untouched.
      expect(writer.readTail('p1', 12).toString()).toBe('middlenewest');
    });

    it('takes only a partial tail of an older file when the byte budget runs out mid-file', () => {
      writeFileSync(join(dir, 'p1.log.1'), 'middle');
      writeFileSync(join(dir, 'p1.log'), 'newest');
      const writer = new LogWriter({ enabled: true, directory: dir, maxSizeMb: 10, maxFiles: 5 });

      // "newest" (6) leaves a budget of 3 for p1.log.1 -- its own tail: "dle".
      expect(writer.readTail('p1', 9).toString()).toBe('dlenewest');
    });

    it('returns an empty buffer when nothing has been logged for this port', () => {
      const writer = new LogWriter({ enabled: true, directory: dir, maxSizeMb: 10, maxFiles: 5 });
      expect(writer.readTail('never-seen', 100)).toEqual(Buffer.alloc(0));
    });

    it('returns an empty buffer for a non-positive byte budget', () => {
      writeFileSync(join(dir, 'p1.log'), 'hello');
      const writer = new LogWriter({ enabled: true, directory: dir, maxSizeMb: 10, maxFiles: 5 });
      expect(writer.readTail('p1', 0)).toEqual(Buffer.alloc(0));
    });
  });

  describe('rotation', () => {
    it('rotates during a synchronous burst of appends and caps the number of files', () => {
      // maxSizeMb of 10_000 bytes, appended 100 times in one tick with no chance for async I/O to settle.
      const maxBytes = 10_000;
      const writer = new LogWriter({ enabled: true, directory: dir, maxSizeMb: maxBytes / (1024 * 1024), maxFiles: 3 });
      for (let i = 0; i < 100; i++) writer.append('p1', Buffer.alloc(1000, 0x41));
      writer.closeAll();

      expect(readdirSync(dir).sort()).toEqual(['p1.log', 'p1.log.1', 'p1.log.2', 'p1.log.3']);
      for (const name of readdirSync(dir)) {
        expect(statSync(join(dir, name)).size).toBeLessThanOrEqual(maxBytes + 1000);
      }
    });

    it('keeps data in chronological order across rotated files', () => {
      const writer = new LogWriter({ enabled: true, directory: dir, maxSizeMb: 4 / (1024 * 1024), maxFiles: 5 });
      for (const part of ['aaaa', 'bbbb', 'cccc']) writer.append('p1', Buffer.from(part));
      writer.closeAll();

      expect(writer.readTail('p1', 100).toString()).toBe('aaaabbbbcccc');
    });
  });
});
