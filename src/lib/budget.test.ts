import { describe, expect, test } from 'vitest';
import { alertLevel, budgetVsActual } from './budget';
import type { Plan, Tx } from './types';

describe('alertLevel', () => {
  test.each([[799, 1000, 'ok'], [800, 1000, 'warn'], [1000, 1000, 'warn'], [1001, 1000, 'over'], [0, 0, 'ok'], [1, 0, 'over']] as const)(
    '%i of %i → %s', (spent, limit, level) => expect(alertLevel(spent, limit)).toBe(level));
});

const A = 'a', B = 'b';
let n = 0;
const tx = (o: Partial<Tx>): Tx => ({
  id: `t${n++}`, type: 'expense', scope: 'personal', household_id: null, paid_by: A, created_by: A, amount_cents: 0,
  date: '2026-10-10', category_id: 'groc', note: null, recurring_rule_id: null, splits: [], ...o,
});
const plan = (o: Partial<Plan>): Plan => ({ id: 'p', user_id: A, household_id: null, month: '2026-10', expected_income_cents: 0, savings_target_cents: 0, limits: [], ...o });

const txs = [
  tx({ type: 'income', amount_cents: 500000, category_id: 'salary' }),
  tx({ amount_cents: 10000, category_id: 'groc' }),
  tx({ scope: 'shared', household_id: 'h', paid_by: B, created_by: B, amount_cents: 200001, category_id: 'rent',
    splits: [{ user_id: A, share_cents: 100000 }, { user_id: B, share_cents: 100001 }] }),
  tx({ created_by: B, paid_by: B, amount_cents: 99999, category_id: 'gym' }), // B's personal: must be ignored
  tx({ created_by: B, paid_by: B, type: 'income', amount_cents: 77777, category_id: 'salary' }),
];

describe('budgetVsActual', () => {
  const r = budgetVsActual(A, txs, plan({ savings_target_cents: 300000, limits: [{ category_id: 'groc', limit_cents: 12000 }] }),
    plan({ user_id: null, household_id: 'h', limits: [{ category_id: 'rent', limit_cents: 200000 }] }));
  const row = (id: string) => r.rows.find((x) => x.category_id === id);

  test('month totals use my personal spending plus my share only', () => {
    expect(r).toMatchObject({ income: 500000, spent: 110000, actualSavings: 390000, plannedSavings: 300000 });
  });
  test('shared row compares the household total with the household limit', () => {
    expect(row('rent')).toEqual({ category_id: 'rent', scope: 'shared', limit: 200000, spent: 200001, mine: 100000, remaining: -1, level: 'over' });
  });
  test('personal row', () => {
    expect(row('groc')).toEqual({ category_id: 'groc', scope: 'personal', limit: 12000, spent: 10000, mine: 10000, remaining: 2000, level: 'warn' });
  });
  test("the partner's personal entries are ignored", () => expect(row('gym')).toBeUndefined());
  test('a category without a limit has no level', () => {
    const r2 = budgetVsActual(A, txs, null, null);
    expect(r2.rows.find((x) => x.category_id === 'groc')).toMatchObject({ limit: null, remaining: null, level: null });
    expect(r2.plannedSavings).toBe(0);
  });
  test('a limit with no spending still shows a row', () => {
    const r3 = budgetVsActual(A, [], plan({ limits: [{ category_id: 'fun', limit_cents: 5000 }] }), null);
    expect(r3.rows).toEqual([{ category_id: 'fun', scope: 'personal', limit: 5000, spent: 0, mine: 0, remaining: 5000, level: 'ok' }]);
  });
});
