import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_NOTES_PER_PORT, PortNotesStore } from '../src/notes/PortNotesStore.js';

describe('PortNotesStore', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ttymux-notes-test-'));
    filePath = join(dir, 'data', 'port-notes.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty list for a port with no notes', () => {
    expect(new PortNotesStore(filePath).list('p1')).toEqual([]);
  });

  it('adds notes oldest first, scoped per port', () => {
    const store = new PortNotesStore(filePath);
    store.add('p1', { text: 'first', color: 'blue' });
    store.add('p1', { text: 'second', color: 'red', author: 'alice' });
    store.add('p2', { text: 'other port', color: 'green' });

    expect(store.list('p1').map((n) => [n.text, n.color, n.author])).toEqual([
      ['first', 'blue', undefined],
      ['second', 'red', 'alice'],
    ]);
    expect(store.list('p2')).toHaveLength(1);
  });

  it('persists across instances, creating the directory if needed', () => {
    const note = new PortNotesStore(filePath).add('p1', { text: 'kept', color: 'amber' });
    const reloaded = new PortNotesStore(filePath).list('p1');
    expect(reloaded).toEqual([note]);
    expect(JSON.parse(readFileSync(filePath, 'utf8')).p1).toHaveLength(1);
  });

  it('removes a note by id and reports unknown ids', () => {
    const store = new PortNotesStore(filePath);
    const a = store.add('p1', { text: 'a', color: 'blue' });
    const b = store.add('p1', { text: 'b', color: 'blue' });

    expect(store.remove('p1', a.id)).toBe(true);
    expect(store.list('p1')).toEqual([b]);
    expect(store.remove('p1', a.id)).toBe(false);
    expect(store.remove('p2', b.id)).toBe(false);
  });

  it('drops the oldest notes past the per-port cap', () => {
    const store = new PortNotesStore(filePath);
    for (let i = 0; i < MAX_NOTES_PER_PORT + 3; i++) store.add('p1', { text: `n${i}`, color: 'blue' });

    const notes = store.list('p1');
    expect(notes).toHaveLength(MAX_NOTES_PER_PORT);
    expect(notes[0].text).toBe('n3');
  });

  it('starts empty on a corrupted file instead of throwing', () => {
    rmSync(dir, { recursive: true, force: true });
    dir = mkdtempSync(join(tmpdir(), 'ttymux-notes-test-'));
    filePath = join(dir, 'port-notes.json');
    writeFileSync(filePath, '{not json');
    expect(new PortNotesStore(filePath).list('p1')).toEqual([]);
  });
});
