import { parseCents } from './money';
import type { Split, SplitInput } from './types';

const whole = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** Shares for a two-person shared entry. Rounding leftovers go to the payer. Throws a user-facing Error on bad input. */
export function computeSplit(amount: number, payer: string, members: [string, string], input: SplitInput): Split[] {
  const other = members.find((m) => m !== payer)!;
  let otherShare: number;
  if (input.mode === 'equal') {
    otherShare = Math.floor(amount / 2);
  } else if (input.mode === 'percent') {
    const p = members.map((m) => input.pct[m]);
    if (!p.every(whole)) throw new Error('Percentages must be whole numbers from 0 to 100.');
    if (p[0] + p[1] !== 100) throw new Error('Percentages must add up to 100.');
    otherShare = Math.floor((amount * input.pct[other]) / 100);
  } else {
    const c = members.map((m) => input.cents[m]);
    if (!c.every(whole)) throw new Error('Each share must be zero or more.');
    if (c[0] + c[1] !== amount) throw new Error('Shares must add up to the total.');
    otherShare = input.cents[other];
  }
  return members.map((m) => ({ user_id: m, share_cents: m === other ? otherShare : amount - otherShare }));
}

export type SplitMode = SplitInput['mode'];

/** The split editor asks only for my share; the partner gets the rest, so totals can't drift. Bad input becomes NaN for computeSplit to reject. */
export function toSplitInput(mode: SplitMode, mine: string, amount: number, me: string, partner: string): SplitInput {
  if (mode === 'equal') return { mode };
  const t = mine.trim();
  if (mode === 'percent') {
    const p = /^\d{1,3}$/.test(t) ? Number(t) : NaN;
    return { mode, pct: { [me]: p, [partner]: 100 - p } };
  }
  const c = /^0*(\.0{0,2})?$/.test(t) && /0/.test(t) ? 0 : parseCents(t) ?? NaN;
  return { mode, cents: { [me]: c, [partner]: amount - c } };
}
