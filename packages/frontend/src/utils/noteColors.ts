import type { PortNoteColor } from '@ttymux/shared';

/** Literal class strings (not built dynamically) so Tailwind's scanner picks every one of them up. */
export const NOTE_COLOR_META: Record<PortNoteColor, { label: string; dot: string; card: string }> = {
  blue: { label: 'Info', dot: 'bg-note-blue', card: 'border-note-blue/60 bg-note-blue/10' },
  amber: { label: 'In use', dot: 'bg-note-amber', card: 'border-note-amber/60 bg-note-amber/10' },
  red: { label: 'Important', dot: 'bg-note-red', card: 'border-note-red/60 bg-note-red/10' },
  green: { label: 'OK', dot: 'bg-note-green', card: 'border-note-green/60 bg-note-green/10' },
  purple: { label: 'Heads up', dot: 'bg-note-purple', card: 'border-note-purple/60 bg-note-purple/10' },
};

/** Picker order, most common first. */
export const NOTE_COLOR_ORDER: PortNoteColor[] = ['blue', 'amber', 'red', 'green', 'purple'];

export function formatNoteAge(createdAt: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(createdAt).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(createdAt).toLocaleDateString();
}
