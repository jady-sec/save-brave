import { expect, test } from 'vitest';
import { fetchAll } from './paging';

const source = (n: number) => {
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => { calls.push([from, to]); return { data: Array.from({ length: Math.max(0, Math.min(n, to + 1) - from) }, (_, i) => from + i), error: null }; };
  return { calls, page };
};

test('reads every page until a short one', async () => {
  const s = source(2500);
  expect((await fetchAll(s.page, 1000)).length).toBe(2500);
  expect(s.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
});
test('an exact multiple needs one more (empty) page', async () => {
  const s = source(2000);
  expect((await fetchAll(s.page, 1000)).length).toBe(2000);
  expect(s.calls).toHaveLength(3);
});
test('errors are thrown, not returned as a partial list', async () => {
  await expect(fetchAll(async () => ({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom');
});
