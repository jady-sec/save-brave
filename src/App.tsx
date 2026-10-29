import { useCallback, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { AddSheet } from './screens/AddSheet';

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

export function App() {
  const [adding, setAdding] = useState(false);
  const closeAdd = useCallback(() => setAdding(false), []);
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Placeholder title="This month" />} />
        <Route path="/tx" element={<Placeholder title="Entries" />} />
        <Route path="/balance" element={<Placeholder title="Balance" />} />
        <Route path="/more" element={<More />} />
        <Route path="/plan" element={<Placeholder title="Plan" />} />
        <Route path="/recurring" element={<Placeholder title="Recurring" />} />
        <Route path="/history" element={<Placeholder title="History" />} />
        <Route path="/settings" element={<Placeholder title="Settings" />} />
        <Route path="*" element={<Placeholder title="Not found" />} />
      </Routes>
      <BottomNav onAdd={() => setAdding(true)} />
      {adding && <AddSheet onClose={closeAdd} />}
    </div>
  );
}
