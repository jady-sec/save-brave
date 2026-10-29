-- Emails of the caller's household members (auth.users is not exposed to the API).
create function public.household_members_view() returns table (user_id uuid, email text)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text
  from household_members m join auth.users u on u.id = m.user_id
  where m.household_id = (select household_id from household_members where user_id = auth.uid())
$$;
revoke all on function public.household_members_view() from public, anon, authenticated;
grant execute on function public.household_members_view() to authenticated;
