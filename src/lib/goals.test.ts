import { expect, test } from 'vitest';
import { goalProgress } from './goals';

const c = (user_id: string, amount_cents: number) => ({ user_id, amount_cents });

test('sums contributions, splits them by person, and caps the bar at 100%', () => {
  expect(goalProgress(300000, [c('a', 100000), c('b', 20000), c('a', -10000)])).toEqual({
    saved: 110000, left: 190000, pct: 36, byUser: { a: 90000, b: 20000 }, done: false,
  });
  expect(goalProgress(1000, [c('a', 1500)])).toEqual({ saved: 1500, left: 0, pct: 100, byUser: { a: 1500 }, done: true });
});

test('an empty goal is 0%, and taking out more than was put in never shows below zero', () => {
  expect(goalProgress(5000, [])).toEqual({ saved: 0, left: 5000, pct: 0, byUser: {}, done: false });
  expect(goalProgress(5000, [c('a', 100), c('a', -300)]).pct).toBe(0);
});
