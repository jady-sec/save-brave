import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { partnerOf, useMe } from '../me';
import { setPendingJoin } from './Household';

export function Settings() {
  const { me } = useMe();
  if (!me) return null;
  const partner = partnerOf(me);
  return (
    <main className="screen">
      <h1>Settings</h1>
      <section className="stack section">
        <h2>Household</h2>
        {me.householdId ? (
          <p>{me.householdName} · {partner ? `with ${partner.email}` : 'waiting for your partner'}</p>
        ) : (
          <p className="muted">Not set up yet.</p>
        )}
        <Link className="btn" to="/household">{me.householdId && !partner ? 'Invite partner' : me.householdId ? 'View household' : 'Set up household'}</Link>
      </section>
      <section className="stack section">
        <h2>Account</h2>
        <p className="muted">Signed in as {me.email}</p>
        <button type="button" className="btn" onClick={() => { setPendingJoin(null); supabase.auth.signOut(); }}>Sign out</button>
      </section>
    </main>
  );
}
