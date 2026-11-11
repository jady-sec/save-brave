-- Entries made offline get their id on the phone (new_id), so the app can send one again after a lost reply:
-- the second send fails on the primary key instead of creating a duplicate, and the app treats that as sent.
create or replace function public.save_transaction(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  tx_id uuid := (p ->> 'id')::uuid;
  amount integer := (p ->> 'amount_cents')::integer; -- '12.5' fails the cast: integer cents only
  rule uuid := (p ->> 'recurring_rule_id')::uuid;
  new_id uuid := (p ->> 'new_id')::uuid;
begin
  if tx_id is null then
    insert into transactions (id, type, scope, household_id, paid_by, created_by, amount_cents, date, category_id, note, recurring_rule_id)
    values (coalesce(new_id, gen_random_uuid()), p ->> 'type', p ->> 'scope',
            case when p ->> 'scope' = 'shared' then (select household_id from household_members where user_id = auth.uid()) end,
            coalesce((p ->> 'paid_by')::uuid, auth.uid()), auth.uid(), amount, (p ->> 'date')::date,
            (p ->> 'category_id')::uuid, nullif(trim(p ->> 'note'), ''), rule)
    on conflict (recurring_rule_id, date) where recurring_rule_id is not null do nothing
    returning id into tx_id;
    if rule is not null then
      update recurring_rules set last_generated_date = greatest(coalesce(last_generated_date, (p ->> 'date')::date), (p ->> 'date')::date)
      where id = rule;
    end if;
    if tx_id is null then return null; end if;
  else
    update transactions set type = p ->> 'type', scope = p ->> 'scope', -- scope change is refused by a_immutable
      paid_by = coalesce((p ->> 'paid_by')::uuid, transactions.paid_by), amount_cents = amount, date = (p ->> 'date')::date,
      category_id = (p ->> 'category_id')::uuid, note = nullif(trim(p ->> 'note'), '')
    where id = tx_id returning id into tx_id;
    if tx_id is null then raise exception 'entry not found'; end if;
    delete from transaction_splits where transaction_id = tx_id;
  end if;
  if p ->> 'scope' = 'shared' then
    insert into transaction_splits (transaction_id, user_id, share_cents)
    select tx_id, (s ->> 'user_id')::uuid, (s ->> 'share_cents')::integer from jsonb_array_elements(p -> 'splits') s;
  end if;
  return tx_id;
end $$;
