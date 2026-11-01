-- Savings goals ("Trip to Banff: $1,200 of $3,000"). Personal goals are private; shared goals belong to the
-- household. Money is tracked as contributions (negative = taken out), so each partner sees who put in what.
-- A goal is a tracker: it doesn't move money or change budgets.
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  household_id uuid references public.households on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  target_cents integer not null check (target_cents > 0),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  check ((user_id is null) <> (household_id is null))
);
create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  amount_cents integer not null check (amount_cents <> 0),
  date date not null default current_date,
  created_at timestamptz not null default now()
);
create index on public.goal_contributions (goal_id);
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;

create policy own_or_household on public.goals for all to authenticated
  using (user_id = auth.uid() or is_member(household_id))
  with check ((user_id = auth.uid() and household_id is null) or (user_id is null and is_member(household_id)));

-- Contributions follow their goal's visibility (the subquery runs under the goals policy above).
create policy goal_visible_read on public.goal_contributions for select to authenticated
  using (exists (select 1 from goals g where g.id = goal_id));
create policy own_insert on public.goal_contributions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from goals g where g.id = goal_id));
create policy own_delete on public.goal_contributions for delete to authenticated
  using (user_id = auth.uid() and exists (select 1 from goals g where g.id = goal_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.goals, public.goal_contributions;
  end if;
end $$;

-- A goal stays personal or shared for life: otherwise a partner could turn a shared goal into their own and
-- take it (and the other person's contributions) out of view.
create function public.goals_keep_owner() returns trigger language plpgsql set search_path = public as $$
begin
  if new.user_id is distinct from old.user_id or new.household_id is distinct from old.household_id then
    raise exception 'a goal can''t change owner';
  end if;
  return new;
end $$;
create trigger goals_keep_owner before update on public.goals for each row execute function public.goals_keep_owner();
