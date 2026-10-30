import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { friendlyError, listPlans, listTransactionsRange } from '../lib/api';
import { budgetVsActual } from '../lib/budget';
import { cached } from '../lib/cache';
import { formatCents } from '../lib/money';
import { addMonths, monthKey, todayLocal } from '../lib/month';
import type { Plan, Tx } from '../lib/types';
import { useMe } from '../me';
import { monthLabel } from './Transactions';

const MONTHS = 12;

export function History() {
  const { me, version } = useMe();
  const [data, setData] = useState<{ txs: Tx[]; plans: Plan[] } | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const to = monthKey(todayLocal());
  const from = addMonths(to, -(MONTHS - 1));

  useEffect(() => {
    if (!me) return;
    let live = true;
    Promise.all([cached(`${me.userId}:history:${to}`, () => listTransactionsRange(from, to)), cached(`${me.userId}:plans:me`, () => listPlans('me'))])
      .then(([t, p]) => { if (live) { setData({ txs: t.data, plans: p.data }); setStale(t.stale || p.stale); } })
      .catch((e) => { if (live) setError(friendlyError(e.message)); });
    return () => { live = false; };
  }, [me, version, from, to]);

  if (!me) return null;
  // Newest first; each month uses the same rules as the Month screen (own share of shared, carried-forward plan).
  const months = Array.from({ length: MONTHS }, (_, i) => addMonths(to, -i)).map((m) => {
    const plan = data ? [...data.plans].reverse().find((p) => p.month <= m) ?? null : null;
    const r = data ? budgetVsActual(me.userId, data.txs.filter((t) => monthKey(t.date) === m), plan, null) : null;
    return { m, r, plan };
  });
  const saved12 = months.reduce((s, x) => s + (x.r?.actualSavings ?? 0), 0);

  return (
    <Screen title="History" hero={data && (
      <>
        <p className="hero-label">Saved over the last {MONTHS} months</p>
        <p className="hero-figure num">{formatCents(saved12)}</p>
      </>
    )}>
      {stale && <p className="notice-inline" role="status">Offline: showing the last loaded history.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!data ? (!error && <p className="muted">Loading…</p>) : (
        <ul className="history">
          {months.map(({ m, r, plan }) => {
            const status = !plan ? null : r!.actualSavings >= r!.plannedSavings ? 'met' : 'short';
            return (
              <li key={m}>
                <Link to={`/?m=${m}`}>
                  <span className="h-month">{monthLabel(m)}</span>
                  <span className="h-detail muted num">In {formatCents(r!.income)} · Out {formatCents(r!.spent)}</span>
                  <span className={`h-saved num ${status ?? ''}`}>{formatCents(r!.actualSavings)}</span>
                  <span className="h-target muted num">
                    {status ? <>{status === 'met' ? 'Hit' : 'Missed'} target {formatCents(r!.plannedSavings)}</> : 'No plan'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}
