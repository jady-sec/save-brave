import type { Settlement, Tx } from './types';

/** What the partner owes me (negative: what I owe). Always derived from records, never stored. */
export function computeBalance(me: string, shared: Pick<Tx, 'paid_by' | 'splits'>[],
  settlements: Pick<Settlement, 'from_user' | 'to_user' | 'amount_cents'>[]): number {
  let b = 0;
  for (const t of shared) {
    for (const s of t.splits) {
      if (t.paid_by === me) b += s.share_cents;    // I paid: I'm owed the whole amount…
      if (s.user_id === me) b -= s.share_cents;    // …minus my own share
    }
  }
  for (const s of settlements) {
    if (s.from_user === me) b += s.amount_cents;
    if (s.to_user === me) b -= s.amount_cents;
  }
  return b;
}
