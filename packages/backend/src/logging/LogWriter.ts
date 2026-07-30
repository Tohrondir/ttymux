import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
  type WriteStream,
} from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { PortId } from '@ttymux/shared';

export interface LogWriterOptions {
  enabled: boolean;
  directory: string;
  maxSizeMb: number;
  maxFiles: number;
}

interface LogEntry {
  stream: WriteStream;
  size: number;
  filePath: string;
}

/** Raw per-port disk logging with size-based rotation, e.g. port.log, port.log.1, port.log.2, ... */
export class LogWriter {
  private readonly entries = new Map<PortId, LogEntry>();
  private readonly maxBytes: number;

  constructor(private readonly opts: LogWriterOptions) {
    this.maxBytes = opts.maxSizeMb * 1024 * 1024;
  }

  append(portId: PortId, chunk: Buffer): void {
    if (!this.opts.enabled || chunk.length === 0) return;

    let entry = this.entries.get(portId);
    if (!entry) entry = this.openEntry(portId);

    entry.stream.write(chunk);
    entry.size += chunk.length;

    if (entry.size >= this.maxBytes) {
      this.rotate(portId, entry);
    }
  }

  close(portId: PortId): void {
    const entry = this.entries.get(portId);
    if (!entry) return;
    entry.stream.end();
    this.entries.delete(portId);
  }

  closeAll(): void {
    for (const portId of [...this.entries.keys()]) this.close(portId);
  }

  getLogFileName(portId: PortId): string {
    return `${sanitizeFileName(portId)}.log`;
  }

  /** All log files for this port that currently exist on disk, oldest rotation first, current file last. */
  listExistingLogFiles(portId: PortId): string[] {
    const basePath = join(this.opts.directory, this.getLogFileName(portId));
    const paths: string[] = [];
    for (let i = this.opts.maxFiles; i >= 1; i--) {
      const rotated = `${basePath}.${i}`;
      if (existsSync(rotated)) paths.push(rotated);
    }
    if (existsSync(basePath)) paths.push(basePath);
    return paths;
  }

  /** A single stream over all of this port's available log history (oldest first), or undefined if nothing's been captured yet. */
  createLogReadStream(portId: PortId): { stream: Readable; filename: string } | undefined {
    const files = this.listExistingLogFiles(portId);
    if (files.length === 0) return undefined;

    async function* readAll() {
      for (const filePath of files) {
        for await (const chunk of createReadStream(filePath)) yield chunk;
      }
    }

    return { stream: Readable.from(readAll()), filename: this.getLogFileName(portId) };
  }

  /**
   * The most recent `maxBytes` of this port's on-disk history (across
   * rotated files if the current one alone isn't enough), oldest first --
   * for seeding a freshly created in-memory scrollback buffer after a
   * restart, without reading whole (potentially many-MB) log files into memory.
   */
  readTail(portId: PortId, maxBytes: number): Buffer {
    if (maxBytes <= 0) return Buffer.alloc(0);

    const files = this.listExistingLogFiles(portId);
    const chunks: Buffer[] = [];
    let remaining = maxBytes;

    for (let i = files.length - 1; i >= 0 && remaining > 0; i--) {
      const filePath = files[i];
      const size = statSync(filePath).size;
      const readSize = Math.min(size, remaining);
      if (readSize <= 0) continue;

      const fd = openSync(filePath, 'r');
      try {
        const chunk = Buffer.alloc(readSize);
        readSync(fd, chunk, 0, readSize, size - readSize);
        chunks.unshift(chunk);
      } finally {
        closeSync(fd);
      }
      remaining -= readSize;
    }

    return Buffer.concat(chunks);
  }

  private openEntry(portId: PortId): LogEntry {
    mkdirSync(this.opts.directory, { recursive: true });
    const filePath = join(this.opts.directory, this.getLogFileName(portId));
    const size = existsSync(filePath) ? statSync(filePath).size : 0;
    const entry: LogEntry = { stream: createWriteStream(filePath, { flags: 'a' }), size, filePath };
    this.entries.set(portId, entry);
    return entry;
  }

  private rotate(portId: PortId, entry: LogEntry): void {
    entry.stream.end();
    this.entries.delete(portId);

    for (let i = this.opts.maxFiles - 1; i >= 1; i--) {
      const src = `${entry.filePath}.${i}`;
      if (!existsSync(src)) continue;
      const dst = `${entry.filePath}.${i + 1}`;
      if (i + 1 > this.opts.maxFiles) unlinkSync(src);
      else renameSync(src, dst);
    }
    if (existsSync(entry.filePath)) renameSync(entry.filePath, `${entry.filePath}.1`);

    this.openEntry(portId);
  }
}

function sanitizeFileName(portId: PortId): string {
  return portId.replace(/[/\\:]/g, '_');
}
