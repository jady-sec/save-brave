import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, test } from 'vitest';
import { addUser, asUser, makeDb } from './harness';

// A created the household, so A is its admin; B is the partner; C is in another household.
let db: PGlite, A: string, B: string, C: string, H: string, H2: string, cat: string;

const record = (by: string, from: string, to: string, amount: number, txId: string | null = null, household = H) => asUser(db, by,
  `insert into settlements (household_id, from_user, to_user, amount_cents, date, created_by, transaction_id)
   values ($1, $2, $3, $4, '2026-11-07', $5, $6)`, [household, from, to, amount, by, txId]);

async function sharedPaidBy(payer: string, shares: [string, number][]) {
  return db.transaction(async (tx) => {
    const amount = shares.reduce((s, [, c]) => s + c, 0);
    const id = (await tx.query<{ id: string }>(`insert into transactions (type, scope, household_id, paid_by, created_by, amount_cents, date, category_id)
      values ('expense', 'shared', $1, $2, $2, $3, '2026-11-05', $4) returning id`, [H, payer, amount, cat])).rows[0].id;
    for (const [u, s] of shares) await tx.query('insert into transaction_splits values ($1, $2, $3)', [id, u, s]);
    return id;
  });
}

beforeEach(async () => {
  db = await makeDb();
  [A, B, C] = await Promise.all(['a@t', 'b@t', 'c@t'].map((e) => addUser(db, e)));
  H = (await db.query<{ id: string }>(`insert into households (name, created_by) values ('H', $1) returning id`, [A])).rows[0].id;
  await db.query('insert into household_members values ($1,$2),($1,$3)', [H, A, B]);
  H2 = (await db.query<{ id: string }>(`insert into households (name, created_by) values ('H2', $1) returning id`, [C])).rows[0].id;
  await db.query('insert into household_members values ($1,$2)', [H2, C]);
  cat = (await db.query<{ id: string }>(`insert into categories (scope, type, name, household_id) values ('shared','expense','Groceries',$1) returning id`, [H])).rows[0].id;
});

describe('the household admin records payments', () => {
  test("the admin can record that the partner paid them, and it's marked as recorded by the admin", async () => {
    await record(A, B, A, 5000);
    expect((await db.query('select from_user, to_user, created_by from settlements')).rows).toEqual([{ from_user: B, to_user: A, created_by: A }]);
  });
  test("the admin can record the partner's share of one expense the admin paid", async () => {
    const e = await sharedPaidBy(A, [[A, 3000], [B, 5000]]);
    await expect(record(A, B, A, 4000, e)).rejects.toThrow(/share/);
    await record(A, B, A, 5000, e);
    await expect(record(A, B, A, 5000, e)).rejects.toThrow(); // still once per expense
  });
  test("the partner can't record payments on the admin's behalf", async () => {
    await expect(record(B, A, B, 5000)).rejects.toThrow();
    const e = await sharedPaidBy(B, [[A, 4000], [B, 4000]]);
    await expect(record(B, A, B, 4000, e)).rejects.toThrow();
  });
  test('the admin of another household has no say here', async () => {
    await expect(record(C, B, A, 5000)).rejects.toThrow();
    await expect(record(C, A, C, 5000, null, H2)).rejects.toThrow();
  });
  test("a recorded payment still can't be credited to someone else or stamped with someone else's name", async () => {
    await expect(asUser(db, A, `insert into settlements (household_id, from_user, to_user, amount_cents, date, created_by)
      values ($1, $2, $3, 100, '2026-11-07', $2)`, [H, B, A])).rejects.toThrow();
  });
});
