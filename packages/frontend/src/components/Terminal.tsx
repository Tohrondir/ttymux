import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XtermTerminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { LineHighlighter } from '../utils/LineHighlighter.js';

export interface TerminalHandle {
  write(data: Uint8Array): void;
  clear(): void;
}

export interface TerminalProps {
  readOnly: boolean;
  onInput: (data: Uint8Array) => void;
  /** Best-effort log-pattern coloring for plain text; off returns to exact raw byte passthrough. */
  highlightEnabled: boolean;
}

const encoder = new TextEncoder();

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal({ readOnly, onInput, highlightEnabled }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XtermTerminal | null>(null);
  const highlighterRef = useRef<LineHighlighter | null>(null);
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;
  const highlightEnabledRef = useRef(highlightEnabled);
  highlightEnabledRef.current = highlightEnabled;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XtermTerminal({
      convertEol: true,
      fontFamily: 'ui-monospace, "JetBrains Mono", "SF Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#0c0f0e',
        foreground: '#e4e7e4',
        cursor: '#e8a33d',
        selectionBackground: '#232b29',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    const dataDisposable = term.onData((text) => onInputRef.current(encoder.encode(text)));

    const resizeObserver = new ResizeObserver(() => fit.fit());
    resizeObserver.observe(container);

    termRef.current = term;
    highlighterRef.current = new LineHighlighter((text) => termRef.current?.write(text));

    return () => {
      highlighterRef.current?.flush();
      highlighterRef.current = null;
      dataDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (termRef.current) termRef.current.options.disableStdin = readOnly;
  }, [readOnly]);

  useEffect(() => {
    if (!highlightEnabled) highlighterRef.current?.flush();
  }, [highlightEnabled]);

  useImperativeHandle(
    ref,
    () => ({
      write(data) {
        if (highlightEnabledRef.current) highlighterRef.current?.push(data);
        else termRef.current?.write(data);
      },
      clear() {
        highlighterRef.current?.reset();
        termRef.current?.clear();
      },
    }),
    [],
  );

  return <div ref={containerRef} className="terminal-glass h-full w-full [&_.xterm]:h-full [&_.xterm-viewport]:!bg-transparent" />;
});
