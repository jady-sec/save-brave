// Every database call the UI makes. Errors surface as thrown Error with a user-facing message.
import { supabase } from './supabase';

export interface Member { user_id: string; email: string }
export interface Me { userId: string; email: string; householdId: string | null; householdName: string | null; members: Member[] }

function must<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/** Turns raw Supabase/network errors into something a person can act on. */
export function friendlyError(msg: string): string {
  if (/fetch|network|load failed/i.test(msg)) return 'Can’t reach the server. Check your connection and try again.';
  if (/too many attempts/.test(msg)) return 'Too many wrong codes. Try again in an hour.';
  if (/household is full/.test(msg)) return 'That household already has two people.';
  if (/already in a household/.test(msg)) return 'You are already in a household.';
  return msg;
}

// The user comes from the local session, so this works without a round trip to the auth server.
export async function getMe(user: { id: string; email?: string }): Promise<Me> {
  const hh = must(await supabase.from('households').select('id, name').maybeSingle());
  const members = hh ? must(await supabase.rpc('household_members_view')) as Member[] : [];
  return { userId: user.id, email: user.email ?? '', householdId: hh?.id ?? null, householdName: hh?.name ?? null, members };
}

export async function createHousehold(name: string): Promise<string> {
  return must(await supabase.rpc('create_household', { p_name: name }));
}

export async function createInvite(): Promise<string> {
  return must(await supabase.rpc('create_invite'));
}

/** Household id, or null when the code is wrong, used or expired. */
export async function redeemInvite(code: string): Promise<string | null> {
  return must(await supabase.rpc('redeem_invite', { p_code: code }));
}
