import { useState } from 'react';
import type { PortNote, PortNoteColor } from '@ttymux/shared';
import { api } from '../api/client.js';
import { formatNoteAge, NOTE_COLOR_META, NOTE_COLOR_ORDER } from '../utils/noteColors.js';

export interface PortNotesProps {
  portId: string;
  notes: PortNote[];
  /** Whether the add-note form is showing; toggled from the console header. */
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  /** Remembered name to sign new notes with. */
  author: string;
  onAuthorChange: (author: string) => void;
}

/** Strip of color-coded notes under the console header, plus the form to leave a new one. Renders nothing when empty and not adding. */
export function PortNotes({ portId, notes, adding, onAddingChange, author, onAuthorChange }: PortNotesProps) {
  const [error, setError] = useState<string | null>(null);

  async function deleteNote(noteId: string) {
    setError(null);
    try {
      await api.deleteNote(portId, noteId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (notes.length === 0 && !adding && !error) return null;

  return (
    <div className="flex flex-wrap items-start gap-2 border-b border-line px-4 py-2">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} onDelete={() => deleteNote(note.id)} />
      ))}
      {adding && (
        <NoteForm
          portId={portId}
          author={author}
          onAuthorChange={onAuthorChange}
          onDone={() => onAddingChange(false)}
          onError={setError}
        />
      )}
      {error && <p className="w-full text-xs text-status-error">{error}</p>}
    </div>
  );
}

function NoteCard({ note, onDelete }: { note: PortNote; onDelete: () => void }) {
  const meta = NOTE_COLOR_META[note.color];
  return (
    <div className={`group flex max-w-md min-w-0 items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs ${meta.card}`}>
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} title={meta.label} aria-label={meta.label} />
      <div className="min-w-0">
        <p className="whitespace-pre-wrap break-words text-paper">{note.text}</p>
        <p className="mt-0.5 text-[11px] text-fog" title={new Date(note.createdAt).toLocaleString()}>
          {note.author ? `${note.author} · ` : ''}
          {formatNoteAge(note.createdAt)}
        </p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete note"
        title="Delete note"
        className="shrink-0 text-fog opacity-0 hover:text-paper focus-visible:opacity-100 group-hover:opacity-100"
      >
        &times;
      </button>
    </div>
  );
}

interface NoteFormProps {
  portId: string;
  author: string;
  onAuthorChange: (author: string) => void;
  onDone: () => void;
  onError: (message: string | null) => void;
}

function NoteForm({ portId, author, onAuthorChange, onDone, onError }: NoteFormProps) {
  const [text, setText] = useState('');
  const [color, setColor] = useState<PortNoteColor>('blue');
  const [saving, setSaving] = useState(false);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    onError(null);
    try {
      await api.addNote(portId, { text: trimmed, color, author: author.trim() || undefined });
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'rounded-md border border-line bg-ink px-2 py-1 text-xs text-paper outline-none placeholder:text-fog focus:border-signal';

  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-panel px-2.5 py-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDone();
      }}
    >
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Note color">
        {NOTE_COLOR_ORDER.map((option) => {
          const meta = NOTE_COLOR_META[option];
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={color === option}
              aria-label={meta.label}
              title={meta.label}
              onClick={() => setColor(option)}
              className={`h-4 w-4 rounded-full ${meta.dot} ${color === option ? 'ring-2 ring-paper ring-offset-1 ring-offset-panel' : 'opacity-60 hover:opacity-100'}`}
            />
          );
        })}
        <span className="ml-1 w-16 text-[11px] text-fog">{NOTE_COLOR_META[color].label}</span>
      </div>
      <input
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={500}
        placeholder="Leave a message, e.g. using this until 3pm"
        className={`${inputClass} w-72`}
      />
      <input
        value={author}
        onChange={(event) => onAuthorChange(event.target.value)}
        maxLength={100}
        placeholder="Your name (optional)"
        className={`${inputClass} w-36`}
      />
      <button
        type="submit"
        disabled={!text.trim() || saving}
        className="rounded-md border border-signal-dim px-2 py-1 text-xs text-signal transition-colors hover:text-paper disabled:opacity-50"
      >
        Add
      </button>
      <button type="button" onClick={onDone} className="text-xs text-fog hover:text-paper">
        Cancel
      </button>
    </form>
  );
}
