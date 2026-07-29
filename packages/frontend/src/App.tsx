import { ConsolePane } from './components/ConsolePane.js';
import { GridView } from './components/GridView.js';
import { Sidebar } from './components/Sidebar.js';
import { useLocalStorageState } from './hooks/useLocalStorageState.js';
import { useRoute } from './hooks/useRoute.js';
import { useSessionPorts } from './hooks/useSessionPorts.js';

export default function App() {
  const route = useRoute();
  const selectedPortId = route.name === 'console' ? route.portId : null;
  const session = useSessionPorts();
  const [highlightEnabled, setHighlightEnabled] = useLocalStorageState('ttymux.highlightEnabled', true);
  const [lurkerMode, setLurkerMode] = useLocalStorageState('ttymux.lurkerMode', false);

  return (
    <div className="flex h-screen">
      <Sidebar
        selectedPortId={selectedPortId}
        gridActive={route.name === 'grid'}
        sessionPortIds={session.sessionPortIds}
        isInSession={session.isInSession}
        onToggleSession={session.toggleInSession}
        lurkerMode={lurkerMode}
        onToggleLurkerMode={setLurkerMode}
      />
      <main className="min-w-0 flex-1">
        {route.name === 'console' && (
          <ConsolePane
            key={route.portId}
            portId={route.portId}
            highlightEnabled={highlightEnabled}
            onToggleHighlight={setHighlightEnabled}
            lurkerMode={lurkerMode}
          />
        )}
        {route.name === 'grid' && (
          <GridView
            sessionPortIds={session.sessionPortIds}
            onRemoveFromSession={session.removeFromSession}
            highlightEnabled={highlightEnabled}
            lurkerMode={lurkerMode}
          />
        )}
      </main>
    </div>
  );
}
