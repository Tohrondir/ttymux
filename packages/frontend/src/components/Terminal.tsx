import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon, type ISearchOptions } from '@xterm/addon-search';
import { Terminal as XtermTerminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { LineHighlighter } from '../utils/LineHighlighter.js';

export interface SearchResult {
  resultIndex: number;
  resultCount: number;
}

export interface TerminalHandle {
  write(data: Uint8Array): void;
  clear(): void;
  findNext(term: string, options?: ISearchOptions): boolean;
  findPrevious(term: string, options?: ISearchOptions): boolean;
  clearSearch(): void;
  /** Returns an unsubscribe function. */
  onSearchResultsChange(callback: (result: SearchResult) => void): () => void;
}

export interface TerminalProps {
  readOnly: boolean;
  onInput: (data: Uint8Array) => void;
  /** Best-effort log-pattern coloring for plain text; off returns to exact raw byte passthrough. */
  highlightEnabled: boolean;
}

const encoder = new TextEncoder();

const SEARCH_DECORATIONS = {
  matchBackground: '#3a3626',
  matchBorder: '#5b6864',
  matchOverviewRuler: '#5b6864',
  activeMatchBackground: '#e8a33d',
  activeMatchBorder: '#e8a33d',
  activeMatchColorOverviewRuler: '#e8a33d',
};

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal({ readOnly, onInput, highlightEnabled }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XtermTerminal | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const highlighterRef = useRef<LineHighlighter | null>(null);
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;
  const highlightEnabledRef = useRef(highlightEnabled);
  highlightEnabledRef.current = highlightEnabled;
  /** True while the viewport is scrolled up away from the newest output. */
  const [scrolledUp, setScrolledUp] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XtermTerminal({
      allowProposedApi: true, // addon-search relies on the proposed registerDecoration/registerMarker APIs
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
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    term.open(container);
    fit.fit();

    const dataDisposable = term.onData((text) => {
      onInputRef.current(encoder.encode(text));
      highlighterRef.current?.notifyLocalInput();
    });

    // Three triggers can change whether we're scrolled up: the user scrolling
    // (xterm suppresses onScroll for that, so listen to the viewport element's
    // own DOM scroll event; xterm's listener on it was registered first in
    // open(), so viewportY is already updated when ours runs), programmatic
    // scrolls (onScroll), and new output growing the buffer underneath a
    // viewport that stays put while scrolled up (onWriteParsed).
    const updateScrolledUp = () => setScrolledUp(term.buffer.active.viewportY < term.buffer.active.baseY);
    const viewportElement = container.querySelector('.xterm-viewport');
    viewportElement?.addEventListener('scroll', updateScrolledUp);
    const scrollDisposable = term.onScroll(updateScrolledUp);
    const writeDisposable = term.onWriteParsed(updateScrolledUp);

    const resizeObserver = new ResizeObserver(() => fit.fit());
    resizeObserver.observe(container);

    termRef.current = term;
    searchAddonRef.current = searchAddon;
    highlighterRef.current = new LineHighlighter((text) => termRef.current?.write(text));

    return () => {
      highlighterRef.current?.flush();
      highlighterRef.current = null;
      searchAddonRef.current = null;
      dataDisposable.dispose();
      viewportElement?.removeEventListener('scroll', updateScrolledUp);
      scrollDisposable.dispose();
      writeDisposable.dispose();
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
      findNext(term, options) {
        return searchAddonRef.current?.findNext(term, { decorations: SEARCH_DECORATIONS, ...options }) ?? false;
      },
      findPrevious(term, options) {
        return searchAddonRef.current?.findPrevious(term, { decorations: SEARCH_DECORATIONS, ...options }) ?? false;
      },
      clearSearch() {
        searchAddonRef.current?.clearDecorations();
      },
      onSearchResultsChange(callback) {
        const disposable = searchAddonRef.current?.onDidChangeResults(callback);
        return () => disposable?.dispose();
      },
    }),
    [],
  );

  return (
    // overflow-hidden: xterm's hidden input textarea follows the cursor and pokes below the last row, which would otherwise stretch the page.
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="terminal-glass h-full w-full [&_.xterm]:h-full [&_.xterm-viewport]:!bg-transparent" />
      {scrolledUp && (
        <button
          type="button"
          onClick={() => {
            termRef.current?.scrollToBottom();
            termRef.current?.focus();
          }}
          title="Scroll to the newest output"
          className="absolute bottom-3 right-5 z-10 rounded-md border border-signal-dim bg-panel/90 px-2.5 py-1 text-xs text-signal shadow-lg transition-colors hover:text-paper"
        >
          Jump to bottom &darr;
        </button>
      )}
    </div>
  );
});
