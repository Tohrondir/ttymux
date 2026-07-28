import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PortId, PortOverride } from '@ttymux/shared';

/**
 * Two layers, merged on read: `configOverrides` comes from the YAML config
 * file and is never mutated at runtime (so a rename never risks rewriting
 * and reformatting a hand-edited config.yaml). `runtimeOverrides` comes from
 * renames made through the UI/API, persisted to a small JSON file on every
 * change, and takes precedence over the config layer per field.
 */
export class PortOverridesStore {
  private readonly runtimeOverrides: Record<PortId, PortOverride>;

  constructor(
    private readonly configOverrides: Record<PortId, PortOverride>,
    private readonly filePath: string,
  ) {
    this.runtimeOverrides = this.load();
  }

  get(portId: PortId): PortOverride | undefined {
    const fromConfig = this.configOverrides[portId];
    const fromRuntime = this.runtimeOverrides[portId];
    if (!fromConfig && !fromRuntime) return undefined;
    return { ...fromConfig, ...fromRuntime };
  }

  update(portId: PortId, patch: { name?: string | null; group?: string | null }): PortOverride {
    const existing = { ...this.runtimeOverrides[portId] };
    applyField(existing, 'name', patch.name);
    applyField(existing, 'group', patch.group);
    this.runtimeOverrides[portId] = existing;
    this.save();
    return this.get(portId)!;
  }

  private load(): Record<PortId, PortOverride> {
    if (!existsSync(this.filePath)) return {};
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8'));
    } catch {
      return {};
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.runtimeOverrides, null, 2));
  }
}

function applyField<K extends 'name' | 'group'>(override: { name?: string; group?: string }, key: K, value: string | null | undefined): void {
  if (value === undefined) return; // omitted -> leave unchanged
  if (value === null || value === '') delete override[key];
  else override[key] = value;
}
