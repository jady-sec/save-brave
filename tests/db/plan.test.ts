import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, test } from 'vitest';
import { addUser, asUser, makeDb } from './harness';

let db: PGlite, A: string, B: string, H: string, catA: string, catB: string, shared: string;

const save = async (uid: string, p: Record<string, unknown>) =>
  (await asUser<{ id: string }>(db, uid, 'select save_plan($1::jsonb) as id', [JSON.stringify(p)])).rows[0].id;
const limits = async (id: string) =>
  (await db.query<{ category_id: string; limit_cents: number }>('select category_id, limit_cents from category_limits where plan_id = $1 order by limit_cents', [id])).rows;
const visible = async (uid: string) => (await asUser(db, uid, 'select id from monthly_plans')).rows.length;
const mine = (over: Record<string, unknown> = {}) =>
  ({ owner: 'me', month: '2026-10', expected_income_cents: 500000, savings_target_cents: 100000, limits: [{ category_id: catA, limit_cents: 40000 }], ...over });

beforeEach(async () => {
  db = await makeDb();
  [A, B] = await Promise.all(['a@t', 'b@t'].map((e) => addUser(db, e)));
  H = (await db.query<{ id: string }>(`insert into households (name, created_by) values ('H', $1) returning id`, [A])).rows[0].id;
  await db.query('insert into household_members values ($1,$2),($1,$3)', [H, A, B]);
  const cat = async (sql: string, p: unknown[]) => (await db.query<{ id: string }>(sql + ' returning id', p)).rows[0].id;
  catA = await cat(`insert into categories (scope, type, name, owner_id) values ('personal','expense','Fun',$1)`, [A]);
  catB = await cat(`insert into categories (scope, type, name, owner_id) values ('personal','expense','Gym',$1)`, [B]);
  shared = await cat(`insert into categories (scope, type, name, household_id) values ('shared','expense','Rent',$1)`, [H]);
});

describe('save_plan', () => {
  test('saves my plan and its limits', async () => {
    const id = await save(A, mine());
    expect(await limits(id)).toEqual([{ category_id: catA, limit_cents: 40000 }]);
    expect((await db.query('select user_id, household_id, expected_income_cents from monthly_plans where id = $1', [id])).rows[0])
      .toEqual({ user_id: A, household_id: null, expected_income_cents: 500000 });
  });
  test('saving the same month again updates the row and replaces its limits', async () => {
    const id = await save(A, mine());
    expect(await save(A, mine({ savings_target_cents: 1, limits: [] }))).toBe(id);
    expect(await limits(id)).toEqual([]);
  });
  test('my plan is private; the household plan is visible to both', async () => {
    await save(A, mine());
    expect(await visible(B)).toBe(0);
    await save(A, { owner: 'household', month: '2026-10', expected_income_cents: 0, savings_target_cents: 0, limits: [{ category_id: shared, limit_cents: 200000 }] });
    expect(await visible(B)).toBe(1);
  });
  test("cannot put a limit on the partner's personal category", async () => {
    await expect(save(A, mine({ limits: [{ category_id: catB, limit_cents: 1 }] }))).rejects.toThrow(/category/);
  });
  test('a household plan cannot limit a personal category', async () => {
    await expect(save(A, { owner: 'household', month: '2026-10', expected_income_cents: 0, savings_target_cents: 0,
      limits: [{ category_id: catA, limit_cents: 1 }] })).rejects.toThrow(/category/);
  });
  test('a failed save leaves the earlier limits intact', async () => {
    const id = await save(A, mine());
    await expect(save(A, mine({ limits: [{ category_id: catA, limit_cents: -5 }] }))).rejects.toThrow();
    expect(await limits(id)).toEqual([{ category_id: catA, limit_cents: 40000 }]);
  });
  test('a bad month is rejected', async () => {
    await expect(save(A, mine({ month: '2026-13' }))).rejects.toThrow();
  });
});
