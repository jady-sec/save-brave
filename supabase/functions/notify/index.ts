// Sends a phone notification to your partner when you add a shared entry or record a settle-up.
// Runs as the signed-in caller (their token + the public anon key), never with the service key: row security
// decides what it can read, and partner_push_targets() (migration 0012) gives only the partner's devices.
// Secrets (set with `npx.cmd supabase secrets set ...`): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const money = (cents: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await db.auth.getUser();
    if (!user) return json({ error: 'not signed in' }, 401);
    const { transaction_id, settlement_id } = await req.json();

    const { data: profile } = await db.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle();
    const name = profile?.display_name ?? user.email?.split('@')[0] ?? 'Your partner';

    let body: string, url: string;
    if (transaction_id) {
      const { data: t } = await db.from('transactions')
        .select('scope, amount_cents, created_by, category:categories(name), splits:transaction_splits(user_id, share_cents)')
        .eq('id', transaction_id).maybeSingle();
      // Only your own new shared entries; the note stays out of the notification (it shows on the lock screen).
      if (!t || t.scope !== 'shared' || t.created_by !== user.id) return json({ sent: 0 });
      const theirs = (t.splits as { user_id: string; share_cents: number }[]).find((s) => s.user_id !== user.id)?.share_cents ?? 0;
      const category = (t.category as { name: string } | null)?.name ?? 'an entry';
      body = `${name} added ${category} ${money(t.amount_cents)} (shared). Your share: ${money(theirs)}.`;
      url = '/tx';
    } else if (settlement_id) {
      const { data: s } = await db.from('settlements').select('amount_cents, created_by, from_user').eq('id', settlement_id).maybeSingle();
      if (!s || s.created_by !== user.id) return json({ sent: 0 });
      // The household admin can record the partner's payment to them (migration 0016).
      body = s.from_user === user.id
        ? `${name} recorded paying you ${money(s.amount_cents)}.`
        : `${name} recorded that you paid them ${money(s.amount_cents)}.`;
      url = '/balance';
    } else {
      return json({ error: 'nothing to send' }, 400);
    }

    const { data: targets, error } = await db.rpc('partner_push_targets');
    if (error) throw new Error(error.message);
    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
    const payload = JSON.stringify({ title: 'Save Brave', body, url });
    let sent = 0;
    await Promise.all((targets as { endpoint: string; p256dh: string; auth: string }[]).map(async (t) => {
      try {
        await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, { TTL: 86400 });
        sent++;
      } catch (e) {
        // 404/410: the phone unsubscribed or the app was removed; forget that device.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.rpc('drop_partner_push_target', { gone: t.endpoint });
      }
    }));
    return json({ sent });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
