-- Phone notifications. Each device that turns them on stores its Web Push subscription here; only its owner can
-- see or remove it. The `notify` edge function (running as the signed-in user, never with the service key) reads
-- the partner's devices through partner_push_targets() and sends the message, signed with the app's VAPID key.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- Only real push services, so the notify function can't be pointed at arbitrary URLs.
  endpoint text not null unique check (endpoint ~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.apple\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com)/'),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy own_read on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy own_insert on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy own_update on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- The caller's household partner's devices (never the caller's own, never anyone outside the household).
create function public.partner_push_targets() returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select s.endpoint, s.p256dh, s.auth
  from push_subscriptions s
  join household_members them on them.user_id = s.user_id
  join household_members me on me.household_id = them.household_id and me.user_id = auth.uid()
  where s.user_id <> auth.uid()
$$;
revoke all on function public.partner_push_targets() from public, anon, authenticated;
grant execute on function public.partner_push_targets() to authenticated;

-- Lets the notify function drop a device the push service says is gone (uninstalled app, expired subscription).
create function public.drop_partner_push_target(gone text) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions s using household_members them, household_members me
  where s.endpoint = gone and them.user_id = s.user_id and me.household_id = them.household_id
    and me.user_id = auth.uid() and s.user_id <> auth.uid()
$$;
revoke all on function public.drop_partner_push_target(text) from public, anon, authenticated;
grant execute on function public.drop_partner_push_target(text) to authenticated;
