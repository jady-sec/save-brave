export interface Goal { id: string; user_id: string | null; household_id: string | null; name: string; target_cents: number; created_at: string }
export interface Contribution { id: string; goal_id: string; user_id: string; amount_cents: number; date: string }

/** Where a goal stands. pct is floored and kept within 0–100 for the progress bar; saved can go negative. */
export function goalProgress(target: number, contributions: { user_id: string; amount_cents: number }[]) {
  const byUser: Record<string, number> = {};
  let saved = 0;
  for (const c of contributions) {
    saved += c.amount_cents;
    byUser[c.user_id] = (byUser[c.user_id] ?? 0) + c.amount_cents;
  }
  return {
    saved,
    left: Math.max(0, target - saved),
    pct: Math.min(100, Math.max(0, Math.floor((saved * 100) / target))),
    byUser,
    done: saved >= target,
  };
}
