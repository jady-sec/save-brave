import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { friendlyError, getMe, type Me } from './lib/api';

interface MeState { me: Me | null; error: string | null; refresh: () => Promise<void> }
const Ctx = createContext<MeState | null>(null);

export function MeProvider({ user, children }: { user: { id: string; email?: string }; children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try { setMe(await getMe(user)); setError(null); } catch (e) { setError(friendlyError((e as Error).message)); }
  }, [user]);
  useEffect(() => {
    refresh();
    // Picks up the partner joining (or any other device's change) when the app comes back to the foreground.
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);
  return <Ctx.Provider value={{ me, error, refresh }}>{children}</Ctx.Provider>;
}

export function useMe(): MeState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMe outside MeProvider');
  return v;
}

/** The other member of my household, if they have joined. */
export const partnerOf = (me: Me) => me.members.find((m) => m.user_id !== me.userId) ?? null;
