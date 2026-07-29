import { useRef } from 'react';
import { useConsoleSocket } from '../hooks/useConsoleSocket.js';
import { StatusDot } from './StatusDot.js';
import { Terminal, type TerminalHandle } from './Terminal.js';
import { WriterBanner } from './WriterBanner.js';

export interface GridPaneProps {
  portId: string;
  onRemove: (id: string) => void;
  highlightEnabled: boolean;
}

export function GridPane({ portId, onRemove, highlightEnabled }: GridPaneProps) {
  const terminalRef = useRef<TerminalHandle | null>(null);

  const { connected, port, writeToken, isWriter, controlDeniedReason, requestControl, setFreeForAll, sendInput } = useConsoleSocket(portId, {
    onScrollback: (bytes) => {
      terminalRef.current?.clear();
      terminalRef.current?.write(bytes);
    },
    onOutput: (bytes) => terminalRef.current?.write(bytes),
  });

  const canType = isWriter || writeToken.freeForAll;

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-line bg-ink">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-2 py-1.5 text-[11px]">
        <div className="flex min-w-0 items-center gap-2">
          {port && <StatusDot status={port.status} hasWriter={port.writer !== null} showLabel={false} />}
          <span className="truncate text-xs font-medium text-paper" title={portId}>
            {port?.friendlyName ?? port?.path ?? portId}
          </span>
          {!connected && <span className="shrink-0 text-status-error">Reconnecting&hellip;</span>}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <WriterBanner
            writeToken={writeToken}
            isWriter={isWriter}
            deniedReason={controlDeniedReason}
            onRequestControl={requestControl}
            onToggleFreeForAll={setFreeForAll}
          />
          <button
            type="button"
            onClick={() => onRemove(portId)}
            aria-label="Remove from grid view"
            title="Remove from grid view"
            className="inline-flex shrink-0 items-center justify-center text-fog hover:text-paper"
          >
            &#10005;
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 p-1">
        <Terminal ref={terminalRef} readOnly={!canType} onInput={sendInput} highlightEnabled={highlightEnabled} />
      </div>
    </div>
  );
}
