import { useMemo } from 'react';
import type { PortInfo } from '@ttymux/shared';
import { usePorts } from '../hooks/usePorts.js';
import { groupPorts } from '../utils/groupPorts.js';
import { SidebarPortItem } from './SidebarPortItem.js';
import { TokenPrompt } from './TokenPrompt.js';

export function Sidebar({ selectedPortId }: { selectedPortId: string | null }) {
  const { ports, loading, error, authRequired, refresh } = usePorts();

  const okPorts = useMemo(() => ports.filter((p) => p.status !== 'error'), [ports]);
  const errorPorts = useMemo(
    () => ports.filter((p) => p.status === 'error').sort((a, b) => (a.friendlyName ?? a.path).localeCompare(b.friendlyName ?? b.path)),
    [ports],
  );
  const grouped = useMemo(() => groupPorts(okPorts), [okPorts]);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-panel">
      <div className="border-b border-line px-4 py-3">
        <h1 className="font-mono text-sm font-semibold tracking-tight text-paper">ttymux</h1>
        <p className="text-xs text-fog">Serial consoles on this host</p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {authRequired && (
          <div className="m-1 mb-3 rounded-md border border-status-error/40 bg-ink px-3 py-2 text-xs text-paper">
            This server requires a token.
            <TokenPrompt onSubmitted={refresh} />
          </div>
        )}

        {error && !authRequired && <p className="m-1 text-xs text-status-error">Couldn&rsquo;t load ports: {error}</p>}

        {!authRequired && !error && loading && <p className="m-1 text-xs text-fog">Loading&hellip;</p>}

        {!authRequired && !error && !loading && ports.length === 0 && (
          <p className="m-1 text-xs text-fog">No serial ports found. Plug in a USB serial device to see it here.</p>
        )}

        {grouped.map(([group, list]) => (
          <div key={group ?? '__ungrouped'} className="mb-3">
            {group && <h2 className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-fog">{group}</h2>}
            {list.map((port) => (
              <SidebarPortItem key={port.id} port={port} selected={port.id === selectedPortId} />
            ))}
          </div>
        ))}

        {errorPorts.length > 0 && (
          <details className="mb-3">
            <summary className="mb-1 cursor-pointer select-none px-2 text-[11px] font-medium uppercase tracking-wider text-fog hover:text-paper">
              Errors ({errorPorts.length})
            </summary>
            {errorPorts.map((port: PortInfo) => (
              <SidebarPortItem key={port.id} port={port} selected={port.id === selectedPortId} />
            ))}
          </details>
        )}
      </div>
    </aside>
  );
}
