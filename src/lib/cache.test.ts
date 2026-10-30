import { describe, expect, test } from 'vitest';
import { cached, clearCache, isNetworkError } from './cache';

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe('cached', () => {
  test('returns fresh data and stores it', async () => {
    const s = memStorage();
    expect(await cached('u1:tx', async () => [1, 2], s)).toEqual({ data: [1, 2], stale: false });
    expect(s.getItem('cache:u1:tx')).toBe('[1,2]');
  });
  test('on a network error returns the last good copy marked stale', async () => {
    const s = memStorage();
    await cached('u1:tx', async () => [1], s);
    expect(await cached('u1:tx', async () => { throw new Error('TypeError: Failed to fetch'); }, s)).toEqual({ data: [1], stale: true });
  });
  test('on a network error with nothing cached, rethrows', async () => {
    await expect(cached('u1:tx', async () => { throw new Error('Failed to fetch'); }, memStorage())).rejects.toThrow(/fetch/);
  });
  test('a server error is never hidden behind cached data', async () => {
    const s = memStorage();
    await cached('u1:tx', async () => [1], s);
    await expect(cached('u1:tx', async () => { throw new Error('permission denied'); }, s)).rejects.toThrow(/permission/);
  });
  test('works when storage is unavailable', async () => {
    const broken = { ...memStorage(), getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as Storage;
    expect(await cached('k', async () => 5, broken)).toEqual({ data: 5, stale: false });
  });
  test('clearCache removes only cache entries', async () => {
    const s = memStorage();
    s.setItem('pendingJoin', 'x');
    await cached('u1:a', async () => 1, s);
    await cached('u2:b', async () => 2, s);
    clearCache(s);
    expect([s.getItem('cache:u1:a'), s.getItem('cache:u2:b'), s.getItem('pendingJoin')]).toEqual([null, null, 'x']);
  });
});

test.each([['TypeError: Failed to fetch', true], ['Load failed', true], ['NetworkError when attempting to fetch resource.', true], ['permission denied', false]])(
  'isNetworkError(%j) = %s', (msg, expected) => expect(isNetworkError(new Error(msg))).toBe(expected));
