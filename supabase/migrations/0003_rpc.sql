-- Household and invite functions. security definer because these tables have no client write policies;
-- each function checks auth.uid() itself. Errors are user-facing messages.

-- Failed invite redemptions, for rate limiting. No client access at all.
create table invite_attempts (
  user_id uuid not null references auth.users on delete cascade,
  at timestamptz not null default now()
);
create index invite_attempts_user_at on invite_attempts (user_id, at);
alter table invite_attempts enable row level security;
revoke all on invite_attempts from anon, authenticated;

create function public.create_household(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hh uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'already in a household';
  end if;
  insert into households (name, created_by) values (trim(p_name), auth.uid()) returning id into hh;
  insert into household_members (household_id, user_id) values (hh, auth.uid());
  return hh;
end $$;

create function public.invite_hash(p_code text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(lower(trim(p_code)), 'UTF8')), 'hex')
$$;

-- Returns a fresh 8-character code (shown once); only its hash is stored. Valid 48 hours, single use.
create function public.create_invite() returns text
language plpgsql security definer set search_path = public as $$
declare
  hh uuid;
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789'; -- no 0/o, 1/l/i
  bytes bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()); -- CSPRNG-backed
  code text := '';
begin
  select household_id into hh from household_members where user_id = auth.uid();
  if hh is null then raise exception 'not in a household'; end if;
  perform 1 from households where id = hh for update; -- serialise with redeem_invite and double taps
  if (select count(*) from household_members where household_id = hh) >= 2 then
    raise exception 'household is full';
  end if;
  -- uuid v4 bytes 0-5 are fully random; take bytes 0-3 of each uuid.
  for i in 0..7 loop
    code := code || substr(alphabet, 1 + get_byte(bytes, (array[0,1,2,3,16,17,18,19])[i + 1]) % length(alphabet), 1);
  end loop;
  update invites set expires_at = now() where created_by = auth.uid() and used_at is null and expires_at > now();
  insert into invites (household_id, code_hash, created_by, expires_at)
    values (hh, invite_hash(code), auth.uid(), now() + interval '48 hours');
  return code;
end $$;

-- Returns the household id, or null for a wrong, used or expired code (null rather than an error so
-- the failed attempt is recorded). 5 failures in an hour blocks further tries.
create function public.redeem_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invites;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'already in a household';
  end if;
  if (select count(*) from invite_attempts where user_id = auth.uid() and at > now() - interval '1 hour') >= 5 then
    raise exception 'too many attempts, try again in an hour';
  end if;
  select * into inv from invites where code_hash = invite_hash(p_code) for update; -- serialises concurrent redeems
  if inv.id is null or inv.used_at is not null or inv.expires_at <= now() then
    insert into invite_attempts (user_id) values (auth.uid());
    return null;
  end if;
  perform 1 from households where id = inv.household_id for update;
  if (select count(*) from household_members where household_id = inv.household_id) >= 2 then
    raise exception 'household is full';
  end if;
  insert into household_members (household_id, user_id) values (inv.household_id, auth.uid());
  update invites set used_at = now(), used_by = auth.uid() where id = inv.id;
  return inv.household_id;
end $$;

revoke all on function public.create_household(text), public.create_invite(), public.redeem_invite(text), public.invite_hash(text)
  from public, anon, authenticated;
grant execute on function public.create_household(text), public.create_invite(), public.redeem_invite(text) to authenticated;
