import { useEffect, useState } from 'react';

// Light or dark, chosen in the app (moon button on Month, or Settings), remembered on this device. Starts light.
export type Theme = 'light' | 'dark';
const KEY = 'saveBrave:theme';
const EVENT = 'savebrave:theme';

export function savedTheme(): Theme {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

/** Sets <html data-theme>, which styles.css keys dark mode on. */
export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* private mode: still switches for now */ }
  applyTheme(t);
  window.dispatchEvent(new Event(EVENT));
}

/** The current theme, kept in sync between the Month button and Settings. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [t, setT] = useState(savedTheme);
  useEffect(() => {
    const on = () => setT(savedTheme());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [t, setTheme];
}
