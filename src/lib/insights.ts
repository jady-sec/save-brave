import { addMonths, daysInMonth, monthKey } from './month';
import { myExpense } from './trends';
import type { Tx } from './types';

/** My spending this month up to today, against last month up to the same day (capped at a shorter month's end). */
export function spendPace(me: string, txs: Tx[], today: string) {
  const month = monthKey(today);
  const last = addMonths(month, -1);
  const day = Math.min(Number(today.slice(8, 10)), daysInMonth(last));
  const lastCutoff = `${last}-${String(day).padStart(2, '0')}`;
  let now = 0, then = 0;
  for (const t of txs) {
    if (monthKey(t.date) === month && t.date <= today) now += myExpense(me, t);
    else if (monthKey(t.date) === last && t.date <= lastCutoff) then += myExpense(me, t);
  }
  return { now, then, change: then > 0 ? Math.round(((now - then) * 100) / then) : null };
}

/** Where my money went this month, biggest first. Percentages are whole numbers that add up to exactly 100. */
export function categoryShares(me: string, txs: Tx[], month: string) {
  const by = new Map<string, number>();
  for (const t of txs) {
    if (monthKey(t.date) !== month) continue;
    const c = myExpense(me, t);
    if (c) by.set(t.category_id, (by.get(t.category_id) ?? 0) + c);
  }
  const total = [...by.values()].reduce((a, b) => a + b, 0);
  const rows = [...by].map(([category_id, cents]) => ({ category_id, cents, exact: total ? (cents * 100) / total : 0 }))
    .sort((a, b) => b.cents - a.cents || a.category_id.localeCompare(b.category_id));
  // Largest remainder: floor everything, then hand the leftover points to the biggest fractions.
  const pcts = rows.map((r) => Math.floor(r.exact));
  let left = total ? 100 - pcts.reduce((a, b) => a + b, 0) : 0;
  [...rows.keys()].sort((i, j) => (rows[j].exact % 1) - (rows[i].exact % 1)).forEach((i) => { if (left > 0) { pcts[i]++; left--; } });
  return rows.map((r, i) => ({ category_id: r.category_id, cents: r.cents, pct: pcts[i] }));
}
