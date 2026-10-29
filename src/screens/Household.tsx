import { useState, type FormEvent } from 'react';
import { createHousehold, createInvite, friendlyError, redeemInvite } from '../lib/api';
import { partnerOf, useMe } from '../me';

const JOIN_KEY = 'pendingJoin';
export const pendingJoin = () => { try { return localStorage.getItem(JOIN_KEY); } catch { return null; } };
export const setPendingJoin = (code: string | null) => {
  try { code ? localStorage.setItem(JOIN_KEY, code) : localStorage.removeItem(JOIN_KEY); } catch { /* private mode */ }
};

export function Household({ onSkip }: { onSkip?: () => void }) {
  const { me, refresh } = useMe();
  const [name, setName] = useState('Home');
  const [code, setCode] = useState(pendingJoin() ?? '');
  const [invite, setInvite] = useState<{ code: string; until: Date } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function act(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(friendlyError((e as Error).message)); } finally { setBusy(false); }
  }

  const create = (e: FormEvent) => { e.preventDefault(); act(async () => { await createHousehold(name.trim()); await refresh(); }); };
  const join = (e: FormEvent) => {
    e.preventDefault();
    act(async () => {
      if (!(await redeemInvite(code))) {
        setPendingJoin(null);
        throw new Error('That code is wrong, already used or expired. Ask your partner for a new one.');
      }
      setPendingJoin(null);
      await refresh();
    });
  };
  const newInvite = () => act(async () => {
    setCopied(false);
    setInvite({ code: await createInvite(), until: new Date(Date.now() + 48 * 3600e3) });
  });

  if (!me) return null;
  const partner = partnerOf(me);

  if (!me.householdId) {
    return (
      <main className="screen">
        <h1>Set up your household</h1>
        <p className="muted">Shared costs and the balance need a household with your partner. Your personal entries stay private either way.</p>
        <form onSubmit={join} className="stack section">
          <h2>Join your partner</h2>
          <label className="field">
            <span>Invite code</span>
            <input className="num code" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={12} required
              value={code} onChange={(e) => setCode(e.target.value.replace(/s/g, ''))} />
          </label>
          <button className="btn primary" disabled={busy || code.trim().length < 8}>Join household</button>
        </form>
        <form onSubmit={create} className="stack section">
          <h2>Or start one</h2>
          <label className="field">
            <span>Household name</span>
            <input maxLength={60} required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn" disabled={busy || !name.trim()}>Create household</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        {onSkip && <button type="button" className="btn ghost" onClick={onSkip}>Skip for now</button>}
      </main>
    );
  }

  const link = invite && `${location.origin}/?join=${invite.code}`;
  async function share() {
    if (!link) return;
    try {
      if (navigator.share) await navigator.share({ title: 'Join me on Save Brave', text: `Invite code: ${invite!.code}`, url: link });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(link); setCopied(true); }
    } catch { /* user cancelled the share sheet; the link is still shown to copy by hand */ }
  }

  return (
    <main className="screen">
      <h1>{me.householdName}</h1>
      <ul className="list members">
        {me.members.map((m) => <li key={m.user_id}>{m.email}{m.user_id === me.userId && <span className="muted"> (you)</span>}</li>)}
      </ul>
      {!partner && (
        <section className="stack section">
          <h2>Invite your partner</h2>
          {invite ? (
            <>
              <p className="invite-code num"><span className="sr-only">Invite code </span>{invite.code}</p>
              <p className="invite-link">{link}</p>
              <p className="muted">Works once, until {invite.until.toLocaleString('en-CA', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}. They sign in, then enter this code or open the link. Making a new code cancels this one.</p>
              <button type="button" className="btn primary" onClick={share}>{copied ? 'Link copied' : 'Share invite link'}</button>
              <button type="button" className="btn" onClick={newInvite} disabled={busy}>Make a new code</button>
            </>
          ) : (
            <>
              <p className="muted">This cancels any code you made earlier.</p>
              <button type="button" className="btn primary" onClick={newInvite} disabled={busy}>Create invite code</button>
            </>
          )}
        </section>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}

