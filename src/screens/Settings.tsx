import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Screen } from '../components/Screen';
import { deleteCategory, friendlyError, fullBackup, listForExport, saveCategory, saveProfile } from '../lib/api';
import { AVATARS, TONES, cleanName, displayName, type AvatarKey } from '../lib/profile';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';
import { clearCache } from '../lib/cache';
import { toCsv } from '../lib/csv';
import { exportRows } from '../lib/export';
import { todayLocal } from '../lib/month';
import { supabase } from '../lib/supabase';
import type { Scope, TxType } from '../lib/types';
import { partnerOf, useMe } from '../me';
import { setPendingJoin } from './Household';

/** Name and avatar, shown to you and your partner (Month greeting, Balance, shared entries). */
function ProfileEditor() {
  const { me, refresh } = useMe();
  const [name, setName] = useState(me ? displayName({ email: me.email, display_name: me.profile?.display_name }).slice(0, 24) : '');
  const [avatar, setAvatar] = useState<AvatarKey>(me?.profile?.avatar ?? 'fox');
  const [tone, setTone] = useState(me?.profile?.tone ?? 0);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  async function save(e: FormEvent) {
    e.preventDefault();
    const n = cleanName(name);
    if (!n) { setMsg({ error: 'Enter a name of up to 24 characters.' }); return; }
    setBusy(true); setMsg({});
    try { await saveProfile(me!.userId, { display_name: n, avatar, tone }); setName(n); await refresh(); setMsg({ ok: 'Profile saved' }); }
    catch (err) { setMsg({ error: friendlyError((err as Error).message) }); }
    finally { setBusy(false); }
  }

  return (
    <section className="stack" id="profile">
      <div className="profile-preview">
        <Avatar who={{ email: me.email, display_name: name, avatar, tone }} size={72} />
        <strong>{cleanName(name) ?? 'Your name'}</strong>
      </div>
      <form onSubmit={save} className="stack">
        <label className="field">
          <span>Name</span>
          <input value={name} maxLength={24} autoComplete="nickname" onChange={(e) => { setName(e.target.value); setMsg({}); }} />
        </label>
        <fieldset className="avatar-grid">
          <legend>Avatar</legend>
          {(Object.keys(AVATARS) as AvatarKey[]).map((k) => (
            <label key={k} className={k === avatar ? 'on' : ''}>
              <input type="radio" name="avatar" className="sr-only" checked={k === avatar} onChange={() => { setAvatar(k); setMsg({}); }} />
              <span aria-hidden="true">{AVATARS[k]}</span><span className="sr-only">{k}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="tone-row">
          <legend>Colour</legend>
          {Array.from({ length: TONES }, (_, t) => (
            <label key={t} className={`t${t} ${t === tone ? 'on' : ''}`}>
              <input type="radio" name="tone" className="sr-only" checked={t === tone} onChange={() => { setTone(t); setMsg({}); }} />
              <span className="sr-only">Colour {t + 1}</span>
            </label>
          ))}
        </fieldset>
        {msg.error && <p className="error" role="alert">{msg.error}</p>}
        {msg.ok && <p className="ok-text" role="status">{msg.ok}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
      </form>
    </section>
  );
}

function Categories() {
  const { me, categories, refresh } = useMe();
  const [scope, setScope] = useState<Scope>('personal');
  const [type, setType] = useState<TxType>('expense');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;
  const list = categories.filter((c) => c.scope === scope && c.type === type);

  async function act(fn: () => Promise<void>) {
    setError(null);
    try { await fn(); await refresh(); } catch (e) { setError(friendlyError((e as Error).message)); }
  }
  const add = (e: FormEvent) => { e.preventDefault(); act(async () => { await saveCategory(me, { name, type, scope }); setName(''); }); };
  const rename = (id: string, current: string) => {
    const next = prompt('Rename category', current)?.trim();
    if (next && next !== current) act(() => saveCategory(me, { id, name: next, type, scope }));
  };
  const remove = (id: string, n: string) => { if (confirm(`Delete “${n}”? Any monthly limits set for it are removed too.`)) act(() => deleteCategory(id)); };

  return (
    <section className="stack section">
      <h2>Categories</h2>
      <div className="filter-row">
        {me.householdId && (
          <div className="segmented" role="group" aria-label="Whose categories">
            {(['personal', 'shared'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={scope === s} onClick={() => { setScope(s); if (s === 'shared') setType('expense'); }}>
                {s === 'personal' ? 'Mine' : 'Shared'}
              </button>
            ))}
          </div>
        )}
        {scope === 'personal' && (
          <div className="segmented" role="group" aria-label="Category type">
            {(['expense', 'income'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>{t === 'expense' ? 'Expense' : 'Income'}</button>
            ))}
          </div>
        )}
      </div>
      <ul className="list cats">
        {list.map((c) => (
          <li key={c.id}>
            <span>{c.name}</span>
            <button type="button" className="btn small" onClick={() => rename(c.id, c.name)} aria-label={`Rename ${c.name}`}>Rename</button>
            <button type="button" className="btn small" onClick={() => remove(c.id, c.name)} aria-label={`Delete ${c.name}`}>Delete</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="inline-form">
        <label className="field grow"><span className="sr-only">New category name</span>
          <input maxLength={40} placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn" disabled={!name.trim()}>Add</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

// Two taps: prepare (network), then Download or Share. iOS only allows the share sheet straight from a tap,
// and the fetch in between would use that up.
function Export() {
  const { me, categories } = useMe();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<{ f: File; rows: number } | null>(null);
  if (!me) return null;

  async function prepare(e: FormEvent) {
    e.preventDefault();
    if (from && to && from > to) { setError('The start date is after the end date.'); return; }
    setBusy(true); setError(null); setFile(null);
    try {
      const txs = await listForExport(from, to);
      const partner = partnerOf(me!);
      const csv = toCsv(exportRows(me!.userId, partner ? displayName(partner) : 'partner', txs, new Map(categories.map((c) => [c.id, c.name]))));
      // The BOM tells Excel the file is UTF-8, so accented names don't come out garbled.
      setFile({ f: new File(['﻿' + csv], `save-brave-${from || 'all'}${to ? `-to-${to}` : ''}.csv`, { type: 'text/csv' }), rows: txs.length });
    } catch (err) { setError(`Export failed. ${friendlyError((err as Error).message)}`); }
    setBusy(false);
  }

  function download() {
    const url = URL.createObjectURL(file!.f);
    Object.assign(document.createElement('a'), { href: url, download: file!.f.name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function share() {
    try { await navigator.share({ files: [file!.f] }); }
    catch (err) { if ((err as Error).name !== 'AbortError') setError(`Couldn't share. ${(err as Error).message}`); }
  }

  const canShare = file && navigator.canShare?.({ files: [file.f] });
  return (
    <form className="stack section" onSubmit={prepare}>
      <h2>Export</h2>
      <p className="muted">A CSV of the entries you can see: yours and the shared ones. Leave the dates blank for everything.
        Notes starting with = + − or @ get a leading ' so spreadsheets don't run them as formulas.</p>
      <div className="row">
        <label className="field grow"><span>From</span><input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setFile(null); }} /></label>
        <label className="field grow"><span>To</span><input type="date" value={to} onChange={(e) => { setTo(e.target.value); setFile(null); }} /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!file ? (
        <button className="btn primary" disabled={busy}>{busy ? 'Preparing…' : 'Export CSV'}</button>
      ) : (
        <>
          <p role="status">{file.rows} {file.rows === 1 ? 'entry' : 'entries'} ready.</p>
          <div className="row">
            <button type="button" className="btn primary grow" onClick={download}>Download</button>
            {canShare && <button type="button" className="btn grow" onClick={share}>Share…</button>}
          </div>
        </>
      )}
    </form>
  );
}

function Notifications() {
  const { me } = useMe();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { pushState().then(setState); }, []);
  if (!me || state === null) return null;

  async function toggle() {
    setBusy(true); setError(null);
    try {
      if (state === 'on') { await disablePush(); setState('off'); } else setState(await enablePush(me!.userId));
    } catch (err) { setError(`Couldn't change notifications. ${friendlyError((err as Error).message)}`); }
    setBusy(false);
  }

  const text: Record<PushState, string> = {
    on: 'On for this phone. You get a notification when your partner adds a shared entry or settles up.',
    off: 'Get a notification when your partner adds a shared entry or settles up.',
    denied: 'Notifications are blocked for Save Brave. Allow them in your phone’s settings, then come back here.',
    unsupported: 'This browser can’t show notifications. On iPhone, open Save Brave from its home-screen icon (iOS 16.4 or later).',
    'not-configured': 'Notifications aren’t set up for this app yet.',
  };
  return (
    <section className="stack section">
      <h2>Notifications</h2>
      <p className={state === 'on' ? '' : 'muted'}>{text[state]}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {(state === 'on' || state === 'off') && (
        <button type="button" className={state === 'on' ? 'btn' : 'btn primary'} onClick={toggle} disabled={busy}>
          {busy ? 'One moment…' : state === 'on' ? 'Turn off on this phone' : 'Turn on notifications'}
        </button>
      )}
    </section>
  );
}

const LAST_BACKUP ='saveBrave:lastBackup'; // not cache: — a sign-out shouldn't forget when you last backed up

/** The free database plan keeps no backups, so this file is the safety copy. */
function Backup() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState(() => { try { return localStorage.getItem(LAST_BACKUP); } catch { return null; } });

  async function run() {
    setBusy(true); setError(null);
    try {
      const data = await fullBackup();
      const day = todayLocal();
      const f = new File([JSON.stringify(data, null, 1)], `save-brave-backup-${day}.json`, { type: 'application/json' });
      const url = URL.createObjectURL(f);
      Object.assign(document.createElement('a'), { href: url, download: f.name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      try { localStorage.setItem(LAST_BACKUP, day); } catch { /* private mode */ }
      setLast(day);
    } catch (err) { setError(`Backup failed. ${friendlyError((err as Error).message)}`); }
    setBusy(false);
  }

  return (
    <section className="stack section">
      <h2>Backup</h2>
      <p className="muted">Downloads everything you can see (your entries, the shared ones, plans, recurring items) as one file.
        Keep it somewhere safe, like your cloud drive. Once a month is plenty.</p>
      <p>{last ? `Last backup on this device: ${last}` : 'No backup from this device yet.'}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="btn" onClick={run} disabled={busy}>{busy ? 'Preparing…' : 'Download full backup'}</button>
    </section>
  );
}

export function Settings() {
  const { me } = useMe();
  if (!me) return null;
  const partner = partnerOf(me);
  return (
    <Screen title="Settings">
      <ProfileEditor />
      <Notifications />
      <Categories />
      <section className="stack section">
        <h2>Household</h2>
        {me.householdId ? (
          <p>{me.householdName} · {partner ? `with ${displayName(partner)}` : 'waiting for your partner'}</p>
        ) : (
          <p className="muted">Not set up yet.</p>
        )}
        <Link className="btn" to="/household">{me.householdId && !partner ? 'Invite partner' : me.householdId ? 'View household' : 'Set up household'}</Link>
      </section>
      <Export />
      <Backup />
      <section className="stack section">
        <h2>Account</h2>
        <p className="muted">Signed in as {me.email}</p>
        <button type="button" className="btn" onClick={async () => { setPendingJoin(null); clearCache(); await disablePush().catch(() => {}); supabase.auth.signOut(); }}>Sign out</button>
      </section>
    </Screen>
  );
}
