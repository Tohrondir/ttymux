import { useCallback } from 'react';
import { useLocalStorageState } from './useLocalStorageState.js';

const STORAGE_KEY = 'ttymux.pinnedPorts';

export function usePinnedPorts() {
  const [pinnedIds, setPinnedIds] = useLocalStorageState<string[]>(STORAGE_KEY, []);

  const isPinned = useCallback((id: string) => pinnedIds.includes(id), [pinnedIds]);

  const togglePin = useCallback(
    (id: string) => {
      setPinnedIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
    },
    [setPinnedIds],
  );

  const unpin = useCallback(
    (id: string) => {
      setPinnedIds((prev) => prev.filter((existing) => existing !== id));
    },
    [setPinnedIds],
  );

  return { pinnedIds, isPinned, togglePin, unpin };
}
