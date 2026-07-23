import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import type { AuthConfig, PortId, PortOverride } from '@ttymux/shared';
import { configSchema } from './schema.js';

export interface ResolvedConfig {
  server: { port: number; host: string };
  auth: AuthConfig;
  logging: { enabled: boolean; directory: string; maxSizeMb: number; maxFiles: number };
  scrollback: { bytes: number };
  discovery: { includeLegacyPorts: boolean };
  ports: Record<PortId, PortOverride>;
}

export const DEFAULT_CONFIG: ResolvedConfig = {
  server: { port: 9000, host: '127.0.0.1' },
  auth: { mode: 'none' },
  logging: { enabled: true, directory: './logs', maxSizeMb: 10, maxFiles: 5 },
  scrollback: { bytes: 200_000 },
  discovery: { includeLegacyPorts: false },
  ports: {},
};

const DEFAULT_CANDIDATE_PATHS = ['ttymux.config.yaml', 'ttymux.config.yml'];

export interface LoadConfigResult {
  config: ResolvedConfig;
  sourcePath: string | null;
}

export function loadConfig(explicitPath?: string): LoadConfigResult {
  const candidatePath = explicitPath ?? process.env.TTYMUX_CONFIG ?? findDefaultConfigPath();

  if (!candidatePath) {
    return { config: DEFAULT_CONFIG, sourcePath: null };
  }

  const absolutePath = resolve(candidatePath);
  if (!existsSync(absolutePath)) {
    if (explicitPath) {
      throw new Error(`Config file not found: ${absolutePath}`);
    }
    return { config: DEFAULT_CONFIG, sourcePath: null };
  }

  const raw = yaml.load(readFileSync(absolutePath, 'utf8')) ?? {};
  const parsed = configSchema.parse(raw);

  const config: ResolvedConfig = {
    server: { ...DEFAULT_CONFIG.server, ...parsed.server },
    auth: parsed.auth ?? DEFAULT_CONFIG.auth,
    logging: { ...DEFAULT_CONFIG.logging, ...parsed.logging },
    scrollback: { bytes: parsed.scrollback?.bytes ?? DEFAULT_CONFIG.scrollback.bytes },
    discovery: { includeLegacyPorts: parsed.discovery?.includeLegacyPorts ?? DEFAULT_CONFIG.discovery.includeLegacyPorts },
    ports: parsed.ports ?? {},
  };

  return { config, sourcePath: absolutePath };
}

function findDefaultConfigPath(): string | null {
  for (const candidate of DEFAULT_CANDIDATE_PATHS) {
    if (existsSync(resolve(candidate))) return candidate;
  }
  return null;
}
