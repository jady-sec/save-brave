-- Settle one shared expense: a settlement can point at the expense it pays off. Whoever didn't pay records it
-- (the existing payer_insert policy: from_user = you), for exactly their share, to whoever paid; once per expense.
-- Undoing the payment frees the expense again; deleting the expense keeps the payment (it still happened).
alter table public.settlements add column transaction_id uuid references public.transactions on delete set null;
create unique index settlements_one_per_expense on public.settlements (transaction_id) where transaction_id is not null;

create function public.settlements_check_expense() returns trigger language plpgsql set search_path = public as $$
declare
  t transactions%rowtype;
  share integer;
begin
  if new.transaction_id is null then return new; end if;
  -- Runs as the caller, so an expense outside their household simply isn't found.
  select * into t from transactions where id = new.transaction_id;
  if not found or t.scope <> 'shared' or t.household_id <> new.household_id or t.paid_by <> new.to_user then
    raise exception 'that expense can''t be settled this way';
  end if;
  select s.share_cents into share from transaction_splits s where s.transaction_id = t.id and s.user_id = new.from_user;
  if share is null or share <> new.amount_cents then
    raise exception 'a settlement must equal your share of the expense';
  end if;
  return new;
end $$;
create trigger settlements_check_expense before insert on public.settlements
  for each row execute function public.settlements_check_expense();
