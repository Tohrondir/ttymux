import { COMMON_BAUD_RATES, SERIAL_PRESETS, type DataBits, type FlowControl, type Parity, type SerialSettings, type StopBits } from '@ttymux/shared';

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  settings: SerialSettings;
  canEdit: boolean;
  onChange: (settings: Partial<SerialSettings>) => void;
}

const DATA_BITS_OPTIONS: DataBits[] = [5, 6, 7, 8];
const STOP_BITS_OPTIONS: StopBits[] = [1, 1.5, 2];
const PARITY_OPTIONS: Parity[] = ['none', 'even', 'odd', 'mark', 'space'];
const FLOW_CONTROL_OPTIONS: FlowControl[] = ['none', 'rts/cts', 'xon/xoff'];

const selectClass = 'w-full rounded-md border border-line bg-ink px-2 py-1.5 text-sm text-paper outline-none focus:border-signal';

export function SettingsPanel({ open, onClose, settings, canEdit, onChange }: SettingsPanelProps) {
  if (!open) return null;

  const baudOptions = [...new Set([...COMMON_BAUD_RATES, settings.baudRate])].sort((a, b) => a - b);

  return (
    <div className="absolute inset-0 z-10 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-80 max-w-full overflow-y-auto border-l border-line bg-panel p-4" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-paper">Connection settings</h2>
          <button type="button" onClick={onClose} aria-label="Close settings" className="text-lg leading-none text-fog hover:text-paper">
            &times;
          </button>
        </div>

        {!canEdit && (
          <p className="mb-4 rounded-md border border-signal-dim/40 bg-signal-dim/10 px-3 py-2 text-xs text-fog">
            Take control to change these settings &mdash; they apply to everyone viewing this console.
          </p>
        )}

        <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-50">
          <div>
            <label className="mb-1 block text-xs text-fog">Preset</label>
            <select
              className={selectClass}
              value=""
              onChange={(event) => {
                const preset = SERIAL_PRESETS.find((p) => p.name === event.target.value);
                if (preset) onChange(preset.settings);
              }}
            >
              <option value="" disabled>
                Choose a preset&hellip;
              </option>
              {SERIAL_PRESETS.map((preset) => (
                <option key={preset.name} value={preset.name}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-fog">Baud rate</label>
            <select className={selectClass} value={settings.baudRate} onChange={(event) => onChange({ baudRate: Number(event.target.value) })}>
              {baudOptions.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-fog">Data bits</label>
              <select
                className={selectClass}
                value={settings.dataBits}
                onChange={(event) => onChange({ dataBits: Number(event.target.value) as DataBits })}
              >
                {DATA_BITS_OPTIONS.map((bits) => (
                  <option key={bits} value={bits}>
                    {bits}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-fog">Stop bits</label>
              <select
                className={selectClass}
                value={settings.stopBits}
                onChange={(event) => onChange({ stopBits: Number(event.target.value) as StopBits })}
              >
                {STOP_BITS_OPTIONS.map((bits) => (
                  <option key={bits} value={bits}>
                    {bits}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-fog">Parity</label>
            <select className={`${selectClass} capitalize`} value={settings.parity} onChange={(event) => onChange({ parity: event.target.value as Parity })}>
              {PARITY_OPTIONS.map((parity) => (
                <option key={parity} value={parity} className="capitalize">
                  {parity}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-fog">Flow control</label>
            <select
              className={selectClass}
              value={settings.flowControl}
              onChange={(event) => onChange({ flowControl: event.target.value as FlowControl })}
            >
              {FLOW_CONTROL_OPTIONS.map((flow) => (
                <option key={flow} value={flow}>
                  {flow}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
      </div>
    </div>
  );
}
