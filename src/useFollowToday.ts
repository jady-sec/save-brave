import { useEffect, useRef } from 'react';
import { followToday, monthKey, todayLocal } from './lib/month';

/** Moves a month screen on to the new month if the app was left open on the current one past month end.
 *  `version` bumps on every refresh (including coming back to the app), which is when this re-checks. */
export function useFollowToday(month: string, setMonth: (m: string) => void, version: number) {
  const last = useRef(monthKey(todayLocal()));
  useEffect(() => {
    const now = monthKey(todayLocal());
    const next = followToday(month, last.current, now);
    last.current = now;
    if (next !== month) setMonth(next);
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps -- only re-check on refresh
}
