import { ConsolePane } from './components/ConsolePane.js';
import { Sidebar } from './components/Sidebar.js';
import { useRoute } from './hooks/useRoute.js';

export default function App() {
  const route = useRoute();
  const selectedPortId = route.name === 'console' ? route.portId : null;

  return (
    <div className="flex h-screen">
      <Sidebar selectedPortId={selectedPortId} />
      <main className="min-w-0 flex-1">{selectedPortId && <ConsolePane key={selectedPortId} portId={selectedPortId} />}</main>
    </div>
  );
}
