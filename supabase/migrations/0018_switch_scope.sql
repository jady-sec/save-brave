-- Move an entry between "just me" and "shared". scope and household_id stay immutable on update (0004), so this
-- deletes the entry and re-adds it with the same id through save_transaction, in one transaction: any check that
-- fails (category, payer, splits) undoes both. Runs as the caller, so RLS still decides what they can delete and add.
-- Only the person who added it may move it (a personal entry is theirs alone); a settled expense must stay as it is.
-- A recurring entry loses its link to the rule, which belongs to the old scope.
create function public.switch_transaction_scope(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare old transactions;
begin
  select * into old from transactions where id = (p ->> 'id')::uuid;
  if not found then raise exception 'entry not found'; end if;
  if old.created_by <> auth.uid() then raise exception 'only the person who added this entry can move it'; end if;
  if old.scope = p ->> 'scope' then raise exception 'this entry is already %', old.scope; end if;
  if exists (select 1 from settlements where transaction_id = old.id) then
    raise exception 'this expense is settled; undo the settlement first';
  end if;
  delete from transactions where id = old.id;
  return save_transaction((p - 'id' - 'recurring_rule_id') || jsonb_build_object('new_id', old.id));
end $$;
revoke all on function public.switch_transaction_scope(jsonb) from public, anon, authenticated;
grant execute on function public.switch_transaction_scope(jsonb) to authenticated;
