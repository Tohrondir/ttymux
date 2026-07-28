import { useCallback, useState } from 'react';

/** Per-browser persistence for view preferences. There's no server-side user-account system to key prefs on, so "customizable per person" means "remembered by this browser." */
export function useLocalStorageState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setAndPersist = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Storage full or unavailable (e.g. private browsing) -- state still updates for this session.
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, setAndPersist];
}
