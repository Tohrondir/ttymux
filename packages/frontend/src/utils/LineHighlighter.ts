import { highlightLine } from './highlightLine.js';

/**
 * Feeds raw terminal output through line-based highlighting without ever
 * delaying anything: a newline-terminated segment is colored and written the
 * moment it arrives, and a line still being streamed (no trailing newline
 * yet, e.g. a shell prompt echoing keystrokes, or a progress line rewritten
 * in place) is written raw in the same call, so character echo is never held
 * back waiting to see if a match completes. That still-open line just skips
 * highlighting for its remainder, exactly like the rest of any line that's
 * already been shown raw.
 */
export class LineHighlighter {
  private decoder = new TextDecoder();
  private rawMode = false;

  constructor(private readonly writeRaw: (text: string) => void) {}

  push(data: Uint8Array): void {
    const text = this.decoder.decode(data, { stream: true });
    const segments = text.split('\n');
    const trailing = segments.pop() ?? '';

    segments.forEach((segment, index) => {
      const raw = index === 0 && this.rawMode;
      this.writeRaw((raw ? segment : highlightLine(segment)) + '\n');
    });
    if (segments.length > 0) this.rawMode = false;

    // Never highlight the trailing, not-yet-newline-terminated remainder --
    // it may be an incomplete word (e.g. "ERR" of a still-arriving "ERRONEOUS"),
    // and a pattern match on partial text can be outright wrong, not just
    // premature. Writing it raw now, immediately, is what makes echo instant.
    if (trailing) {
      this.writeRaw(trailing);
      this.rawMode = true;
    }
  }

  /** Drop all buffered state, e.g. before replaying scrollback after a reconnect. */
  reset(): void {
    this.decoder = new TextDecoder();
    this.rawMode = false;
  }
}
