interface HighlightRule {
  pattern: RegExp;
  sgr: string;
}

// Checked in this order; on overlap, whichever pattern's match starts
// earliest wins (see highlightLine below) -- listed roughly most-specific
// first so severity words win over, say, a timestamp digit run.
const RULES: HighlightRule[] = [
  { pattern: /\b(FATAL|PANIC|CRIT(?:ICAL)?)\b/g, sgr: '1;31' }, // bold red
  { pattern: /\bERR(?:OR)?\b/g, sgr: '31' }, // red
  { pattern: /\bWARN(?:ING)?\b/g, sgr: '33' }, // amber
  { pattern: /\b(OK|SUCCESS|PASS(?:ED)?)\b/g, sgr: '32' }, // green
  { pattern: /\bINFO\b/g, sgr: '36' }, // cyan
  { pattern: /\b(DEBUG|TRACE)\b/g, sgr: '90' }, // dim gray
  { pattern: /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, sgr: '90' }, // timestamp
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, sgr: '36' }, // IPv4
  { pattern: /\b(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}\b/g, sgr: '36' }, // MAC
  { pattern: /\b0x[0-9a-fA-F]+\b/g, sgr: '35' }, // hex literal
  { pattern: /"[^"\n]*"/g, sgr: '32' }, // quoted string
];

/**
 * Wraps recognized log-style tokens (severity words, timestamps, IPs, hex,
 * quoted strings) in ANSI SGR color codes -- xterm already renders ANSI
 * natively, this just adds some for plain text that doesn't come with its
 * own. This is pattern matching over arbitrary log/console text, not
 * language-aware syntax highlighting -- there's no single "language" a
 * serial device speaks. Lines that already contain an ESC byte are left
 * untouched entirely: the device is doing its own coloring already, this
 * doesn't try to out-guess it.
 */
export function highlightLine(line: string): string {
  if (line.length === 0 || line.includes('\x1b')) return line;

  const matches: Array<{ start: number; end: number; sgr: string }> = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(line))) {
      matches.push({ start: match.index, end: match.index + match[0].length, sgr: rule.sgr });
      if (match[0].length === 0) rule.pattern.lastIndex++; // guard against zero-width matches looping forever
    }
  }
  if (matches.length === 0) return line;

  matches.sort((a, b) => a.start - b.start);

  let result = '';
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue; // overlaps a match already applied, skip
    result += line.slice(cursor, m.start);
    result += `\x1b[${m.sgr}m${line.slice(m.start, m.end)}\x1b[0m`;
    cursor = m.end;
  }
  result += line.slice(cursor);
  return result;
}
