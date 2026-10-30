// Every database call the UI makes. Errors surface as thrown Error with a user-facing message.
import { isNetworkError } from './cache';
import { monthBounds } from './month';
import { supabase } from './supabase';
import type { Category, Scope, Split, Tx, TxType } from './types';

export interface Member { user_id: string; email: string }
export interface Me { userId: string; email: string; householdId: string | null; householdName: string | null; members: Member[] }

function must<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/** Turns raw Supabase/network errors into something a person can act on. */
export function friendlyError(msg: string): string {
  if (isNetworkError(msg)) return 'Can’t reach the server. Check your connection and try again.';
  if (/too many attempts/.test(msg)) return 'Too many wrong codes. Try again in an hour.';
  if (/household is full/.test(msg)) return 'That household already has two people.';
  if (/already in a household/.test(msg)) return 'You are already in a household.';
  if (/categories_(owner|household)_name/.test(msg)) return 'You already have a category with that name.';
  if (/transactions_rule_date/.test(msg)) return 'This recurring item already has an entry on that date.';
  if (/foreign key/.test(msg)) return 'This category is used by entries or recurring items, so it can’t be deleted.';
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

// ---- categories ----

const DEFAULTS: { type: TxType; name: string }[] = [
  { type: 'expense', name: 'Groceries' }, { type: 'expense', name: 'Eating out' }, { type: 'expense', name: 'Transport' },
  { type: 'expense', name: 'Fun' }, { type: 'expense', name: 'Other' }, { type: 'income', name: 'Salary' }, { type: 'income', name: 'Other income' },
];
const SHARED_DEFAULTS = ['Groceries', 'Rent', 'Utilities', 'Household'];

export async function listCategories(): Promise<Category[]> {
  return must(await supabase.from('categories').select('*').order('name')) as Category[];
}

/** First run: give the person (and their household) a starter set. Idempotent thanks to unique names. */
export async function ensureDefaultCategories(me: Me, existing: Category[]): Promise<boolean> {
  let added = false;
  // Seed only when that scope has no categories at all: deleted defaults stay deleted while any remain,
  // and an empty list (nothing could be saved) always recovers. No device flag: a stale one blocked seeding for good.
  if (!existing.some((c) => c.scope === 'personal')) {
    must(await supabase.from('categories').upsert(DEFAULTS.map((d) => ({ ...d, scope: 'personal', owner_id: me.userId })),
      { onConflict: 'owner_id,type,name', ignoreDuplicates: true }));
    added = true;
  }
  if (me.householdId && !existing.some((c) => c.scope === 'shared')) {
    must(await supabase.from('categories').upsert(SHARED_DEFAULTS.map((name) => ({ type: 'expense', name, scope: 'shared', household_id: me.householdId })),
      { onConflict: 'household_id,type,name', ignoreDuplicates: true }));
    added = true;
  }
  return added;
}

export async function saveCategory(me: Me, c: { id?: string; name: string; type: TxType; scope: Scope }): Promise<void> {
  const name = c.name.trim();
  if (c.id) { must(await supabase.from('categories').update({ name }).eq('id', c.id)); return; }
  const owner = c.scope === 'personal' ? { owner_id: me.userId } : { household_id: me.householdId };
  must(await supabase.from('categories').insert({ name, type: c.type, scope: c.scope, ...owner }));
}

export async function deleteCategory(id: string): Promise<void> {
  must(await supabase.from('categories').delete().eq('id', id));
}

// ---- transactions ----

export interface TxInput {
  id?: string; type: TxType; scope: Scope; amount_cents: number; date: string; category_id: string;
  note?: string | null; paid_by?: string; splits?: Split[];
}

export async function listTransactions(month: string): Promise<Tx[]> {
  const { start, endExclusive } = monthBounds(month);
  const rows = must(await supabase.from('transactions').select('*, splits:transaction_splits(user_id, share_cents)')
    .gte('date', start).lt('date', endExclusive).order('date', { ascending: false }).order('created_at', { ascending: false }));
  return rows as Tx[];
}

export async function saveTransaction(input: TxInput): Promise<string> {
  return must(await supabase.rpc('save_transaction', { p: input }));
}

export async function deleteTransaction(id: string): Promise<void> {
  must(await supabase.from('transactions').delete().eq('id', id));
}
