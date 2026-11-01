import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReload } from '../me';
import { Icon } from './Icon';

const TRIGGER = 70; // px of downward pull that reloads

/** Every signed-in screen: dark header band (title + headline figure), then the white sheet with the content. */
export function Screen({ title, hero, children }: { title?: ReactNode; hero?: ReactNode; children: ReactNode }) {
  const reload = useReload();
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const signedIn = !!reload;
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  // Pull down from the top to fetch the partner's latest changes (coming back to the app also reloads).
  useEffect(() => {
    if (!signedIn) return;
    let startY: number | null = null, dist = 0;
    const start = (e: TouchEvent) => {
      const inSheet = (e.target as Element).closest?.('dialog');
      startY = window.scrollY <= 0 && !inSheet ? e.touches[0].clientY : null;
      dist = 0;
    };
    const move = (e: TouchEvent) => {
      if (startY === null) return;
      dist = Math.max(0, e.touches[0].clientY - startY);
      setPull(Math.min(dist, TRIGGER * 1.5));
    };
    const end = async () => {
      const go = startY !== null && dist >= TRIGGER;
      startY = null; dist = 0; setPull(0);
      if (!go) return;
      setBusy(true);
      try { await reloadRef.current?.(); } finally { setBusy(false); }
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, [signedIn]);

  const gap = busy ? 36 : pull / 2;
  return (
    <main className="screen">
      <header className="hero">
        {typeof title === 'string' ? <h1>{title}</h1> : title}
        {hero}
      </header>
      <div className="body" style={gap ? { paddingTop: 20 + gap } : undefined}>
        {(pull > 0 || busy) && (
          <span className={busy ? 'ptr busy' : 'ptr'} aria-hidden="true"
            style={busy ? undefined : { opacity: Math.min(1, pull / TRIGGER), transform: `rotate(${pull * 3}deg)` }}>
            <Icon name="refresh" size={22} />
          </span>
        )}
        {busy && <span className="visually-hidden" role="status">Refreshing</span>}
        {children}
      </div>
    </main>
  );
}
