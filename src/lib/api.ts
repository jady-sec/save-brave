// Every database call the UI makes. Errors surface as thrown Error with a user-facing message.
import { isNetworkError } from './cache';
import { fetchAll } from './paging';
import { monthBounds, todayLocal } from './month';
import { supabase } from './supabase';
import { dueDates } from './recurring';
import type { Contribution, Goal } from './goals';
import type { AvatarKey, Profile } from './profile';
import { computeSplit } from './split';
import type { Category, Plan, RecurringRule, Scope, Settlement, Split, Tx, TxType } from './types';

const TX = '*, splits:transaction_splits(user_id, share_cents)';
const DESC = { ascending: false };

/** Profile fields are null until that person sets a name and avatar. */
export interface Member { user_id: string; email: string; display_name?: string | null; avatar?: AvatarKey | null; tone?: number | null }
export interface Me {
  userId: string; email: string; householdId: string | null; householdName: string | null; members: Member[];
  profile: Profile | null;
}

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
  const profile = must(await supabase.from('profiles').select('display_name, avatar, tone').eq('user_id', user.id).maybeSingle()) as Profile | null;
  return { userId: user.id, email: user.email ?? '', householdId: hh?.id ?? null, householdName: hh?.name ?? null, members, profile };
}

export async function saveProfile(userId: string, p: Profile): Promise<void> {
  must(await supabase.from('profiles').upsert({ user_id: userId, ...p, updated_at: new Date().toISOString() }));
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
  note?: string | null; paid_by?: string; splits?: Split[]; recurring_rule_id?: string;
}

export async function listTransactions(month: string): Promise<Tx[]> {
  const { start, endExclusive } = monthBounds(month);
  return fetchAll<Tx>((a, b) => supabase.from('transactions').select(TX)
    .gte('date', start).lt('date', endExclusive).order('date', DESC).order('created_at', DESC).order('id').range(a, b));
}

export async function saveTransaction(input: TxInput): Promise<string> {
  return must(await supabase.rpc('save_transaction', { p: input }));
}

export async function deleteTransaction(id: string): Promise<void> {
  must(await supabase.from('transactions').delete().eq('id', id));
}

/** Every shared entry, all time: the balance is derived from the full history. */
export async function listShared(): Promise<Tx[]> {
  return fetchAll<Tx>((a, b) => supabase.from('transactions').select(TX)
    .eq('scope', 'shared').order('date', DESC).order('created_at', DESC).order('id').range(a, b));
}

export async function listSettlements(): Promise<Settlement[]> {
  return fetchAll<Settlement>((a, b) => supabase.from('settlements').select('*')
    .order('date', DESC).order('created_at', DESC).order('id').range(a, b));
}

// RLS only accepts a settlement recorded by the person paying (from_user = caller).
export async function addSettlement(me: Me, to_user: string, amount_cents: number, date: string): Promise<string> {
  return must(await supabase.from('settlements').insert({ household_id: me.householdId, from_user: me.userId, to_user, amount_cents, date, created_by: me.userId }).select('id').single())!.id;
}

export async function deleteSettlement(id: string): Promise<void> {
  must(await supabase.from('settlements').delete().eq('id', id));
}

export type PlanOwner = 'me' | 'household';
export interface PlanFields { expected_income_cents: number; savings_target_cents: number; limits: { category_id: string; limit_cents: number }[] }

/** The plan for `month`, or else the latest one before it: that is carry-forward, nothing is copied. RLS limits 'me' to my own. */
export async function getPlan(owner: PlanOwner, month: string): Promise<Plan | null> {
  const q = supabase.from('monthly_plans').select('*, limits:category_limits(category_id, limit_cents)')
    .not(owner === 'me' ? 'user_id' : 'household_id', 'is', null);
  return must(await q.lte('month', month).order('month', { ascending: false }).limit(1).maybeSingle()) as Plan | null;
}

/** Writes exactly this month's plan and replaces its limits in one transaction. */
export async function savePlan(owner: PlanOwner, month: string, fields: PlanFields): Promise<void> {
  must(await supabase.rpc('save_plan', { p: { owner, month, ...fields } }));
}

export async function listRecurring(): Promise<RecurringRule[]> {
  return must(await supabase.from('recurring_rules').select('*').order('created_at')) as RecurringRule[];
}

export type RecurringInput = Pick<RecurringRule, 'type' | 'scope' | 'paid_by' | 'amount_cents' | 'category_id' | 'note' | 'day_of_month' | 'start_date' | 'split'>;

export async function saveRecurring(me: Me, input: RecurringInput, id?: string): Promise<void> {
  const row = { ...input, household_id: input.scope === 'shared' ? me.householdId : null };
  if (id) must(await supabase.from('recurring_rules').update(row).eq('id', id));
  else must(await supabase.from('recurring_rules').insert(row));
}

export async function setRecurringActive(rule: RecurringRule, active: boolean, today: string): Promise<void> {
  // Resuming skips the paused months instead of back-filling them.
  const skipped = active ? dueDates(rule, today).at(-1) : undefined;
  must(await supabase.from('recurring_rules').update({ active, ...(skipped ? { last_generated_date: skipped } : {}) }).eq('id', rule.id));
}

/** Generated entries stay; their link to the rule is cleared by the database. */
export async function deleteRecurring(id: string): Promise<void> {
  must(await supabase.from('recurring_rules').delete().eq('id', id));
}

/**
 * Creates every missed entry for my active rules (mine and the household's), oldest first. Safe to run on both
 * phones at once: save_transaction skips a rule+date that already exists and advances the rule either way. Returns how many entries were created.
 */
export async function runRecurring(me: Me, today: string): Promise<number> {
  let created = 0;
  let failed: Error | null = null;
  const partner = me.members.find((m) => m.user_id !== me.userId);
  for (const rule of (await listRecurring()).filter((r) => r.active)) {
    try { // one broken rule must not stop the others
      for (const date of dueDates(rule, today)) {
        const shared = rule.scope === 'shared';
        if (shared && !partner) break; // a shared split needs both members
        const id = await saveTransaction({
          type: rule.type, scope: rule.scope, amount_cents: rule.amount_cents, date, category_id: rule.category_id, note: rule.note,
          recurring_rule_id: rule.id,
          ...(shared ? { paid_by: rule.paid_by, splits: computeSplit(rule.amount_cents, rule.paid_by, [me.userId, partner!.user_id], rule.split ?? { mode: 'equal' }) } : {}),
        });
        if (id) created++; // save_transaction also advances the rule, in the same transaction (0009)
      }
    } catch (e) { failed ??= e as Error; }
  }
  if (failed) throw failed;
  return created;
}

/** Entries from the first day of fromMonth to the end of toMonth, oldest first. */
export async function listTransactionsRange(fromMonth: string, toMonth: string): Promise<Tx[]> {
  return fetchAll<Tx>((a, b) => supabase.from('transactions').select(TX)
    .gte('date', monthBounds(fromMonth).start).lt('date', monthBounds(toMonth).endExclusive).order('date').order('created_at').order('id').range(a, b));
}

/** All of one owner's plans, oldest first; pick the latest at or before a month for carry-forward. */
export async function listPlans(owner: PlanOwner): Promise<Plan[]> {
  return must(await supabase.from('monthly_plans').select('*, limits:category_limits(category_id, limit_cents)')
    .not(owner === 'me' ? 'user_id' : 'household_id', 'is', null).order('month')) as Plan[];
}

/** Every entry I can see (RLS: mine and the household's shared), optionally between two dates inclusive. */
// Every table a backup holds, with a stable order for paging. RLS limits it to what this person can see.
const BACKUP_TABLES: [string, string, string[]][] = [
  ['households', '*', ['id']], ['profiles', '*', ['user_id']], ['categories', '*', ['id']],
  ['transactions', TX, ['date', 'id']], ['settlements', '*', ['date', 'id']], ['recurring_rules', '*', ['id']],
  ['monthly_plans', '*', ['month', 'id']], ['category_limits', '*', ['plan_id', 'category_id']],
  ['goals', '*', ['created_at', 'id']], ['goal_contributions', '*', ['date', 'id']],
];

/** Everything you can see, as one JSON document: your own records plus the shared ones. */
export async function fullBackup(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { app: 'Save Brave', version: 1, exported_at: new Date().toISOString() };
  for (const [table, cols, order] of BACKUP_TABLES) {
    out[table] = await fetchAll((a, b) => order.reduce((q, c) => q.order(c), supabase.from(table).select(cols)).range(a, b));
  }
  return out;
}

export async function listForExport(from: string, to: string): Promise<Tx[]> {
  return fetchAll<Tx>((a, b) => {
    let q = supabase.from('transactions').select(TX);
    if (from) q = q.gte('date', from);
    if (to) q = q.lte('date', to);
    return q.order('date').order('created_at').order('id').range(a, b);
  });
}

// ---- Savings goals (migration 0013) ----
export async function listGoals(): Promise<Goal[]> {
  return fetchAll<Goal>((a, b) => supabase.from('goals').select('*').order('created_at').order('id').range(a, b));
}

export async function listContributions(): Promise<Contribution[]> {
  return fetchAll<Contribution>((a, b) => supabase.from('goal_contributions').select('id, goal_id, user_id, amount_cents, date')
    .order('date', DESC).order('id').range(a, b));
}

export async function saveGoal(me: Me, g: { id?: string; name: string; target_cents: number; shared: boolean }): Promise<void> {
  const owner: { user_id: string | null; household_id: string | null } = g.shared
    ? { user_id: null, household_id: me.householdId } : { user_id: me.userId, household_id: null };
  const row = { name: g.name, target_cents: g.target_cents, ...owner };
  must(g.id ? await supabase.from('goals').update(row).eq('id', g.id) : await supabase.from('goals').insert(row));
}

export async function deleteGoal(id: string): Promise<void> {
  must(await supabase.from('goals').delete().eq('id', id));
}

/** Negative amounts take money out of the goal. */
export async function addContribution(me: Me, goal_id: string, amount_cents: number): Promise<void> {
  must(await supabase.from('goal_contributions').insert({ goal_id, user_id: me.userId, amount_cents, date: todayLocal() })); // local date, not the server's UTC day
}
