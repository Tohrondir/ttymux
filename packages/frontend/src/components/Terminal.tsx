import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
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
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    term.open(container);
    fit.fit();

    const dataDisposable = term.onData((text) => onInputRef.current(encoder.encode(text)));

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

  return <div ref={containerRef} className="terminal-glass h-full w-full [&_.xterm]:h-full [&_.xterm-viewport]:!bg-transparent" />;
});
