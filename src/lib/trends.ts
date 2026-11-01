import { addMonths, monthKey } from './month';
import type { Tx } from './types';

export interface Trend { category_id: string; current: number; average: number; change: number | null; series: number[] }

/** What an entry costs me: a personal expense of mine in full, my share of a shared one; income and the partner's entries are 0. */
export function myExpense(me: string, t: Tx): number {
  if (t.type !== 'expense') return 0;
  if (t.scope === 'personal') return t.created_by === me ? t.amount_cents : 0;
  return t.splits.find((s) => s.user_id === me)?.share_cents ?? 0;
}

const BASELINE = 3; // months averaged before the current one

/**
 * My spending per category for the last `months` months (personal + my share of shared, like the Month screen),
 * with the current month compared to the average of the 3 before it. Biggest spend this month first.
 */
export function spendingTrends(me: string, txs: Tx[], current: string, months: number): Trend[] {
  const keys = Array.from({ length: months }, (_, i) => addMonths(current, i - months + 1));
  const index = new Map(keys.map((k, i) => [k, i]));
  const series = new Map<string, number[]>();
  for (const t of txs) {
    const i = index.get(monthKey(t.date));
    if (i === undefined) continue;
    const mine = myExpense(me, t);
    if (!mine) continue;
    let s = series.get(t.category_id);
    if (!s) series.set(t.category_id, s = Array(months).fill(0));
    s[i] += mine;
  }
  return [...series].map(([category_id, s]) => {
    const now = s[months - 1];
    const before = s.slice(Math.max(0, months - 1 - BASELINE), months - 1);
    const sum = before.reduce((a, b) => a + b, 0);
    return {
      category_id, current: now, series: s,
      average: Math.round(sum / BASELINE),
      change: sum > 0 ? Math.round(((now * BASELINE - sum) * 100) / sum) : null,
    };
  }).sort((a, b) => b.current - a.current || b.average - a.average || a.category_id.localeCompare(b.category_id));
}
