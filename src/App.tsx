import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Screen } from './components/Screen';
import { Splash } from './components/Splash';
import { BottomNav } from './components/BottomNav';
import { Celebration } from './components/Celebration';
import { MeProvider, useMe } from './me';
import { AddSheet } from './screens/AddSheet';
import { Goals } from './screens/Goals';
import { History } from './screens/History';
import { Household, pendingJoin, setPendingJoin } from './screens/Household';
import { Insights } from './screens/Insights';
import { Login } from './screens/Login';
import { Balance } from './screens/Balance';
import { Overview } from './screens/Overview';
import { Plan } from './screens/Plan';
import { RecapScreen, lastMonth, recapSeenKey } from './screens/Recap';
import { Recurring } from './screens/Recurring';
import { Settings } from './screens/Settings';
import { Transactions } from './screens/Transactions';
import { friendlyError, listTransactions, runRecurring } from './lib/api';
import { cached } from './lib/cache';
import { discardFailed } from './lib/outbox';
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
  const items = [['/insights', 'Insights'], ['/goals', 'Goals'], ['/plan', 'Plan'], ['/recurring', 'Recurring'], ['/history', 'History'], ['/settings', 'Settings']];
  return (
    <Screen title="More">
      <ul className="list">
        {items.map(([to, label]) => <li key={to}><Link to={to}>{label}</Link></li>)}
      </ul>
    </Screen>
  );
}

function Shell({ sheet, closeSheet }: { sheet: { editing?: Tx } | null; closeSheet: () => void }) {
  const { me, error, refresh, openEntry, stale, changed, version, outbox } = useMe();
  const waiting = outbox.filter((o) => !o.error).length;
  const failed = outbox.filter((o) => o.error);
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
  // Long-press "Add expense" on the app icon (manifest shortcuts) opens the app at /?add=1.
  const [params, setParams] = useSearchParams();
  const fromShortcut = useRef(params.get('add') === '1');
  useEffect(() => {
    if (me && params.get('add') === '1') { setParams({}, { replace: true }); openEntry(); }
  }, [me, params, setParams, openEntry]);
  // In the first week of a month, the first visit shows last month's recap (once), if there was anything in it.
  const location = useLocation();
  const navigate = useNavigate();
  const path = useRef(location.pathname);
  path.current = location.pathname;
  useEffect(() => {
    if (!ready || !me || fromShortcut.current || location.pathname !== '/' || Number(todayLocal().slice(8, 10)) > 7) return;
    const m = lastMonth();
    try { if (localStorage.getItem(recapSeenKey(me.userId, m))) return; } catch { return; }
    let live = true;
    cached(`${me.userId}:tx:${m}`, () => listTransactions(m))
      // Only if they're still on the Month screen: don't pull them out of whatever they tapped meanwhile.
      .then((r) => { if (live && path.current === '/' && r.data.some((t) => t.created_by === me.userId)) navigate(`/recap?m=${m}`); })
      .catch(() => { /* the recap is a nicety; skip it this time */ });
    return () => { live = false; };
  }, [ready, me?.userId]); // eslint-disable-line react-hooks/exhaustive-deps -- once per app open
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
      {(stale || waiting > 0) && <p className="notice-inline offline" role="status">
        {stale ? 'Offline: showing what was last loaded. ' : ''}
        {waiting ? `${waiting} ${waiting === 1 ? 'change' : 'changes'} saved on this phone, syncing when you're back online.` : "You can still add entries and settle up; they sync when you're back online."}
      </p>}
      {failed.length > 0 && (
        <div className="notice" role="alert">
          <p>{failed.length === 1 ? 'A change' : `${failed.length} changes`} made offline couldn't be saved: {friendlyError(failed[0].error!)}</p>
          <button type="button" className="btn" onClick={() => { discardFailed(me.userId); changed(); }}>Discard</button>
        </div>
      )}
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
        <Route path="/insights" element={<Insights />} />
        <Route path="/recap" element={<RecapScreen />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/household" element={<Household />} />
        <Route path="*" element={<Placeholder title="Not found" />} />
      </Routes>
      <BottomNav onAdd={() => openEntry()} />
      <Celebration />
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
