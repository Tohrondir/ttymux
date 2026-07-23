import { readdirSync, realpathSync } from 'node:fs';
import { platform } from 'node:os';
import { SerialPort } from 'serialport';
import type { PortId } from '@ttymux/shared';

export interface PortDescriptor {
  id: PortId;
  path: string;
  stableId: boolean;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
  pnpId?: string;
  locationId?: string;
}

const BY_ID_DIR = '/dev/serial/by-id';
const BY_PATH_DIR = '/dev/serial/by-path';

/** Maps a resolved device path (e.g. /dev/ttyUSB0) to the stable symlink name that points at it. */
function buildSymlinkMap(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return map;
  }
  for (const name of entries) {
    try {
      const resolved = realpathSync(`${dir}/${name}`);
      map.set(resolved, name);
    } catch {
      // Symlink target vanished between readdir and realpath (race with unplug), skip it.
    }
  }
  return map;
}

const LEGACY_TTY_PATTERN = /^\/dev\/ttyS\d+$/;

/**
 * Linux always exposes /dev/ttyS0..31 for legacy 8250/16550 UART headers,
 * almost none of which are wired to real hardware on modern machines,
 * so opening them fails immediately. Excluded by default so discovery reflects
 * actual USB/serial devices; set discovery.includeLegacyPorts to include them.
 */
export function isLikelyPhantomLegacyPort(path: string): boolean {
  return platform() === 'linux' && LEGACY_TTY_PATTERN.test(path);
}

export interface ListRawPortsOptions {
  includeLegacyPorts?: boolean;
}

export async function listRawPorts(opts: ListRawPortsOptions = {}): Promise<PortDescriptor[]> {
  const raw = await SerialPort.list();

  const byIdMap = platform() === 'linux' ? buildSymlinkMap(BY_ID_DIR) : new Map<string, string>();
  const byPathMap = platform() === 'linux' ? buildSymlinkMap(BY_PATH_DIR) : new Map<string, string>();

  const filtered = opts.includeLegacyPorts ? raw : raw.filter((entry) => !isLikelyPhantomLegacyPort(entry.path));

  return filtered.map((entry) => {
    let resolvedPath = entry.path;
    try {
      resolvedPath = realpathSync(entry.path);
    } catch {
      // Path may not be resolvable (rare); fall back to the raw path.
    }

    const descriptor: Omit<PortDescriptor, 'id' | 'stableId'> = {
      path: entry.path,
      manufacturer: entry.manufacturer,
      serialNumber: entry.serialNumber,
      vendorId: entry.vendorId,
      productId: entry.productId,
      pnpId: entry.pnpId,
      locationId: entry.locationId,
    };

    const { id, stableId } = computeStableId(descriptor, byIdMap.get(resolvedPath), byPathMap.get(resolvedPath));

    return { ...descriptor, id, stableId };
  });
}

export function computeStableId(
  descriptor: Omit<PortDescriptor, 'id' | 'stableId'>,
  byIdName?: string,
  byPathName?: string,
): { id: PortId; stableId: boolean } {
  if (byIdName) {
    return { id: `by-id:${byIdName}`, stableId: true };
  }
  if (byPathName) {
    return { id: `by-path:${byPathName}`, stableId: true };
  }
  if (descriptor.serialNumber) {
    const vendor = descriptor.manufacturer ?? descriptor.vendorId ?? 'unknown';
    const model = descriptor.productId ?? 'device';
    return { id: `usb-${slug(vendor)}_${slug(model)}_${slug(descriptor.serialNumber)}`, stableId: true };
  }
  if (descriptor.locationId) {
    return { id: `usb-loc-${slug(descriptor.locationId)}`, stableId: true };
  }
  if (descriptor.pnpId) {
    return { id: `pnp-${slug(descriptor.pnpId)}`, stableId: true };
  }
  return { id: `path:${descriptor.path}`, stableId: false };
}

function slug(value: string): string {
  return value.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
}
