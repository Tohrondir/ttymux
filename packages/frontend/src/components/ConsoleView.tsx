import { useRef } from 'react';
import { useConsoleSocket } from '../hooks/useConsoleSocket.js';
import { navigate } from '../hooks/useRoute.js';
import { StatusDot } from './StatusDot.js';
import { Terminal, type TerminalHandle } from './Terminal.js';
import { WriterBanner } from './WriterBanner.js';

export function ConsoleView({ portId }: { portId: string }) {
  const terminalRef = useRef<TerminalHandle | null>(null);

  const { connected, port, viewers, writeToken, isWriter, controlDeniedReason, requestControl, releaseControl, setFreeForAll, sendInput } =
    useConsoleSocket(portId, {
      onScrollback: (bytes) => {
        terminalRef.current?.clear();
        terminalRef.current?.write(bytes);
      },
      onOutput: (bytes) => terminalRef.current?.write(bytes),
    });

  const canType = isWriter || writeToken.freeForAll;

  return (
    <div className="flex h-screen flex-col bg-ink">
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="shrink-0 rounded-md border border-line px-2 py-1 text-xs text-fog transition-colors hover:border-signal-dim hover:text-paper"
          >
            &larr; Dashboard
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium text-paper">{port?.friendlyName ?? port?.path ?? portId}</h1>
            <p className="truncate font-mono text-xs text-fog">{portId}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-xs text-fog">
          {port && <StatusDot status={port.status} />}
          <span title={viewers.map((v) => v.displayName ?? 'Anonymous').join(', ')}>
            {viewers.length} {viewers.length === 1 ? 'viewer' : 'viewers'}
          </span>
          {!connected && <span className="text-status-error">Reconnecting&hellip;</span>}
        </div>
      </header>

      <WriterBanner
        writeToken={writeToken}
        isWriter={isWriter}
        deniedReason={controlDeniedReason}
        onRequestControl={requestControl}
        onReleaseControl={releaseControl}
        onToggleFreeForAll={setFreeForAll}
      />

      <div className="min-h-0 flex-1 p-2">
        <Terminal ref={terminalRef} readOnly={!canType} onInput={sendInput} />
      </div>
    </div>
  );
}
