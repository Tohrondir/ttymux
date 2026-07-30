import { highlightLine } from './highlightLine.js';

// A device's 'data' event isn't guaranteed to deliver one logical line as a
// single chunk -- one write() on the far end can arrive as several separate
// chunks, and the gap between them grows under load (device-side buffering,
// OS scheduling, or the browser's own event loop being busy with a burst of
// incoming messages). A short give-up window actively works against
// correctness here: the busier the output, the more likely some line's tail
// arrives just late enough to miss it, and that line permanently loses its
// highlighting. This waits generously before giving up and showing a
// still-open line raw, so reassembly comfortably survives realistic jitter;
// watching output that occasionally takes an extra beat to color is far less
// noticeable than output that never colors at all.
const PARTIAL_LINE_FLUSH_DELAY_MS = 200;

// Separate, non-time-based safety valve: a stream that's genuinely not
// line-oriented (e.g. raw/binary data, or an interactive session with no
// newline for a while) shouldn't make `carry` grow without bound just
// because nothing has hit the time-based flush yet.
const MAX_UNTERMINATED_BYTES = 8192;

/**
 * Feeds raw terminal output through line-based highlighting without ever
 * delaying output that's already newline-terminated -- the common case for
 * log-style lines gets colored with zero added latency. A line still being
 * streamed (no trailing newline yet, e.g. a shell prompt waiting for input,
 * or a line arriving in several chunks) is written raw once it's been
 * buffered longer than the flush delay, or has grown past a sane single-line
 * size, so real-time character echo never visibly lags forever; that
 * particular line just doesn't get colorized, since by the time its newline
 * arrives part of it is already on screen.
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
    // A completed newline resolves whatever fragment the pending timer (if
    // any) was tracking -- clear it so a fresh one gets scheduled below for
    // whatever's left over, rather than firing on the old fragment's clock.
    if (segments.length > 0) {
      this.rawMode = false;
      this.clearFlushTimer();
    }

    this.carry = trailing;
    if (this.carry.length > MAX_UNTERMINATED_BYTES) {
      this.flush();
    } else if (this.carry && !this.flushTimer) {
      // Schedule exactly once per fragment, on its first chunk -- do NOT
      // reset this on every subsequent push() for the same still-open
      // fragment. A continuously-arriving partial (e.g. a held-down key's
      // OS-level repeat, echoed back character by character every 20-40ms)
      // would otherwise keep pushing this deadline out forever, so nothing
      // would ever reach the screen until the key is released. Scheduling
      // once, from the fragment's first byte, caps worst-case latency at
      // the delay itself no matter how long new chunks keep arriving.
      this.flushTimer = setTimeout(() => this.flush(), PARTIAL_LINE_FLUSH_DELAY_MS);
    }
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

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }
}
