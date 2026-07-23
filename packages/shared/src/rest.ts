import type { AuthMode } from './auth.js';
import type { PortInfo } from './ports.js';

/**
 * REST surface is intentionally read-only. All mutation (input, control
 * handoff, settings changes) goes through the per-console WebSocket —
 * see ws-messages.ts.
 *
 *   GET /api/ports        -> GetPortsResponse
 *   GET /api/ports/:id    -> GetPortResponse
 *   GET /api/server-info  -> GetServerInfoResponse
 *   GET /api/health       -> { ok: true }
 */

export interface GetPortsResponse {
  ports: PortInfo[];
}

export interface GetPortResponse {
  port: PortInfo;
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
