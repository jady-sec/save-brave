import { useEffect, useState, type FormEvent } from 'react';
import { Screen } from '../components/Screen';
import { friendlyError, getPlan, savePlan, type PlanOwner } from '../lib/api';
import { cached } from '../lib/cache';
import { centsToPlain, parseCentsOrZero } from '../lib/money';
import { monthKey, todayLocal } from '../lib/month';
import type { Category, Plan as PlanRow } from '../lib/types';
import { useMe } from '../me';
import { MonthSwitcher, monthLabel } from './Transactions';

const toInput = (c: number | undefined) => (c === undefined ? '' : centsToPlain(c));

export function Plan() {
  const { me, categories, version, changed } = useMe();
  const [month, setMonth] = useState(monthKey(todayLocal()));
  const [owner, setOwner] = useState<PlanOwner>('me');
  const [plan, setPlan] = useState<PlanRow | null | undefined>(undefined);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFor, setSavedFor] = useState<string | null>(null); // lives here: the form remounts on the refetch after saving

  // Blank the form only when the month or owner changes: a background refetch (app back in focus) must keep unsaved edits.
  useEffect(() => { setPlan(undefined); }, [owner, month]);
  useEffect(() => {
    if (!me) return;
    let live = true;
    setError(null);
    cached(`${me.userId}:plan:${owner}:${month}`, () => getPlan(owner, month))
      .then((r) => { if (live) { setPlan(r.data); setStale(r.stale); } })
      .catch((e) => { if (live) setError(friendlyError(e.message)); });
    return () => { live = false; };
  }, [me, owner, month, version]);

  if (!me) return null;
  const cats = categories.filter((c) => c.type === 'expense' && c.scope === (owner === 'me' ? 'personal' : 'shared'));
  return (
    <Screen title={<MonthSwitcher month={month} onChange={setMonth} />}>
      {me.householdId && (
        <div className="segmented wide" role="radiogroup" aria-label="Whose plan">
          {([['me', 'My plan'], ['household', 'Household']] as const).map(([o, label]) => (
            <button key={o} type="button" role="radio" aria-checked={owner === o} onClick={() => setOwner(o)}>{label}</button>
          ))}
        </div>
      )}
      {stale && <p className="notice-inline" role="status">Offline: showing the last loaded plan. Saving needs a connection.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {savedFor === `${owner}:${month}` && <p className="ok-text" role="status">Saved for {monthLabel(month)}.</p>}
      {plan === undefined ? (!error && <p className="muted">Loading…</p>) : (
        <PlanForm key={`${owner}:${month}:${plan?.id ?? 'new'}`} owner={owner} month={month} plan={plan} cats={cats}
          onSaved={() => { setSavedFor(`${owner}:${month}`); changed(); }} />
      )}
    </Screen>
  );
}

function PlanForm({ owner, month, plan, cats, onSaved }: { owner: PlanOwner; month: string; plan: PlanRow | null; cats: Category[]; onSaved: () => void }) {
  const [income, setIncome] = useState(toInput(plan?.expected_income_cents));
  const [savings, setSavings] = useState(toInput(plan?.savings_target_cents));
  const [limits, setLimits] = useState<Record<string, string>>(
    Object.fromEntries((plan?.limits ?? []).map((l) => [l.category_id, toInput(l.limit_cents)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const carried = plan && plan.month !== month ? plan.month : null;

  async function save(e: FormEvent) {
    e.preventDefault();
    const money = (s: string, label: string) => {
      if (!s.trim()) return 0;
      const c = parseCentsOrZero(s);
      if (c === null) throw new Error(`${label}: enter an amount like 250.00`);
      return c;
    };
    let fields;
    try {
      fields = {
        expected_income_cents: owner === 'me' ? money(income, 'Expected income') : 0,
        savings_target_cents: owner === 'me' ? money(savings, 'Savings target') : 0,
        limits: cats.filter((c) => limits[c.id]?.trim()).map((c) => ({ category_id: c.id, limit_cents: money(limits[c.id], c.name) })),
      };
    } catch (err) { setError((err as Error).message); return; }
    setBusy(true); setError(null);
    try { await savePlan(owner, month, fields); onSaved(); }
    catch (err) { setError(`Not saved. ${friendlyError((err as Error).message)}`); }
    setBusy(false);
  }

  return (
    <form className="stack plan-form" onSubmit={save}>
      {carried && <p className="muted">Carried from {monthLabel(carried)}. Saving makes a plan for {monthLabel(month)}; later months without their own plan follow it.</p>}
      {!plan && <p className="muted">No plan yet. Later months without their own plan follow this one.</p>}
      {owner === 'me' && (
        <>
          <label className="field"><span>Expected income</span>
            <input className="num" inputMode="decimal" autoComplete="off" placeholder="0.00" value={income} onChange={(e) => setIncome(e.target.value)} />
          </label>
          <label className="field"><span>Savings target</span>
            <input className="num" inputMode="decimal" autoComplete="off" placeholder="0.00" value={savings} onChange={(e) => setSavings(e.target.value)} />
          </label>
        </>
      )}
      <fieldset className="limits">
        <legend>{owner === 'me' ? 'Monthly limits' : 'Shared limits (for both of you)'}</legend>
        <p className="muted hint">Leave blank for no limit.</p>
        {cats.length === 0 && <p className="muted">No {owner === 'me' ? '' : 'shared '}expense categories yet. Add some in Settings.</p>}
        {cats.map((c) => (
          <label key={c.id} className="limit-row">
            <span>{c.name}</span>
            <input className="num" inputMode="decimal" autoComplete="off" placeholder="No limit"
              value={limits[c.id] ?? ''} onChange={(e) => setLimits({ ...limits, [c.id]: e.target.value })} />
          </label>
        ))}
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : `Save plan for ${monthLabel(month)}`}</button>
    </form>
  );
}
