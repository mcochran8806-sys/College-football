import { useEffect, useState } from 'react';
import HighlightWall from './pages/HighlightWall';
import Settings from './pages/Settings';
import Ticker from './pages/Ticker';
import BreakOverlay from './pages/BreakOverlay';
import Deck from './pages/Deck';
import Scoreboard from './pages/Scoreboard';

/**
 * Two screens, no router dependency. These TVs never navigate — each one is
 * pointed at a URL once and left alone for twelve hours — so a path switch is
 * the whole routing requirement. `popstate` is handled anyway so that a Fire
 * Stick remote's back button doesn't strand the page.
 */
export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const route = path.replace(/\/+$/, '');
  if (route === '/highlights') return <HighlightWall />;
  if (route === '/settings') return <Settings />;
  if (route === '/ticker') return <Ticker />;
  if (route === '/break') return <BreakOverlay />;
  if (route === '/deck') return <Deck />;
  return <Scoreboard />;
}
