import { expect, test } from 'vitest';
import { upcomingBills } from './upcoming';

const rule = (id: string, day_of_month: number, extra = {}) => ({
  id, day_of_month, type: 'expense' as const, active: true, start_date: '2026-01-01', last_generated_date: '2026-10-01', ...extra,
});

test('lists active expense rules due in the next 7 days, soonest first, with days to go', () => {
  const rules = [rule('rent', 1), rule('phone', 8), rule('gym', 5), rule('far', 20), rule('off', 6, { active: false }), rule('pay', 6, { type: 'income' })];
  expect(upcomingBills(rules, '2026-11-02', 7)).toEqual([
    { id: 'gym', date: '2026-11-05', days: 3 },
    { id: 'phone', date: '2026-11-08', days: 6 },
  ]);
});

test('wraps into next month and clamps the day to short months', () => {
  expect(upcomingBills([rule('rent', 1)], '2026-11-28', 7)).toEqual([{ id: 'rent', date: '2026-12-01', days: 3 }]);
  expect(upcomingBills([rule('end', 31)], '2027-02-25', 7)).toEqual([{ id: 'end', date: '2027-02-28', days: 3 }]);
});

test("due today counts, unless this month's entry was already added", () => {
  expect(upcomingBills([rule('rent', 2)], '2026-11-02', 7)).toEqual([{ id: 'rent', date: '2026-11-02', days: 0 }]);
  expect(upcomingBills([rule('rent', 2, { last_generated_date: '2026-11-02' })], '2026-11-02', 7)).toEqual([]);
  expect(upcomingBills([rule('new', 10, { start_date: '2026-12-01' })], '2026-11-05', 7)).toEqual([]);
});
