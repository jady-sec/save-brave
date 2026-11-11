import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, test } from 'vitest';
import { addUser, asUser, makeDb } from './harness';

let db: PGlite, A: string, B: string, C: string, H: string, catA: string, catB: string, shared: string, rule: string;

const save = async (uid: string, p: Record<string, unknown>) =>
  (await asUser<{ id: string | null }>(db, uid, 'select save_transaction($1::jsonb) as id', [JSON.stringify(p)])).rows[0].id;
const one = async (id: string) => (await db.query<Record<string, unknown>>('select * from transactions where id = $1', [id])).rows[0];
const splits = async (id: string) =>
  (await db.query<{ user_id: string; share_cents: number }>('select user_id, share_cents from transaction_splits where transaction_id = $1 order by share_cents', [id])).rows;
const personal = (over: Record<string, unknown> = {}) => ({ type: 'expense', scope: 'personal', amount_cents: 1250, date: '2026-10-29', category_id: catA, ...over });
const sharedTx = (over: Record<string, unknown> = {}) => ({
  type: 'expense', scope: 'shared', amount_cents: 1001, date: '2026-10-29', category_id: shared, paid_by: A,
  splits: [{ user_id: A, share_cents: 501 }, { user_id: B, share_cents: 500 }], ...over,
});

beforeEach(async () => {
  db = await makeDb();
  [A, B, C] = await Promise.all(['a@t', 'b@t', 'c@t'].map((e) => addUser(db, e)));
  H = (await db.query<{ id: string }>(`insert into households (name, created_by) values ('H', $1) returning id`, [A])).rows[0].id;
  await db.query('insert into household_members values ($1,$2),($1,$3)', [H, A, B]);
  const cat = async (sql: string, p: unknown[]) => (await db.query<{ id: string }>(sql + ' returning id', p)).rows[0].id;
  catA = await cat(`insert into categories (scope, type, name, owner_id) values ('personal','expense','Fun',$1)`, [A]);
  catB = await cat(`insert into categories (scope, type, name, owner_id) values ('personal','expense','Gym',$1)`, [B]);
  shared = await cat(`insert into categories (scope, type, name, household_id) values ('shared','expense','Groceries',$1)`, [H]);
  rule = await cat(`insert into recurring_rules (type, scope, owner_id, household_id, paid_by, amount_cents, category_id, day_of_month, start_date)
    values ('expense','shared',$1,$2,$1,1001,$3,1,'2026-01-01')`, [A, H, shared]);
});

describe('save_transaction: personal', () => {
  test('inserts with caller as creator and payer', async () => {
    const id = (await save(A, personal({ note: '  lunch  ' })))!;
    expect(await one(id)).toMatchObject({ created_by: A, paid_by: A, amount_cents: 1250, household_id: null, note: 'lunch' });
    expect(await splits(id)).toEqual([]);
  });
  test('empty note is stored as null', async () => {
    expect((await one((await save(A, personal({ note: '   ' })))!)).note).toBeNull();
  });
  test("cannot use the partner's personal category", async () => {
    await expect(save(A, personal({ category_id: catB }))).rejects.toThrow(/category/);
  });
  test('a non-integer amount is rejected', async () => {
    await expect(save(A, personal({ amount_cents: 12.5 }))).rejects.toThrow();
  });
  test("cannot edit the partner's personal entry", async () => {
    const id = (await save(A, personal()))!;
    await expect(save(B, personal({ id, category_id: catB }))).rejects.toThrow(/not found/);
  });
  test('edits keep the same row', async () => {
    const id = (await save(A, personal()))!;
    expect(await save(A, personal({ id, amount_cents: 999 }))).toBe(id);
    expect((await one(id)).amount_cents).toBe(999);
  });
});

describe('save_transaction: shared', () => {
  test('inserts the entry and its splits in the caller household', async () => {
    const id = (await save(B, sharedTx()))!;
    expect(await one(id)).toMatchObject({ household_id: H, paid_by: A, created_by: B });
    expect(await splits(id)).toEqual([{ user_id: B, share_cents: 500 }, { user_id: A, share_cents: 501 }]);
  });
  test('splits that do not add up to the amount are rejected', async () => {
    await expect(save(A, sharedTx({ splits: [{ user_id: A, share_cents: 500 }, { user_id: B, share_cents: 500 }] }))).rejects.toThrow(/splits/);
  });
  test('splits must cover both members', async () => {
    await expect(save(A, sharedTx({ splits: [{ user_id: A, share_cents: 1001 }] }))).rejects.toThrow(/splits/);
  });
  test('a split for a non-member is rejected', async () => {
    await expect(save(A, sharedTx({ splits: [{ user_id: A, share_cents: 501 }, { user_id: C, share_cents: 500 }] }))).rejects.toThrow(/household member/);
  });
  test("either member can edit; splits are replaced and the creator is kept", async () => {
    const id = (await save(A, sharedTx()))!;
    await save(B, sharedTx({ id, amount_cents: 2000, paid_by: B, splits: [{ user_id: A, share_cents: 700 }, { user_id: B, share_cents: 1300 }] }));
    expect(await one(id)).toMatchObject({ amount_cents: 2000, paid_by: B, created_by: A });
    expect(await splits(id)).toEqual([{ user_id: A, share_cents: 700 }, { user_id: B, share_cents: 1300 }]);
  });
  test('an edit that omits paid_by keeps the original payer', async () => {
    const id = (await save(A, sharedTx({ paid_by: A })))!;
    const { paid_by: _omit, ...edit } = sharedTx({ id, note: 'edited' });
    await save(B, edit);
    expect((await one(id)).paid_by).toBe(A);
  });
  test('scope cannot change on edit', async () => {
    const id = (await save(A, personal()))!;
    await expect(save(A, sharedTx({ id }))).rejects.toThrow(/cannot change/);
  });
  test('generating the same recurring date twice keeps one entry with one set of splits', async () => {
    const first = await save(A, sharedTx({ recurring_rule_id: rule, date: '2026-10-01' }));
    const second = await save(B, sharedTx({ recurring_rule_id: rule, date: '2026-10-01' }));
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect((await db.query('select 1 from transactions where recurring_rule_id = $1', [rule])).rows).toHaveLength(1);
    expect(await splits(first!)).toHaveLength(2);
  });
});

describe('split totals hold even for direct writes (no RPC)', () => {
  test('a shared entry inserted without splits is rejected at commit', async () => {
    await expect(asUser(db, A, `insert into transactions (type, scope, household_id, paid_by, created_by, amount_cents, date, category_id)
      values ('expense','shared',$1,$2,$2,100,'2026-10-01',$3)`, [H, A, shared])).rejects.toThrow(/splits/);
  });
  test("changing a shared entry's amount without its splits is rejected", async () => {
    const id = (await save(A, sharedTx()))!;
    await expect(asUser(db, B, 'update transactions set amount_cents = 5000 where id = $1', [id])).rejects.toThrow(/splits/);
  });
  test('deleting one split is rejected; deleting the entry is fine', async () => {
    const id = (await save(A, sharedTx()))!;
    await expect(asUser(db, B, 'delete from transaction_splits where transaction_id = $1 and user_id = $2', [id, A])).rejects.toThrow(/splits/);
    expect((await asUser(db, B, 'delete from transactions where id = $1', [id])).affectedRows).toBe(1);
  });
});

describe('recurring generation advances its rule in the same transaction', () => {
  const last = async () => (await db.query<{ d: string | null }>(`select last_generated_date::text as d from recurring_rules where id = $1`, [rule])).rows[0].d;
  test('saving a generated entry moves last_generated_date to its date', async () => {
    await save(A, sharedTx({ recurring_rule_id: rule, date: '2026-10-01' }));
    expect(await last()).toBe('2026-10-01');
  });
  test('a duplicate (already generated elsewhere) still advances it', async () => {
    await save(A, sharedTx({ recurring_rule_id: rule, date: '2026-10-01' }));
    await db.query(`update recurring_rules set last_generated_date = null where id = $1`, [rule]);
    expect(await save(B, sharedTx({ recurring_rule_id: rule, date: '2026-10-01' }))).toBeNull();
    expect(await last()).toBe('2026-10-01');
  });
  test('it never moves backwards', async () => {
    await save(A, sharedTx({ recurring_rule_id: rule, date: '2026-10-01' }));
    await save(B, sharedTx({ recurring_rule_id: rule, date: '2026-09-01' }));
    expect(await last()).toBe('2026-10-01');
  });
});

describe('save_transaction: entries made offline (migration 0017)', () => {
  const ID = '6f1c1d5e-0b7a-4c1e-9d2a-3b4c5d6e7f80';
  test('a new entry keeps the id the phone gave it', async () => {
    expect(await save(A, sharedTx({ new_id: ID }))).toBe(ID);
    expect(await one(ID)).toMatchObject({ created_by: A, household_id: H });
    expect(await splits(ID)).toHaveLength(2);
  });
  test('sending it again is refused, so a lost reply never makes a duplicate', async () => {
    await save(A, sharedTx({ new_id: ID }));
    await expect(save(A, sharedTx({ new_id: ID }))).rejects.toThrow(/duplicate key/);
    expect(await splits(ID)).toHaveLength(2);
    expect((await db.query('select 1 from transactions')).rows).toHaveLength(1);
  });
});
