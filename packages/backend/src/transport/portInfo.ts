import { DEFAULT_SERIAL_SETTINGS, type PortId, type PortInfo } from '@ttymux/shared';
import type { PortOverridesStore } from '../config/PortOverridesStore.js';
import type { SerialManager } from '../serial/SerialManager.js';
import type { SessionHub } from '../session/SessionHub.js';

export function buildPortInfo(
  portId: PortId,
  serialManager: SerialManager,
  sessionHub: SessionHub,
  overrides: PortOverridesStore,
): PortInfo | undefined {
  const descriptor = serialManager.getDescriptor(portId);
  if (!descriptor) return undefined;

  const statusInfo = serialManager.getStatus(portId) ?? { status: 'offline' as const };
  const settings = serialManager.getSettings(portId) ?? DEFAULT_SERIAL_SETTINGS;
  const writeToken = sessionHub.getWriteTokenState(portId);
  const override = overrides.get(portId);

  return {
    id: descriptor.id,
    path: descriptor.path,
    stableId: descriptor.stableId,
    manufacturer: descriptor.manufacturer,
    serialNumber: descriptor.serialNumber,
    vendorId: descriptor.vendorId,
    productId: descriptor.productId,
    pnpId: descriptor.pnpId,
    locationId: descriptor.locationId,
    friendlyName: override?.name,
    group: override?.group,
    status: statusInfo.status,
    errorMessage: statusInfo.errorMessage,
    lastSeenAt: statusInfo.lastSeenAt,
    settings,
    viewerCount: sessionHub.getViewerCount(portId),
    writer: writeToken.holder
      ? { clientId: writeToken.holder, displayName: writeToken.holderName, since: writeToken.since ?? new Date().toISOString() }
      : null,
  };
}

export function listAllPortInfo(serialManager: SerialManager, sessionHub: SessionHub, overrides: PortOverridesStore): PortInfo[] {
  return serialManager
    .listKnownIds()
    .map((id) => buildPortInfo(id, serialManager, sessionHub, overrides))
    .filter((info): info is PortInfo => info !== undefined && !overrides.get(info.id)?.hidden);
}
