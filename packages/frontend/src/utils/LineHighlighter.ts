import { highlightLine } from './highlightLine.js';

// A serial device's 'data' event very often fires more than once per
// logical line -- e.g. one write() call from the device can arrive as two or
// three chunks a few hundred microseconds apart. Without buffering across
// calls, a line split like that would never see its own newline in the same
// push() call and would silently skip highlighting forever. This is *not*
// about waiting for a slow typist to pause; it's a short window for a line's
// own tail to catch up before giving up on it -- short enough to be
// imperceptible, long enough to reassemble same-line chunks that land back
// to back.
const PARTIAL_LINE_FLUSH_DELAY_MS = 16;

/**
 * Feeds raw terminal output through line-based highlighting without ever
 * delaying output that's already newline-terminated -- the common case for
 * log-style lines gets colored with zero added latency. A line still being
 * streamed (no trailing newline yet, e.g. a shell prompt waiting for input)
 * is written raw once it's been buffered longer than the flush delay, so
 * real-time character echo never visibly lags; that particular line just
 * doesn't get colorized, since by the time its newline arrives part of it
 * is already on screen.
 */
export class LineHighlighter {
  private decoder = new TextDecoder();
  private carry = '';
  private rawMode = false;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly writeRaw: (text: string) => void) {}

  push(data: Uint8Array): void {
    const text = this.decoder.decode(data, { stream: true });
    const combined = this.carry + text;
    const segments = combined.split('\n');
    const trailing = segments.pop() ?? '';

    segments.forEach((segment, index) => {
      const raw = index === 0 && this.rawMode;
      this.writeRaw((raw ? segment : highlightLine(segment)) + '\n');
    });
    if (segments.length > 0) this.rawMode = false;

    this.carry = trailing;
    this.rescheduleFlush();
  }

  /** Drop all buffered state, e.g. before replaying scrollback after a reconnect. */
  reset(): void {
    this.clearFlushTimer();
    this.decoder = new TextDecoder();
    this.carry = '';
    this.rawMode = false;
  }

  /** Write out any buffered partial line immediately, uncolored (e.g. when highlighting is toggled off, or on unmount). */
  flush(): void {
    this.clearFlushTimer();
    if (this.carry) {
      this.writeRaw(this.carry);
      this.carry = '';
      this.rawMode = true;
    }
  }

  private rescheduleFlush(): void {
    this.clearFlushTimer();
    if (!this.carry) return;
    this.flushTimer = setTimeout(() => this.flush(), PARTIAL_LINE_FLUSH_DELAY_MS);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }
}
