import type { AuthMode } from '@ttymux/shared';
import type { AuthProvider } from '../auth/AuthProvider.js';
import type { PortOverridesStore } from '../config/PortOverridesStore.js';
import type { LogWriter } from '../logging/LogWriter.js';
import type { PortNotesStore } from '../notes/PortNotesStore.js';
import type { SerialManager } from '../serial/SerialManager.js';
import type { SessionHub } from '../session/SessionHub.js';
import type { EventsBroadcaster } from './EventsBroadcaster.js';

export interface TransportDeps {
  serialManager: SerialManager;
  sessionHub: SessionHub;
  authProvider: AuthProvider;
  authMode: AuthMode;
  /** Config-file overrides merged with persisted runtime renames; PATCH /api/ports/:id writes into the runtime layer. */
  portOverrides: PortOverridesStore;
  /** Messages users leave on a port for each other; POST/DELETE /api/ports/:id/notes. */
  portNotes: PortNotesStore;
  broadcaster: EventsBroadcaster;
  logWriter: LogWriter;
}
