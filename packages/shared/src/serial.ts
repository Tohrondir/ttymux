export type Parity = 'none' | 'even' | 'odd' | 'mark' | 'space';
export type DataBits = 5 | 6 | 7 | 8;
export type StopBits = 1 | 1.5 | 2;
export type FlowControl = 'none' | 'rts/cts' | 'xon/xoff';

export interface SerialSettings {
  baudRate: number;
  dataBits: DataBits;
  stopBits: StopBits;
  parity: Parity;
  flowControl: FlowControl;
}

export const DEFAULT_SERIAL_SETTINGS: SerialSettings = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none',
};

export const COMMON_BAUD_RATES = [
  300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
] as const;

export interface SerialSettingsPreset {
  name: string;
  settings: SerialSettings;
}

export const SERIAL_PRESETS: SerialSettingsPreset[] = [
  { name: 'Default (115200 8N1)', settings: DEFAULT_SERIAL_SETTINGS },
  { name: 'Classic console (9600 8N1)', settings: { ...DEFAULT_SERIAL_SETTINGS, baudRate: 9600 } },
  { name: 'High speed (230400 8N1)', settings: { ...DEFAULT_SERIAL_SETTINGS, baudRate: 230400 } },
];
