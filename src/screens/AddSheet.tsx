import { useEffect, useRef, useState, type FormEvent } from 'react';
import { haptic } from '../components/Celebration';
import { SplitEditor } from '../components/SplitEditor';
import { deleteSettlement, deleteTransaction, friendlyError, listSettlements, listTransactionsRange, sendOp, settleExpenseRow } from '../lib/api';
import { cached } from '../lib/cache';
import { frequentEntries, type Frequent } from '../lib/frequent';
import { centsToPlain, formatCents, parseCents } from '../lib/money';
import { dropFromOutbox, overlaySettlements, submit } from '../lib/outbox';
import { displayName } from '../lib/profile';
import { addMonths, monthKey, todayLocal } from '../lib/month';
import { computeSplit, toSplitInput, type SplitMode } from '../lib/split';
import type { Scope, Settlement, Split, Tx, TxType } from '../lib/types';
import { partnerOf, useMe } from '../me';

const lastCatKey = (type: TxType, scope: Scope) => `cache:lastCategory:${type}:${scope}`; // cache: prefix so sign-out clears it
// Who usually pays for each shared category ("rent: me, groceries: her"), so the Paid-by default is right.
const payerKey = (categoryId: string) => `cache:payer:${categoryId}`;
const recall = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const remember = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

// Native modal <dialog>: traps focus and makes the page inert. Unmounting closes it;
// Escape arrives as 'cancel', which we route to onClose instead of relying on the 'close' event.
export function AddSheet({ editing, onClose }: { editing?: Tx; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const { me, categories, changed, outbox } = useMe();
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
  const [repeats, setRepeats] = useState<Frequent[]>([]);
  // A shared entry may already be settled on its own (migration 0015), maybe offline and not synced yet: undefined while loading.
  const [settlements, setSettlements] = useState<Settlement[] | undefined>(editing?.scope === 'shared' ? undefined : []);
  useEffect(() => {
    if (editing?.scope !== 'shared' || !me) return;
    let live = true;
    cached(`${me.userId}:settlements`, listSettlements).then((r) => { if (live) setSettlements(r.data); }).catch(() => { if (live) setSettlements([]); });
    return () => { live = false; };
  }, [editing, me?.userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const settled = settlements && (overlaySettlements(settlements, outbox).find((s) => s.transaction_id === editing?.id) ?? null);

  // Repeat chips: your most frequent entries from the last 3 months (from the offline copy when there's no signal).
  useEffect(() => {
    if (editing || !me) return;
    let live = true;
    const now = monthKey(todayLocal());
    cached(`${me.userId}:recent`, () => listTransactionsRange(addMonths(now, -2), now))
      .then((r) => { if (live) setRepeats(frequentEntries(me.userId, r.data, 4)); })
      .catch(() => { /* chips are a shortcut; without them the sheet works as before */ });
    return () => { live = false; };
  }, [editing, me]);

  useEffect(() => {
    const d = ref.current!;
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    d.addEventListener('cancel', onCancel);
    d.showModal();
    // after showModal: autoFocus would run while the dialog is still closed, and showModal would focus Cancel
    if (!editing) amountRef.current?.focus();
    return () => { d.removeEventListener('cancel', onCancel); d.close(); };
  }, [onClose, editing]);

  // Keep the whole sheet above the on-screen keyboard. Phones don't shrink the page for the keyboard; iPhone
  // scrolls everything up instead, which pushed the title and Expense/Income off the top. So sit the sheet on top
  // of the keyboard (the visual viewport's bottom) and cap its height to the space that's left.
  useEffect(() => {
    const d = ref.current!;
    const vv = window.visualViewport;
    document.documentElement.classList.add('sheet-open'); // stop the page behind from scrolling under it
    const fit = () => {
      if (!vv) return;
      d.style.bottom = `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`;
      d.style.maxHeight = `${Math.min(vv.height - 8, window.innerHeight * 0.92)}px`;
    };
    fit();
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    return () => {
      document.documentElement.classList.remove('sheet-open');
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
    };
  }, []);

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

  // New shared entry: default Paid-by to whoever paid last time in this category.
  useEffect(() => {
    if (editing || scope !== 'shared' || !selected || !partner) return;
    const last = recall(payerKey(selected.id));
    setPaidBy(last === partner.user_id ? partner.user_id : myId);
  }, [editing, scope, selected?.id, partner?.user_id, myId]); // not partner: a new object on every refresh would reset a hand-picked payer

  const repeat = (f: Frequent) => {
    if (f.scope === 'shared' && !canShare) return;
    setType(f.type); setScope(f.scope); setCategoryId(f.category_id); setAmount(centsToPlain(f.amount_cents));
    setSplitMode('equal'); setMine(''); setError(null);
  };
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Entry';
  const shownRepeats = repeats.filter((f) => (f.scope === 'personal' || canShare) && categories.some((c) => c.id === f.category_id));

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
    // The payment was for the old amounts; changing them would leave it not matching the expense.
    if (settled && editing && (cents !== editing.amount_cents || paidBy !== editing.paid_by
      || share(settled.from_user) !== editing.splits.find((x) => x.user_id === settled.from_user)?.share_cents)) {
      setError('This expense is settled. Undo the settlement below before changing the amount, split or who paid.'); return;
    }
    setBusy(true); setError(null);
    try {
      // Offline it waits on the phone and syncs later (lib/outbox); a server refusal still shows here.
      await submit(myId, { kind: 'tx', id: editing?.id ?? crypto.randomUUID(), create: !editing,
        input: { type, scope, amount_cents: cents, date, category_id: selected.id, note, ...(shared ? { paid_by: paidBy, splits: splits! } : {}) } }, sendOp);
      haptic();
      remember(lastCatKey(type, scope), selected.id);
      if (shared) remember(payerKey(selected.id), paidBy);
      changed();
      onClose();
    } catch (err) {
      setError(`Not saved. ${friendlyError((err as Error).message)}`);
      setBusy(false);
    }
  }

  async function settleShare(from = myId) {
    setBusy(true); setError(null);
    const row = settleExpenseRow(me!, editing!, from);
    try { await submit(myId, { kind: 'settle', id: row.id, row }, sendOp); haptic(); changed(); onClose(); }
    catch (err) { setError(`Not settled. ${friendlyError((err as Error).message)}`); setBusy(false); }
  }
  async function undoSettle() {
    if (!settled || !confirm('Undo this settlement? The amount goes back on the balance.')) return;
    setBusy(true); setError(null);
    try {
      if (settled.pending) dropFromOutbox(myId, settled.id); // never reached the server
      else { await deleteSettlement(settled.id); setSettlements((l) => l?.filter((s) => s.id !== settled.id)); }
      changed();
    }
    catch (err) { setError(`Not undone. ${friendlyError((err as Error).message)}`); }
    setBusy(false);
  }

  async function remove() {
    if (!editing || !confirm(shared ? 'Delete this shared entry for both of you?' : 'Delete this entry?')) return;
    setBusy(true); setError(null);
    // An entry made offline only needs forgetting; a waiting edit of a synced one goes with the delete.
    const queued = outbox.find((o) => o.id === editing.id);
    try {
      if (!(queued?.kind === 'tx' && queued.create)) await deleteTransaction(editing.id);
      dropFromOutbox(myId, editing.id); changed(); onClose();
    }
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

        {!editing && shownRepeats.length > 0 && (
          <div className="repeats" role="group" aria-label="Repeat a frequent entry">
            {shownRepeats.map((f) => (
              <button key={`${f.scope}${f.category_id}${f.amount_cents}`} type="button" className="repeat" onClick={() => repeat(f)}>
                <span>{catName(f.category_id)}</span> <span className="num">{formatCents(f.amount_cents)}</span>
                {f.scope === 'shared' && <span className="tag shared"> · shared</span>}
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
              {[[myId, 'I paid'], [partner.user_id, `${displayName(partner)} paid`]].map(([id, label]) => (
                <button key={id} type="button" aria-pressed={paidBy === id} onClick={() => setPaidBy(id)}>{label}</button>
              ))}
            </div>
            <SplitEditor mode={splitMode} mine={mine} onMode={(m) => { setSplitMode(m); setMine(''); }} onMine={setMine}
              myShare={share(myId)} partnerShare={share(partner.user_id)} partnerName={displayName(partner)} error={splitError} />
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
        {editing?.scope === 'shared' && partner && settled !== undefined && (() => {
          const myShare = editing.splits.find((x) => x.user_id === myId)?.share_cents ?? 0;
          const theirShare = editing.splits.find((x) => x.user_id === partner.user_id)?.share_cents ?? 0;
          const them = displayName(partner);
          if (settled) return (
            <div className="settle-box done" role="status">
              <span>✓ Settled: {settled.from_user === myId ? 'you' : them} paid {formatCents(settled.amount_cents)} on {settled.date}</span>
              <button type="button" className="btn small" onClick={undoSettle} disabled={busy}>Undo</button>
            </div>
          );
          if (editing.paid_by !== myId) return myShare > 0 && (
            <button type="button" className="btn settle" onClick={() => settleShare()} disabled={busy}>Settle my share · {formatCents(myShare)} to {them}</button>
          );
          if (theirShare <= 0) return null;
          // The household admin can record the partner's payment for this expense (migration 0016).
          return me!.isAdmin
            ? <button type="button" className="btn settle" onClick={() => settleShare(partner.user_id)} disabled={busy}>Record {them}'s payment · {formatCents(theirShare)}</button>
            : <p className="settle-box muted">{them} owes you {formatCents(theirShare)} for this. They can settle it from their phone.</p>;
        })()}
        {editing && <button type="button" className="btn danger" onClick={remove} disabled={busy}>Delete entry</button>}
      </form>
    </dialog>
  );
}
