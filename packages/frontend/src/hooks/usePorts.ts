import { useCallback, useEffect, useState } from 'react';
import type { PortInfo } from '@ttymux/shared';
import { AuthRequiredError, api, connectEventsSocket } from '../api/client.js';

export interface UsePortsResult {
  ports: PortInfo[];
  loading: boolean;
  error: string | null;
  authRequired: boolean;
  refresh: () => void;
}

export function usePorts(): UsePortsResult {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api
      .getPorts()
      .then((list) => {
        if (cancelled) return;
        setPorts(list);
        setError(null);
        setAuthRequired(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof AuthRequiredError) setAuthRequired(true);
        else setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    const close = connectEventsSocket({
      onMessage: (message) => {
        setPorts((prev) => {
          switch (message.type) {
            case 'portAdded':
            case 'portStatusChanged': {
              const index = prev.findIndex((p) => p.id === message.port.id);
              if (index === -1) return [...prev, message.port];
              const next = [...prev];
              next[index] = message.port;
              return next;
            }
            case 'portRemoved':
              return prev.filter((p) => p.id !== message.portId);
            default:
              return prev;
          }
        });
      },
    });
    return close;
  }, []);

  return { ports, loading, error, authRequired, refresh };
}
