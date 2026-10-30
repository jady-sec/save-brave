import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../components/Alert';
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
  const [month, setMonth] = useState(monthKey(todayLocal()));
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

  return (
    <main className="screen">
      <MonthSwitcher month={month} onChange={setMonth} />
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
                    : <><strong>{Math.floor((x.spent * 100) / x.limit!)}%</strong> of {name(x.category_id)} used</>}
                  {x.scope === 'shared' && <span className="muted"> (shared)</span>}
                </Alert>
              ))}
            </div>
          )}

          <section className="totals" aria-label="Month totals">
            <div><span>Income</span><strong className="num">{formatCents(r.income)}</strong></div>
            <div><span>Spent</span><strong className="num">{formatCents(r.spent)}</strong></div>
            <div className={r.actualSavings < r.plannedSavings ? 'short' : 'met'}>
              <span>Saved</span><strong className="num">{formatCents(r.actualSavings)}</strong>
              {data!.mine && <small className="num">target {formatCents(r.plannedSavings)}</small>}
            </div>
          </section>
          {!data!.mine && <p className="muted">No plan yet. <Link to="/plan">Set income, a savings target and limits</Link>.</p>}

          <h2 className="section-title">By category</h2>
          {rows.length === 0 ? <p className="empty muted">No spending this month yet.</p> : (
            <ul className="budget-rows">
              {rows.map((x) => (
                <li key={x.category_id} className={x.level ?? ''}>
                  <div className="budget-head">
                    <span className="tx-cat">{name(x.category_id)}{x.scope === 'shared' && <span className="tag shared"> Shared</span>}</span>
                    <span className="num">{formatCents(x.spent)}{x.limit !== null && <span className="muted"> / {formatCents(x.limit)}</span>}</span>
                  </div>
                  {x.limit !== null && (
                    <div className="bar" role="img" aria-label={`${Math.min(100, x.limit ? Math.floor((x.spent * 100) / x.limit) : (x.spent ? 100 : 0))}% of limit used`}>
                      <span style={{ width: `${x.limit ? Math.min(100, (x.spent * 100) / x.limit) : (x.spent ? 100 : 0)}%` }} />
                    </div>
                  )}
                  <div className="budget-foot muted">
                    {x.remaining !== null && (x.remaining >= 0 ? `${formatCents(x.remaining)} left` : `Over by ${formatCents(-x.remaining)}`)}
                    {x.scope === 'shared' && <span>{x.remaining !== null ? ' · ' : ''}your share {formatCents(x.mine)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
