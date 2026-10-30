import type { Plan, Scope, Tx } from './types';

export type Level = 'ok' | 'warn' | 'over';
export interface BudgetRow {
  category_id: string; scope: Scope; limit: number | null; spent: number; mine: number; remaining: number | null; level: Level | null;
}

/** Warn at 80% of a limit, over once past it. Integer math, so no float edge at exactly 80%. */
export function alertLevel(spent: number, limit: number): Level {
  if (spent > limit) return 'over';
  if (limit > 0 && spent * 100 >= limit * 80) return 'warn';
  return 'ok';
}

/**
 * My month: income and spending are mine only (personal + my share of shared).
 * Shared rows compare the household total with the household limit; `mine` is my share of it.
 */
export function budgetVsActual(me: string, txs: Tx[], personalPlan: Plan | null, householdPlan: Plan | null) {
  let income = 0, spent = 0;
  const rows = new Map<string, BudgetRow>();
  const row = (category_id: string, scope: Scope) => {
    let r = rows.get(category_id);
    if (!r) rows.set(category_id, r = { category_id, scope, limit: null, spent: 0, mine: 0, remaining: null, level: null });
    return r;
  };

  for (const t of txs) {
    if (t.scope === 'personal') {
      if (t.created_by !== me) continue; // never count the partner's private entries, even if passed in
      if (t.type === 'income') { income += t.amount_cents; continue; }
      spent += t.amount_cents;
      const r = row(t.category_id, 'personal');
      r.spent += t.amount_cents; r.mine += t.amount_cents;
    } else {
      const share = t.splits.find((s) => s.user_id === me)?.share_cents ?? 0;
      spent += share;
      const r = row(t.category_id, 'shared');
      r.spent += t.amount_cents; r.mine += share;
    }
  }
  for (const [plan, scope] of [[personalPlan, 'personal'], [householdPlan, 'shared']] as const) {
    for (const l of plan?.limits ?? []) row(l.category_id, scope).limit = l.limit_cents;
  }
  for (const r of rows.values()) {
    if (r.limit === null) continue;
    r.remaining = r.limit - r.spent;
    r.level = alertLevel(r.spent, r.limit);
  }
  const plannedSavings = personalPlan?.savings_target_cents ?? 0;
  return { income, spent, plannedSavings, actualSavings: income - spent, rows: [...rows.values()] };
}
