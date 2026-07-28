import { useCallback } from 'react';
import { useLocalStorageState } from './useLocalStorageState.js';

const STORAGE_KEY = 'ttymux.sessionPorts';

/**
 * The set of ports added to the grid view. Call this once (in App) and pass
 * the result down as props -- calling it separately in multiple components
 * would give each its own disconnected copy of the state (localStorage
 * writes don't trigger re-renders in other components reading it), so
 * toggling one wouldn't be reflected by the other.
 */
export function useSessionPorts() {
  const [sessionPortIds, setSessionPortIds] = useLocalStorageState<string[]>(STORAGE_KEY, []);

  const isInSession = useCallback((id: string) => sessionPortIds.includes(id), [sessionPortIds]);

  const toggleInSession = useCallback(
    (id: string) => {
      setSessionPortIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
    },
    [setSessionPortIds],
  );

  const removeFromSession = useCallback(
    (id: string) => {
      setSessionPortIds((prev) => prev.filter((existing) => existing !== id));
    },
    [setSessionPortIds],
  );

  return { sessionPortIds, isInSession, toggleInSession, removeFromSession };
}
