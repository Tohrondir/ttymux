import type { WriteTokenState } from '@ttymux/shared';

export interface WriterBannerProps {
  writeToken: WriteTokenState;
  isWriter: boolean;
  deniedReason: string | null;
  onRequestControl: () => void;
  onToggleFreeForAll: (enabled: boolean) => void;
}

export function WriterBanner({ writeToken, isWriter, deniedReason, onRequestControl, onToggleFreeForAll }: WriterBannerProps) {
  const canType = isWriter || writeToken.freeForAll;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-sm ${
        canType ? 'border-status-online/30 bg-status-online/10' : 'border-signal-dim/40 bg-signal-dim/10'
      }`}
    >
      <div className="flex items-center gap-2">
        {writeToken.freeForAll ? (
          <span className="text-fog">Free-for-all &mdash; anyone attached can type.</span>
        ) : writeToken.holder ? (
          isWriter ? (
            <span className="font-medium text-status-online">You have control.</span>
          ) : (
            <span className="text-fog">
              <span className="font-medium text-paper">{writeToken.holderName ?? 'Someone'}</span> has control.
            </span>
          )
        ) : (
          <span className="text-fog">Read-only &mdash; no one has taken control yet.</span>
        )}
        {deniedReason && <span className="text-status-error">({deniedReason})</span>}
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-fog">
          <input
            type="checkbox"
            checked={writeToken.freeForAll}
            onChange={(event) => onToggleFreeForAll(event.target.checked)}
            className="accent-signal"
          />
          Free-for-all
        </label>
        {!writeToken.freeForAll && !isWriter && (
          <button
            type="button"
            onClick={onRequestControl}
            className="rounded-md bg-signal px-3 py-1 text-xs font-medium text-ink transition-[filter] hover:brightness-110"
          >
            Take control
          </button>
        )}
      </div>
    </div>
  );
}
