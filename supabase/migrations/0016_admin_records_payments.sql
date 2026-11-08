-- The household admin (whoever created the household; households has no write policies, so that can't change)
-- may also record that the partner paid *them*, generally or for one expense. Everyone else still records only
-- their own payments. created_by stays the person who recorded it, so it's clear who entered what.
-- The per-expense rules from 0015 (exact share, to whoever paid, once) still apply.
drop policy payer_insert on public.settlements;
create policy payer_or_admin_insert on public.settlements for insert to authenticated
  with check (
    is_member(household_id) and created_by = auth.uid()
    and exists (select 1 from household_members m where m.household_id = settlements.household_id and m.user_id = to_user)
    and exists (select 1 from household_members m where m.household_id = settlements.household_id and m.user_id = from_user)
    and (from_user = auth.uid()
      or (to_user = auth.uid() and exists (select 1 from households h where h.id = household_id and h.created_by = auth.uid())))
  );
