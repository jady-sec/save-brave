import { expect, test } from 'vitest';
import { spendingTrends } from './trends';
import type { Tx } from './types';

const tx = (date: string, category_id: string, amount_cents: number, extra: Partial<Tx> = {}): Tx => ({
  id: `${date}-${category_id}-${amount_cents}`, type: 'expense', scope: 'personal', household_id: null, paid_by: 'me', created_by: 'me',
  amount_cents, date, category_id, note: null, recurring_rule_id: null, created_at: date, splits: [], ...extra,
} as Tx);

test('compares this month with the average of the 3 months before, per category, biggest first', () => {
  const txs = [
    tx('2026-08-03', 'food', 30000), tx('2026-09-03', 'food', 30000), tx('2026-10-03', 'food', 30000), tx('2026-11-01', 'food', 39000),
    tx('2026-10-10', 'fun', 6000), tx('2026-11-02', 'fun', 3000),
  ];
  const t = spendingTrends('me', txs, '2026-11', 6);
  expect(t.map((r) => [r.category_id, r.current, r.average, r.change])).toEqual([
    ['food', 39000, 30000, 30],
    ['fun', 3000, 2000, 50],
  ]);
  expect(t[0].series).toEqual([0, 0, 30000, 30000, 30000, 39000]); // Jun … Nov
});

test('counts only my share of shared entries, ignores income, and has no % when there is no history', () => {
  const txs = [
    tx('2026-11-01', 'rent', 200000, { scope: 'shared', splits: [{ user_id: 'me', share_cents: 100000 }, { user_id: 'her', share_cents: 100000 }] }),
    tx('2026-11-01', 'salary', 500000, { type: 'income' }),
  ];
  expect(spendingTrends('me', txs, '2026-11', 3)).toEqual([
    { category_id: 'rent', current: 100000, average: 0, change: null, series: [0, 0, 100000] },
  ]);
});

test('a category spent on before but not this month still shows, at 0', () => {
  const t = spendingTrends('me', [tx('2026-10-05', 'gym', 5000)], '2026-11', 3);
  expect(t).toEqual([{ category_id: 'gym', current: 0, average: 1667, change: -100, series: [0, 5000, 0] }]);
});
