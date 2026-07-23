import { useMemo } from 'react';
import type { PortInfo } from '@ttymux/shared';
import { usePorts } from '../hooks/usePorts.js';
import { PortCard } from './PortCard.js';
import { TokenPrompt } from './TokenPrompt.js';

function groupPorts(ports: PortInfo[]): Array<[string | null, PortInfo[]]> {
  const groups = new Map<string | null, PortInfo[]>();
  for (const port of ports) {
    const key = port.group ?? null;
    const list = groups.get(key) ?? [];
    list.push(port);
    groups.set(key, list);
  }

  const entries = [...groups.entries()];
  entries.sort(([a], [b]) => {
    if (a === b) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return a.localeCompare(b);
  });
  for (const [, list] of entries) {
    list.sort((a, b) => (a.friendlyName ?? a.path).localeCompare(b.friendlyName ?? b.path));
  }
  return entries;
}

export function Dashboard() {
  const { ports, loading, error, authRequired, refresh } = usePorts();
  const grouped = useMemo(() => groupPorts(ports), [ports]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-semibold tracking-tight text-paper">ttymux</h1>
          <p className="text-sm text-fog">Serial consoles on this host</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="rounded-md border border-line px-3 py-1.5 text-sm text-fog transition-colors hover:border-signal-dim hover:text-paper"
        >
          Refresh
        </button>
      </header>

      {authRequired && (
        <div className="mb-6 rounded-md border border-status-error/40 bg-panel px-4 py-3 text-sm text-paper">
          This server requires a token to continue.
          <TokenPrompt onSubmitted={refresh} />
        </div>
      )}

      {error && !authRequired && (
        <div className="mb-6 rounded-md border border-status-error/40 bg-panel px-4 py-3 text-sm text-status-error">
          Couldn&rsquo;t load ports: {error}
        </div>
      )}

      {!authRequired && !error && loading && <p className="text-sm text-fog">Loading ports&hellip;</p>}

      {!authRequired && !error && !loading && ports.length === 0 && (
        <div className="rounded-md border border-dashed border-line px-4 py-8 text-center text-sm text-fog">
          No serial ports found. Plug in a USB serial device to see it here.
        </div>
      )}

      <div className="space-y-8">
        {grouped.map(([group, list]) => (
          <section key={group ?? '__ungrouped'}>
            {group && (
              <h2 className="mb-2 border-b border-line pb-1 text-xs font-medium uppercase tracking-wider text-fog">
                {group}
              </h2>
            )}
            <div className="space-y-2">
              {list.map((port) => (
                <PortCard key={port.id} port={port} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
