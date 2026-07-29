import type { AuthMode } from '@ttymux/shared';
import type { AuthProvider } from '../auth/AuthProvider.js';
import type { PortOverridesStore } from '../config/PortOverridesStore.js';
import type { LogWriter } from '../logging/LogWriter.js';
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
  broadcaster: EventsBroadcaster;
  logWriter: LogWriter;
}
