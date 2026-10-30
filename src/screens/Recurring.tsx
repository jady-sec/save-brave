import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Screen } from '../components/Screen';
import { SplitEditor } from '../components/SplitEditor';
import { deleteRecurring, friendlyError, listRecurring, saveRecurring, setRecurringActive } from '../lib/api';
import { cached } from '../lib/cache';
import { centsToPlain, formatCents, parseCents } from '../lib/money';
import { todayLocal } from '../lib/month';
import { computeSplit, toSplitInput, type SplitMode } from '../lib/split';
import type { RecurringRule, Scope, TxType } from '../lib/types';
import { partnerOf, useMe } from '../me';

const ordinal = (n: number) => `${n}${[11, 12, 13].includes(n) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

export function Recurring() {
  const { me, categories, version, changed } = useMe();
  const [rules, setRules] = useState<RecurringRule[] | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecurringRule | 'new' | null>(null);

  useEffect(() => {
    if (!me) return;
    let live = true;
    cached(`${me.userId}:recurring`, listRecurring)
      .then((r) => { if (live) { setRules(r.data); setStale(r.stale); } })
      .catch((e) => { if (live) setError(friendlyError(e.message)); });
    return () => { live = false; };
  }, [me, version]);

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  if (!me) return null;

  async function act(fn: () => Promise<void>, failed: string) {
    setError(null);
    try { await fn(); changed(); } catch (e) { setError(`${failed} ${friendlyError((e as Error).message)}`); }
  }

  return (
    <Screen title="Recurring" hero={<p className="hero-sub">Added automatically each month when the app opens</p>}>
      {stale && <p className="notice-inline" role="status">Offline: showing the last loaded items. Changes need a connection.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {editing ? (
        <RuleForm key={editing === 'new' ? 'new' : editing.id} rule={editing === 'new' ? undefined : editing}
          onDone={() => { setEditing(null); changed(); }} onCancel={() => setEditing(null)} />
      ) : (
        <>
          <button type="button" className="btn primary wide-btn" onClick={() => setEditing('new')}>Add recurring item</button>
          {rules === null ? (!error && <p className="muted">Loading…</p>) : rules.length === 0 ? (
            <p className="empty muted">Nothing recurring yet. Rent, salary and subscriptions are good candidates.</p>
          ) : (
            <ul className="tx-list rules">
              {rules.map((r) => (
                <li key={r.id} className={r.active ? '' : 'paused'}>
                  <button type="button" onClick={() => setEditing(r)}>
                    <span className="tx-main">
                      <span className="tx-cat">{catName.get(r.category_id) ?? 'Category'}{r.note ? ` · ${r.note}` : ''}</span>
                      <span className="tx-note">
                        Monthly on the {ordinal(r.day_of_month)}{r.scope === 'shared' ? ' · Shared' : ''}{r.active ? '' : ' · Paused'}
                      </span>
                    </span>
                    <span className={`tx-amt num ${r.type}`}>{r.type === 'income' ? '+' : '−'}{formatCents(r.amount_cents)}</span>
                  </button>
                  <div className="rule-actions">
                    <button type="button" className="btn small" aria-label={`${r.active ? 'Pause' : 'Resume'} ${catName.get(r.category_id) ?? 'item'}`} onClick={() => act(() => setRecurringActive(r, !r.active, todayLocal()), 'Not changed.')}>
                      {r.active ? 'Pause' : 'Resume'}
                    </button>
                    <button type="button" className="btn small danger" aria-label={`Delete ${catName.get(r.category_id) ?? 'item'}`} onClick={() =>
                      confirm('Delete this recurring item? Entries it already added stay.') && act(() => deleteRecurring(r.id), 'Not deleted.')}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Screen>
  );
}

function RuleForm({ rule, onDone, onCancel }: { rule?: RecurringRule; onDone: () => void; onCancel: () => void }) {
  const { me, categories } = useMe();
  const partner = me ? partnerOf(me) : null;
  const myId = me!.userId;
  const [type, setType] = useState<TxType>(rule?.type ?? 'expense');
  const [scope, setScope] = useState<Scope>(rule?.scope ?? 'personal');
  const [amount, setAmount] = useState(rule ? centsToPlain(rule.amount_cents) : '');
  const [categoryId, setCategoryId] = useState<string | null>(rule?.category_id ?? null);
  const [day, setDay] = useState(String(rule?.day_of_month ?? Number(todayLocal().slice(8))));
  const [start, setStart] = useState(rule?.start_date ?? todayLocal());
  const [note, setNote] = useState(rule?.note ?? '');
  const [paidBy, setPaidBy] = useState(rule?.paid_by ?? myId);
  const stored = rule?.split;
  const [splitMode, setSplitMode] = useState<SplitMode>(stored?.mode ?? 'equal');
  const [mine, setMine] = useState(stored?.mode === 'amounts' ? centsToPlain(stored.cents[myId] ?? 0)
    : stored?.mode === 'percent' ? String(stored.pct[myId] ?? '') : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shared = scope === 'shared';
  const choices = categories.filter((c) => c.type === type && c.scope === scope);
  const selected = choices.find((c) => c.id === categoryId) ?? (rule ? null : choices[0] ?? null);
  const cents = parseCents(amount);
  const dayN = /^\d{1,2}$/.test(day) && +day >= 1 && +day <= 31 ? +day : null;

  let splitError: string | null = null;
  let preview: [number, number] | null = null;
  const splitInput = partner && cents ? toSplitInput(splitMode, mine, cents, myId, partner.user_id) : null;
  if (shared && partner && cents && (splitMode === 'equal' || mine.trim())) {
    try {
      const s = computeSplit(cents, paidBy, [myId, partner.user_id], splitInput!);
      preview = [s.find((x) => x.user_id === myId)!.share_cents, s.find((x) => x.user_id !== myId)!.share_cents];
    } catch (e) { splitError = (e as Error).message; }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!cents) return setError('Enter an amount first.');
    if (!selected) return setError(choices.length ? 'Pick a category.' : 'Add a category in Settings first.');
    if (!dayN) return setError('Day of month must be 1 to 31.');
    if (shared && !preview) return setError(splitError ?? 'Enter your share.');
    setBusy(true); setError(null);
    try {
      await saveRecurring(me!, {
        type, scope, amount_cents: cents, category_id: selected.id, note: note.trim() || null, day_of_month: dayN, start_date: start,
        paid_by: shared ? paidBy : myId, split: shared ? splitInput : null,
      }, rule?.id);
      onDone();
    } catch (err) { setError(`Not saved. ${friendlyError((err as Error).message)}`); setBusy(false); }
  }

  return (
    <form className="add-form" onSubmit={save}>
      <h2 className="section-title">{rule ? 'Edit recurring item' : 'New recurring item'}</h2>
      <div className="segmented" role="radiogroup" aria-label="Entry type">
        {(['expense', 'income'] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={type === t} disabled={!!rule}
            onClick={() => { setType(t); setCategoryId(null); if (t === 'income') setScope('personal'); }}>
            {t === 'expense' ? 'Expense' : 'Income'}
          </button>
        ))}
      </div>
      {partner && type === 'expense' && !rule && (
        <div className="segmented scope" role="radiogroup" aria-label="Personal or shared">
          {(['personal', 'shared'] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={scope === s} className={s} onClick={() => { setScope(s); setCategoryId(null); }}>
              {s === 'personal' ? 'Just me' : 'Shared'}
            </button>
          ))}
        </div>
      )}
      <label className="amount">
        <span className="sr-only">Amount in dollars</span>
        <span className="currency" aria-hidden="true">$</span>
        <input className="num" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <fieldset className="chips">
        <legend className="sr-only">Category</legend>
        {choices.map((c) => (
          <label key={c.id} className={`chip ${selected?.id === c.id ? 'on' : ''}`}>
            <input type="radio" name="rule-category" className="sr-only" checked={selected?.id === c.id} onChange={() => setCategoryId(c.id)} />
            {c.name}
          </label>
        ))}
      </fieldset>
      {shared && partner && (
        <>
          <div className="segmented" role="radiogroup" aria-label="Paid by">
            {[[myId, 'I pay'], [partner.user_id, `${partner.email.split('@')[0]} pays`]].map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={paidBy === id} onClick={() => setPaidBy(id)}>{label}</button>
            ))}
          </div>
          <SplitEditor mode={splitMode} mine={mine} onMode={(m) => { setSplitMode(m); setMine(''); }} onMine={setMine}
            myShare={preview?.[0] ?? null} partnerShare={preview?.[1] ?? null} partnerName={partner.email.split('@')[0]} error={splitError} />
        </>
      )}
      <div className="row">
        <label className="field grow"><span>Day of month</span>
          <input className="num" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} aria-describedby="day-hint" />
        </label>
        <label className="field grow"><span>Starting</span>
          <input type="date" required value={start} onChange={(e) => setStart(e.target.value || todayLocal())} />
        </label>
      </div>
      <p id="day-hint" className="muted hint-tight">29–31 fall on the last day in shorter months.{rule ? '' : ' If the start date is in the past, those months are added too.'}</p>
      <label className="field"><span>Note <span className="muted">(optional)</span></span>
        <input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary save" disabled={busy}>{busy ? 'Saving…' : 'Save recurring item'}</button>
      <button type="button" className="btn" onClick={onCancel}>Cancel</button>
    </form>
  );
}
