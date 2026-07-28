import { useLocalStorageState } from '../hooks/useLocalStorageState.js';
import { GridPane } from './GridPane.js';

const COLUMN_OPTIONS = ['auto', 1, 2, 3, 4] as const;
type ColumnOption = (typeof COLUMN_OPTIONS)[number];

export interface GridViewProps {
  sessionPortIds: string[];
  onRemoveFromSession: (id: string) => void;
  highlightEnabled: boolean;
}

export function GridView({ sessionPortIds, onRemoveFromSession, highlightEnabled }: GridViewProps) {
  const [columns, setColumns] = useLocalStorageState<ColumnOption>('ttymux.gridColumns', 'auto');

  return (
    <div className="flex h-screen flex-col bg-panel">
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
        <div>
          <h1 className="text-sm font-medium text-paper">Grid view</h1>
          <p className="text-xs text-fog">Add ports from the sidebar to see them here at the same time.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-fog">
          Columns
          <select
            value={columns}
            onChange={(event) => setColumns((event.target.value === 'auto' ? 'auto' : Number(event.target.value)) as ColumnOption)}
            className="rounded-md border border-line bg-ink px-2 py-1 text-paper outline-none focus:border-signal"
          >
            {COLUMN_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 'auto' ? 'Auto' : option}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {sessionPortIds.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-sm text-center text-sm text-fog">
              Nothing added yet. Hover a port in the sidebar and click the + icon to add it here.
            </p>
          </div>
        ) : (
          <div
            className="grid h-full gap-3"
            style={{
              gridTemplateColumns: columns === 'auto' ? 'repeat(auto-fit, minmax(420px, 1fr))' : `repeat(${columns}, minmax(0, 1fr))`,
              gridAutoRows: 'minmax(280px, 1fr)',
            }}
          >
            {sessionPortIds.map((id) => (
              <GridPane key={id} portId={id} onRemove={onRemoveFromSession} highlightEnabled={highlightEnabled} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
