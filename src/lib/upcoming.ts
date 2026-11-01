import { addMonths, daysInMonth, monthKey } from './month';
import type { RecurringRule } from './types';

type Rule = Pick<RecurringRule, 'id' | 'day_of_month' | 'type' | 'active' | 'start_date' | 'last_generated_date'>;

const dateIn = (month: string, day: number) => `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00`) - Date.parse(`${a}T12:00`)) / 86_400_000);

/** Recurring bills (active expenses) coming due within `within` days of today, soonest first. */
export function upcomingBills(rules: Rule[], today: string, within: number) {
  const out: { id: string; date: string; days: number }[] = [];
  for (const r of rules) {
    if (!r.active || r.type !== 'expense') continue;
    const thisMonth = monthKey(today);
    // This month's date, unless it has passed or this month's entry is already in; then next month's.
    const doneThisMonth = !!r.last_generated_date && monthKey(r.last_generated_date) >= thisMonth;
    let date = dateIn(thisMonth, r.day_of_month);
    if (date < today || doneThisMonth) date = dateIn(addMonths(thisMonth, 1), r.day_of_month);
    if (date < r.start_date) continue;
    const days = daysBetween(today, date);
    if (days <= within) out.push({ id: r.id, date, days });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
