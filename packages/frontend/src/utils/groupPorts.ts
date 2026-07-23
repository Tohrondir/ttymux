import type { PortInfo } from '@ttymux/shared';

/** Ungrouped ports first, then named groups alphabetically; ports within a group sorted by display name. */
export function groupPorts(ports: PortInfo[]): Array<[string | null, PortInfo[]]> {
  const groups = new Map<string | null, PortInfo[]>();
  for (const port of ports) {
    const key = port.group ?? null;
    const list = groups.get(key) ?? [];
    list.push(port);
    groups.set(key, list);
  }

  const entries = [...groups.entries()];
  entries.sort(([a], [b]) => {
    if (a === b) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return a.localeCompare(b);
  });
  for (const [, list] of entries) {
    list.sort((a, b) => (a.friendlyName ?? a.path).localeCompare(b.friendlyName ?? b.path));
  }
  return entries;
}
