import { useEffect, useState } from 'react';

export type Route = { name: 'none' } | { name: 'console'; portId: string } | { name: 'grid' };

function parseRoute(pathname: string): Route {
  const match = pathname.match(/^\/console\/(.+)$/);
  if (match) return { name: 'console', portId: decodeURIComponent(match[1]) };
  if (pathname === '/grid') return { name: 'grid' };
  return { name: 'none' };
}

export function navigate(pathname: string): void {
  window.history.pushState(null, '', pathname);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Minimal pushState router: selects which console (if any) shows in the main pane; the sidebar itself never navigates away. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return route;
}
