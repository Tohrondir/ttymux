import type { PortConnectionStatus } from '@ttymux/shared';

const STATUS_META: Record<Exclude<PortConnectionStatus, 'online'>, { dot: string; label: string; pulse?: boolean }> = {
  connecting: { dot: 'bg-status-connecting', label: 'Connecting', pulse: true },
  offline: { dot: 'bg-status-offline', label: 'Offline' },
  error: { dot: 'bg-status-error', label: 'Error' },
};

export interface StatusDotProps {
  status: PortConnectionStatus;
  /** Someone currently holds the write token: shown as "In use" instead of "Free", in the same amber as the take-control button. */
  hasWriter?: boolean;
  showLabel?: boolean;
}

export function StatusDot({ status, hasWriter = false, showLabel = true }: StatusDotProps) {
  const meta =
    status === 'online' ? (hasWriter ? { dot: 'bg-signal', label: 'In use' } : { dot: 'bg-status-online', label: 'Free' }) : STATUS_META[status];

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5" title={meta.label}>
      <span className={`h-2 w-2 rounded-full ${meta.dot} ${'pulse' in meta && meta.pulse ? 'led-pulse' : ''}`} aria-hidden="true" />
      {showLabel && <span className="text-xs text-fog">{meta.label}</span>}
    </span>
  );
}
