import { useEffect, useState } from 'react';

// celebrate('Banff trip reached!') from anywhere; <Celebration /> (mounted once in App) shows a coin burst.
const EVENT = 'savebrave:celebrate';
export const celebrate = (message: string) => window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));

/** A short buzz on Android after a save; iPhone browsers have no vibration, so this does nothing there. */
export const haptic = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* not allowed */ } };

// Where each coin flies (dx, dy in px) and its colour: fixed, so the burst looks the same every time.
const COINS = [[-120, -230, 0], [-60, -290, 3], [10, -320, 2], [80, -280, 1], [130, -210, 4], [-150, -150, 3], [160, -130, 0],
  [-90, -190, 1], [50, -200, 3], [-20, -250, 4], [110, -320, 2], [-130, -300, 0]] as const;

export function Celebration() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let timer = 0;
    const on = (e: Event) => {
      clearTimeout(timer);
      setMessage(null);
      requestAnimationFrame(() => setMessage((e as CustomEvent<string>).detail)); // restart if one is already showing
      haptic(30);
      timer = window.setTimeout(() => setMessage(null), 2200);
    };
    window.addEventListener(EVENT, on);
    return () => { window.removeEventListener(EVENT, on); clearTimeout(timer); };
  }, []);
  if (!message) return null;
  return (
    <div className="celebration" role="status" onClick={() => setMessage(null)}>
      <div className="burst" aria-hidden="true">
        {COINS.map(([dx, dy, tone], i) => (
          <span key={i} className={`coin-fly t${tone}`} style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, animationDelay: `${i * 25}ms` } as React.CSSProperties} />
        ))}
      </div>
      <p className="celebration-msg">{message}</p>
    </div>
  );
}
