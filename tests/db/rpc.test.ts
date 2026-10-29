import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, test } from 'vitest';
import { addUser, asUser, makeDb } from './harness';

let db: PGlite, A: string, B: string, C: string, D: string;

const call = async <T>(uid: string | null, sql: string, params: unknown[] = []) =>
  (await asUser<{ r: T }>(db, uid, `select ${sql} as r`, params)).rows[0].r;
const memberOf = async (uid: string) =>
  (await db.query<{ household_id: string }>('select household_id from household_members where user_id = $1', [uid])).rows[0]?.household_id;

beforeEach(async () => {
  db = await makeDb();
  [A, B, C, D] = await Promise.all(['a@t', 'b@t', 'c@t', 'd@t'].map((e) => addUser(db, e)));
});

describe('create_household', () => {
  test('creates a household with the caller as its only member', async () => {
    const h = await call<string>(A, `create_household('Home')`);
    expect(await memberOf(A)).toBe(h);
  });
  test('a user already in a household cannot create another', async () => {
    await call(A, `create_household('Home')`);
    await expect(call(A, `create_household('Second')`)).rejects.toThrow(/already in a household/);
  });
  test('anon cannot call it', async () => {
    await expect(call(null, `create_household('Home')`)).rejects.toThrow(/permission denied/);
  });
});

describe('household_members_view', () => {
  test("members see each other's emails; outsiders see only their own household", async () => {
    const H = await call<string>(A, `create_household('Home')`);
    await db.query('insert into household_members (household_id, user_id) values ($1, $2)', [H, B]);
    await call(C, `create_household('Other')`);
    const rows = async (uid: string) =>
      (await asUser<{ user_id: string; email: string }>(db, uid, 'select * from household_members_view() order by email')).rows;
    expect(await rows(B)).toEqual([{ user_id: A, email: 'a@t' }, { user_id: B, email: 'b@t' }]);
    expect(await rows(C)).toEqual([{ user_id: C, email: 'c@t' }]);
    expect(await rows(D)).toEqual([]);
    await expect(asUser(db, null, 'select * from household_members_view()')).rejects.toThrow(/permission denied/);
  });
});

describe('invites', () => {
  let H: string, code: string;
  beforeEach(async () => {
    H = await call<string>(A, `create_household('Home')`);
    code = await call<string>(A, 'create_invite()');
  });

  test('code is 8 characters from an unambiguous alphabet and is stored only as a hash', async () => {
    expect(code).toMatch(/^[a-hjkmnp-z2-9]{8}$/);
    const rows = await db.query<{ code_hash: string }>('select code_hash from invites');
    expect(rows.rows[0].code_hash).not.toContain(code);
    expect(rows.rows[0].code_hash).toMatch(/^[0-9a-f]{64}$/);
  });
  test('expires 48 hours after creation', async () => {
    const r = await db.query<{ h: number }>(`select round(extract(epoch from expires_at - now()) / 3600)::int as h from invites`);
    expect(r.rows[0].h).toBe(48);
  });
  test('redeeming joins the household', async () => {
    expect(await call<string>(D, 'redeem_invite($1)', [code])).toBe(H);
    expect(await memberOf(D)).toBe(H);
  });
  test('input is trimmed and case-insensitive', async () => {
    expect(await call<string>(D, 'redeem_invite($1)', [`  ${code.toUpperCase()} `])).toBe(H);
  });
  test('a used code cannot be reused, even by someone else', async () => {
    await call(D, 'redeem_invite($1)', [code]);
    expect(await call(B, 'redeem_invite($1)', [code])).toBeNull();
  });
  test('an expired code is rejected', async () => {
    await db.query(`update invites set expires_at = now() - interval '1 second'`);
    expect(await call(D, 'redeem_invite($1)', [code])).toBeNull();
    expect(await memberOf(D)).toBeUndefined();
  });
  test('a wrong code is rejected', async () => {
    expect(await call(D, 'redeem_invite($1)', ['zzzzzzzz'])).toBeNull();
  });
  test('a new invite cancels the previous unused one', async () => {
    const second = await call<string>(A, 'create_invite()');
    expect(await call(D, 'redeem_invite($1)', [code])).toBeNull();
    expect(await call<string>(D, 'redeem_invite($1)', [second])).toBe(H);
  });
  test('a full household rejects a third member', async () => {
    await db.query('insert into household_members (household_id, user_id) values ($1, $2)', [H, B]);
    await expect(call(D, 'redeem_invite($1)', [code])).rejects.toThrow(/household is full/);
  });
  test('a full household cannot create invites', async () => {
    await call(D, 'redeem_invite($1)', [code]);
    await expect(call(A, 'create_invite()')).rejects.toThrow(/household is full/);
  });
  test('someone already in a household cannot redeem', async () => {
    await call(C, `create_household('Other')`);
    await expect(call(C, 'redeem_invite($1)', [code])).rejects.toThrow(/already in a household/);
  });
  test('after 5 wrong codes in an hour, even a right code is refused', async () => {
    for (let i = 0; i < 5; i++) expect(await call(D, 'redeem_invite($1)', [`wrong${i}xx`])).toBeNull();
    await expect(call(D, 'redeem_invite($1)', [code])).rejects.toThrow(/too many attempts/);
    expect(await memberOf(D)).toBeUndefined();
  });
  test('attempt records are not readable by users', async () => {
    await call(D, 'redeem_invite($1)', ['wrongxxx']);
    await expect(asUser(db, D, 'select * from invite_attempts')).rejects.toThrow(/permission denied/);
  });
  test('only members can create invites', async () => {
    await expect(call(D, 'create_invite()')).rejects.toThrow(/not in a household/);
  });
});
