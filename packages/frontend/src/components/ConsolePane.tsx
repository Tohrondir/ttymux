import { useState, useRef } from 'react';
import { DEFAULT_SERIAL_SETTINGS } from '@ttymux/shared';
import { useConsoleSocket } from '../hooks/useConsoleSocket.js';
import { SettingsPanel } from './SettingsPanel.js';
import { StatusDot } from './StatusDot.js';
import { Terminal, type TerminalHandle } from './Terminal.js';
import { WriterBanner } from './WriterBanner.js';

export function ConsolePane({ portId }: { portId: string }) {
  const terminalRef = useRef<TerminalHandle | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const {
    connected,
    port,
    viewers,
    writeToken,
    isWriter,
    controlDeniedReason,
    requestControl,
    releaseControl,
    changeSettings,
    setFreeForAll,
    sendInput,
  } = useConsoleSocket(portId, {
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
        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium text-paper">{port?.friendlyName ?? port?.path ?? portId}</h1>
          <p className="truncate font-mono text-xs text-fog">{portId}</p>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-xs text-fog">
          {port && <StatusDot status={port.status} />}
          <span title={viewers.map((v) => v.displayName ?? 'Anonymous').join(', ')}>
            {viewers.length} {viewers.length === 1 ? 'viewer' : 'viewers'}
          </span>
          {!connected && <span className="text-status-error">Reconnecting&hellip;</span>}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Connection settings"
            className="inline-flex items-center justify-center rounded-md border border-line px-2 py-1 text-fog transition-colors hover:border-signal-dim hover:text-paper"
          >
            &#9881;
          </button>
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

      <div className="relative min-h-0 flex-1 p-2">
        <Terminal ref={terminalRef} readOnly={!canType} onInput={sendInput} />
        <SettingsPanel
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={port?.settings ?? DEFAULT_SERIAL_SETTINGS}
          canEdit={canType}
          onChange={changeSettings}
        />
      </div>
    </div>
  );
}
