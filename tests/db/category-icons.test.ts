import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, expect, test } from 'vitest';
import { addUser, asUser, makeDb } from './harness';

let db: PGlite, A: string, B: string, cat: string;
beforeEach(async () => {
  db = await makeDb();
  [A, B] = await Promise.all(['a@t', 'b@t'].map((e) => addUser(db, e)));
  cat = (await db.query<{ id: string }>(`insert into categories (scope, type, name, owner_id) values ('personal','expense','Food',$1) returning id`, [A])).rows[0].id;
});

test('a category can get an icon from the set, or none', async () => {
  await asUser(db, A, `update categories set icon = 'cart' where id = $1`, [cat]);
  expect((await db.query('select icon from categories')).rows).toEqual([{ icon: 'cart' }]);
  await asUser(db, A, 'update categories set icon = null where id = $1', [cat]);
  await expect(asUser(db, A, `update categories set icon = 'skull' where id = $1`, [cat])).rejects.toThrow();
});

test("the partner can't change my personal category's icon", async () => {
  await asUser(db, B, `update categories set icon = 'gift' where id = $1`, [cat]);
  expect((await db.query('select icon from categories')).rows).toEqual([{ icon: null }]);
});
