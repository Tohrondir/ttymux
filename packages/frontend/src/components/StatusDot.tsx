import type { PortConnectionStatus } from '@ttymux/shared';

const STATUS_META: Record<PortConnectionStatus, { dot: string; label: string; pulse?: boolean }> = {
  online: { dot: 'bg-status-online', label: 'Online' },
  connecting: { dot: 'bg-status-connecting', label: 'Connecting', pulse: true },
  offline: { dot: 'bg-status-offline', label: 'Offline' },
  error: { dot: 'bg-status-error', label: 'Error' },
};

export function StatusDot({ status }: { status: PortConnectionStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${meta.dot} ${meta.pulse ? 'led-pulse' : ''}`} aria-hidden="true" />
      <span className="text-xs text-fog">{meta.label}</span>
    </span>
  );
}
