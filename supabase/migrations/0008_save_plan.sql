-- Saves one month's plan and replaces its limits atomically, so a failed save never leaves a plan without limits.
-- security invoker: RLS and check_limit (0004) apply exactly as for direct writes.
-- p: { owner: 'me' | 'household', month: 'YYYY-MM', expected_income_cents, savings_target_cents, limits: [{category_id, limit_cents}] }
create function public.save_plan(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  pid uuid;
  income integer := coalesce((p ->> 'expected_income_cents')::integer, 0);
  savings integer := coalesce((p ->> 'savings_target_cents')::integer, 0);
begin
  if p ->> 'owner' = 'household' then
    insert into monthly_plans (household_id, month, expected_income_cents, savings_target_cents)
    values ((select household_id from household_members where user_id = auth.uid()), p ->> 'month', income, savings)
    on conflict (household_id, month) do update
      set expected_income_cents = excluded.expected_income_cents, savings_target_cents = excluded.savings_target_cents
    returning id into pid;
  else
    insert into monthly_plans (user_id, month, expected_income_cents, savings_target_cents)
    values (auth.uid(), p ->> 'month', income, savings)
    on conflict (user_id, month) do update
      set expected_income_cents = excluded.expected_income_cents, savings_target_cents = excluded.savings_target_cents
    returning id into pid;
  end if;
  delete from category_limits where plan_id = pid;
  insert into category_limits (plan_id, category_id, limit_cents)
  select pid, (l ->> 'category_id')::uuid, (l ->> 'limit_cents')::integer
  from jsonb_array_elements(coalesce(p -> 'limits', '[]')) l;
  return pid;
end $$;
revoke all on function public.save_plan(jsonb) from public, anon, authenticated;
grant execute on function public.save_plan(jsonb) to authenticated;
