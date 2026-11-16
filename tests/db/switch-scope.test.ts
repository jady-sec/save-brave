import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, test } from 'vitest';
import { addUser, asUser, makeDb } from './harness';

// Migration 0018: an entry can move between "just me" and "shared", keeping its id.
let db: PGlite, A: string, B: string, H: string, mine: string, shared: string;

const run = async (uid: string, fn: string, p: Record<string, unknown>) =>
  (await asUser<{ id: string | null }>(db, uid, `select ${fn}($1::jsonb) as id`, [JSON.stringify(p)])).rows[0].id;
const one = async (id: string) => (await db.query<Record<string, unknown>>('select * from transactions where id = $1', [id])).rows[0];
const splitCount = async (id: string) => (await db.query('select 1 from transaction_splits where transaction_id = $1', [id])).rows.length;
const personal = { type: 'expense', scope: 'personal', amount_cents: 1000, date: '2026-11-10', note: 'pizza' };
const asShared = (cat: string, paid_by: string) => ({
  type: 'expense', scope: 'shared', amount_cents: 1000, date: '2026-11-10', note: 'pizza', category_id: cat, paid_by,
  splits: [{ user_id: A, share_cents: 500 }, { user_id: B, share_cents: 500 }],
});

beforeEach(async () => {
  db = await makeDb();
  [A, B] = await Promise.all(['a@t', 'b@t'].map((e) => addUser(db, e)));
  H = (await db.query<{ id: string }>(`insert into households (name, created_by) values ('H', $1) returning id`, [A])).rows[0].id;
  await db.query('insert into household_members values ($1,$2),($1,$3)', [H, A, B]);
  const cat = async (sql: string, p: unknown[]) => (await db.query<{ id: string }>(sql + ' returning id', p)).rows[0].id;
  mine = await cat(`insert into categories (scope, type, name, owner_id) values ('personal','expense','Fun',$1)`, [A]);
  shared = await cat(`insert into categories (scope, type, name, household_id) values ('shared','expense','Groceries',$1)`, [H]);
});

describe('switch_transaction_scope', () => {
  test('my entry becomes shared, same id, with splits, and my partner can see it', async () => {
    const id = (await run(A, 'save_transaction', { ...personal, category_id: mine }))!;
    expect(await run(A, 'switch_transaction_scope', { id, ...asShared(shared, A) })).toBe(id);
    expect(await one(id)).toMatchObject({ scope: 'shared', household_id: H, category_id: shared, created_by: A, note: 'pizza' });
    expect(await splitCount(id)).toBe(2);
    expect((await asUser(db, B, 'select id from transactions where id = $1', [id])).rows).toHaveLength(1);
  });
  test('a shared entry I added goes back to just me, and my partner no longer sees it', async () => {
    const id = (await run(A, 'save_transaction', asShared(shared, B)))!;
    await run(A, 'switch_transaction_scope', { id, ...personal, category_id: mine });
    expect(await one(id)).toMatchObject({ scope: 'personal', household_id: null, paid_by: A });
    expect(await splitCount(id)).toBe(0);
    expect((await asUser(db, B, 'select id from transactions where id = $1', [id])).rows).toHaveLength(0);
  });
  test("my partner can't move a shared entry I added", async () => {
    const id = (await run(A, 'save_transaction', asShared(shared, A)))!;
    await expect(run(B, 'switch_transaction_scope', { id, ...personal, category_id: mine })).rejects.toThrow(/only the person who added/);
    expect(await one(id)).toMatchObject({ scope: 'shared' });
  });
  test('a settled expense stays shared', async () => {
    const id = (await run(A, 'save_transaction', asShared(shared, A)))!;
    await asUser(db, B, `insert into settlements (household_id, from_user, to_user, amount_cents, date, created_by, transaction_id)
      values ($1, $2, $3, 500, '2026-11-11', $2, $4)`, [H, B, A, id]);
    await expect(run(A, 'switch_transaction_scope', { id, ...personal, category_id: mine })).rejects.toThrow(/settled/);
    expect(await one(id)).toMatchObject({ scope: 'shared' });
  });
  test('a wrong category undoes the whole switch', async () => {
    const id = (await run(A, 'save_transaction', { ...personal, category_id: mine }))!;
    await expect(run(A, 'switch_transaction_scope', { id, ...asShared(mine, A) })).rejects.toThrow(/category/);
    expect(await one(id)).toMatchObject({ scope: 'personal', category_id: mine });
  });
});
