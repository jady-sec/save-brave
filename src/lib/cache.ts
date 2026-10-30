// Last-loaded data kept on the device so screens still show something offline (v1 is view-only offline).
const PREFIX = 'cache:';
const defaultStorage = () => (typeof localStorage === 'undefined' ? null : localStorage);

export const isNetworkError = (e: unknown) => /failed to fetch|load failed|networkerror|network request failed/i.test(String((e as Error)?.message ?? e));

export async function cached<T>(key: string, fetcher: () => Promise<T>, storage: Storage | null = defaultStorage()): Promise<{ data: T; stale: boolean }> {
  try {
    const data = await fetcher();
    try { storage?.setItem(PREFIX + key, JSON.stringify(data)); } catch { /* quota or private mode */ }
    return { data, stale: false };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    let saved: string | null = null;
    try { saved = storage?.getItem(PREFIX + key) ?? null; } catch { /* unavailable */ }
    if (saved === null) throw e;
    return { data: JSON.parse(saved) as T, stale: true };
  }
}

/** Removes every cached copy (call on sign-out so the next person on this device sees nothing). */
export function clearCache(storage: Storage | null = defaultStorage()) {
  if (!storage) return;
  try {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => !!k?.startsWith(PREFIX));
    keys.forEach((k) => storage.removeItem(k));
  } catch { /* unavailable */ }
}
