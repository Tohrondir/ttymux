import type { SerialSettings } from './serial.js';

/**
 * Stable identifier for a port. Preferred forms, in order:
 *   "usb-<manufacturer>_<model>_<serialNumber>-if<N>" (Linux /dev/serial/by-id derived)
 *   "usb-loc-<locationId>"                            (no serial number, but stable USB location)
 *   "path:<osPath>"                                    (fallback, not stable across replug)
 * See `stableId` to tell which case applies.
 */
export type PortId = string;

export type PortConnectionStatus = 'online' | 'offline' | 'connecting' | 'error';

export interface PortWriter {
  clientId: string;
  displayName?: string;
  since: string;
}

/** Fixed palette so every client renders the same color for the same note. */
export const PORT_NOTE_COLORS = ['blue', 'green', 'amber', 'red', 'purple'] as const;
export type PortNoteColor = (typeof PORT_NOTE_COLORS)[number];

/** A short message left on a port for whoever opens it next, e.g. "in use for flashing, back at 3pm". */
export interface PortNote {
  id: string;
  text: string;
  color: PortNoteColor;
  author?: string;
  /** ISO timestamp. */
  createdAt: string;
}

export interface PortInfo {
  id: PortId;
  /** Current OS path. Volatile, may change across replugs (e.g. /dev/ttyUSB0, /dev/ttyACM0). */
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
  /** ISO timestamp of last activity, meaningful when status is 'offline'. */
  lastSeenAt?: string;
  /** Oldest first. */
  notes: PortNote[];
}
