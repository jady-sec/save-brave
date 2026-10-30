import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, test } from 'vitest';
import { addUser, makeDb } from './harness';

let db: PGlite, a: string, cat: string;

beforeAll(async () => {
  db = await makeDb();
  a = await addUser(db, 'a@test');
  cat = (await db.query<{ id: string }>(
    `insert into categories (scope, type, name, owner_id) values ('personal','expense','Food',$1) returning id`, [a])).rows[0].id;
});

const tx = (fields: Record<string, unknown>) => {
  const row = { type: 'expense', scope: 'personal', paid_by: a, created_by: a, amount_cents: 100, date: '2026-10-01', category_id: cat, ...fields };
  const cols = Object.keys(row);
  return db.query(`insert into transactions (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
};

describe('schema constraints', () => {
  test('a valid personal expense inserts', async () => { await expect(tx({})).resolves.toBeDefined(); });
  test('income cannot be shared', async () => { await expect(tx({ type: 'income', scope: 'shared' })).rejects.toThrow(); });
  test('amount must be positive', async () => { await expect(tx({ amount_cents: 0 })).rejects.toThrow(); });
  test('amount must be an integer', async () => { await expect(tx({ amount_cents: 1.5 })).rejects.toThrow(); });
  test('personal entry cannot carry a household', async () => {
    const h = (await db.query<{ id: string }>(`insert into households (name, created_by) values ('H',$1) returning id`, [a])).rows[0].id;
    await expect(tx({ household_id: h })).rejects.toThrow();
  });
  test('personal entry must be paid by its creator', async () => {
    const b = await addUser(db, 'b@test');
    await expect(tx({ paid_by: b })).rejects.toThrow();
  });
  test('shared category needs a household', async () => {
    await expect(db.query(`insert into categories (scope, type, name) values ('shared','expense','Rent')`)).rejects.toThrow();
  });
});

describe('category names', () => {
  test('a person cannot have two categories with the same name and type', async () => {
    await expect(db.query(`insert into categories (scope, type, name, owner_id) values ('personal','expense','Food',$1)`, [a])).rejects.toThrow(/duplicate|unique/);
  });
  test('the same name is fine for a different type or person', async () => {
    const b = (await db.query<{ id: string }>(`insert into auth.users (email) values ('dup@test') returning id`)).rows[0].id;
    await db.query(`insert into categories (scope, type, name, owner_id) values ('personal','income','Food',$1)`, [a]);
    await db.query(`insert into categories (scope, type, name, owner_id) values ('personal','expense','Food',$1)`, [b]);
  });
  test('a household cannot have two shared categories with the same name', async () => {
    const h = (await db.query<{ id: string }>(`insert into households (name, created_by) values ('H2',$1) returning id`, [a])).rows[0].id;
    await db.query(`insert into categories (scope, type, name, household_id) values ('shared','expense','Rent',$1)`, [h]);
    await expect(db.query(`insert into categories (scope, type, name, household_id) values ('shared','expense','Rent',$1)`, [h])).rejects.toThrow(/duplicate|unique/);
  });
});
