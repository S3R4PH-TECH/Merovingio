import { useCallback, useEffect, useState } from 'react';
import type { RouteKey } from '../types';

const ROUTES: readonly RouteKey[] = [
  'overview',
  'runs',
  'active',
  'scope',
  'tes',
  'findings',
];

const DEFAULT_ROUTE: RouteKey = 'overview';

export interface Route {
  key: RouteKey;
  /** Set only on #/runs/<id>, which opens the run detail screen. */
  runId?: string;
}

/**
 * Routes are top level because this dashboard is the application. Anything the
 * dashboard does not own — notably #/legacy — returns null so Root can hand the
 * page to the old recon screen instead.
 */
export function parseHashRoute(hash: string): Route | null {
  const rest = hash.replace(/^#/, '').replace(/^\/+|\/+$/g, '');
  if (rest === '') return { key: DEFAULT_ROUTE };

  const [head, tail] = rest.split('/');

  // A run id turns the runs list into the run detail screen, so a deep link to
  // one execution survives a reload and can be pasted to a teammate.
  if (head === 'runs' && tail) return { key: 'runs', runId: tail };

  return (ROUTES as readonly string[]).includes(head) ? { key: head as RouteKey } : null;
}

export function routeToHash(route: RouteKey, runId?: string): string {
  return runId ? `#/${route}/${runId}` : `#/${route}`;
}

export function useHashRoute(): {
  route: Route;
  navigate: (route: RouteKey, runId?: string) => void;
} {
  const [route, setRoute] = useState<Route>(
    () => parseHashRoute(window.location.hash) ?? { key: DEFAULT_ROUTE },
  );

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHashRoute(window.location.hash) ?? { key: DEFAULT_ROUTE });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: RouteKey, runId?: string) => {
    window.location.hash = routeToHash(next, runId);
    // jsdom does not always fire hashchange synchronously for a programmatic
    // assignment; setting state here keeps the UI in step either way.
    setRoute({ key: next, runId });
  }, []);

  return { route, navigate };
}
