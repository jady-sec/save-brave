import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, test } from 'vitest';
import { addUser, asUser, makeDb } from './harness';

let db: PGlite, A: string, B: string, C: string;

const upsert = (uid: string, p: Record<string, unknown>) =>
  asUser(db, uid, `insert into profiles (user_id, display_name, avatar, tone) values ($1, $2, $3, $4)
    on conflict (user_id) do update set display_name = excluded.display_name, avatar = excluded.avatar, tone = excluded.tone`,
  [p.user_id ?? uid, p.display_name ?? 'Josh', p.avatar ?? 'fox', p.tone ?? 0]);
const read = async (uid: string) => (await asUser<{ user_id: string }>(db, uid, 'select user_id from profiles order by user_id')).rows.map((r) => r.user_id);

beforeEach(async () => {
  db = await makeDb();
  [A, B, C] = await Promise.all(['a@t', 'b@t', 'c@t'].map((e) => addUser(db, e)));
  const H = (await db.query<{ id: string }>(`insert into households (name, created_by) values ('H', $1) returning id`, [A])).rows[0].id;
  await db.query('insert into household_members values ($1,$2),($1,$3)', [H, A, B]);
});

describe('profiles', () => {
  test('I can save my profile and change it', async () => {
    await upsert(A, {});
    await upsert(A, { display_name: 'Joshua', avatar: 'panda', tone: 3 });
    expect((await asUser(db, A, 'select display_name, avatar, tone from profiles')).rows).toEqual([{ display_name: 'Joshua', avatar: 'panda', tone: 3 }]);
  });
  test('my partner sees my profile; someone outside the household does not', async () => {
    await upsert(A, {});
    expect(await read(B)).toEqual([A]);
    expect(await read(C)).toEqual([]);
  });
  test("I can't create or change someone else's profile", async () => {
    await expect(upsert(A, { user_id: B })).rejects.toThrow();
    await upsert(B, { display_name: 'Priya' });
    await asUser(db, A, `update profiles set display_name = 'Hacked' where user_id = $1`, [B]);
    expect((await db.query('select display_name from profiles where user_id = $1', [B])).rows).toEqual([{ display_name: 'Priya' }]);
  });
  test('names must be 1–24 characters without edge spaces, and the avatar must be one of the set', async () => {
    await expect(upsert(A, { display_name: '' })).rejects.toThrow();
    await expect(upsert(A, { display_name: ' Josh' })).rejects.toThrow();
    await expect(upsert(A, { display_name: 'x'.repeat(25) })).rejects.toThrow();
    await expect(upsert(A, { avatar: 'dragon' })).rejects.toThrow();
    await expect(upsert(A, { tone: 5 })).rejects.toThrow();
  });
  test('the members list carries each name and avatar (null until set)', async () => {
    await upsert(A, { display_name: 'Josh', avatar: 'tiger', tone: 2 });
    const rows = (await asUser(db, B, 'select user_id, display_name, avatar, tone from household_members_view() order by display_name nulls last')).rows;
    expect(rows).toEqual([
      { user_id: A, display_name: 'Josh', avatar: 'tiger', tone: 2 },
      { user_id: B, display_name: null, avatar: null, tone: null },
    ]);
  });
});
