import type { AuthMode, PortId, PortOverride } from '@ttymux/shared';
import type { AuthProvider } from '../auth/AuthProvider.js';
import type { SerialManager } from '../serial/SerialManager.js';
import type { SessionHub } from '../session/SessionHub.js';

export interface TransportDeps {
  serialManager: SerialManager;
  sessionHub: SessionHub;
  authProvider: AuthProvider;
  authMode: AuthMode;
  portOverrides: Record<PortId, PortOverride>;
}
