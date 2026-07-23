import type { PortConnectionStatus, PortInfo } from '@ttymux/shared';
import { navigate } from '../hooks/useRoute.js';
import { StatusDot } from './StatusDot.js';

const EDGE_COLOR: Record<PortConnectionStatus, string> = {
  online: 'bg-status-online',
  connecting: 'bg-status-connecting',
  offline: 'bg-status-offline',
  error: 'bg-status-error',
};

export function PortCard({ port }: { port: PortInfo }) {
  return (
    <button
      type="button"
      onClick={() => navigate(`/console/${encodeURIComponent(port.id)}`)}
      className="group relative flex w-full items-start overflow-hidden rounded-md border border-line bg-panel px-4 py-3 text-left transition-colors hover:border-signal-dim hover:bg-panel-raised"
    >
      <span
        className={`absolute inset-y-0 left-0 w-1 ${EDGE_COLOR[port.status]} ${port.status === 'connecting' ? 'led-pulse' : ''}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 pl-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="truncate text-sm font-medium text-paper">{port.friendlyName ?? port.path}</h3>
          <StatusDot status={port.status} />
        </div>
        <p className="mt-0.5 truncate font-mono text-xs text-fog">{port.id}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fog">
          <span>{port.settings.baudRate} baud</span>
          <span>
            {port.viewerCount} {port.viewerCount === 1 ? 'viewer' : 'viewers'}
          </span>
          {port.writer && <span className="text-signal">{port.writer.displayName ?? 'Someone'} has control</span>}
        </div>
        {port.status === 'error' && port.errorMessage && (
          <p className="mt-1 truncate text-xs text-status-error">{port.errorMessage}</p>
        )}
      </div>
    </button>
  );
}
