const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date as 'YYYY-MM-DD' in the device's local timezone. */
export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const monthKey = (date: string) => date.slice(0, 7);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
}

export function monthBounds(month: string): { start: string; endExclusive: string } {
  return { start: `${month}-01`, endExclusive: `${addMonths(month, 1)}-01` };
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** The month a screen should show after the calendar month changes while the app stays open. */
export const followToday = (viewing: string, lastCurrent: string, nowCurrent: string) =>
  viewing === lastCurrent && nowCurrent !== lastCurrent ? nowCurrent : viewing;
