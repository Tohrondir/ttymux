/** Fixed-capacity byte ring buffer used for per-port scrollback replay. */
export class RingBuffer {
  private readonly buffer: Buffer;
  private writePos = 0;
  private filled = false;

  constructor(private readonly capacity: number) {
    this.buffer = Buffer.alloc(Math.max(1, capacity));
  }

  append(chunk: Buffer): void {
    if (chunk.length === 0) return;

    if (chunk.length >= this.capacity) {
      chunk.copy(this.buffer, 0, chunk.length - this.capacity);
      this.writePos = 0;
      this.filled = true;
      return;
    }

    const spaceToEnd = this.capacity - this.writePos;
    if (chunk.length <= spaceToEnd) {
      chunk.copy(this.buffer, this.writePos);
      this.writePos += chunk.length;
      if (this.writePos === this.capacity) {
        this.writePos = 0;
        this.filled = true;
      }
    } else {
      chunk.copy(this.buffer, this.writePos, 0, spaceToEnd);
      chunk.copy(this.buffer, 0, spaceToEnd);
      this.writePos = chunk.length - spaceToEnd;
      this.filled = true;
    }
  }

  /** Returns buffered bytes in chronological order. */
  read(): Buffer {
    if (!this.filled) return this.buffer.subarray(0, this.writePos);
    return Buffer.concat([this.buffer.subarray(this.writePos), this.buffer.subarray(0, this.writePos)]);
  }

  clear(): void {
    this.writePos = 0;
    this.filled = false;
  }
}
