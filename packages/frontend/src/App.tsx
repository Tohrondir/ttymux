import { ConsolePane } from './components/ConsolePane.js';
import { GridView } from './components/GridView.js';
import { Sidebar } from './components/Sidebar.js';
import { useRoute } from './hooks/useRoute.js';

export default function App() {
  const route = useRoute();
  const selectedPortId = route.name === 'console' ? route.portId : null;

  return (
    <div className="flex h-screen">
      <Sidebar selectedPortId={selectedPortId} gridActive={route.name === 'grid'} />
      <main className="min-w-0 flex-1">
        {route.name === 'console' && <ConsolePane key={route.portId} portId={route.portId} />}
        {route.name === 'grid' && <GridView />}
      </main>
    </div>
  );
}
