import { useEffect, useRef, useState, type FormEvent } from 'react';
import { deleteTransaction, friendlyError, saveTransaction } from '../lib/api';
import { formatCents, parseCents } from '../lib/money';
import { todayLocal } from '../lib/month';
import type { Tx, TxType } from '../lib/types';
import { useMe } from '../me';

const lastCatKey = (type: TxType) => `cache:lastCategory:${type}`; // cache: prefix so sign-out clears it
const recall = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const remember = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const centsToInput = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;

// Native modal <dialog>: traps focus and makes the page inert. Unmounting closes it;
// Escape arrives as 'cancel', which we route to onClose instead of relying on the 'close' event.
export function AddSheet({ editing, onClose }: { editing?: Tx; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const { categories, changed } = useMe();
  const [type, setType] = useState<TxType>(editing?.type ?? 'expense');
  const [amount, setAmount] = useState(editing ? centsToInput(editing.amount_cents) : '');
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category_id ?? null);
  const [date, setDate] = useState(editing?.date ?? todayLocal());
  const [note, setNote] = useState(editing?.note ?? '');
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

  const choices = categories.filter((c) => c.type === type && c.scope === 'personal');
  // Preselect the last-used category for this type so the common add is: amount, Save.
  // When editing, never fall back: a silently different category would be saved.
  const selected = choices.find((c) => c.id === categoryId)
    ?? (editing && categoryId ? null : choices.find((c) => c.id === recall(lastCatKey(type))) ?? choices[0] ?? null);
  const readOnly = editing?.scope === 'shared'; // shared editing arrives with the split editor (M5)
  const cents = parseCents(amount);
  const today = todayLocal();

  async function save(e: FormEvent) {
    e.preventDefault();
    // Say what's missing instead of a silently disabled button.
    if (!cents) { setError('Enter an amount first.'); amountRef.current?.focus(); return; }
    if (!selected) { setError(choices.length ? 'Pick a category.' : `Add a ${type} category in Settings first.`); return; }
    setBusy(true); setError(null);
    try {
      await saveTransaction({ id: editing?.id, type, scope: 'personal', amount_cents: cents, date, category_id: selected.id, note });
      remember(lastCatKey(type), selected.id);
      changed();
      onClose();
    } catch (err) {
      setError(`Not saved. ${friendlyError((err as Error).message)}`);
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing || !confirm('Delete this entry?')) return;
    setBusy(true); setError(null);
    try { await deleteTransaction(editing.id); changed(); onClose(); }
    catch (err) { setError(`Not deleted. ${friendlyError((err as Error).message)}`); setBusy(false); }
  }

  return (
    <dialog className="sheet" aria-labelledby="add-title" ref={ref}
      onClick={(e) => e.target === ref.current && onClose()}>
      <form onSubmit={save} className="add-form">
        <div className="sheet-head">
          <h2 id="add-title">{editing ? 'Edit entry' : 'Add entry'}</h2>
          <button type="button" className="btn ghost close" onClick={onClose}>Cancel</button>
        </div>

        <div className="segmented" role="radiogroup" aria-label="Entry type">
          {(['expense', 'income'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={type === t} disabled={!!editing && editing.scope === 'shared'}
              onClick={() => { setType(t); setCategoryId(null); }}>
              {t === 'expense' ? 'Expense' : 'Income'}
            </button>
          ))}
        </div>

        <label className="amount">
          <span className="sr-only">Amount in dollars</span>
          <span className="currency" aria-hidden="true">$</span>
          <input className="num" inputMode="decimal" autoComplete="off" placeholder="0.00" ref={amountRef} disabled={readOnly}
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
          {choices.length === 0 && <p className="muted">No {type} categories yet. Add one in Settings.</p>}
        </fieldset>

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

        {readOnly && <p className="muted">Editing shared entries is coming soon. You can delete it.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary save" hidden={readOnly} disabled={busy}>
          {busy ? 'Saving…' : cents ? `Save ${formatCents(cents)}` : 'Save'}
        </button>
        {editing && <button type="button" className="btn danger" onClick={remove} disabled={busy}>Delete entry</button>}
      </form>
    </dialog>
  );
}
