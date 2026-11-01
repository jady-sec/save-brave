import { expect, test } from 'vitest';
import { monthRecap } from './recap';
import type { Plan, Tx } from './types';

let n = 0;
const tx = (date: string, category_id: string, amount_cents: number, extra: Partial<Tx> = {}): Tx => ({
  id: String(n++), type: 'expense', scope: 'personal', household_id: null, paid_by: 'me', created_by: 'me',
  amount_cents, date, category_id, note: null, recurring_rule_id: null, splits: [], ...extra,
});
const plan = { id: 'p', user_id: 'me', household_id: null, month: '2026-09', expected_income_cents: 500000, savings_target_cents: 100000, limits: [] } as unknown as Plan;

test('sums up last month: saved vs target, top category, biggest jump, goal money and entry count', () => {
  const txs = [
    tx('2026-10-01', 'salary', 400000, { type: 'income' }),
    tx('2026-10-02', 'rent', 150000), tx('2026-10-05', 'food', 60000), tx('2026-10-20', 'food', 30000),
    tx('2026-07-05', 'food', 30000), tx('2026-08-05', 'food', 30000), tx('2026-09-05', 'food', 30000),
    tx('2026-07-02', 'rent', 150000), tx('2026-08-02', 'rent', 150000), tx('2026-09-02', 'rent', 150000),
    tx('2026-11-01', 'food', 99999), // next month: ignored
  ];
  const contributions = [
    { user_id: 'me', amount_cents: 20000, date: '2026-10-10' }, { user_id: 'her', amount_cents: 5000, date: '2026-10-11' },
    { user_id: 'me', amount_cents: 7000, date: '2026-09-30' },
  ];
  expect(monthRecap('me', txs, [plan], contributions, '2026-10')).toEqual({
    month: '2026-10', income: 400000, spent: 240000, saved: 160000, target: 100000, entries: 4,
    top: { category_id: 'rent', cents: 150000 },
    jump: { category_id: 'food', change: 200 },
    goals: 25000,
  });
});

test('a quiet month: no plan, no spending, nothing to compare', () => {
  expect(monthRecap('me', [], [], [], '2026-10')).toEqual({
    month: '2026-10', income: 0, spent: 0, saved: 0, target: null, entries: 0, top: null, jump: null, goals: 0,
  });
});
