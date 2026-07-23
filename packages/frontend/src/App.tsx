import { Dashboard } from './components/Dashboard.js';
import { useRoute } from './hooks/useRoute.js';

export default function App() {
  const route = useRoute();

  if (route.name === 'console') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="font-mono text-fog">Console view coming up&hellip;</p>
      </div>
    );
  }

  return <Dashboard />;
}
