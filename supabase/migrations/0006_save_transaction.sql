-- One entry point for saving an entry and its splits atomically. security invoker: RLS and the
-- integrity triggers (0004) apply exactly as for direct writes.
-- p: { id?, type, scope, amount_cents, date, category_id, note?, paid_by?, splits?: [{user_id, share_cents}], recurring_rule_id? }
-- Returns the entry id, or null when a recurring entry for that rule and date already exists.
create function public.save_transaction(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  tx_id uuid := (p ->> 'id')::uuid;
  amount integer := (p ->> 'amount_cents')::integer; -- '12.5' fails the cast: integer cents only
begin
  if tx_id is null then
    insert into transactions (type, scope, household_id, paid_by, created_by, amount_cents, date, category_id, note, recurring_rule_id)
    values (p ->> 'type', p ->> 'scope',
            case when p ->> 'scope' = 'shared' then (select household_id from household_members where user_id = auth.uid()) end,
            coalesce((p ->> 'paid_by')::uuid, auth.uid()), auth.uid(), amount, (p ->> 'date')::date,
            (p ->> 'category_id')::uuid, nullif(trim(p ->> 'note'), ''), (p ->> 'recurring_rule_id')::uuid)
    on conflict (recurring_rule_id, date) where recurring_rule_id is not null do nothing
    returning id into tx_id;
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
revoke all on function public.save_transaction(jsonb) from public, anon, authenticated;
grant execute on function public.save_transaction(jsonb) to authenticated;

-- At commit, every shared entry touched in the transaction has one split per household member and
-- the splits add up to the amount. Deferred so an entry and its splits can be written in any order.
create function public.check_split_total() returns trigger language plpgsql set search_path = public as $$
declare
  r jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  tid uuid := coalesce(r ->> 'transaction_id', r ->> 'id')::uuid;
  t transactions;
begin
  select * into t from transactions where id = tid;
  if t.id is null or t.scope <> 'shared' then return null; end if; -- entry deleted, or personal
  if (select coalesce(sum(share_cents), 0) from transaction_splits where transaction_id = tid) <> t.amount_cents
     or (select count(*) from transaction_splits where transaction_id = tid)
        <> (select count(*) from household_members where household_id = t.household_id) then
    raise exception 'splits must cover each household member once and add up to the amount';
  end if;
  return null;
end $$;
revoke all on function public.check_split_total() from public, anon, authenticated;

create constraint trigger d_split_total after insert or update on transactions
  deferrable initially deferred for each row execute function check_split_total();
create constraint trigger d_split_total after insert or update or delete on transaction_splits
  deferrable initially deferred for each row execute function check_split_total();
