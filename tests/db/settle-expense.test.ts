import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, test } from 'vitest';
import { addUser, asUser, makeDb } from './harness';

let db: PGlite, A: string, B: string, C: string, H: string, H2: string, cat: string;

/** A shared expense paid by `payer`, split as given (inserted directly, as the database owner). */
async function shared(payer: string, amount: number, shares: [string, number][], household = H) {
  return db.transaction(async (tx) => {
    const id = (await tx.query<{ id: string }>(`insert into transactions (type, scope, household_id, paid_by, created_by, amount_cents, date, category_id)
      values ('expense', 'shared', $1, $2, $2, $3, '2026-11-05', $4) returning id`, [household, payer, amount, cat])).rows[0].id;
    for (const [u, s] of shares) await tx.query('insert into transaction_splits values ($1, $2, $3)', [id, u, s]);
    return id;
  });
}
const settle = (uid: string, txId: string, amount: number, to: string, household = H) => asUser(db, uid,
  `insert into settlements (household_id, from_user, to_user, amount_cents, date, created_by, transaction_id)
   values ($1, $2, $3, $4, '2026-11-07', $2, $5)`, [household, uid, to, amount, txId]);

beforeEach(async () => {
  db = await makeDb();
  [A, B, C] = await Promise.all(['a@t', 'b@t', 'c@t'].map((e) => addUser(db, e)));
  H = (await db.query<{ id: string }>(`insert into households (name, created_by) values ('H', $1) returning id`, [A])).rows[0].id;
  await db.query('insert into household_members values ($1,$2),($1,$3)', [H, A, B]);
  H2 = (await db.query<{ id: string }>(`insert into households (name, created_by) values ('H2', $1) returning id`, [C])).rows[0].id;
  await db.query('insert into household_members values ($1,$2)', [H2, C]);
  cat = (await db.query<{ id: string }>(`insert into categories (scope, type, name, household_id) values ('shared','expense','Groceries',$1) returning id`, [H])).rows[0].id;
});

describe('settling one shared expense', () => {
  test("I settle my share of an expense my partner paid, and she can settle hers on one I paid", async () => {
    const herExpense = await shared(B, 8000, [[A, 4000], [B, 4000]]);
    await settle(A, herExpense, 4000, B);
    const myExpense = await shared(A, 3000, [[A, 1000], [B, 2000]]);
    await settle(B, myExpense, 2000, A);
    expect((await db.query('select from_user, amount_cents from settlements order by amount_cents')).rows)
      .toEqual([{ from_user: B, amount_cents: 2000 }, { from_user: A, amount_cents: 4000 }]);
  });
  test('the amount must be exactly my share, paid to whoever paid the expense', async () => {
    const e = await shared(B, 8000, [[A, 3000], [B, 5000]]);
    await expect(settle(A, e, 2999, B)).rejects.toThrow(/share/);
    await expect(settle(A, e, 8000, B)).rejects.toThrow(/share/);
  });
  test("the person who paid can't 'settle' their own expense", async () => {
    const e = await shared(A, 8000, [[A, 4000], [B, 4000]]);
    await expect(settle(A, e, 4000, B)).rejects.toThrow();
  });
  test('an expense can only be settled once', async () => {
    const e = await shared(B, 8000, [[A, 4000], [B, 4000]]);
    await settle(A, e, 4000, B);
    await expect(settle(A, e, 4000, B)).rejects.toThrow();
  });
  test("nobody outside the household can settle it or link a payment to it", async () => {
    const e = await shared(B, 8000, [[A, 4000], [B, 4000]]);
    await expect(settle(C, e, 4000, B, H2)).rejects.toThrow();
  });
  test('undoing the payment frees the expense to be settled again; deleting the expense keeps the payment', async () => {
    const e = await shared(B, 8000, [[A, 4000], [B, 4000]]);
    await settle(A, e, 4000, B);
    await asUser(db, A, 'delete from settlements where transaction_id = $1', [e]);
    await settle(A, e, 4000, B);
    await asUser(db, B, 'delete from transactions where id = $1', [e]);
    expect((await db.query('select amount_cents, transaction_id from settlements')).rows).toEqual([{ amount_cents: 4000, transaction_id: null }]);
  });
  test('a plain settle-up with no expense still works as before', async () => {
    await asUser(db, A, `insert into settlements (household_id, from_user, to_user, amount_cents, date, created_by) values ($1, $2, $3, 1234, '2026-11-07', $2)`, [H, A, B]);
    expect((await db.query('select count(*)::int as n from settlements')).rows[0]).toEqual({ n: 1 });
  });
});
