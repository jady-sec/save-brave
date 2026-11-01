import { useEffect, useState, type FormEvent } from 'react';
import { celebrate, haptic } from '../components/Celebration';
import { Screen } from '../components/Screen';
import { addContribution, deleteGoal, friendlyError, listContributions, listGoals, saveGoal } from '../lib/api';
import { cached } from '../lib/cache';
import { goalProgress, type Contribution, type Goal } from '../lib/goals';
import { formatCents, parseCents } from '../lib/money';
import { displayName } from '../lib/profile';
import { partnerOf, useMe } from '../me';

/** The app's jar, filled to the goal's progress. */
function JarMeter({ pct, id }: { pct: number; id: string }) {
  const h = (48 * pct) / 100;
  return (
    <svg viewBox="0 0 96 96" className="jar-meter" aria-hidden="true">
      <defs><clipPath id={`jar-${id}`}><rect x="29" y="26" width="38" height="48" rx="10" /></clipPath></defs>
      <rect x="30" y="27" width="42" height="52" rx="12" fill="#111" />
      <rect x="27" y="24" width="42" height="52" rx="12" fill="#fff" />
      <rect x="27" y={74 - h} width="42" height={h} fill="var(--tone-0)" clipPath={`url(#jar-${id})`} />
      <rect x="27" y="24" width="42" height="52" rx="12" fill="none" stroke="#111" strokeWidth="4" />
      <rect x="31" y="16" width="34" height="10" rx="4" fill="#b98cff" stroke="#111" strokeWidth="3.5" />
    </svg>
  );
}

function GoalForm({ goal, onDone, onCancel }: { goal?: Goal; onDone: () => void; onCancel: () => void }) {
  const { me } = useMe();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? String(goal.target_cents / 100) : '');
  const [shared, setShared] = useState(goal ? !!goal.household_id : !!me?.householdId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  async function save(e: FormEvent) {
    e.preventDefault();
    const n = name.trim().replace(/\s+/g, ' ');
    const cents = parseCents(target);
    if (!n || n.length > 40) { setError('Give the goal a name of up to 40 characters.'); return; }
    if (!cents || cents <= 0) { setError('Enter a target amount, like 3000.'); return; }
    setBusy(true); setError(null);
    try { await saveGoal(me!, { id: goal?.id, name: n, target_cents: cents, shared }); onDone(); }
    catch (err) { setError(friendlyError((err as Error).message)); setBusy(false); }
  }

  return (
    <form className="stack goal-form" onSubmit={save}>
      <h2>{goal ? 'Edit goal' : 'New goal'}</h2>
      <label className="field"><span>Name</span><input value={name} maxLength={40} placeholder="Trip to Banff" onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>Target</span><input inputMode="decimal" value={target} placeholder="3000" onChange={(e) => setTarget(e.target.value)} /></label>
      {me.householdId && !goal && (
        <div className="segmented scope" role="group" aria-label="Personal or shared">
          <button type="button" aria-pressed={!shared} onClick={() => setShared(false)}>Just me</button>
          <button type="button" className="shared" aria-pressed={shared} onClick={() => setShared(true)}>Together</button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button type="button" className="btn grow" onClick={onCancel}>Cancel</button>
        <button className="btn primary grow" disabled={busy}>{busy ? 'Saving…' : 'Save goal'}</button>
      </div>
    </form>
  );
}

function GoalCard({ goal, contributions, onChange, onEdit }: { goal: Goal; contributions: Contribution[]; onChange: () => void; onEdit: () => void }) {
  const { me, stale } = useMe();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const p = goalProgress(goal.target_cents, contributions);
  const partner = partnerOf(me);
  const shared = !!goal.household_id;

  async function move(sign: 1 | -1) {
    const cents = parseCents(amount);
    if (!cents || cents <= 0) { setError('Enter an amount first.'); return; }
    setBusy(true); setError(null);
    try {
      await addContribution(me!, goal.id, sign * cents);
      haptic();
      if (!p.done && p.saved + sign * cents >= goal.target_cents) celebrate(`${goal.name}: goal reached!`);
      setAmount(''); onChange();
    }
    catch (err) { setError(friendlyError((err as Error).message)); }
    setBusy(false);
  }
  async function remove() {
    if (!confirm(`Delete “${goal.name}” and its history? This can’t be undone.`)) return;
    try { await deleteGoal(goal.id); onChange(); } catch (err) { setError(friendlyError((err as Error).message)); }
  }

  return (
    <li className={`goal-card ${p.done ? 'done' : ''}`}>
      <div className="goal-head">
        <JarMeter pct={p.pct} id={goal.id} />
        <div className="goal-text">
          <strong className="goal-name">{goal.name}</strong>
          <span className={shared ? 'tag shared' : 'tag'}>{shared ? 'Together' : 'Just me'}</span>
          <span className="num"><strong>{formatCents(p.saved)}</strong> of {formatCents(goal.target_cents)}</span>
          <span className="muted">{p.done ? 'Goal reached' : `${formatCents(p.left)} to go · ${p.pct}%`}</span>
        </div>
      </div>
      <div className="bar" role="img" aria-label={`${p.pct}% saved`}><span style={{ width: `${p.pct}%` }} /></div>
      {shared && partner && (
        <p className="goal-split num">You {formatCents(p.byUser[me.userId] ?? 0)} · {displayName(partner)} {formatCents(p.byUser[partner.user_id] ?? 0)}</p>
      )}
      <div className="goal-move">
        <label className="field grow"><span className="sr-only">Amount for {goal.name}</span>
          <input inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => { setAmount(e.target.value); setError(null); }} disabled={stale} />
        </label>
        <button type="button" className="btn primary" onClick={() => move(1)} disabled={busy || stale}>Add</button>
        <button type="button" className="btn" onClick={() => move(-1)} disabled={busy || stale}>Take out</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="rule-actions">
        <button type="button" className="btn small" onClick={onEdit} disabled={stale}>Edit</button>
        <button type="button" className="btn small danger" onClick={remove} disabled={stale}>Delete</button>
      </div>
    </li>
  );
}

export function Goals() {
  const { me, version, changed, stale } = useMe();
  const [data, setData] = useState<{ goals: Goal[]; contributions: Contribution[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);

  useEffect(() => {
    if (!me) return;
    let live = true;
    Promise.all([cached(`${me.userId}:goals`, listGoals), cached(`${me.userId}:goal-contributions`, listContributions)])
      .then(([g, c]) => { if (live) { setData({ goals: g.data, contributions: c.data }); setError(null); } })
      .catch((e) => { if (live) setError(friendlyError(e.message)); });
    return () => { live = false; };
  }, [me, version]);

  if (!me) return null;
  const byGoal = (id: string) => data?.contributions.filter((c) => c.goal_id === id) ?? [];
  const total = data ? data.contributions.reduce((s, c) => s + c.amount_cents, 0) : 0;

  return (
    <Screen title="Goals" hero={data && (
      <>
        <p className="hero-label">Saved toward goals</p>
        <p className="hero-figure num">{formatCents(total)}</p>
        <p className="hero-sub">{data.goals.length} {data.goals.length === 1 ? 'goal' : 'goals'}</p>
      </>
    )}>
      {stale && <p className="notice-inline" role="status">Offline: showing the last loaded goals. Changes need a connection.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {editing ? (
        <GoalForm key={editing === 'new' ? 'new' : editing.id} goal={editing === 'new' ? undefined : editing}
          onDone={() => { setEditing(null); changed(); }} onCancel={() => setEditing(null)} />
      ) : (
        <button type="button" className="btn primary wide-btn" onClick={() => setEditing('new')} disabled={stale}>New goal</button>
      )}
      {!data ? (!error && <p className="muted">Loading…</p>) : data.goals.length === 0 ? (
        !editing && <p className="empty muted">Saving for a trip, a sofa or a rainy day? Start a goal and put money toward it together.</p>
      ) : (
        <ul className="goal-list">
          {data.goals.map((g) => <GoalCard key={g.id} goal={g} contributions={byGoal(g.id)} onChange={changed} onEdit={() => setEditing(g)} />)}
        </ul>
      )}
    </Screen>
  );
}
