import { expect, test } from 'vitest';
import { exportRows } from './export';
import type { Tx } from './types';

const base: Tx = { id: '1', type: 'expense', scope: 'personal', household_id: null, paid_by: 'a', created_by: 'a', amount_cents: 1250,
  date: '2026-10-01', category_id: 'c1', note: '=lunch', recurring_rule_id: null, splits: [] };

test('header, personal, shared and income rows', () => {
  const rows = exportRows('a', 'Sam', [
    base,
    { ...base, id: '2', scope: 'shared', paid_by: 'b', amount_cents: 1001, note: null, category_id: 'c2',
      splits: [{ user_id: 'a', share_cents: 500 }, { user_id: 'b', share_cents: 501 }] },
    { ...base, id: '3', type: 'income', amount_cents: 500000, note: 'Pay', category_id: 'c3' },
  ], new Map([['c1', 'Fun'], ['c2', 'Rent'], ['c3', 'Salary']]));
  expect(rows).toEqual([
    ['date', 'type', 'scope', 'category', 'amount', 'your_share', 'paid_by', 'note'],
    ['2026-10-01', 'expense', 'personal', 'Fun', '12.50', '12.50', 'you', '=lunch'],
    ['2026-10-01', 'expense', 'shared', 'Rent', '10.01', '5.00', 'Sam', ''],
    ['2026-10-01', 'income', 'personal', 'Salary', '5000.00', '5000.00', 'you', 'Pay'],
  ]);
});
