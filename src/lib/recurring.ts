import { addMonths, daysInMonth, monthKey } from './month';
import type { RecurringRule } from './types';

/**
 * Every occurrence on or after start_date, up to and including today, in months after last_generated_date's month
 * (one entry per month, even if the day was changed after this month's entry). Day clamped to month length.
 */
export function dueDates(rule: Pick<RecurringRule, 'day_of_month' | 'start_date' | 'last_generated_date'>, today: string): string[] {
  const out: string[] = [];
  for (let m = monthKey(rule.start_date); m <= monthKey(today); m = addMonths(m, 1)) {
    const d = `${m}-${String(Math.min(rule.day_of_month, daysInMonth(m))).padStart(2, '0')}`;
    if (d >= rule.start_date && d <= today && (!rule.last_generated_date || m > monthKey(rule.last_generated_date))) out.push(d);
  }
  return out;
}
