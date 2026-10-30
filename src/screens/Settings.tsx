import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { deleteCategory, friendlyError, saveCategory } from '../lib/api';
import { clearCache } from '../lib/cache';
import { supabase } from '../lib/supabase';
import type { Scope, TxType } from '../lib/types';
import { partnerOf, useMe } from '../me';
import { setPendingJoin } from './Household';

function Categories() {
  const { me, categories, refresh } = useMe();
  const [scope, setScope] = useState<Scope>('personal');
  const [type, setType] = useState<TxType>('expense');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;
  const list = categories.filter((c) => c.scope === scope && c.type === type);

  async function act(fn: () => Promise<void>) {
    setError(null);
    try { await fn(); await refresh(); } catch (e) { setError(friendlyError((e as Error).message)); }
  }
  const add = (e: FormEvent) => { e.preventDefault(); act(async () => { await saveCategory(me, { name, type, scope }); setName(''); }); };
  const rename = (id: string, current: string) => {
    const next = prompt('Rename category', current)?.trim();
    if (next && next !== current) act(() => saveCategory(me, { id, name: next, type, scope }));
  };
  const remove = (id: string, n: string) => { if (confirm(`Delete “${n}”?`)) act(() => deleteCategory(id)); };

  return (
    <section className="stack section">
      <h2>Categories</h2>
      <div className="filter-row">
        {me.householdId && (
          <div className="segmented" role="radiogroup" aria-label="Whose categories">
            {(['personal', 'shared'] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={scope === s} onClick={() => { setScope(s); if (s === 'shared') setType('expense'); }}>
                {s === 'personal' ? 'Mine' : 'Shared'}
              </button>
            ))}
          </div>
        )}
        {scope === 'personal' && (
          <div className="segmented" role="radiogroup" aria-label="Category type">
            {(['expense', 'income'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)}>{t === 'expense' ? 'Expense' : 'Income'}</button>
            ))}
          </div>
        )}
      </div>
      <ul className="list cats">
        {list.map((c) => (
          <li key={c.id}>
            <span>{c.name}</span>
            <button type="button" className="btn small" onClick={() => rename(c.id, c.name)} aria-label={`Rename ${c.name}`}>Rename</button>
            <button type="button" className="btn small" onClick={() => remove(c.id, c.name)} aria-label={`Delete ${c.name}`}>Delete</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="inline-form">
        <label className="field grow"><span className="sr-only">New category name</span>
          <input maxLength={40} placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn" disabled={!name.trim()}>Add</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

export function Settings() {
  const { me } = useMe();
  if (!me) return null;
  const partner = partnerOf(me);
  return (
    <main className="screen">
      <h1>Settings</h1>
      <Categories />
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
        <button type="button" className="btn" onClick={() => { setPendingJoin(null); clearCache(); supabase.auth.signOut(); }}>Sign out</button>
      </section>
    </main>
  );
}
