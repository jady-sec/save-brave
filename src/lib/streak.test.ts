import { expect, test } from 'vitest';
import { dayStreak } from './streak';

const e = (date: string, created_by = 'me') => ({ date, created_by, recurring_rule_id: null });

test('counts consecutive days with an entry of mine, ending today', () => {
  expect(dayStreak('me', [e('2026-11-03'), e('2026-11-02'), e('2026-11-02'), e('2026-11-01'), e('2026-10-30')], '2026-11-03')).toBe(3);
});

test("a streak still counts until the day is over: nothing yet today keeps yesterday's run", () => {
  expect(dayStreak('me', [e('2026-11-02'), e('2026-11-01')], '2026-11-03')).toBe(2);
  expect(dayStreak('me', [e('2026-11-01')], '2026-11-03')).toBe(0);
});

test('runs across month ends; the partner’s entries and automatic recurring ones don’t count', () => {
  expect(dayStreak('me', [e('2026-11-01'), e('2026-10-31'), e('2026-10-30')], '2026-11-01')).toBe(3);
  expect(dayStreak('me', [e('2026-11-01', 'her')], '2026-11-01')).toBe(0);
  expect(dayStreak('me', [{ date: '2026-11-01', created_by: 'me', recurring_rule_id: 'r' }], '2026-11-01')).toBe(0);
});
