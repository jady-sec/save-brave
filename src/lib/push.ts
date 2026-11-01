// Phone notifications (Web Push). This device's subscription goes in push_subscriptions; the notify edge function
// sends to the partner's devices. iPhone needs iOS 16.4+ and the app opened from the home-screen icon.
import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState = 'unsupported' | 'not-configured' | 'denied' | 'off' | 'on';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** The VAPID public key is base64url; the browser wants raw bytes. */
function keyBytes(b64: string): Uint8Array {
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'not-configured';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

/** Must run from a tap: iPhone only shows the permission prompt in response to one. */
export async function enablePush(userId: string): Promise<PushState> {
  if (!supported() || !VAPID_PUBLIC_KEY) return pushState();
  if ((await Notification.requestPermission()) !== 'granted') return pushState();
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) as BufferSource });
  const { endpoint, keys } = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase.from('push_subscriptions')
    .upsert({ user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' });
  if (error) { await sub.unsubscribe(); throw new Error(error.message); }
  return 'on';
}

/** Turns this device off (also called on sign-out so the next person on this phone doesn't get your alerts). */
export async function disablePush(): Promise<void> {
  if (!supported()) return;
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/** Fire and forget: a failed notification must never get in the way of saving. */
export function notifyPartner(body: { transaction_id: string } | { settlement_id: string }) {
  supabase.functions.invoke('notify', { body }).catch(() => { /* offline or not deployed yet */ });
}
