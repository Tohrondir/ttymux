import type { SerialSettings } from './serial.js';

/**
 * Stable identifier for a port. Preferred forms, in order:
 *   "usb-<manufacturer>_<model>_<serialNumber>-if<N>" (Linux /dev/serial/by-id derived)
 *   "usb-loc-<locationId>"                            (no serial number, but stable USB location)
 *   "path:<osPath>"                                    (fallback — not stable across replug)
 * See `stableId` to tell which case applies.
 */
export type PortId = string;

export type PortConnectionStatus = 'online' | 'offline' | 'connecting' | 'error';

export interface PortWriter {
  clientId: string;
  displayName?: string;
  since: string;
}

export interface PortInfo {
  id: PortId;
  /** Current OS path. Volatile — may change across replugs (e.g. /dev/ttyUSB0, COM3). */
  path: string;
  /** False when `id` had to fall back to a path-derived identifier (no USB serial/location info available). */
  stableId: boolean;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
  pnpId?: string;
  locationId?: string;
  /** From config override. */
  friendlyName?: string;
  /** From config override. */
  group?: string;
  status: PortConnectionStatus;
  errorMessage?: string;
  settings: SerialSettings;
  viewerCount: number;
  writer: PortWriter | null;
  /** ISO timestamp of last activity — meaningful when status is 'offline'. */
  lastSeenAt?: string;
}
