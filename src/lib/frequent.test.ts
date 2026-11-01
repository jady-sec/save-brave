import { expect, test } from 'vitest';
import { frequentEntries } from './frequent';
import type { Tx } from './types';

let n = 0;
const tx = (category_id: string, amount_cents: number, date: string, extra: Partial<Tx> = {}): Tx => ({
  id: String(n++), type: 'expense', scope: 'personal', household_id: null, paid_by: 'me', created_by: 'me',
  amount_cents, date, category_id, note: null, recurring_rule_id: null, splits: [], ...extra,
});

test('picks entries repeated at least twice, most frequent first, then most recent', () => {
  const txs = [
    tx('coffee', 540, '2026-11-01'), tx('coffee', 540, '2026-10-30'), tx('coffee', 540, '2026-10-29'),
    tx('bus', 335, '2026-10-20'), tx('bus', 335, '2026-10-21'),
    tx('lunch', 1500, '2026-11-01'), tx('lunch', 1500, '2026-10-31'),
    tx('once', 9999, '2026-11-01'),
  ];
  expect(frequentEntries('me', txs, 4).map((f) => [f.category_id, f.amount_cents, f.count])).toEqual([
    ['coffee', 540, 3], ['lunch', 1500, 2], ['bus', 335, 2],
  ]);
});

test('keeps type, scope and the payer of the latest one; skips recurring and other people’s personal entries', () => {
  const shared = { scope: 'shared' as const, paid_by: 'her', created_by: 'her' };
  const txs = [
    tx('groceries', 8000, '2026-10-01', shared), tx('groceries', 8000, '2026-10-08', { ...shared, paid_by: 'me' }),
    tx('rent', 200000, '2026-10-01', { recurring_rule_id: 'r' }), tx('rent', 200000, '2026-11-01', { recurring_rule_id: 'r' }),
    tx('secret', 100, '2026-10-01', { created_by: 'her' }), tx('secret', 100, '2026-10-02', { created_by: 'her' }),
  ];
  expect(frequentEntries('me', txs, 4)).toEqual([
    { type: 'expense', scope: 'shared', category_id: 'groceries', amount_cents: 8000, paid_by: 'me', count: 2 },
  ]);
});
