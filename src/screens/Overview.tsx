import { CatBadge } from '../components/CatBadge';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert } from '../components/Alert';
import { Screen } from '../components/Screen';
import { friendlyError, getPlan, listTransactions } from '../lib/api';
import { budgetVsActual } from '../lib/budget';
import { cached } from '../lib/cache';
import { formatCents } from '../lib/money';
import { monthKey, todayLocal } from '../lib/month';
import type { Plan, Tx } from '../lib/types';
import { useMe } from '../me';
import { MonthSwitcher } from './Transactions';

export function Overview() {
  const { me, categories, version } = useMe();
  const [params, setParams] = useSearchParams(); // History links here with ?m=YYYY-MM
  const asked = params.get('m');
  const [month, setMonth] = useState(asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : monthKey(todayLocal()));
  // Read once, then drop it: otherwise a refresh or relaunch jumps back to that month.
  useEffect(() => { if (asked) setParams({}, { replace: true }); }, [asked, setParams]);
  const [data, setData] = useState<{ txs: Tx[]; mine: Plan | null; home: Plan | null } | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    let live = true;
    setError(null);
    const k = `${me.userId}:`;
    Promise.all([
      cached(`${k}tx:${month}`, () => listTransactions(month)),
      cached(`${k}plan:me:${month}`, () => getPlan('me', month)),
      me.householdId ? cached(`${k}plan:household:${month}`, () => getPlan('household', month)) : Promise.resolve({ data: null, stale: false }),
    ]).then(([t, p, h]) => { if (live) { setData({ txs: t.data, mine: p.data, home: h.data }); setStale(t.stale || p.stale || h.stale); } })
      .catch((e) => { if (live) setError(friendlyError(e.message)); });
    return () => { live = false; };
  }, [me, month, version]);
  useEffect(() => { setData(null); }, [month]);

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  if (!me) return null;
  const r = data ? budgetVsActual(me.userId, data.txs, data.mine, data.home) : null;
  const name = (id: string) => catName.get(id) ?? 'Category';
  const rows = r ? [...r.rows].sort((a, b) => Number(b.limit !== null) - Number(a.limit !== null) || name(a.category_id).localeCompare(name(b.category_id))) : [];
  const alerts = rows.filter((x) => x.level === 'warn' || x.level === 'over');

  const pct = (x: { spent: number; limit: number | null }) => (x.limit ? Math.floor((x.spent * 100) / x.limit) : x.spent ? 100 : 0);
  const status = r && data!.mine ? (r.actualSavings < r.plannedSavings ? 'short' : 'met') : '';

  return (
    <Screen title={<MonthSwitcher month={month} onChange={setMonth} />} hero={r && (
      <>
        <p className="hero-label">Saved this month</p>
        <p className={`hero-figure num ${status}`}>{formatCents(r.actualSavings)}</p>
        {data!.mine && <p className="hero-sub num">Target {formatCents(r.plannedSavings)}{status === 'met' ? ' · on track' : status === 'short' ? ' · below target' : ''}</p>}
        <section className="totals" aria-label="Month totals">
          <div><span>Total income</span><strong className="num">+{formatCents(r.income)}</strong></div>
          <div><span>Total spending</span><strong className="num">−{formatCents(r.spent)}</strong></div>
        </section>
      </>
    )}>
      {stale && <p className="notice-inline" role="status">Offline: showing the last loaded numbers.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!r ? (!error && <p className="muted">Loading…</p>) : (
        <>
          {alerts.length > 0 && (
            <div className="alerts">
              {alerts.map((x) => (
                <Alert key={x.category_id} level={x.level as 'warn' | 'over'}>
                  {x.level === 'over'
                    ? <><strong>{name(x.category_id)}</strong> over by {formatCents(-x.remaining!)}</>
                    : <><strong>{pct(x)}%</strong> of {name(x.category_id)} used</>}
                  {x.scope === 'shared' && <span className="muted"> (shared)</span>}
                </Alert>
              ))}
            </div>
          )}

          <ul className="tiles" aria-label="This month at a glance">
            <li className="t0"><strong className="num">{data!.txs.length}</strong>Entries</li>
            <li className="t1"><strong className="num">{rows.filter((x) => x.level === 'warn').length}</strong>Near limit</li>
            <li className="t2"><strong className="num">{rows.filter((x) => x.level === 'over').length}</strong>Over limit</li>
          </ul>
          {!data!.mine && <p className="muted">No plan yet. <Link to="/plan">Set income, a savings target and limits</Link>.</p>}

          <h2 className="section-title">Your budget</h2>
          {rows.length === 0 ? <p className="empty muted">No spending this month yet.</p> : (
            <ul className="budget-grid">
              {rows.map((x) => (
                <li key={x.category_id} className={`budget-card ${x.scope} ${x.level ?? ''}`}>
                  <CatBadge name={name(x.category_id)} />
                  <span className="name">{name(x.category_id)}</span>
                  <span className="amt num">
                    <strong>{formatCents(x.spent)}</strong>{x.limit !== null && <> / {formatCents(x.limit)}</>}
                  </span>
                  {x.scope === 'shared' && <span className="tag shared">Shared · yours {formatCents(x.mine)}</span>}
                  <span className="meta">
                    {x.limit !== null
                      ? <>{x.remaining! >= 0 ? `${formatCents(x.remaining!)} left` : `Over ${formatCents(-x.remaining!)}`}<span className="pct num">{pct(x)}%</span></>
                      : <span>No limit</span>}
                  </span>
                  {x.limit !== null && (
                    <div className="bar" role="img" aria-label={`${pct(x)}% of limit used`}>
                      <span style={{ width: `${Math.min(100, pct(x))}%` }} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Screen>
  );
}
