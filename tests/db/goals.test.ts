import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, test } from 'vitest';
import { addUser, asUser, makeDb } from './harness';

let db: PGlite, A: string, B: string, C: string, H: string;

const goal = async (uid: string, shared: boolean, name = 'Trip') => (await asUser<{ id: string }>(db, uid,
  `insert into goals (user_id, household_id, name, target_cents) values ($1, $2, $3, 300000) returning id`,
  [shared ? null : uid, shared ? H : null, name])).rows[0].id;
const put = (uid: string, g: string, cents: number, who = uid) => asUser(db, uid,
  'insert into goal_contributions (goal_id, user_id, amount_cents) values ($1, $2, $3)', [g, who, cents]);
const seen = async (uid: string) => (await asUser<{ name: string }>(db, uid, 'select name from goals order by name')).rows.map((r) => r.name);

beforeEach(async () => {
  db = await makeDb();
  [A, B, C] = await Promise.all(['a@t', 'b@t', 'c@t'].map((e) => addUser(db, e)));
  H = (await db.query<{ id: string }>(`insert into households (name, created_by) values ('H', $1) returning id`, [A])).rows[0].id;
  await db.query('insert into household_members values ($1,$2),($1,$3)', [H, A, B]);
});

describe('goals', () => {
  test('a personal goal is private; a shared goal is visible to both partners only', async () => {
    await goal(A, false, 'My bike');
    await goal(A, true, 'Banff');
    expect(await seen(A)).toEqual(['Banff', 'My bike']);
    expect(await seen(B)).toEqual(['Banff']);
    expect(await seen(C)).toEqual([]);
  });
  test('both partners can add to a shared goal, and each sees who put in what', async () => {
    const g = await goal(A, true);
    await put(A, g, 5000);
    await put(B, g, 2500);
    const rows = async (uid: string) => (await asUser<{ amount_cents: number }>(db, uid, 'select amount_cents from goal_contributions order by amount_cents')).rows;
    expect(await rows(A)).toEqual([{ amount_cents: 2500 }, { amount_cents: 5000 }]);
    expect(await rows(C)).toEqual([]);
  });
  test("nobody can add to my personal goal, and nobody can add money in someone else's name", async () => {
    const mine = await goal(A, false);
    await expect(put(B, mine, 100)).rejects.toThrow();
    const shared = await goal(A, true);
    await expect(put(A, shared, 100, B)).rejects.toThrow();
    await expect(put(C, shared, 100)).rejects.toThrow();
  });
  test("my partner can't rename or delete my personal goal, but either of us can edit a shared one", async () => {
    const mine = await goal(A, false, 'Bike');
    await asUser(db, B, `update goals set name = 'Hacked' where id = $1`, [mine]);
    await asUser(db, B, 'delete from goals where id = $1', [mine]);
    expect((await db.query('select name from goals where id = $1', [mine])).rows).toEqual([{ name: 'Bike' }]);
    const shared = await goal(A, true, 'Banff');
    await asUser(db, B, `update goals set name = 'Banff trip' where id = $1`, [shared]);
    expect((await db.query('select name from goals where id = $1', [shared])).rows).toEqual([{ name: 'Banff trip' }]);
  });
  test('a goal can’t be moved into someone else’s household or name', async () => {
    const shared = await goal(A, true);
    const H2 = (await db.query<{ id: string }>(`insert into households (name, created_by) values ('H2', $1) returning id`, [C])).rows[0].id;
    await expect(asUser(db, A, 'update goals set household_id = $1 where id = $2', [H2, shared])).rejects.toThrow();
    await expect(asUser(db, A, 'update goals set household_id = null, user_id = $1 where id = $2', [B, shared])).rejects.toThrow();
  });
  test('target must be positive and the name 1–40 characters', async () => {
    await expect(asUser(db, A, `insert into goals (user_id, name, target_cents) values ($1, 'x', 0)`, [A])).rejects.toThrow();
    await expect(asUser(db, A, `insert into goals (user_id, name, target_cents) values ($1, '', 100)`, [A])).rejects.toThrow();
    await expect(asUser(db, A, `insert into goals (user_id, name, target_cents) values ($1, $2, 100)`, [A, 'x'.repeat(41)])).rejects.toThrow();
  });
  test('taking money out is a negative contribution; zero is rejected', async () => {
    const g = await goal(A, false);
    await put(A, g, 1000);
    await put(A, g, -400);
    await expect(put(A, g, 0)).rejects.toThrow();
    expect((await db.query<{ s: number }>('select sum(amount_cents)::int as s from goal_contributions')).rows[0].s).toBe(600);
  });
});
