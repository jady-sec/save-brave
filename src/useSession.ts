import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { clearCache } from './lib/cache';
import { supabase } from './lib/supabase';

/** undefined while loading, null when signed out. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session), () => setSession(null));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') clearCache(); // any sign-out (expired, other tab): nothing of theirs stays on the device
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}
