import { describe, expect, test } from 'vitest';
import { dueDates } from './recurring';

const rule = (day_of_month: number, start_date: string, last_generated_date: string | null = null) => ({ day_of_month, start_date, last_generated_date });

describe('dueDates', () => {
  test('back-fills every missed month up to today', () =>
    expect(dueDates(rule(15, '2026-07-15'), '2026-10-29')).toEqual(['2026-07-15', '2026-08-15', '2026-09-15', '2026-10-15']));
  test("this month's date not reached yet is excluded", () =>
    expect(dueDates(rule(15, '2026-07-15'), '2026-10-14')).toEqual(['2026-07-15', '2026-08-15', '2026-09-15']));
  test('only dates after the last generated one', () =>
    expect(dueDates(rule(15, '2026-07-15', '2026-09-15'), '2026-10-29')).toEqual(['2026-10-15']));
  test('day 31 clamps to short months', () =>
    expect(dueDates(rule(31, '2026-01-31'), '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']));
  test('leap-year February', () => expect(dueDates(rule(31, '2028-02-01'), '2028-02-29')).toEqual(['2028-02-29']));
  test('a start date in the future gives nothing', () => expect(dueDates(rule(1, '2026-11-01'), '2026-10-29')).toEqual([]));
  test('a start date after this month\'s day starts next month', () =>
    expect(dueDates(rule(1, '2026-09-20'), '2026-10-29')).toEqual(['2026-10-01']));
  test('crosses a year boundary', () =>
    expect(dueDates(rule(5, '2026-11-05', '2026-11-05'), '2027-01-10')).toEqual(['2026-12-05', '2027-01-05']));
});

test('changing the day after this month was added does not add the month again', () =>
  expect(dueDates(rule(20, '2026-07-15', '2026-10-15'), '2026-10-29')).toEqual([]));
