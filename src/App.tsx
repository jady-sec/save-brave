import { useCallback, useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Screen } from './components/Screen';
import { Splash } from './components/Splash';
import { BottomNav } from './components/BottomNav';
import { MeProvider, useMe } from './me';
import { AddSheet } from './screens/AddSheet';
import { Goals } from './screens/Goals';
import { History } from './screens/History';
import { Household, pendingJoin, setPendingJoin } from './screens/Household';
import { Login } from './screens/Login';
import { Balance } from './screens/Balance';
import { Overview } from './screens/Overview';
import { Plan } from './screens/Plan';
import { Recurring } from './screens/Recurring';
import { Settings } from './screens/Settings';
import { Transactions } from './screens/Transactions';
import { friendlyError, runRecurring } from './lib/api';
import { todayLocal } from './lib/month';
import type { Tx } from './lib/types';
import { useSession } from './useSession';

function Placeholder({ title }: { title: string }) {
  return (
    <Screen title={title}>
      <p className="muted">Coming soon.</p>
    </Screen>
  );
}

function More() {
  const items = [['/goals', 'Goals'], ['/plan', 'Plan'], ['/recurring', 'Recurring'], ['/history', 'History'], ['/settings', 'Settings']];
  return (
    <Screen title="More">
      <ul className="list">
        {items.map(([to, label]) => <li key={to}><Link to={to}>{label}</Link></li>)}
      </ul>
    </Screen>
  );
}

function Shell({ sheet, closeSheet }: { sheet: { editing?: Tx } | null; closeSheet: () => void }) {
  const { me, error, refresh, openEntry, stale, changed, version } = useMe();
  const [skipped, setSkipped] = useState(false);
  const [ignoredJoin, setIgnoredJoin] = useState(false);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const ready = !!me && !stale;
  // Back-fill recurring entries on open, after any change (a new or resumed rule) and when the app returns to the
  // foreground (an installed app may stay open for days). Both phones may run this at once; the database keeps
  // one entry per rule and date, so re-running is cheap and safe.
  useEffect(() => {
    if (!ready || !me) return;
    runRecurring(me, todayLocal())
      .then((n) => { setRecurringError(null); if (n) changed(); })
      .catch((e) => setRecurringError(friendlyError((e as Error).message)));
  }, [ready, me?.userId, me?.members.length, version]); // not `me`: it changes on every refresh
  useEffect(() => {
    // Already in a household: an invite link opened here can't be used, so say why instead of dropping it silently.
    if (me?.householdId && pendingJoin()) { setPendingJoin(null); setIgnoredJoin(true); }
  }, [me?.householdId]);

  if (error && !me) {
    return (
      <Screen title="Can't load your data">
        <div className="stack">
        <p className="error" role="alert">{error}</p>
        <button type="button" className="btn primary" onClick={refresh}>Try again</button>
      </div>
      </Screen>
    );
  }
  if (!me) return <Splash />;
  if (!me.householdId && !skipped) return <Household onSkip={() => { setPendingJoin(null); setSkipped(true); }} />;

  return (
    <div className="app">
      {stale && <p className="notice-inline offline" role="status">Offline: showing what was last loaded. Adding and editing need a connection.</p>}
      {recurringError && (
        <div className="notice" role="alert">
          <p>Couldn't add recurring entries: {recurringError}</p>
          <button type="button" className="btn" onClick={() => setRecurringError(null)}>Dismiss</button>
        </div>
      )}
      {ignoredJoin && (
        <div className="notice" role="status">
          <p>You're signed in as {me.email}, who is already in a household, so this invite link can't be used here.
            Your partner should open it on their own phone, or test it in a private window signed in with another email.</p>
          <button type="button" className="btn" onClick={() => setIgnoredJoin(false)}>OK</button>
        </div>
      )}
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/tx" element={<Transactions />} />
        <Route path="/balance" element={<Balance />} />
        <Route path="/more" element={<More />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/household" element={<Household />} />
        <Route path="*" element={<Placeholder title="Not found" />} />
      </Routes>
      <BottomNav onAdd={() => openEntry()} />
      {sheet && <AddSheet key={sheet.editing?.id ?? 'new'} editing={sheet.editing} onClose={closeSheet} />}
    </div>
  );
}

export function App() {
  const session = useSession();
  if (session === undefined) return <Splash />;
  if (session === null) return <Login />;
  return <SignedIn key={session.user.id} user={session.user} />;
}

function SignedIn({ user }: { user: { id: string; email?: string } }) {
  const [sheet, setSheet] = useState<{ editing?: Tx } | null>(null);
  const openEntry = useCallback((editing?: Tx) => setSheet({ editing }), []);
  const closeSheet = useCallback(() => setSheet(null), []);
  return <MeProvider user={user} openEntry={openEntry}><Shell sheet={sheet} closeSheet={closeSheet} /></MeProvider>;
}
