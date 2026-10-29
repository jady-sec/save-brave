import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, test } from 'vitest';
import { addUser, asUser, makeDb } from './harness';

const TABLES = ['households', 'household_members', 'invites', 'categories', 'recurring_rules', 'transactions',
  'transaction_splits', 'settlements', 'monthly_plans', 'category_limits'];

let db: PGlite;
let A: string, B: string, C: string, D: string, H1: string, H2: string;
const ids: Record<string, string> = {};

const ins = async (table: string, row: Record<string, unknown>) => {
  const cols = Object.keys(row);
  const r = await db.query<{ id?: string }>(
    `insert into ${table} (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) returning *`, Object.values(row));
  return r.rows[0].id as string;
};
const count = async (uid: string | null, sql: string, params: unknown[] = []) =>
  (await asUser<{ n: number }>(db, uid, `select count(*)::int as n from ${sql}`, params)).rows[0].n;
const affected = async (uid: string, sql: string, params: unknown[] = []) => (await asUser(db, uid, sql, params)).affectedRows;

beforeAll(async () => {
  db = await makeDb();
  [A, B, C, D] = await Promise.all(['a@t', 'b@t', 'c@t', 'd@t'].map((e) => addUser(db, e)));
  H1 = await ins('households', { name: 'H1', created_by: A });
  H2 = await ins('households', { name: 'H2', created_by: C });
  await db.query('insert into household_members (household_id, user_id) values ($1,$2),($1,$3),($4,$5)', [H1, A, B, H2, C]);

  // A's private data
  ids.catA = await ins('categories', { scope: 'personal', type: 'expense', name: 'Fun', owner_id: A });
  ids.catAi = await ins('categories', { scope: 'personal', type: 'income', name: 'Salary', owner_id: A });
  ids.txA = await ins('transactions', { type: 'expense', scope: 'personal', paid_by: A, created_by: A, amount_cents: 1000, date: '2026-10-01', category_id: ids.catA });
  ids.incA = await ins('transactions', { type: 'income', scope: 'personal', paid_by: A, created_by: A, amount_cents: 500000, date: '2026-10-01', category_id: ids.catAi });
  ids.planA = await ins('monthly_plans', { user_id: A, month: '2026-10', expected_income_cents: 500000, savings_target_cents: 100000 });
  await db.query('insert into category_limits values ($1,$2,5000)', [ids.planA, ids.catA]);
  ids.ruleA = await ins('recurring_rules', { type: 'income', scope: 'personal', owner_id: A, paid_by: A, amount_cents: 500000, category_id: ids.catAi, day_of_month: 1, start_date: '2026-01-01' });
  // B's private data
  ids.catB = await ins('categories', { scope: 'personal', type: 'expense', name: 'Gym', owner_id: B });
  ids.txB = await ins('transactions', { type: 'expense', scope: 'personal', paid_by: B, created_by: B, amount_cents: 2000, date: '2026-10-02', category_id: ids.catB });

  // H1 shared data
  ids.cat1 = await ins('categories', { scope: 'shared', type: 'expense', name: 'Rent', household_id: H1 });
  ids.tx1 = await ins('transactions', { type: 'expense', scope: 'shared', household_id: H1, paid_by: A, created_by: A, amount_cents: 200001, date: '2026-10-01', category_id: ids.cat1 });
  ids.tx1b = await ins('transactions', { type: 'expense', scope: 'shared', household_id: H1, paid_by: B, created_by: B, amount_cents: 300, date: '2026-10-03', category_id: ids.cat1 });
  await db.query('insert into transaction_splits values ($1,$2,100001),($1,$3,100000)', [ids.tx1, A, B]);
  ids.set1 = await ins('settlements', { household_id: H1, from_user: B, to_user: A, amount_cents: 5000, date: '2026-10-05', created_by: B });
  ids.plan1 = await ins('monthly_plans', { household_id: H1, month: '2026-10', expected_income_cents: 0, savings_target_cents: 0 });
  await db.query('insert into category_limits values ($1,$2,250000)', [ids.plan1, ids.cat1]);
  ids.rule1 = await ins('recurring_rules', { type: 'expense', scope: 'shared', owner_id: A, household_id: H1, paid_by: A, amount_cents: 200001, category_id: ids.cat1, day_of_month: 1, start_date: '2026-01-01' });
  ids.inv1 = await ins('invites', { household_id: H1, code_hash: 'x', created_by: A, expires_at: '2099-01-01' });

  // H2 shared data
  ids.cat2 = await ins('categories', { scope: 'shared', type: 'expense', name: 'Food', household_id: H2 });
  ids.tx2 = await ins('transactions', { type: 'expense', scope: 'shared', household_id: H2, paid_by: C, created_by: C, amount_cents: 700, date: '2026-10-01', category_id: ids.cat2 });
  await db.query('insert into transaction_splits values ($1,$2,700)', [ids.tx2, C]);
});

describe("partner cannot read the other's private data", () => {
  test("B sees none of A's personal transactions", async () => {
    expect(await count(B, `transactions where created_by = $1 and scope = 'personal'`, [A])).toBe(0);
  });
  test("B sees none of A's income", async () => {
    expect(await count(B, `transactions where type = 'income'`)).toBe(0);
  });
  test("B sees none of A's plans or limits", async () => {
    expect(await count(B, 'monthly_plans where user_id = $1', [A])).toBe(0);
    expect(await count(B, 'category_limits where plan_id = $1', [ids.planA])).toBe(0);
  });
  test("B sees none of A's personal categories or recurring rules", async () => {
    expect(await count(B, 'categories where owner_id = $1', [A])).toBe(0);
    expect(await count(B, `recurring_rules where scope = 'personal' and owner_id = $1`, [A])).toBe(0);
  });
  test('A sees exactly own personal rows', async () => {
    expect(await count(A, `transactions where scope = 'personal'`)).toBe(2);
    expect(await count(A, `categories where scope = 'personal'`)).toBe(2);
  });
});

describe('both members read shared rows of their household', () => {
  test.each([['A'], ['B']])('%s sees H1 shared data', async (who) => {
    const u = who === 'A' ? A : B;
    expect(await count(u, `transactions where scope = 'shared'`)).toBe(2);
    expect(await count(u, 'transaction_splits where transaction_id = $1', [ids.tx1])).toBe(2);
    expect(await count(u, 'settlements')).toBe(1);
    expect(await count(u, 'monthly_plans where household_id = $1', [H1])).toBe(1);
    expect(await count(u, 'category_limits where plan_id = $1', [ids.plan1])).toBe(1);
    expect(await count(u, `categories where scope = 'shared'`)).toBe(1);
    expect(await count(u, `recurring_rules where scope = 'shared'`)).toBe(1);
    expect(await count(u, 'household_members')).toBe(2);
    expect(await count(u, 'households')).toBe(1);
  });
});

describe('other households and non-members see nothing', () => {
  test('C sees nothing from H1', async () => {
    expect(await count(C, 'households where id = $1', [H1])).toBe(0);
    expect(await count(C, 'household_members where household_id = $1', [H1])).toBe(0);
    expect(await count(C, 'transactions where household_id = $1 or created_by in ($2, $3)', [H1, A, B])).toBe(0);
    expect(await count(C, 'transaction_splits where user_id in ($1, $2)', [A, B])).toBe(0);
    expect(await count(C, 'settlements')).toBe(0);
    expect(await count(C, 'monthly_plans where household_id = $1 or user_id = $2', [H1, A])).toBe(0);
    expect(await count(C, 'categories where household_id = $1 or owner_id in ($2, $3)', [H1, A, B])).toBe(0);
    expect(await count(C, 'recurring_rules where household_id = $1 or owner_id = $2', [H1, A])).toBe(0);
  });
  test('A sees nothing from H2', async () => {
    expect(await count(A, 'transactions where household_id = $1', [H2])).toBe(0);
    expect(await count(A, 'transaction_splits where transaction_id = $1', [ids.tx2])).toBe(0);
    expect(await count(A, 'categories where household_id = $1', [H2])).toBe(0);
  });
  test.each(TABLES)('non-member D sees no rows in %s', async (t) => {
    expect(await count(D, t)).toBe(0);
  });
  test.each(TABLES)('anon has no access at all to %s', async (t) => {
    await expect(count(null, t)).rejects.toThrow(/permission denied/);
  });
});

describe('writes are confined the same way', () => {
  test("B cannot update or delete A's personal entry", async () => {
    expect(await affected(B, `update transactions set note = 'x' where id = $1`, [ids.txA])).toBe(0);
    expect(await affected(B, 'delete from transactions where id = $1', [ids.txA])).toBe(0);
  });
  test('B cannot create a personal entry as A', async () => {
    await expect(asUser(db, B, `insert into transactions (type, scope, paid_by, created_by, amount_cents, date, category_id)
      values ('expense','personal',$1,$1,100,'2026-10-01',$2)`, [A, ids.catA])).rejects.toThrow();
  });
  test("B cannot attach a split to A's personal entry", async () => {
    await expect(asUser(db, B, 'insert into transaction_splits values ($1,$2,1)', [ids.txA, B])).rejects.toThrow();
  });
  test('either member can edit a shared entry; outsiders cannot', async () => {
    expect(await affected(B, `update transactions set note = 'edited by B' where id = $1`, [ids.tx1])).toBe(1);
    expect(await affected(C, `update transactions set note = 'x' where id = $1`, [ids.tx1])).toBe(0);
    expect(await affected(C, 'delete from transactions where id = $1', [ids.tx1b])).toBe(0);
    expect(await affected(A, 'delete from transactions where id = $1', [ids.tx1b])).toBe(1); // created by B
  });
  test('nobody can add themselves to a household directly', async () => {
    await expect(asUser(db, D, 'insert into household_members (household_id, user_id) values ($1,$2)', [H1, D])).rejects.toThrow();
    await expect(asUser(db, D, `insert into households (name, created_by) values ('x',$1)`, [D])).rejects.toThrow();
  });
  test('outsiders cannot write shared rows into another household', async () => {
    await expect(asUser(db, C, `insert into transactions (type, scope, household_id, paid_by, created_by, amount_cents, date, category_id)
      values ('expense','shared',$1,$2,$2,100,'2026-10-01',$3)`, [H1, C, ids.cat1])).rejects.toThrow();
    await expect(asUser(db, C, `insert into settlements (household_id, from_user, to_user, amount_cents, date, created_by)
      values ($1,$2,$3,100,'2026-10-01',$2)`, [H1, C, A])).rejects.toThrow();
    await expect(asUser(db, C, `insert into categories (scope, type, name, household_id) values ('shared','expense','x',$1)`, [H1])).rejects.toThrow();
  });
  test("a member cannot record a settlement on the partner's behalf", async () => {
    await expect(asUser(db, A, `insert into settlements (household_id, from_user, to_user, amount_cents, date, created_by)
      values ($1,$2,$3,100,'2026-10-01',$3)`, [H1, B, A])).rejects.toThrow();
  });
});

describe('rows cannot be moved or pointed at data they should not touch', () => {
  const sharedTx = (uid: string, over: Record<string, unknown> = {}) => {
    const row = { type: 'expense', scope: 'shared', household_id: H1, paid_by: uid, created_by: uid, amount_cents: 100, date: '2026-10-09', category_id: ids.cat1, ...over };
    const cols = Object.keys(row);
    return asUser(db, uid, `insert into transactions (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) returning id`, Object.values(row));
  };
  test("B cannot turn A's shared entry into B's personal entry", async () => {
    await expect(asUser(db, B, `update transactions set scope = 'personal', household_id = null, created_by = $2, paid_by = $2 where id = $1`,
      [ids.tx1, B])).rejects.toThrow(/cannot change/);
    expect(await count(A, 'transactions where id = $1', [ids.tx1])).toBe(1);
  });
  test('the creator of a shared entry cannot be rewritten', async () => {
    await expect(asUser(db, B, 'update transactions set created_by = $2 where id = $1', [ids.tx1, B])).rejects.toThrow(/cannot change/);
  });
  test('A cannot move a personal entry into the household by update', async () => {
    await expect(asUser(db, A, `update transactions set scope = 'shared', household_id = $2 where id = $1`, [ids.txA, H1])).rejects.toThrow(/cannot change/);
  });
  test('a shared entry must be paid by a household member', async () => {
    await expect(sharedTx(B, { paid_by: C })).rejects.toThrow(/not a household member/);
  });
  test('a shared entry cannot use a personal category', async () => {
    await expect(sharedTx(A, { category_id: ids.catA })).rejects.toThrow(/category/);
  });
  test("a personal entry cannot use someone else's or a shared category", async () => {
    await expect(asUser(db, A, `insert into transactions (type, scope, paid_by, created_by, amount_cents, date, category_id)
      values ('expense','personal',$1,$1,100,'2026-10-01',$2)`, [A, ids.cat1])).rejects.toThrow(/category/);
  });
  test('the category type must match the entry type', async () => {
    await expect(asUser(db, A, `insert into transactions (type, scope, paid_by, created_by, amount_cents, date, category_id)
      values ('expense','personal',$1,$1,100,'2026-10-01',$2)`, [A, ids.catAi])).rejects.toThrow(/category/);
  });
  test("a shared entry cannot claim A's personal recurring rule", async () => {
    await expect(sharedTx(B, { recurring_rule_id: ids.ruleA })).rejects.toThrow(/recurring rule/);
  });
  test('splits can only name household members', async () => {
    await expect(asUser(db, A, 'insert into transaction_splits values ($1,$2,1)', [ids.tx1, C])).rejects.toThrow(/not a household member/);
  });
  test('a household limit cannot point at a personal category', async () => {
    await expect(asUser(db, A, 'insert into category_limits values ($1,$2,100)', [ids.plan1, ids.catA])).rejects.toThrow(/category/);
  });
  test("B cannot turn a shared category or the household plan into B's own", async () => {
    await expect(asUser(db, B, `update categories set scope = 'personal', household_id = null, owner_id = $2 where id = $1`,
      [ids.cat1, B])).rejects.toThrow(/cannot change/);
    await expect(asUser(db, B, 'update monthly_plans set household_id = null, user_id = $2 where id = $1',
      [ids.plan1, B])).rejects.toThrow(/cannot change/);
  });
  test("B cannot turn a shared recurring rule into B's personal rule", async () => {
    await expect(asUser(db, B, `update recurring_rules set scope = 'personal', household_id = null, owner_id = $2, paid_by = $2 where id = $1`,
      [ids.rule1, B])).rejects.toThrow(/cannot change/);
  });
  test('a shared recurring rule must be paid by a member and use a shared category', async () => {
    await expect(asUser(db, A, `insert into recurring_rules (type, scope, owner_id, household_id, paid_by, amount_cents, category_id, day_of_month, start_date)
      values ('expense','shared',$1,$2,$3,100,$4,1,'2026-01-01')`, [A, H1, C, ids.cat1])).rejects.toThrow(/not a household member/);
    await expect(asUser(db, A, `insert into recurring_rules (type, scope, owner_id, household_id, paid_by, amount_cents, category_id, day_of_month, start_date)
      values ('expense','shared',$1,$2,$1,100,$3,1,'2026-01-01')`, [A, H1, ids.catA])).rejects.toThrow(/category/);
  });
});

describe('invites', () => {
  test('only the creator can read an invite', async () => {
    expect(await count(A, 'invites')).toBe(1);
    expect(await count(B, 'invites')).toBe(0);
    expect(await count(D, 'invites')).toBe(0);
  });
  test('invites cannot be written directly', async () => {
    await expect(asUser(db, A, `update invites set expires_at = '2100-01-01' where id = $1`, [ids.inv1])).resolves.toMatchObject({ affectedRows: 0 });
    await expect(asUser(db, D, `insert into invites (household_id, code_hash, created_by, expires_at) values ($1,'y',$2,'2099-01-01')`, [H1, D])).rejects.toThrow();
  });
});

test('anon holds no privilege on any public table or function', async () => {
  const t = await db.query(`select relname from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','v')
    and (has_table_privilege('anon', oid, 'select') or has_table_privilege('anon', oid, 'insert')
      or has_table_privilege('anon', oid, 'update') or has_table_privilege('anon', oid, 'delete'))`);
  const f = await db.query(`select proname from pg_proc where pronamespace = 'public'::regnamespace and has_function_privilege('anon', oid, 'execute')`);
  expect([...t.rows, ...f.rows]).toEqual([]);
});

test('tables and functions added later are not granted to anon by default', async () => {
  await db.exec(`create table public.future_t (x int); create function public.future_f() returns int language sql as 'select 1';`);
  const r = await db.query<{ t: boolean; f: boolean }>(
    `select has_table_privilege('anon', 'public.future_t', 'select') as t, has_function_privilege('anon', 'public.future_f()', 'execute') as f`);
  await db.exec('drop table public.future_t; drop function public.future_f();');
  expect(r.rows[0]).toEqual({ t: false, f: false });
});

test('every public table has RLS enabled', async () => {
  const r = await db.query<{ relname: string }>(
    `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`);
  expect(r.rows).toEqual([]);
});
