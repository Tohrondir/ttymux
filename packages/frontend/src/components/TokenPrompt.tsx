import { useState } from 'react';
import { setAuthToken } from '../api/client.js';

export function TokenPrompt({ onSubmitted }: { onSubmitted: () => void }) {
  const [value, setValue] = useState('');

  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        setAuthToken(value.trim() || null);
        onSubmitted();
      }}
    >
      <input
        type="password"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Access token"
        autoFocus
        className="flex-1 rounded-md border border-line bg-ink px-3 py-1.5 font-mono text-sm text-paper outline-none focus:border-signal"
      />
      <button
        type="submit"
        className="rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-ink transition-[filter] hover:brightness-110"
      >
        Connect
      </button>
    </form>
  );
}
