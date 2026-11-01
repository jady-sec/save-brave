import { describe, expect, test } from 'vitest';
import { addMonths, daysInMonth, followToday, monthBounds, monthKey, todayLocal } from './month';

describe('month helpers', () => {
  test('todayLocal uses local date parts, not UTC', () => {
    expect(todayLocal(new Date(2026, 9, 31, 23, 30))).toBe('2026-10-31');
    expect(todayLocal(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
  test('monthKey', () => expect(monthKey('2026-10-31')).toBe('2026-10'));
  test('monthBounds rolls over the year', () => {
    expect(monthBounds('2026-12')).toEqual({ start: '2026-12-01', endExclusive: '2027-01-01' });
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', endExclusive: '2026-03-01' });
  });
  test('addMonths', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-05', 0)).toBe('2026-05');
    expect(addMonths('2026-05', -17)).toBe('2024-12');
  });
  test('daysInMonth handles leap years', () => {
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2100-02')).toBe(28);
    expect(daysInMonth('2026-12')).toBe(31);
  });
});

describe('followToday', () => {
  test('moves on to the new month only when you were looking at the month that just ended', () => {
    expect(followToday('2026-11', '2026-11', '2026-12')).toBe('2026-12');
    expect(followToday('2026-09', '2026-11', '2026-12')).toBe('2026-09'); // browsing an old month: stay
    expect(followToday('2026-11', '2026-11', '2026-11')).toBe('2026-11');
  });
});
