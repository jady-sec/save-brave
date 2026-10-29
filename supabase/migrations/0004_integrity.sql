-- Integrity triggers. RLS decides who sees a row; these stop a visible row from being moved into
-- another owner's scope or pointed at data that belongs elsewhere. They run as the caller, so a
-- reference to a row the caller cannot see fails the same way as a reference to a wrong row.
-- BEFORE triggers fire in name order: a_* (immutability) runs before b_* (references).

create function public.forbid_change() returns trigger language plpgsql set search_path = public as $$
declare c text;
begin
  foreach c in array tg_argv loop
    if to_jsonb(new) -> c is distinct from to_jsonb(old) -> c then
      raise exception 'cannot change % of this row', c;
    end if;
  end loop;
  return new;
end $$;

create trigger a_immutable before update on transactions
  for each row execute function forbid_change('scope', 'created_by', 'household_id');
create trigger a_immutable before update on recurring_rules
  for each row execute function forbid_change('scope', 'owner_id', 'household_id');
create trigger a_immutable before update on categories
  for each row execute function forbid_change('scope', 'owner_id', 'household_id');
create trigger a_immutable before update on monthly_plans
  for each row execute function forbid_change('user_id', 'household_id');

create function public.check_entry_refs() returns trigger language plpgsql set search_path = public as $$
-- transactions are owned by created_by, recurring_rules by owner_id
declare owner uuid := coalesce(to_jsonb(new) ->> 'created_by', to_jsonb(new) ->> 'owner_id')::uuid;
begin
  if new.scope = 'shared' and not exists (
      select 1 from household_members where household_id = new.household_id and user_id = new.paid_by) then
    raise exception 'payer is not a household member';
  end if;
  if not exists (
      select 1 from categories c where c.id = new.category_id and c.type = new.type and c.scope = new.scope
        and (c.owner_id = owner or c.household_id = new.household_id)) then
    raise exception 'category does not match this entry';
  end if;
  return new;
end $$;

create trigger b_refs before insert or update on transactions for each row execute function check_entry_refs();
create trigger b_refs before insert or update on recurring_rules for each row execute function check_entry_refs();

create function public.check_transaction_rule() returns trigger language plpgsql set search_path = public as $$
begin
  if new.recurring_rule_id is not null and not exists (
      select 1 from recurring_rules r where r.id = new.recurring_rule_id and r.scope = new.scope
        and ((r.scope = 'personal' and r.owner_id = new.created_by) or r.household_id = new.household_id)) then
    raise exception 'recurring rule does not match this entry';
  end if;
  return new;
end $$;
create trigger c_rule before insert or update on transactions for each row execute function check_transaction_rule();

create function public.check_split() returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
      select 1 from transactions t join household_members m on m.household_id = t.household_id
      where t.id = new.transaction_id and m.user_id = new.user_id) then
    raise exception 'split user is not a household member';
  end if;
  return new;
end $$;
create trigger b_refs before insert or update on transaction_splits for each row execute function check_split();

create function public.check_limit() returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
      select 1 from monthly_plans p join categories c on c.id = new.category_id
      where p.id = new.plan_id and c.type = 'expense'
        and ((c.scope = 'personal' and c.owner_id = p.user_id) or (c.scope = 'shared' and c.household_id = p.household_id))) then
    raise exception 'category does not match this plan';
  end if;
  return new;
end $$;
create trigger b_refs before insert or update on category_limits for each row execute function check_limit();

revoke all on function public.forbid_change(), public.check_entry_refs(), public.check_transaction_rule(),
  public.check_split(), public.check_limit() from public, anon, authenticated;
