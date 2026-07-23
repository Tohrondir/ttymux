import { useState } from 'react';
import type { PortInfo } from '@ttymux/shared';
import { api } from '../api/client.js';
import { navigate } from '../hooks/useRoute.js';
import { StatusDot } from './StatusDot.js';

export function SidebarPortItem({ port, selected }: { port: PortInfo; selected: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  function startEditing() {
    setDraft(port.friendlyName ?? '');
    setRenameError(null);
    setEditing(true);
  }

  async function commitRename() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed === (port.friendlyName ?? '')) return;
    try {
      await api.updatePort(port.id, { name: trimmed || null });
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !editing && navigate(`/console/${encodeURIComponent(port.id)}`)}
        onKeyDown={(event) => {
          if (!editing && (event.key === 'Enter' || event.key === ' ')) navigate(`/console/${encodeURIComponent(port.id)}`);
        }}
        className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none focus-visible:ring-1 focus-visible:ring-signal ${
          selected ? 'bg-panel-raised' : 'hover:bg-panel-raised'
        }`}
      >
        <StatusDot status={port.status} showLabel={false} />

        {editing ? (
          <input
            autoFocus
            value={draft}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
              if (event.key === 'Escape') setEditing(false);
            }}
            className="min-w-0 flex-1 rounded border border-signal-dim bg-ink px-1 py-0.5 text-sm text-paper outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-paper" title={port.id}>
            {port.friendlyName ?? port.path}
          </span>
        )}

        {!editing && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              startEditing();
            }}
            aria-label="Rename"
            className="inline-flex shrink-0 items-center justify-center text-fog opacity-0 hover:text-paper focus-visible:opacity-100 group-hover:opacity-100"
          >
            &#9998;
          </button>
        )}

        {!editing && port.viewerCount > 0 && (
          <span className="shrink-0 text-xs text-fog" title={`${port.viewerCount} ${port.viewerCount === 1 ? 'viewer' : 'viewers'}`}>
            {port.viewerCount}
          </span>
        )}
      </div>

      {renameError && <p className="px-2 text-xs text-status-error">Rename failed: {renameError}</p>}
    </div>
  );
}
