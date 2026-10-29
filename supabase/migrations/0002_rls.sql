-- Row-level security. Privacy is enforced here and only here.
-- Personal rows: visible to their owner only. Shared rows: visible to members of their household.
-- households / household_members / invites have no write policies: they change only via RPCs (0003).

-- security definer so policies on household_members don't recurse into themselves.
create function public.is_member(hh uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = hh and user_id = auth.uid())
$$;
revoke all on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;

alter table households enable row level security;
alter table household_members enable row level security;
alter table invites enable row level security;
alter table categories enable row level security;
alter table recurring_rules enable row level security;
alter table transactions enable row level security;
alter table transaction_splits enable row level security;
alter table settlements enable row level security;
alter table monthly_plans enable row level security;
alter table category_limits enable row level security;

-- The anon key must never read or write app data, even if a policy is mis-written later.
revoke all on all tables in schema public from anon;

create policy member_read on households for select to authenticated using (is_member(id));
create policy member_read on household_members for select to authenticated using (is_member(household_id));
create policy creator_read on invites for select to authenticated using (created_by = auth.uid());

-- categories
create policy personal_own on categories for all to authenticated
  using (scope = 'personal' and owner_id = auth.uid())
  with check (scope = 'personal' and owner_id = auth.uid());
create policy shared_member on categories for all to authenticated
  using (scope = 'shared' and is_member(household_id))
  with check (scope = 'shared' and is_member(household_id));

-- transactions: either member may edit/delete shared rows; the creator is recorded on insert.
create policy personal_own on transactions for all to authenticated
  using (scope = 'personal' and created_by = auth.uid())
  with check (scope = 'personal' and created_by = auth.uid());
create policy shared_read on transactions for select to authenticated using (scope = 'shared' and is_member(household_id));
create policy shared_insert on transactions for insert to authenticated
  with check (scope = 'shared' and is_member(household_id) and created_by = auth.uid());
create policy shared_update on transactions for update to authenticated
  using (scope = 'shared' and is_member(household_id)) with check (scope = 'shared' and is_member(household_id));
create policy shared_delete on transactions for delete to authenticated using (scope = 'shared' and is_member(household_id));

-- recurring rules mirror transactions.
create policy personal_own on recurring_rules for all to authenticated
  using (scope = 'personal' and owner_id = auth.uid())
  with check (scope = 'personal' and owner_id = auth.uid());
create policy shared_read on recurring_rules for select to authenticated using (scope = 'shared' and is_member(household_id));
create policy shared_insert on recurring_rules for insert to authenticated
  with check (scope = 'shared' and is_member(household_id) and owner_id = auth.uid());
create policy shared_update on recurring_rules for update to authenticated
  using (scope = 'shared' and is_member(household_id)) with check (scope = 'shared' and is_member(household_id));
create policy shared_delete on recurring_rules for delete to authenticated using (scope = 'shared' and is_member(household_id));

-- splits exist only on shared transactions and inherit their visibility (subquery runs under RLS).
create policy via_transaction on transaction_splits for all to authenticated
  using (exists (select 1 from transactions t where t.id = transaction_id and t.scope = 'shared'))
  with check (exists (select 1 from transactions t where t.id = transaction_id and t.scope = 'shared'));

-- settlements: members read and delete; only the payer records one, to the other member.
create policy member_read on settlements for select to authenticated using (is_member(household_id));
create policy member_delete on settlements for delete to authenticated using (is_member(household_id));
create policy payer_insert on settlements for insert to authenticated
  with check (is_member(household_id) and from_user = auth.uid() and created_by = auth.uid()
    and exists (select 1 from household_members m where m.household_id = settlements.household_id and m.user_id = to_user));

-- plans: a user plan is private; the household plan is shared.
create policy personal_own on monthly_plans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy household_member on monthly_plans for all to authenticated
  using (is_member(household_id)) with check (is_member(household_id));
create policy via_plan on category_limits for all to authenticated
  using (exists (select 1 from monthly_plans p where p.id = plan_id))
  with check (exists (select 1 from monthly_plans p where p.id = plan_id)
    and exists (select 1 from categories c where c.id = category_id));
