import type { PortId, PortInfo } from './ports.js';
import type { SerialSettings } from './serial.js';
import type { ViewerInfo, WriteTokenState } from './session.js';

/**
 * `/ws/console/:portId`, one socket per attached console.
 * Binary payloads travel as base64 strings inside JSON frames: serial data is not
 * guaranteed to be valid UTF-8, and this keeps the protocol a single JSON frame type.
 */
export type ConsoleClientMessage =
  | { type: 'hello'; displayName?: string }
  | { type: 'input'; dataBase64: string }
  | { type: 'requestControl' }
  | { type: 'releaseControl' }
  | { type: 'changeSettings'; settings: Partial<SerialSettings> }
  | { type: 'setFreeForAll'; enabled: boolean }
  | { type: 'ping' };

export type ConsoleServerMessage =
  | { type: 'scrollback'; dataBase64: string }
  | { type: 'output'; dataBase64: string }
  | { type: 'status'; port: PortInfo }
  | { type: 'writerChanged'; writeToken: WriteTokenState }
  | { type: 'viewers'; viewers: ViewerInfo[] }
  | { type: 'controlDenied'; reason: string }
  | { type: 'error'; message: string }
  | { type: 'pong' };

/**
 * `/ws/events`, dashboard-wide, read-only. No console attachment required;
 * lets the port list stay live without opening a socket per card.
 */
export type EventsServerMessage =
  | { type: 'portAdded'; port: PortInfo }
  | { type: 'portRemoved'; portId: PortId }
  | { type: 'portStatusChanged'; port: PortInfo };
