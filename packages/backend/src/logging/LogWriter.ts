import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';
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

  private openEntry(portId: PortId): LogEntry {
    mkdirSync(this.opts.directory, { recursive: true });
    const filePath = join(this.opts.directory, `${sanitizeFileName(portId)}.log`);
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
