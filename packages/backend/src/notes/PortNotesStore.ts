import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PortId, PortNote, PortNoteColor } from '@ttymux/shared';

/** Oldest notes are dropped past this, so a forgotten port can't grow its note list forever. */
export const MAX_NOTES_PER_PORT = 50;

/**
 * Short messages left on a port for other users ("using this for flashing,
 * back at 3pm"). Persisted to a small JSON file next to port-overrides.json
 * on every change, so they survive a restart.
 */
export class PortNotesStore {
  private readonly notes: Record<PortId, PortNote[]>;

  constructor(private readonly filePath: string) {
    this.notes = this.load();
  }

  list(portId: PortId): PortNote[] {
    return this.notes[portId] ?? [];
  }

  add(portId: PortId, input: { text: string; color: PortNoteColor; author?: string }): PortNote {
    const note: PortNote = { id: randomUUID(), text: input.text, color: input.color, createdAt: new Date().toISOString() };
    if (input.author) note.author = input.author;
    this.notes[portId] = [...this.list(portId), note].slice(-MAX_NOTES_PER_PORT);
    this.save();
    return note;
  }

  /** Returns false if no such note exists on this port. */
  remove(portId: PortId, noteId: string): boolean {
    const existing = this.list(portId);
    const remaining = existing.filter((note) => note.id !== noteId);
    if (remaining.length === existing.length) return false;
    if (remaining.length === 0) delete this.notes[portId];
    else this.notes[portId] = remaining;
    this.save();
    return true;
  }

  private load(): Record<PortId, PortNote[]> {
    if (!existsSync(this.filePath)) return {};
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8'));
    } catch {
      return {};
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.notes, null, 2));
  }
}
