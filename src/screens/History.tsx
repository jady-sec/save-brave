import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { friendlyError, listPlans, listTransactionsRange } from '../lib/api';
import { budgetVsActual } from '../lib/budget';
import { cached } from '../lib/cache';
import { formatCents } from '../lib/money';
import { addMonths, monthKey, todayLocal } from '../lib/month';
import { spendingTrends } from '../lib/trends';
import type { Plan, Tx } from '../lib/types';
import { useMe } from '../me';
import { monthLabel } from './Transactions';

const MONTHS = 12;
const TREND_MONTHS = 6;
const TREND_ROWS = 6;

export function History() {
  const { me, categories, version } = useMe();
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
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const trends = data ? spendingTrends(me.userId, data.txs, to, TREND_MONTHS).slice(0, TREND_ROWS) : [];
  const short = (m: string) => new Date(`${m}-15T12:00`).toLocaleString('en-CA', { month: 'short' });
  const trendMonths = Array.from({ length: TREND_MONTHS }, (_, i) => addMonths(to, i - TREND_MONTHS + 1));

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
        <>
        {trends.length > 0 && (
          <section aria-labelledby="trends-title">
            <h2 className="section-title" id="trends-title">Spending trends</h2>
            <p className="muted trend-note">This month so far, against your average for the 3 months before.</p>
            <ul className="trends">
              {trends.map((t) => {
                const top = Math.max(...t.series, 1);
                return (
                  <li key={t.category_id} className="trend-card">
                    <div className="trend-head">
                      <strong>{catName.get(t.category_id) ?? 'Category'}</strong>
                      {t.change !== null && t.change !== 0 && (
                        <span className={`trend-pill ${t.change > 0 ? 'up' : 'down'}`}>{t.change > 0 ? '▲ up' : '▼ down'} {Math.abs(t.change)}%</span>
                      )}
                    </div>
                    <p className="num trend-figures"><strong>{formatCents(t.current)}</strong> <span className="muted">· avg {formatCents(t.average)}</span></p>
                    <div className="spark" role="img" aria-label={trendMonths.map((m, i) => `${short(m)} ${formatCents(t.series[i])}`).join(', ')}>
                      {t.series.map((v, i) => (
                        <span key={i} className={i === t.series.length - 1 ? 'now' : ''}>
                          <i style={{ height: `${Math.max(4, (v * 100) / top)}%` }} />
                          <small>{short(trendMonths[i]).slice(0, 1)}</small>
                        </span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <h2 className="section-title">Month by month</h2>
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
        </>
      )}
    </Screen>
  );
}
