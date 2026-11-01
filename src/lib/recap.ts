import { budgetVsActual } from './budget';
import { monthKey } from './month';
import { spendingTrends } from './trends';
import type { Plan, Tx } from './types';

/**
 * The month-in-review story: my numbers for `month` (same rules as the Month screen), my top category, the
 * category that jumped most against the 3 months before, money the household put toward goals, and how many
 * entries I made. `txs` should cover the month and the 3 before it; `plans` are my plans (carried forward).
 */
export function monthRecap(me: string, txs: Tx[], plans: Plan[], contributions: { amount_cents: number; date: string }[], month: string) {
  const inMonth = txs.filter((t) => monthKey(t.date) === month);
  const plan = [...plans].sort((a, b) => a.month.localeCompare(b.month)).reverse().find((p) => p.month <= month) ?? null;
  const r = budgetVsActual(me, inMonth, plan, null);
  const trends = spendingTrends(me, txs, month, 4);
  const top = trends.find((t) => t.current > 0);
  const jump = trends.filter((t) => t.change !== null && t.change > 0).sort((a, b) => b.change! - a.change!)[0];
  return {
    month,
    income: r.income, spent: r.spent, saved: r.actualSavings, target: plan ? r.plannedSavings : null,
    entries: inMonth.filter((t) => t.created_by === me).length,
    top: top ? { category_id: top.category_id, cents: top.current } : null,
    jump: jump ? { category_id: jump.category_id, change: jump.change! } : null,
    goals: contributions.filter((c) => monthKey(c.date) === month).reduce((s, c) => s + c.amount_cents, 0),
  };
}
export type Recap = ReturnType<typeof monthRecap>;
