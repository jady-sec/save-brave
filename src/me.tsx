import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ensureDefaultCategories, friendlyError, getMe, listCategories, sendOp, type Me } from './lib/api';
import { cached } from './lib/cache';
import { flushOutbox, readOutbox, subscribeOutbox, type Op } from './lib/outbox';
import { supabase } from './lib/supabase';
import type { Category, Tx } from './lib/types';

interface MeState {
  me: Me | null;
  categories: Category[];
  error: string | null;
  /** true when showing last-loaded data because the server can't be reached */
  stale: boolean;
  refresh: () => Promise<void>;
  /** bumps after any save so screens refetch */
  version: number;
  changed: () => void;
  /** opens the Add sheet, or the edit sheet for an existing entry */
  openEntry: (tx?: Tx) => void;
  /** changes made offline, waiting to sync (see lib/outbox) */
  outbox: Op[];
  /** sends what is waiting now (pull-to-refresh) */
  sync: () => Promise<void>;
}
const Ctx = createContext<MeState | null>(null);

export function MeProvider({ user, openEntry, children }: { user: { id: string; email?: string }; openEntry: (tx?: Tx) => void; children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [version, setVersion] = useState(0);
  const changed = useCallback(() => setVersion((v) => v + 1), []);
  const [outbox, setOutbox] = useState(() => readOutbox(user.id));
  useEffect(() => subscribeOutbox(() => setOutbox(readOutbox(user.id))), [user.id]);
  // Sends what was saved offline. getSession first: it renews a token that expired while the phone was offline.
  const sync = useCallback(async () => {
    if (navigator.onLine === false || !readOutbox(user.id).some((o) => !o.error)) return;
    await supabase.auth.getSession().catch(() => {});
    await flushOutbox(user.id, sendOp);
    changed(); // sent or refused: either way the lists change
  }, [user.id, changed]);
  useEffect(() => {
    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [sync]);

  const refresh = useCallback(async () => {
    try {
      const m = await cached(`${user.id}:me`, () => getMe(user));
      let c = await cached(`${user.id}:categories`, listCategories);
      if (!m.stale && !c.stale && (await ensureDefaultCategories(m.data, c.data))) c = await cached(`${user.id}:categories`, listCategories);
      setMe(m.data); setCategories(c.data); setStale(m.stale || c.stale); setError(null);
    } catch (e) {
      setError(friendlyError((e as Error).message));
    }
  }, [user]);

  useEffect(() => {
    refresh();
    // Picks up the partner joining (or any other device's change) when the app comes back to the foreground.
    const onVisible = () => { if (document.visibilityState === 'visible') { sync(); refresh(); changed(); } };
    document.addEventListener('visibilitychange', onVisible);
    // Live updates (migration 0011): any change the database lets this person see reloads the screens. A save
    // touches several rows at once, so wait for the burst to settle.
    let timer = 0;
    const channel = supabase.channel('changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        clearTimeout(timer);
        timer = window.setTimeout(() => { refresh(); changed(); }, 500);
      })
      .subscribe();
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [refresh, changed, sync]);

  return <Ctx.Provider value={{ me, categories, error, stale, refresh, version, changed, openEntry, outbox, sync }}>{children}</Ctx.Provider>;
}

export function useMe(): MeState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMe outside MeProvider');
  return v;
}

/** Reloads everything from the server; null outside the signed-in app (Login). */
export function useReload(): (() => Promise<void>) | null {
  const v = useContext(Ctx);
  if (!v) return null;
  return async () => { await v.sync(); await v.refresh(); v.changed(); };
}

/** The other member of my household, if they have joined. */
export const partnerOf = (me: Me) => me.members.find((m) => m.user_id !== me.userId) ?? null;
