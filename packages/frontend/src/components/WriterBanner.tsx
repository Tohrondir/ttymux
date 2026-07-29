import type { WriteTokenState } from '@ttymux/shared';

export interface WriterBannerProps {
  writeToken: WriteTokenState;
  isWriter: boolean;
  deniedReason: string | null;
  onRequestControl: () => void;
  onToggleFreeForAll: (enabled: boolean) => void;
}

/** Compact control-state group meant to sit inline in a header row, not as a full-width bar of its own. */
export function WriterBanner({ writeToken, isWriter, deniedReason, onRequestControl, onToggleFreeForAll }: WriterBannerProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {writeToken.freeForAll ? (
        <span className="text-fog">Free-for-all</span>
      ) : writeToken.holder ? (
        isWriter ? (
          <span className="font-medium text-status-online">You have control</span>
        ) : (
          <span className="truncate text-fog">
            <span className="font-medium text-paper">{writeToken.holderName ?? 'Someone'}</span> has control
          </span>
        )
      ) : (
        <span className="text-fog">Read-only</span>
      )}

      {deniedReason && <span className="text-status-error">({deniedReason})</span>}

      <label className="flex items-center gap-1 text-fog" title="Free-for-all: anyone attached can type, no need to take control">
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
          className="shrink-0 rounded-md bg-signal px-2 py-0.5 font-medium text-ink transition-[filter] hover:brightness-110"
        >
          Take control
        </button>
      )}
    </div>
  );
}
