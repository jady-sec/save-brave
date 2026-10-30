import { useState, type FormEvent } from 'react';
import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';

const installed = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    try {
      const { error } = await fn();
      if (error) setError(error.message);
      return !error;
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: location.origin } }));
    if (ok) setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    await run(() => supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' }));
  }

  return (
    <Screen title="Save Brave" hero={<p className="hero-sub">Spend together. Save together.</p>}>
      {!sent ? (
        <form onSubmit={sendCode} className="stack">
          <p className="muted">Sign in with your email. No password needed.</p>
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="btn primary" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Email me a sign-in code'}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="stack">
          <p className="muted">
            We sent a code to <strong>{email.trim()}</strong>. Enter it here.
            {/* In an installed iOS app the email link opens Safari instead and uses up the code. */}
            {installed ? ' Don’t tap the link in the email; it opens your browser instead of this app.' : ' Or tap the link in the email on this device.'}
          </p>
          <label className="field">
            <span>Sign-in code</span>
            <input className="num code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} required
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          <button className="btn primary" disabled={busy || code.length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button type="button" className="btn" onClick={() => { setSent(false); setCode(''); setError(null); }}>Use a different email</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </Screen>
  );
}
