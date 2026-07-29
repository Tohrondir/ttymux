import { useState, useRef } from 'react';
import { DEFAULT_SERIAL_SETTINGS } from '@ttymux/shared';
import { api } from '../api/client.js';
import { useConsoleSocket } from '../hooks/useConsoleSocket.js';
import { SettingsPanel } from './SettingsPanel.js';
import { StatusDot } from './StatusDot.js';
import { Terminal, type TerminalHandle } from './Terminal.js';
import { TerminalSearchBar } from './TerminalSearchBar.js';
import { WriterBanner } from './WriterBanner.js';

export interface ConsolePaneProps {
  portId: string;
  highlightEnabled: boolean;
  onToggleHighlight: (enabled: boolean) => void;
}

export function ConsolePane({ portId, highlightEnabled, onToggleHighlight }: ConsolePaneProps) {
  const terminalRef = useRef<TerminalHandle | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function downloadLog() {
    setDownloadError(null);
    try {
      await api.downloadLog(portId);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err));
    }
  }

  const {
    connected,
    port,
    viewers,
    writeToken,
    isWriter,
    controlDeniedReason,
    requestControl,
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
    <div
      className="flex h-screen flex-col bg-ink"
      onKeyDownCapture={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault();
          setSearchOpen(true);
        }
      }}
    >
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium text-paper">{port?.friendlyName ?? port?.path ?? portId}</h1>
          <p className="truncate font-mono text-xs text-fog">{portId}</p>
        </div>
        <div className="flex flex-wrap shrink-0 items-center justify-end gap-3 text-xs text-fog">
          {port && <StatusDot status={port.status} hasWriter={port.writer !== null} />}
          <span title={viewers.map((v) => v.displayName ?? 'Anonymous').join(', ')}>
            {viewers.length} {viewers.length === 1 ? 'viewer' : 'viewers'}
          </span>
          {!connected && <span className="text-status-error">Reconnecting&hellip;</span>}

          <WriterBanner
            writeToken={writeToken}
            isWriter={isWriter}
            deniedReason={controlDeniedReason}
            onRequestControl={requestControl}
            onToggleFreeForAll={setFreeForAll}
          />

          <button
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
            aria-pressed={searchOpen}
            title="Find in scrollback (Ctrl+F)"
            className={`rounded-md border px-2 py-1 transition-colors ${
              searchOpen ? 'border-signal-dim text-paper' : 'border-line text-fog hover:border-signal-dim hover:text-paper'
            }`}
          >
            Find
          </button>
          <button
            type="button"
            onClick={downloadLog}
            title="Download this port's captured log"
            className="rounded-md border border-line px-2 py-1 text-fog transition-colors hover:border-signal-dim hover:text-paper"
          >
            Download log
          </button>
          {downloadError && <span className="text-status-error">{downloadError}</span>}
          <button
            type="button"
            onClick={() => onToggleHighlight(!highlightEnabled)}
            aria-pressed={highlightEnabled}
            title="Color log levels, timestamps, IPs, and other common patterns in plain-text output"
            className={`rounded-md border px-2 py-1 transition-colors ${
              highlightEnabled ? 'border-signal-dim text-signal' : 'border-line text-fog hover:border-signal-dim hover:text-paper'
            }`}
          >
            Highlight
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label="Connection settings"
            aria-pressed={settingsOpen}
            className={`inline-flex items-center justify-center rounded-md border px-2 py-1 transition-colors ${
              settingsOpen ? 'border-signal-dim text-paper' : 'border-line text-fog hover:border-signal-dim hover:text-paper'
            }`}
          >
            &#9881;
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 p-2">
        <Terminal ref={terminalRef} readOnly={!canType} onInput={sendInput} highlightEnabled={highlightEnabled} />
        {searchOpen && <TerminalSearchBar terminalRef={terminalRef} onClose={() => setSearchOpen(false)} />}
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
