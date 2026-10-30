import { describe, expect, test } from 'vitest';
import { computeBalance } from './balance';
import { computeSplit, toSplitInput } from './split';

const A = 'a', B = 'b';
const M: [string, string] = [A, B];
const shares = (s: { user_id: string; share_cents: number }[]) => Object.fromEntries(s.map((x) => [x.user_id, x.share_cents]));

describe('computeSplit: equal', () => {
  test('odd cent goes to the payer', () => expect(shares(computeSplit(1001, A, M, { mode: 'equal' }))).toEqual({ a: 501, b: 500 }));
  test('even amount splits evenly', () => expect(shares(computeSplit(1000, B, M, { mode: 'equal' }))).toEqual({ a: 500, b: 500 }));
  test('payer B gets the odd cent', () => expect(shares(computeSplit(3, B, M, { mode: 'equal' }))).toEqual({ a: 1, b: 2 }));
  test('always sums to the amount', () => {
    for (const amt of [1, 2, 3, 99, 1001, 2147483647]) {
      expect(computeSplit(amt, A, M, { mode: 'equal' }).reduce((s, x) => s + x.share_cents, 0)).toBe(amt);
    }
  });
});

describe('computeSplit: percent', () => {
  test('non-payer is floored, payer gets the remainder', () =>
    expect(shares(computeSplit(1001, B, M, { mode: 'percent', pct: { a: 70, b: 30 } }))).toEqual({ a: 700, b: 301 }));
  test('percents must add up to 100', () =>
    expect(() => computeSplit(1000, A, M, { mode: 'percent', pct: { a: 60, b: 30 } })).toThrow(/100/));
  test('negative percent is rejected', () =>
    expect(() => computeSplit(1000, A, M, { mode: 'percent', pct: { a: 110, b: -10 } })).toThrow());
  test('non-integer percent is rejected', () =>
    expect(() => computeSplit(1000, A, M, { mode: 'percent', pct: { a: 50.5, b: 49.5 } })).toThrow());
  test('missing member is rejected', () =>
    expect(() => computeSplit(1000, A, M, { mode: 'percent', pct: { a: 100 } })).toThrow());
});

describe('computeSplit: amounts', () => {
  test('uses the amounts as given', () =>
    expect(shares(computeSplit(1000, A, M, { mode: 'amounts', cents: { a: 300, b: 700 } }))).toEqual({ a: 300, b: 700 }));
  test('amounts must add up to the total', () =>
    expect(() => computeSplit(1000, A, M, { mode: 'amounts', cents: { a: 300, b: 600 } })).toThrow(/add up/));
  test('negative amount is rejected', () =>
    expect(() => computeSplit(1000, A, M, { mode: 'amounts', cents: { a: 1100, b: -100 } })).toThrow());
  test('fractional cents are rejected', () =>
    expect(() => computeSplit(1000, A, M, { mode: 'amounts', cents: { a: 300.5, b: 699.5 } })).toThrow());
});

const tx = (paid_by: string, a: number, b: number) => ({ paid_by, splits: [{ user_id: A, share_cents: a }, { user_id: B, share_cents: b }] });
const st = (from_user: string, to_user: string, amount_cents: number) => ({ from_user, to_user, amount_cents });

describe('computeBalance', () => {
  test('A pays 1000 split evenly: B owes A 500', () => {
    expect(computeBalance(A, [tx(A, 500, 500)], [])).toBe(500);
    expect(computeBalance(B, [tx(A, 500, 500)], [])).toBe(-500);
  });
  test('B settling 500 to A clears it', () => {
    expect(computeBalance(A, [tx(A, 500, 500)], [st(B, A, 500)])).toBe(0);
    expect(computeBalance(B, [tx(A, 500, 500)], [st(B, A, 500)])).toBe(0);
  });
  test('a settlement from A raises A’s balance', () => expect(computeBalance(A, [], [st(A, B, 300)])).toBe(300));
  test('invariant: both balances always cancel out', () => {
    let seed = 42;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let run = 0; run < 200; run++) {
      const txs = Array.from({ length: rnd(10) }, () => {
        const amt = 1 + rnd(100000), payer = rnd(2) ? A : B, p = rnd(101), c = rnd(amt + 1);
        const input = [{ mode: 'equal' } as const, { mode: 'percent', pct: { a: p, b: 100 - p } } as const,
          { mode: 'amounts', cents: { a: c, b: amt - c } } as const][rnd(3)];
        return { paid_by: payer, splits: computeSplit(amt, payer, M, input) };
      });
      const sts = Array.from({ length: rnd(5) }, () => (rnd(2) ? st(A, B, 1 + rnd(5000)) : st(B, A, 1 + rnd(5000))));
      expect(computeBalance(A, txs, sts) + computeBalance(B, txs, sts)).toBe(0);
    }
  });
});

describe('toSplitInput: editor asks for my share, partner gets the rest', () => {
  const run = (mode: 'equal' | 'amounts' | 'percent', mine: string, amt = 1000) =>
    shares(computeSplit(amt, A, M, toSplitInput(mode, mine, amt, A, B)));
  test('amounts in dollars', () => expect(run('amounts', '3.00')).toEqual({ a: 300, b: 700 }));
  test('a zero share is allowed', () => expect(run('amounts', '0')).toEqual({ a: 0, b: 1000 }));
  test('more than the total is rejected', () => expect(() => run('amounts', '10.01')).toThrow());
  test('junk is rejected', () => expect(() => run('amounts', 'abc')).toThrow());
  test('empty is rejected', () => expect(() => run('amounts', '')).toThrow());
  test('percent', () => expect(run('percent', '70')).toEqual({ a: 700, b: 300 }));
  test('percent over 100 is rejected', () => expect(() => run('percent', '120')).toThrow());
  test('fractional percent is rejected', () => expect(() => run('percent', '50.5')).toThrow());
  test('equal ignores the field', () => expect(run('equal', 'junk', 1001)).toEqual({ a: 501, b: 500 }));
});
