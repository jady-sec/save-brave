import { formatCents } from '../lib/money';
import { addMonths } from '../lib/month';
import type { Trend } from '../lib/trends';

const short = (m: string) => new Date(`${m}-15T12:00`).toLocaleString('en-CA', { month: 'short' });

/** One card per category: this month so far, the 3-month average, up/down, and a bar per month. */
export function TrendCards({ trends, current, names }: { trends: Trend[]; current: string; names: Map<string, string> }) {
  return (
    <ul className="trends">
      {trends.map((t) => {
        const months = t.series.map((_, i) => addMonths(current, i - t.series.length + 1));
        const top = Math.max(...t.series, 1);
        return (
          <li key={t.category_id} className="trend-card">
            <div className="trend-head">
              <strong>{names.get(t.category_id) ?? 'Category'}</strong>
              {t.change !== null && t.change !== 0 && (
                <span className={`trend-pill ${t.change > 0 ? 'up' : 'down'}`}>{t.change > 0 ? '▲ up' : '▼ down'} {Math.abs(t.change)}%</span>
              )}
            </div>
            <p className="num trend-figures"><strong>{formatCents(t.current)}</strong> <span className="muted">· avg {formatCents(t.average)}</span></p>
            <div className="spark" role="img" aria-label={months.map((m, i) => `${short(m)} ${formatCents(t.series[i])}`).join(', ')}>
              {t.series.map((v, i) => (
                <span key={months[i]} className={i === t.series.length - 1 ? 'now' : ''}>
                  <i style={{ height: `${Math.max(4, (v * 100) / top)}%` }} />
                  <small>{short(months[i]).slice(0, 1)}</small>
                </span>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
