import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CatBadge } from '../components/CatBadge';
import { Screen } from '../components/Screen';
import { TrendCards } from '../components/TrendCards';
import { friendlyError, listContributions, listPlans, listTransactionsRange } from '../lib/api';
import { budgetVsActual } from '../lib/budget';
import { cached } from '../lib/cache';
import { categoryShares, spendPace } from '../lib/insights';
import { formatCents } from '../lib/money';
import { addMonths, monthKey, todayLocal } from '../lib/month';
import { spendingTrends } from '../lib/trends';
import type { Plan, Tx } from '../lib/types';
import { useMe } from '../me';
import { lastMonth } from './Recap';
import { monthLabel } from './Transactions';

const MONTHS = 6;

/** The big picture: pace against last month, where the money went, savings by month, trends and goals. */
export function Insights() {
  const { me, categories, version } = useMe();
  const [data, setData] = useState<{ txs: Tx[]; plans: Plan[]; goalsSaved: number } | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayLocal();
  const month = monthKey(today);
  const from = addMonths(month, -(MONTHS - 1));

  useEffect(() => {
    if (!me) return;
    let live = true;
    Promise.all([
      cached(`${me.userId}:insights:${month}`, () => listTransactionsRange(from, month)),
      cached(`${me.userId}:plans:me`, () => listPlans('me')),
      cached(`${me.userId}:goal-contributions`, listContributions),
    ]).then(([t, p, c]) => {
      if (!live) return;
      setData({ txs: t.data, plans: p.data, goalsSaved: c.data.reduce((s, x) => s + x.amount_cents, 0) });
      setStale(t.stale || p.stale || c.stale); setError(null);
    }).catch((e) => { if (live) setError(friendlyError(e.message)); });
    return () => { live = false; };
  }, [me, version, from, month]);

  const names = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  if (!me) return null;

  const pace = data ? spendPace(me.userId, data.txs, today) : null;
  const shares = data ? categoryShares(me.userId, data.txs, month) : [];
  const trends = data ? spendingTrends(me.userId, data.txs, month, MONTHS).slice(0, 6) : [];
  // Saved per month, same rules as the Month screen (own share of shared, plan carried forward). Oldest first.
  const savings = data ? Array.from({ length: MONTHS }, (_, i) => addMonths(from, i)).map((m) => {
    const plan = [...data.plans].reverse().find((p) => p.month <= m) ?? null;
    return { m, saved: budgetVsActual(me.userId, data.txs.filter((t) => monthKey(t.date) === m), plan, null).actualSavings };
  }) : [];
  const biggest = Math.max(1, ...savings.map((s) => Math.abs(s.saved)));

  return (
    <Screen title="Insights" hero={pace && (
      <>
        <p className="hero-label">Spent so far this month</p>
        <p className="hero-figure num">{formatCents(pace.now)}</p>
        <p className="hero-sub num">
          {pace.change === null ? 'Nothing to compare with last month yet'
            : pace.change === 0 ? 'Same as this point last month'
            : `${pace.change > 0 ? '▲' : '▼'} ${Math.abs(pace.change)}% ${pace.change > 0 ? 'more' : 'less'} than this point last month (${formatCents(pace.then)})`}
        </p>
      </>
    )}>
      {stale && <p className="notice-inline" role="status">Offline: showing the last loaded numbers.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!data ? (!error && <p className="muted">Loading…</p>) : (
        <>
          <h2 className="section-title">Where it went this month</h2>
          {shares.length === 0 ? <p className="empty muted">No spending this month yet.</p> : (
            <ul className="shares">
              {shares.map((s) => (
                <li key={s.category_id}>
                  <CatBadge name={names.get(s.category_id) ?? 'Category'} />
                  <span className="share-main">
                    <span className="share-top"><strong>{names.get(s.category_id) ?? 'Category'}</strong><span className="num">{formatCents(s.cents)}</span></span>
                    <span className="bar" role="img" aria-label={`${s.pct}% of your spending`}><span style={{ width: `${s.pct}%` }} /></span>
                  </span>
                  <span className="share-pct num">{s.pct}%</span>
                </li>
              ))}
            </ul>
          )}

          <h2 className="section-title">Saved each month</h2>
          <ul className="saved-bars">
            {savings.map((s) => (
              <li key={s.m}>
                <span className="sb-month">{monthLabel(s.m).split(' ')[0].slice(0, 3)}</span>
                <span className="sb-track"><span className={s.saved < 0 ? 'neg' : ''} style={{ width: `${(Math.abs(s.saved) * 100) / biggest}%` }} /></span>
                <span className={`sb-value num ${s.saved < 0 ? 'neg' : ''}`}>{formatCents(s.saved)}</span>
              </li>
            ))}
          </ul>

          {trends.length > 0 && (
            <>
              <h2 className="section-title">Spending trends</h2>
              <p className="muted trend-note">This month so far, against your average for the 3 months before.</p>
              <TrendCards trends={trends} current={month} names={names} />
            </>
          )}

          <Link to="/goals" className="goals-link">
            <span><strong>Saved toward goals</strong><span className="num">{formatCents(data.goalsSaved)}</span></span>
            <span aria-hidden="true">›</span>
          </Link>
          <Link to={`/recap?m=${lastMonth()}`} className="btn wide-btn recap-link">See {monthLabel(lastMonth())} in review</Link>
        </>
      )}
    </Screen>
  );
}
