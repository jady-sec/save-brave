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
