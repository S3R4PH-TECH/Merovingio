import { useEffect, useState } from 'react';
import App from './App';
import { ReconTracker } from './features/recon-tracker/ReconTracker';

/** The old recon screen is kept, but only reachable on purpose. */
const LEGACY_HASH = '#/legacy';

/**
 * The Recon Tracker is the application. Opening the app on any ordinary URL
 * lands on it; the previous dashboard stays available at #/legacy so that work
 * is not lost, but it is never what a visitor sees by default.
 *
 * Only one is ever mounted, so the Recon Tracker's scoped stylesheet and the
 * old dashboard's global CSS never share a page.
 */
export function Root() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return hash.startsWith(LEGACY_HASH) ? <App /> : <ReconTracker />;
}
