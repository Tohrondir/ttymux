import type { AuthConfig } from './auth.js';
import type { PortId } from './ports.js';
import type { SerialSettings } from './serial.js';

export interface PortOverride {
  name?: string;
  group?: string;
  defaultSettings?: Partial<SerialSettings>;
  /** Exclude this port from the dashboard entirely. */
  hidden?: boolean;
}

export interface LoggingConfig {
  enabled?: boolean;
  directory?: string;
  maxSizeMb?: number;
  maxFiles?: number;
}

export interface ScrollbackConfig {
  /** Ring buffer size in bytes, per port. */
  bytes?: number;
}

export interface ServerConfig {
  port?: number;
  host?: string;
}

export interface TtymuxConfig {
  server?: ServerConfig;
  auth?: AuthConfig;
  logging?: LoggingConfig;
  scrollback?: ScrollbackConfig;
  /** Keyed by stable port id (falls back to path-derived id when no stable id exists). */
  ports?: Record<PortId, PortOverride>;
}
