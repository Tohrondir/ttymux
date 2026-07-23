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

export interface DiscoveryConfig {
  /**
   * Linux always exposes /dev/ttyS0..31 for legacy UART headers, almost
   * never wired to real hardware on modern machines. Excluded by default;
   * set true to include them (e.g. on hardware with a genuine RS-232 port).
   */
  includeLegacyPorts?: boolean;
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
  discovery?: DiscoveryConfig;
  /** Keyed by stable port id (falls back to path-derived id when no stable id exists). */
  ports?: Record<PortId, PortOverride>;
}
