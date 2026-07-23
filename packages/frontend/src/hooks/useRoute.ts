import { useEffect, useState } from 'react';

export type Route = { name: 'dashboard' } | { name: 'console'; portId: string };

function parseRoute(pathname: string): Route {
  const match = pathname.match(/^\/console\/(.+)$/);
  if (match) return { name: 'console', portId: decodeURIComponent(match[1]) };
  return { name: 'dashboard' };
}

export function navigate(pathname: string): void {
  window.history.pushState(null, '', pathname);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Minimal pushState router — the app only ever has two destinations, so no router dependency is warranted. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return route;
}
