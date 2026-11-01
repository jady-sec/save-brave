import type { Scope, Tx, TxType } from './types';

export interface Frequent { type: TxType; scope: Scope; category_id: string; amount_cents: number; paid_by: string; count: number }

/**
 * Entries you make again and again (same type, scope, category and amount, at least twice), most frequent first,
 * for the Add sheet's repeat chips. Recurring items add themselves, so they're left out.
 */
export function frequentEntries(me: string, txs: Tx[], limit: number): Frequent[] {
  const groups = new Map<string, Frequent & { last: string }>();
  for (const t of txs) {
    if (t.recurring_rule_id || (t.scope === 'personal' && t.created_by !== me)) continue;
    const key = `${t.type}|${t.scope}|${t.category_id}|${t.amount_cents}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { type: t.type, scope: t.scope, category_id: t.category_id, amount_cents: t.amount_cents, paid_by: t.paid_by, count: 1, last: t.date });
    else {
      g.count++;
      if (t.date >= g.last) { g.last = t.date; g.paid_by = t.paid_by; }
    }
  }
  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, limit)
    .map(({ last: _last, ...f }) => f);
}
