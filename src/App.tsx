import { useCallback, useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { MeProvider, useMe } from './me';
import { AddSheet } from './screens/AddSheet';
import { Household, pendingJoin, setPendingJoin } from './screens/Household';
import { Login } from './screens/Login';
import { Settings } from './screens/Settings';
import { useSession } from './useSession';

function Placeholder({ title }: { title: string }) {
  return (
    <main className="screen">
      <h1>{title}</h1>
      <p className="muted">Coming soon.</p>
    </main>
  );
}

function More() {
  const items = [['/plan', 'Plan'], ['/recurring', 'Recurring'], ['/history', 'History'], ['/settings', 'Settings']];
  return (
    <main className="screen">
      <h1>More</h1>
      <ul className="list">
        {items.map(([to, label]) => <li key={to}><Link to={to}>{label}</Link></li>)}
      </ul>
    </main>
  );
}

function Shell() {
  const { me, error, refresh } = useMe();
  const [adding, setAdding] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const closeAdd = useCallback(() => setAdding(false), []);
  const [ignoredJoin, setIgnoredJoin] = useState(false);
  useEffect(() => {
    // Already in a household: an invite link opened here can't be used, so say why instead of dropping it silently.
    if (me?.householdId && pendingJoin()) { setPendingJoin(null); setIgnoredJoin(true); }
  }, [me?.householdId]);

  if (error && !me) {
    return (
      <main className="screen stack">
        <h1>Can't load your data</h1>
        <p className="error" role="alert">{error}</p>
        <button type="button" className="btn primary" onClick={refresh}>Try again</button>
      </main>
    );
  }
  if (!me) return null;
  if (!me.householdId && !skipped) return <Household onSkip={() => { setPendingJoin(null); setSkipped(true); }} />;

  return (
    <div className="app">
      {ignoredJoin && (
        <div className="notice" role="status">
          <p>You're signed in as {me.email}, who is already in a household, so this invite link can't be used here.
            Your partner should open it on their own phone, or test it in a private window signed in with another email.</p>
          <button type="button" className="btn" onClick={() => setIgnoredJoin(false)}>OK</button>
        </div>
      )}
      <Routes>
        <Route path="/" element={<Placeholder title="This month" />} />
        <Route path="/tx" element={<Placeholder title="Entries" />} />
        <Route path="/balance" element={<Placeholder title="Balance" />} />
        <Route path="/more" element={<More />} />
        <Route path="/plan" element={<Placeholder title="Plan" />} />
        <Route path="/recurring" element={<Placeholder title="Recurring" />} />
        <Route path="/history" element={<Placeholder title="History" />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/household" element={<Household />} />
        <Route path="*" element={<Placeholder title="Not found" />} />
      </Routes>
      <BottomNav onAdd={() => setAdding(true)} />
      {adding && <AddSheet onClose={closeAdd} />}
    </div>
  );
}

export function App() {
  const session = useSession();
  if (session === undefined) return null;
  if (session === null) return <Login />;
  return <MeProvider key={session.user.id} user={session.user}><Shell /></MeProvider>;
}
