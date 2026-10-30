import type { ReactNode } from 'react';

/** In-app budget warnings. role=status so screen readers hear them without stealing focus. */
export function Alert({ level, children }: { level: 'warn' | 'over'; children: ReactNode }) {
  return <div className={`alert ${level}`} role="status">{children}</div>;
}
