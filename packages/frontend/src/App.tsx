import { ConsoleView } from './components/ConsoleView.js';
import { Dashboard } from './components/Dashboard.js';
import { useRoute } from './hooks/useRoute.js';

export default function App() {
  const route = useRoute();

  if (route.name === 'console') {
    return <ConsoleView portId={route.portId} />;
  }

  return <Dashboard />;
}
