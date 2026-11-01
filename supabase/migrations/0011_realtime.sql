-- Live updates: the app listens for changes to these tables and reloads. Realtime applies the same row security,
-- so each person only hears about rows they can already read. (Guarded: local test databases have no publication.)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.transactions, public.transaction_splits, public.settlements,
      public.categories, public.recurring_rules, public.monthly_plans, public.category_limits, public.profiles,
      public.household_members;
  end if;
end $$;
