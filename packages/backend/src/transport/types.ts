import type { AuthMode, PortId, PortOverride } from '@ttymux/shared';
import type { AuthProvider } from '../auth/AuthProvider.js';
import type { SerialManager } from '../serial/SerialManager.js';
import type { SessionHub } from '../session/SessionHub.js';
import type { EventsBroadcaster } from './EventsBroadcaster.js';

export interface TransportDeps {
  serialManager: SerialManager;
  sessionHub: SessionHub;
  authProvider: AuthProvider;
  authMode: AuthMode;
  /** Mutated directly by PATCH /api/ports/:id (renames) — the single source of truth read everywhere a PortInfo is built. */
  portOverrides: Record<PortId, PortOverride>;
  broadcaster: EventsBroadcaster;
}
