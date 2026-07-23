import type { AuthMode } from './auth.js';
import type { PortInfo } from './ports.js';

/**
 * Console I/O and control handoff go through the per-console WebSocket, not
 * REST, see ws-messages.ts. Renaming/grouping a port is a REST call since
 * it's an administrative action on the port itself, not a console session.
 *
 *   GET   /api/ports        -> GetPortsResponse
 *   GET   /api/ports/:id    -> GetPortResponse
 *   PATCH /api/ports/:id    <- UpdatePortRequest -> GetPortResponse
 *   GET   /api/server-info  -> GetServerInfoResponse
 *   GET   /api/health       -> { ok: true }
 */

export interface GetPortsResponse {
  ports: PortInfo[];
}

export interface GetPortResponse {
  port: PortInfo;
}

export interface UpdatePortRequest {
  /** Omit to leave unchanged, `null` to clear back to the auto-discovered path/id. */
  name?: string | null;
  group?: string | null;
}

export interface GetServerInfoResponse {
  version: string;
  authMode: AuthMode;
  platform: string;
}

export interface HealthResponse {
  ok: true;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
}
