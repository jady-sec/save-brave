import { useEffect, useMemo, useState } from 'react';
import { CatBadge } from '../components/CatBadge';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { friendlyError, listForExport, listTransactions } from '../lib/api';
import { cached } from '../lib/cache';
import { formatCents } from '../lib/money';
import { addMonths, monthKey, todayLocal } from '../lib/month';
import { displayName } from '../lib/profile';
import { matchesSearch } from '../lib/search';
import type { Tx } from '../lib/types';
import { partnerOf, useMe } from '../me';
import { useFollowToday } from '../useFollowToday';

export const monthLabel = (m: string) => new Date(`${m}-15T12:00`).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
const dayLabel = (d: string, withYear = false) => new Date(`${d}T12:00`).toLocaleDateString('en-CA',
  withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' });

export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="month-switch">
      <button type="button" className="btn icon" aria-label="Previous month" onClick={() => onChange(addMonths(month, -1))}><Icon name="left" /></button>
      <h1 aria-live="polite">{monthLabel(month)}</h1>
      <button type="button" className="btn icon" aria-label="Next month" onClick={() => onChange(addMonths(month, 1))}><Icon name="right" /></button>
    </div>
  );
}

export function Transactions() {
  const { me, categories, version, openEntry } = useMe();
  const [month, setMonth] = useState(monthKey(todayLocal()));
  useFollowToday(month, setMonth, version);
  const [rows, setRows] = useState<Tx[] | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<'all' | 'expense' | 'income'>('all');
  const [scope, setScope] = useState<'all' | 'personal' | 'shared'>('all');
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [everywhere, setEverywhere] = useState(false); // search all months instead of this one
  const [all, setAll] = useState<Tx[] | null>(null);

  useEffect(() => {
    if (!me) return;
    let live = true;
    setError(null);
    cached(`${me.userId}:tx:${month}`, () => listTransactions(month))
      .then((r) => { if (live) { setRows(r.data); setStale(r.stale); } })
      .catch((e) => { if (live) setError(friendlyError(e.message)); });
    return () => { live = false; };
  }, [me, month, version]);
  const searchingAll = everywhere && !!q.trim();
  useEffect(() => {
    if (!me || !searchingAll) return;
    let live = true;
    cached(`${me.userId}:tx:all`, () => listForExport('', ''))
      .then((r) => { if (live) setAll([...r.data].reverse()); }) // newest first, like the month view
      .catch((e) => { if (live) setError(friendlyError(e.message)); });
    return () => { live = false; };
  }, [me, searchingAll, version]);
  useEffect(() => { setRows(null); setStale(false); }, [month]); // don't show last month's entries under this month's title

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const source = searchingAll ? all : rows;
  const shown = (source ?? []).filter((t) =>
    (type === 'all' || t.type === type) && (scope === 'all' || t.scope === scope) && (cat === 'all' || t.category_id === cat)
    && matchesSearch(t, catName.get(t.category_id) ?? '', q));
  const shownTotal = shown.reduce((sum, t) => sum + (t.type === 'income' ? t.amount_cents : -t.amount_cents), 0);
  const byDay = new Map<string, Tx[]>(); // not Map.groupBy: needs iOS 17.4+
  for (const t of shown) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);

  if (!me) return null;
  return (
    <Screen title={<MonthSwitcher month={month} onChange={setMonth} />}>
      {stale && <p className="notice-inline" role="status">Offline: showing the last loaded entries. Changes need a connection.</p>}
      <div className="filters">
        <label className="field"><span className="sr-only">Search notes</span>
          <input type="search" placeholder="Search notes, categories or amounts" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="check"><input type="checkbox" checked={everywhere} onChange={(e) => setEverywhere(e.target.checked)} /> Search all months</label>
        <div className="filter-row">
          <label className="field"><span className="sr-only">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="all">All types</option><option value="expense">Expenses</option><option value="income">Income</option>
            </select>
          </label>
          {me.householdId && (
            <label className="field"><span className="sr-only">Personal or shared</span>
              <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                <option value="all">Personal + shared</option><option value="personal">Personal</option><option value="shared">Shared</option>
              </select>
            </label>
          )}
          <label className="field"><span className="sr-only">Category</span>
            <select value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.scope === 'shared' ? ' (shared)' : ''}</option>)}
            </select>
          </label>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {q.trim() && source && shown.length > 0 && (
        <p className="muted search-summary num" role="status">{shown.length} {shown.length === 1 ? 'entry' : 'entries'}{searchingAll ? ' in all months' : ''} · net {shownTotal < 0 ? '−' : '+'}{formatCents(Math.abs(shownTotal))}</p>
      )}
      {source === null ? (!error && <p className="muted">Loading…</p>) : shown.length === 0 ? (
        <p className="empty muted">{source.length === 0 ? 'No entries this month yet. Tap + to add one.' : 'Nothing matches these filters.'}</p>
      ) : (
        [...byDay].map(([day, list]) => (
          <section key={day} className="day">
            <h2>{dayLabel(day, searchingAll)}</h2>
            <ul className="tx-list">
              {list.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => openEntry(t)}>
                    <CatBadge id={t.category_id} />
                    <span className="tx-main">
                      <span className="tx-cat">{catName.get(t.category_id) ?? 'Category'}</span>
                      {t.scope === 'shared' && <span className="tag shared">Shared · {t.paid_by === me.userId ? 'you paid' : `${(partnerOf(me) ? displayName(partnerOf(me)!) : 'partner')} paid`}</span>}
                      {t.note && <span className="tx-note">{t.note}</span>}
                    </span>
                    <span className={`tx-amt num ${t.type}`}>
                      {t.type === 'income' ? '+' : '−'}{formatCents(t.amount_cents)}
                      <span className="sr-only">{t.type === 'income' ? ' income' : ' expense'}</span>
                      {t.scope === 'shared' && (
                        <span className="tx-share">your share {formatCents(t.splits.find((s) => s.user_id === me.userId)?.share_cents ?? 0)}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Screen>
  );
}
