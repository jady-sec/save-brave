import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, test } from 'vitest';
import { addUser, asUser, makeDb } from './harness';

let db: PGlite, A: string, B: string, C: string;

const subscribe = (uid: string, endpoint: string, owner = uid) => asUser(db, uid,
  'insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)', [owner, endpoint, 'key', 'secret']);
const targets = async (uid: string) =>
  (await asUser<{ endpoint: string }>(db, uid, 'select endpoint from partner_push_targets() order by endpoint')).rows.map((r) => r.endpoint);

beforeEach(async () => {
  db = await makeDb();
  [A, B, C] = await Promise.all(['a@t', 'b@t', 'c@t'].map((e) => addUser(db, e)));
  const H = (await db.query<{ id: string }>(`insert into households (name, created_by) values ('H', $1) returning id`, [A])).rows[0].id;
  await db.query('insert into household_members values ($1,$2),($1,$3)', [H, A, B]);
});

describe('push subscriptions', () => {
  test('each person sees and removes only their own devices', async () => {
    await subscribe(A, 'https://push/a1');
    await subscribe(B, 'https://push/b1');
    expect((await asUser(db, A, 'select endpoint from push_subscriptions')).rows).toEqual([{ endpoint: 'https://push/a1' }]);
    await asUser(db, A, 'delete from push_subscriptions');
    expect((await db.query('select endpoint from push_subscriptions order by endpoint')).rows).toEqual([{ endpoint: 'https://push/b1' }]);
  });
  test("I can't register a device for someone else", async () => {
    await expect(subscribe(A, 'https://push/x', B)).rejects.toThrow();
  });
  test('the notify function can reach my partner’s devices only, never mine or a stranger’s', async () => {
    await subscribe(A, 'https://push/a1');
    await subscribe(B, 'https://push/b1');
    await subscribe(B, 'https://push/b2');
    await subscribe(C, 'https://push/c1');
    expect(await targets(A)).toEqual(['https://push/b1', 'https://push/b2']);
    expect(await targets(B)).toEqual(['https://push/a1']);
    expect(await targets(C)).toEqual([]);
    await expect(asUser(db, null, 'select * from partner_push_targets()')).rejects.toThrow(/permission denied/);
  });
  test("dropping a dead device works for my partner's devices only", async () => {
    await subscribe(B, 'https://push/b1');
    await subscribe(C, 'https://push/c1');
    await asUser(db, A, 'select drop_partner_push_target($1)', ['https://push/c1']);
    await asUser(db, A, 'select drop_partner_push_target($1)', ['https://push/b1']);
    expect((await db.query('select endpoint from push_subscriptions')).rows).toEqual([{ endpoint: 'https://push/c1' }]);
  });
  test('the same phone re-subscribing replaces its old entry', async () => {
    await subscribe(A, 'https://push/a1');
    await asUser(db, A, `insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push/a1', 'k2', 's2')
      on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth`, [A]);
    expect((await db.query('select p256dh from push_subscriptions')).rows).toEqual([{ p256dh: 'k2' }]);
  });
});
