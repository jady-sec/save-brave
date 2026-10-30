import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SplitEditor } from '../components/SplitEditor';
import { deleteTransaction, friendlyError, saveTransaction } from '../lib/api';
import { centsToPlain, formatCents, parseCents } from '../lib/money';
import { todayLocal } from '../lib/month';
import { computeSplit, toSplitInput, type SplitMode } from '../lib/split';
import type { Scope, Split, Tx, TxType } from '../lib/types';
import { partnerOf, useMe } from '../me';

const lastCatKey = (type: TxType, scope: Scope) => `cache:lastCategory:${type}:${scope}`; // cache: prefix so sign-out clears it
const recall = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const remember = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const nameOf = (email: string) => email.split('@')[0];

// Native modal <dialog>: traps focus and makes the page inert. Unmounting closes it;
// Escape arrives as 'cancel', which we route to onClose instead of relying on the 'close' event.
export function AddSheet({ editing, onClose }: { editing?: Tx; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const { me, categories, changed } = useMe();
  const partner = me ? partnerOf(me) : null;
  const myId = me?.userId ?? '';
  const [type, setType] = useState<TxType>(editing?.type ?? 'expense');
  const [scope, setScope] = useState<Scope>(editing?.scope ?? 'personal');
  const [amount, setAmount] = useState(editing ? centsToPlain(editing.amount_cents) : '');
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category_id ?? null);
  const [date, setDate] = useState(editing?.date ?? todayLocal());
  const [note, setNote] = useState(editing?.note ?? '');
  const [paidBy, setPaidBy] = useState(editing?.paid_by ?? myId);
  // An existing shared entry opens on its stored shares (as "Amounts") unless they are the plain 50/50.
  const storedMine = editing?.splits.find((s) => s.user_id === myId)?.share_cents;
  const storedIsEqual = editing?.scope === 'shared' && partner
    && computeSplit(editing.amount_cents, editing.paid_by, [myId, partner.user_id], { mode: 'equal' })
      .every((s) => editing.splits.some((x) => x.user_id === s.user_id && x.share_cents === s.share_cents));
  const [splitMode, setSplitMode] = useState<SplitMode>(editing?.scope === 'shared' && !storedIsEqual ? 'amounts' : 'equal');
  const [mine, setMine] = useState(storedMine !== undefined && !storedIsEqual ? centsToPlain(storedMine) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current!;
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    d.addEventListener('cancel', onCancel);
    d.showModal();
    // after showModal: autoFocus would run while the dialog is still closed, and showModal would focus Cancel
    if (!editing) amountRef.current?.focus();
    return () => { d.removeEventListener('cancel', onCancel); d.close(); };
  }, [onClose, editing]);

  const shared = scope === 'shared';
  // Shared needs a partner: a split made while alone couldn't cover both members once they join.
  const canShare = !!partner && type === 'expense' && !editing;
  const choices = categories.filter((c) => c.type === type && c.scope === scope);
  // Preselect the last-used category for this type so the common add is: amount, Save.
  // When editing, never fall back: a silently different category would be saved.
  const selected = choices.find((c) => c.id === categoryId)
    ?? (editing && categoryId ? null : choices.find((c) => c.id === recall(lastCatKey(type, scope))) ?? choices[0] ?? null);
  const cents = parseCents(amount);
  const today = todayLocal();

  let splits: Split[] | null = null;
  let splitError: string | null = null;
  if (shared && partner && cents && (splitMode === 'equal' || mine.trim())) { // no error before they type their share
    try { splits = computeSplit(cents, paidBy, [myId, partner.user_id], toSplitInput(splitMode, mine, cents, myId, partner.user_id)); }
    catch (e) { splitError = (e as Error).message; }
  }
  const share = (id: string) => splits?.find((s) => s.user_id === id)?.share_cents ?? null;

  async function save(e: FormEvent) {
    e.preventDefault();
    // Say what's missing instead of a silently disabled button.
    if (!cents) { setError('Enter an amount first.'); amountRef.current?.focus(); return; }
    if (!selected) { setError(choices.length ? 'Pick a category.' : `Add a ${shared ? 'shared ' : ''}${type} category in Settings first.`); return; }
    if (shared && !splits) { setError(splitError ?? 'Enter your share.'); return; }
    setBusy(true); setError(null);
    try {
      await saveTransaction({ id: editing?.id, type, scope, amount_cents: cents, date, category_id: selected.id, note,
        ...(shared ? { paid_by: paidBy, splits: splits! } : {}) });
      remember(lastCatKey(type, scope), selected.id);
      changed();
      onClose();
    } catch (err) {
      setError(`Not saved. ${friendlyError((err as Error).message)}`);
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing || !confirm(shared ? 'Delete this shared entry for both of you?' : 'Delete this entry?')) return;
    setBusy(true); setError(null);
    try { await deleteTransaction(editing.id); changed(); onClose(); }
    catch (err) { setError(`Not deleted. ${friendlyError((err as Error).message)}`); setBusy(false); }
  }

  return (
    <dialog className="sheet" aria-labelledby="add-title" ref={ref}
      onClick={(e) => e.target === ref.current && onClose()}>
      <form onSubmit={save} className="add-form">
        <div className="sheet-head">
          <h2 id="add-title">{editing ? `Edit ${shared ? 'shared ' : ''}entry` : 'Add entry'}</h2>
          <button type="button" className="btn ghost close" onClick={onClose}>Cancel</button>
        </div>

        <div className="segmented" role="group" aria-label="Entry type">
          {(['expense', 'income'] as const).map((t) => (
            <button key={t} type="button" aria-pressed={type === t} disabled={!!editing && shared}
              onClick={() => { setType(t); setCategoryId(null); if (t === 'income') setScope('personal'); }}>
              {t === 'expense' ? 'Expense' : 'Income'}
            </button>
          ))}
        </div>

        {canShare && (
          <div className="segmented scope" role="group" aria-label="Personal or shared">
            {(['personal', 'shared'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={scope === s} className={s}
                onClick={() => { setScope(s); setCategoryId(null); }}>
                {s === 'personal' ? 'Just me' : 'Shared'}
              </button>
            ))}
          </div>
        )}

        <label className="amount">
          <span className="sr-only">Amount in dollars</span>
          <span className="currency" aria-hidden="true">$</span>
          <input className="num" inputMode="decimal" autoComplete="off" placeholder="0.00" ref={amountRef}
            value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={amount !== '' && !cents} />
        </label>
        {amount !== '' && !cents && <p className="hint error">Enter an amount like 12.50</p>}

        <fieldset className="chips">
          <legend className="sr-only">Category</legend>
          {choices.map((c) => (
            <label key={c.id} className={`chip ${selected?.id === c.id ? 'on' : ''}`}>
              <input type="radio" name="category" className="sr-only" checked={selected?.id === c.id} onChange={() => setCategoryId(c.id)} />
              {c.name}
            </label>
          ))}
          {choices.length === 0 && <p className="muted">No {shared ? 'shared ' : ''}{type} categories yet. Add one in Settings.</p>}
        </fieldset>

        {shared && partner && (
          <>
            <div className="segmented" role="group" aria-label="Paid by">
              {[[myId, 'I paid'], [partner.user_id, `${nameOf(partner.email)} paid`]].map(([id, label]) => (
                <button key={id} type="button" aria-pressed={paidBy === id} onClick={() => setPaidBy(id)}>{label}</button>
              ))}
            </div>
            <SplitEditor mode={splitMode} mine={mine} onMode={(m) => { setSplitMode(m); setMine(''); }} onMine={setMine}
              myShare={share(myId)} partnerShare={share(partner.user_id)} partnerName={nameOf(partner.email)} error={splitError} />
          </>
        )}

        <div className="row">
          <label className="field grow">
            <span>Date</span>
            <input type="date" required value={date} max="2100-12-31" onChange={(e) => setDate(e.target.value || today)} />
          </label>
        </div>
        <label className="field">
          <span>Note <span className="muted">(optional)</span></span>
          <input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary save" disabled={busy}>
          {busy ? 'Saving…' : cents ? `Save ${formatCents(cents)}` : 'Save'}
        </button>
        {editing && <button type="button" className="btn danger" onClick={remove} disabled={busy}>Delete entry</button>}
      </form>
    </dialog>
  );
}
