import { Avatar } from '../components/Avatar';
import { displayName } from '../lib/profile';
import { notifyPartner } from '../lib/push';
import { CatBadge } from '../components/CatBadge';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { addSettlement, deleteSettlement, friendlyError, listSettlements, listShared } from '../lib/api';
import { computeBalance } from '../lib/balance';
import { cached } from '../lib/cache';
import { centsToPlain, formatCents, parseCents } from '../lib/money';
import { todayLocal } from '../lib/month';
import type { Settlement, Tx } from '../lib/types';
import { partnerOf, useMe } from '../me';

const dayLabel = (d: string) => new Date(`${d}T12:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });

export function Balance() {
  const { me, categories, version, changed, openEntry } = useMe();
  const partner = me ? partnerOf(me) : null;
  const [data, setData] = useState<{ shared: Tx[]; settlements: Settlement[] } | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me || !partner) return;
    let live = true;
    setError(null);
    Promise.all([cached(`${me.userId}:shared`, listShared), cached(`${me.userId}:settlements`, listSettlements)])
      .then(([s, st]) => { if (live) { setData({ shared: s.data, settlements: st.data }); setStale(s.stale || st.stale); } })
      .catch((e) => { if (live) setError(friendlyError(e.message)); });
    return () => { live = false; };
  }, [me, partner, version]);

  const balance = data && me ? computeBalance(me.userId, data.shared, data.settlements) : null;
  useEffect(() => { if (balance !== null && balance < 0) setAmount(centsToPlain(-balance)); }, [balance]);

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const activity = useMemo(() => data ? [
    ...data.shared.map((t) => ({ kind: 'tx' as const, date: t.date, t })),
    ...data.settlements.map((s) => ({ kind: 'settle' as const, date: s.date, s })),
  ].sort((a, b) => b.date.localeCompare(a.date)) : [], [data]);

  if (!me) return null;
  if (!partner) {
    return (
      <Screen title="Balance">
        <p className="muted">Shared costs and who owes whom show up here once your partner joins.</p>
        <Link className="btn primary" to="/household">Invite your partner</Link>
      </Screen>
    );
  }
  const name = displayName(partner);
  const cents = parseCents(amount);

  async function settle(e: FormEvent) {
    e.preventDefault();
    if (!cents) { setError('Enter the amount you paid.'); return; }
    if (cents > -balance!) { setError(`That's more than you owe (${formatCents(-balance!)}).`); return; }
    setBusy(true); setError(null);
    // Clear the prefill so a second tap before the refetch can't record the same payment again.
    try { notifyPartner({ settlement_id: await addSettlement(me!, partner!.user_id, cents, todayLocal()) }); setAmount(''); changed(); }
    catch (err) { setError(`Not recorded. ${friendlyError((err as Error).message)}`); }
    setBusy(false);
  }

  async function undo(id: string) {
    if (!confirm('Delete this settle-up payment?')) return;
    try { await deleteSettlement(id); changed(); }
    catch (err) { setError(`Not deleted. ${friendlyError((err as Error).message)}`); }
  }

  return (
    <Screen title="Balance" hero={<>
      <div className="hero-who"><Avatar who={partner} size={40} /><span>With {name}</span></div>
      {balance !== null && (balance === 0
        ? <p className="hero-figure">All settled</p>
        : <>
            <p className="hero-label">{balance > 0 ? `${name} owes you` : `You owe ${name}`}</p>
            <p className="hero-figure num">{formatCents(Math.abs(balance))}</p>
          </>)}
    </>}>
      {stale && <p className="notice-inline" role="status">Offline: showing the last loaded balance. Settling up needs a connection.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {balance === null ? (!error && <p className="muted">Loading…</p>) : (
        <>
          {balance < 0 && (
            <form className="stack settle" onSubmit={settle}>
              <label className="field">
                <span>Amount you paid {name}</span>
                <input className="num" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <button className="btn primary" disabled={busy || stale}>{busy ? 'Recording…' : `Record ${cents ? formatCents(cents) : 'payment'} to ${name}`}</button>
            </form>
          )}
          {/* shortcut: only the person paying records a settle-up (enforced by RLS); relax if that gets annoying. */}
          {balance > 0 && <p className="muted">When {name} pays you back, they record it on their phone.</p>}

          <h2 className="section-title">Shared activity</h2>
          {activity.length === 0 ? <p className="empty muted">No shared entries yet.</p> : (
            <ul className="tx-list">
              {activity.map((a) => a.kind === 'tx' ? (
                <li key={`t${a.t.id}`}>
                  <button type="button" onClick={() => openEntry(a.t)}>
                    <CatBadge name={catName.get(a.t.category_id) ?? 'Category'} />
                    <span className="tx-main">
                      <span className="tx-cat">{catName.get(a.t.category_id) ?? 'Category'}</span>
                      <span className="tx-note">{dayLabel(a.date)} · {a.t.paid_by === me.userId ? 'you paid' : `${name} paid`}{a.t.note ? ` · ${a.t.note}` : ''}</span>
                    </span>
                    <span className="tx-amt num">{formatCents(a.t.amount_cents)}
                      <span className="tx-share">your share {formatCents(a.t.splits.find((s) => s.user_id === me.userId)?.share_cents ?? 0)}</span>
                    </span>
                  </button>
                </li>
              ) : (
                <li key={`s${a.s.id}`}>
                  <button type="button" onClick={() => undo(a.s.id)} aria-label={`Settle-up payment, ${formatCents(a.s.amount_cents)}. Tap to delete.`}>
                    <span className="tx-main">
                      <span className="tx-cat">{a.s.from_user === me.userId ? `You paid ${name}` : `${name} paid you`}</span>
                      <span className="tx-note">{dayLabel(a.date)} · settle up</span>
                    </span>
                    <span className="tx-amt num ok">{formatCents(a.s.amount_cents)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Screen>
  );
}
