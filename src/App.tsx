import { useEffect, useState } from 'react';
import HighlightWall from './pages/HighlightWall';
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

  if (path.replace(/\/+$/, '') === '/highlights') return <HighlightWall />;
  return <Scoreboard />;
}
