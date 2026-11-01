import { expect, test } from 'vitest';
import { categoryShares, spendPace } from './insights';
import type { Tx } from './types';

let n = 0;
const tx = (date: string, category_id: string, amount_cents: number, extra: Partial<Tx> = {}): Tx => ({
  id: String(n++), type: 'expense', scope: 'personal', household_id: null, paid_by: 'me', created_by: 'me',
  amount_cents, date, category_id, note: null, recurring_rule_id: null, splits: [], ...extra,
});

test('pace: this month so far against last month up to the same day', () => {
  const txs = [
    tx('2026-10-03', 'food', 10000), tx('2026-10-10', 'food', 5000), tx('2026-10-25', 'food', 50000),
    tx('2026-11-02', 'food', 9000), tx('2026-11-09', 'fun', 9000),
  ];
  expect(spendPace('me', txs, '2026-11-10')).toEqual({ now: 18000, then: 15000, change: 20 });
});

test('pace: the same day is capped at the end of a shorter last month, and no history gives no %', () => {
  const txs = [tx('2026-02-28', 'food', 1000), tx('2026-03-31', 'food', 2000)];
  expect(spendPace('me', txs, '2026-03-31')).toEqual({ now: 2000, then: 1000, change: 100 });
  expect(spendPace('me', [tx('2026-11-01', 'food', 500)], '2026-11-05')).toEqual({ now: 500, then: 0, change: null });
});

test('pace counts my share of shared entries and skips income', () => {
  const txs = [
    tx('2026-11-01', 'rent', 200000, { scope: 'shared', splits: [{ user_id: 'me', share_cents: 120000 }, { user_id: 'her', share_cents: 80000 }] }),
    tx('2026-11-01', 'salary', 500000, { type: 'income' }),
  ];
  expect(spendPace('me', txs, '2026-11-02').now).toBe(120000);
});

test('category shares: my spending this month by category, biggest first, percentages that add to 100', () => {
  const txs = [tx('2026-11-01', 'a', 5000), tx('2026-11-02', 'b', 3000), tx('2026-11-03', 'c', 2000), tx('2026-10-01', 'a', 99999)];
  expect(categoryShares('me', txs, '2026-11')).toEqual([
    { category_id: 'a', cents: 5000, pct: 50 }, { category_id: 'b', cents: 3000, pct: 30 }, { category_id: 'c', cents: 2000, pct: 20 },
  ]);
  const thirds = categoryShares('me', [tx('2026-11-01', 'a', 100), tx('2026-11-01', 'b', 100), tx('2026-11-01', 'c', 100)], '2026-11');
  expect(thirds.reduce((s, r) => s + r.pct, 0)).toBe(100);
});
