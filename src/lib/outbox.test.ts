import { describe, expect, test } from 'vitest';
import { clearOutbox, discardFailed, dropFromOutbox, enqueue, flushOutbox, overlaySettlements, overlayTx, readOutbox, submit, type Op } from './outbox';
import type { Settlement, Tx } from './types';

const memStorage = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); },
  };
};
const offline = () => Promise.reject(new TypeError('Failed to fetch'));
const ME = { userId: 'u1', householdId: 'h1' };
const txOp = (id: string, over: Partial<Op & { kind: 'tx' }> = {}): Op => ({
  kind: 'tx', id, create: true,
  input: { type: 'expense', scope: 'personal', amount_cents: 500, date: '2026-11-10', category_id: 'c1', note: 'tea' }, ...over,
} as Op);
const settleOp = (id: string, transaction_id: string | null = null): Op => ({
  kind: 'settle', id,
  row: { id, household_id: 'h1', from_user: 'u1', to_user: 'u2', amount_cents: 300, date: '2026-11-10', created_by: 'u1', transaction_id },
});
const tx = (id: string, date: string, extra: Partial<Tx> = {}): Tx => ({
  id, type: 'expense', scope: 'personal', household_id: null, paid_by: 'u1', created_by: 'u1', amount_cents: 100, date,
  category_id: 'c1', note: null, recurring_rule_id: null, splits: [], ...extra,
});

describe('queue', () => {
  test('is kept per person', () => {
    const s = memStorage();
    enqueue('u1', txOp('a'), s);
    expect(readOutbox('u1', s).map((o) => o.id)).toEqual(['a']);
    expect(readOutbox('u2', s)).toEqual([]);
  });
  test('editing a queued new entry stays a create, with the new values', () => {
    const s = memStorage();
    enqueue('u1', txOp('a'), s);
    enqueue('u1', txOp('a', { create: false, input: { ...(txOp('a') as { input: object }).input, amount_cents: 900 } as never }), s);
    const [o] = readOutbox('u1', s);
    expect(readOutbox('u1', s)).toHaveLength(1);
    expect(o.kind === 'tx' && [o.create, o.input.amount_cents]).toEqual([true, 900]);
  });
  test('dropping a queued entry also drops its queued settlement', () => {
    const s = memStorage();
    enqueue('u1', txOp('a'), s); enqueue('u1', settleOp('s1', 'a'), s); enqueue('u1', settleOp('s2'), s);
    dropFromOutbox('u1', 'a', s);
    expect(readOutbox('u1', s).map((o) => o.id)).toEqual(['s2']);
  });
  test('broken storage reads as empty', () => {
    const s = memStorage(); s.setItem('outbox:u1', '{not json');
    expect(readOutbox('u1', s)).toEqual([]);
  });
  test('clearOutbox and discardFailed', () => {
    const s = memStorage();
    enqueue('u1', txOp('a'), s); enqueue('u1', { ...txOp('b'), error: 'nope' }, s);
    discardFailed('u1', s);
    expect(readOutbox('u1', s).map((o) => o.id)).toEqual(['a']);
    clearOutbox('u1', s);
    expect(readOutbox('u1', s)).toEqual([]);
  });
});

describe('flushOutbox', () => {
  test('sends in order and removes what was sent', async () => {
    const s = memStorage(); const seen: string[] = [];
    enqueue('u1', txOp('a'), s); enqueue('u1', settleOp('s1', 'a'), s);
    const sent = await flushOutbox('u1', async (o) => { seen.push(o.id); }, s);
    expect(seen).toEqual(['a', 's1']);
    expect(sent.map((o) => o.id)).toEqual(['a', 's1']);
    expect(readOutbox('u1', s)).toEqual([]);
  });
  test('stops at the first network error and keeps the rest', async () => {
    const s = memStorage();
    enqueue('u1', txOp('a'), s); enqueue('u1', txOp('b'), s);
    let n = 0;
    await flushOutbox('u1', async () => { if (n++ > 0) await offline(); }, s);
    expect(readOutbox('u1', s).map((o) => o.id)).toEqual(['b']);
  });
  test('a server refusal marks that change failed, keeps going, and never retries it', async () => {
    const s = memStorage(); const seen: string[] = [];
    enqueue('u1', txOp('a'), s); enqueue('u1', txOp('b'), s);
    await flushOutbox('u1', async (o) => { seen.push(o.id); if (o.id === 'a') throw new Error('permission denied'); }, s);
    expect(readOutbox('u1', s)).toEqual([expect.objectContaining({ id: 'a', error: 'permission denied' })]);
    await flushOutbox('u1', async (o) => { seen.push(o.id); }, s);
    expect(seen).toEqual(['a', 'b']);
  });
});

describe('submit', () => {
  test('online with nothing waiting: sends straight away', async () => {
    const s = memStorage();
    expect(await submit('u1', txOp('a'), async () => {}, s)).toBe('sent');
    expect(readOutbox('u1', s)).toEqual([]);
  });
  test('offline: queues it', async () => {
    const s = memStorage();
    expect(await submit('u1', txOp('a'), offline, s)).toBe('queued');
    expect(readOutbox('u1', s).map((o) => o.id)).toEqual(['a']);
  });
  test('a server refusal is thrown, not queued', async () => {
    const s = memStorage();
    await expect(submit('u1', txOp('a'), async () => { throw new Error('bad category'); }, s)).rejects.toThrow('bad category');
    expect(readOutbox('u1', s)).toEqual([]);
  });
  test('goes behind changes already waiting, so a settlement never syncs before its expense', async () => {
    const s = memStorage(); const seen: string[] = [];
    enqueue('u1', txOp('a'), s);
    expect(await submit('u1', settleOp('s1', 'a'), async (o) => { seen.push(o.id); }, s)).toBe('sent');
    expect(seen).toEqual(['a', 's1']);
  });
});

describe('overlay', () => {
  test('adds a waiting entry in its month, newest first, marked pending', () => {
    const rows = [tx('x', '2026-11-12'), tx('y', '2026-11-01')];
    const out = overlayTx(rows, [txOp('a'), txOp('b', { input: { ...(txOp('b') as { input: object }).input, date: '2026-10-30' } as never })], ME, { from: '2026-11', to: '2026-11' });
    expect(out.map((t) => t.id)).toEqual(['x', 'a', 'y']);
    expect(out[1]).toMatchObject({ pending: true, created_by: 'u1', paid_by: 'u1', household_id: null, note: 'tea', amount_cents: 500 });
  });
  test('oldest first when asked; a waiting edit replaces the loaded row', () => {
    const rows = [tx('x', '2026-11-01', { created_by: 'u2' }), tx('y', '2026-11-05')];
    const edit = txOp('x', { create: false, input: { type: 'expense', scope: 'shared', amount_cents: 800, date: '2026-11-09', category_id: 'c1', paid_by: 'u2', splits: [{ user_id: 'u1', share_cents: 400 }, { user_id: 'u2', share_cents: 400 }] } } as never);
    const out = overlayTx(rows, [edit], ME, { asc: true });
    expect(out.map((t) => t.id)).toEqual(['y', 'x']);
    expect(out[1]).toMatchObject({ amount_cents: 800, created_by: 'u2', household_id: 'h1', pending: true });
  });
  test('failed changes are left out', () => {
    expect(overlayTx([], [{ ...txOp('a'), error: 'no' }], ME, {})).toEqual([]);
    expect(overlaySettlements([], [{ ...settleOp('s1'), error: 'no' }])).toEqual([]);
  });
  test('waiting settlements join the loaded ones, newest first', () => {
    const loaded: Settlement[] = [{ id: 'old', household_id: 'h1', from_user: 'u1', to_user: 'u2', amount_cents: 1, date: '2026-01-01' }];
    const out = overlaySettlements(loaded, [settleOp('s1', 'a')]);
    expect(out.map((s) => s.id)).toEqual(['s1', 'old']);
    expect(out[0]).toMatchObject({ transaction_id: 'a', pending: true, amount_cents: 300 });
  });
});

test('a change that failed earlier does not hold back the next one', async () => {
  const s = memStorage();
  enqueue('u1', { ...txOp('old'), error: 'refused' }, s);
  await expect(submit('u1', txOp('a'), async () => { throw new Error('bad category'); }, s)).rejects.toThrow('bad category');
});
