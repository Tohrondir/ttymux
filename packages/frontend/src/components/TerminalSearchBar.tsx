import { useEffect, useRef, useState, type RefObject } from 'react';
import type { SearchResult, TerminalHandle } from './Terminal.js';

export interface TerminalSearchBarProps {
  terminalRef: RefObject<TerminalHandle | null>;
  onClose: () => void;
}

export function TerminalSearchBar({ terminalRef, onClose }: TerminalSearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    return terminalRef.current?.onSearchResultsChange(setResults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function findNext(term: string) {
    if (term) terminalRef.current?.findNext(term);
    else terminalRef.current?.clearSearch();
  }

  function findPrevious() {
    if (query) terminalRef.current?.findPrevious(query);
  }

  function close() {
    terminalRef.current?.clearSearch();
    onClose();
  }

  return (
    <div className="absolute right-2 top-2 z-20 flex items-center gap-1 rounded-md border border-line bg-panel px-2 py-1 text-xs shadow-lg">
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          findNext(event.target.value);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            if (event.shiftKey) findPrevious();
            else findNext(query);
          }
          if (event.key === 'Escape') close();
        }}
        placeholder="Find in scrollback"
        className="w-40 bg-transparent text-paper outline-none placeholder:text-fog"
      />
      {query && (
        <span className="tabular-nums text-fog">
          {!results || results.resultCount === 0 ? '0/0' : `${results.resultIndex + 1}/${results.resultCount}`}
        </span>
      )}
      <button type="button" onClick={findPrevious} aria-label="Previous match" title="Previous match (Shift+Enter)" className="text-fog hover:text-paper">
        &#9650;
      </button>
      <button type="button" onClick={() => findNext(query)} aria-label="Next match" title="Next match (Enter)" className="text-fog hover:text-paper">
        &#9660;
      </button>
      <button type="button" onClick={close} aria-label="Close search" title="Close (Esc)" className="text-fog hover:text-paper">
        &times;
      </button>
    </div>
  );
}
