-- A name and an avatar for each person, picked from a fixed set in the app (src/lib/avatars.ts); no photos.
-- Visible to yourself and your household partner only.
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24 and display_name = btrim(display_name)),
  avatar text not null check (avatar in ('fox', 'panda', 'koala', 'tiger', 'lion', 'frog', 'monkey', 'rabbit',
    'bear', 'pig', 'octopus', 'unicorn', 'penguin', 'cat', 'dog', 'owl')),
  tone smallint not null default 0 check (tone between 0 and 4),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy own_or_partner_read on public.profiles for select to authenticated using (
  user_id = auth.uid() or exists (
    select 1 from household_members me join household_members them on them.household_id = me.household_id
    where me.user_id = auth.uid() and them.user_id = profiles.user_id));
create policy own_insert on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy own_update on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The members list now carries each person's profile (null until they set one).
drop function public.household_members_view();
create function public.household_members_view()
returns table (user_id uuid, email text, display_name text, avatar text, tone smallint)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, p.display_name, p.avatar, p.tone
  from household_members m join auth.users u on u.id = m.user_id left join profiles p on p.user_id = m.user_id
  where m.household_id = (select household_id from household_members where user_id = auth.uid())
$$;
revoke all on function public.household_members_view() from public, anon, authenticated;
grant execute on function public.household_members_view() to authenticated;
