-- Save Brave schema. Money is integer cents; dates are calendar dates (no time zone).

-- Supabase grants every new public table/function to anon by default. Stop that for everything
-- created from here on; authenticated access is granted explicitly or via its own defaults + RLS.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges revoke execute on functions from public; -- the PUBLIC default is global, not per-schema

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  created_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households on delete cascade,
  user_id uuid not null unique references auth.users on delete cascade, -- one household per user
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  code_hash text not null unique,
  created_by uuid not null references auth.users on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users on delete set null
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('personal', 'shared')),
  type text not null check (type in ('income', 'expense')),
  name text not null check (length(name) between 1 and 40),
  owner_id uuid references auth.users on delete cascade,
  household_id uuid references households on delete cascade,
  check (type = 'expense' or scope = 'personal'),
  check (case scope when 'personal' then owner_id is not null and household_id is null
                    else household_id is not null and owner_id is null end)
);

create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('income', 'expense')),
  scope text not null check (scope in ('personal', 'shared')),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  household_id uuid references households on delete cascade,
  paid_by uuid not null references auth.users on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  category_id uuid not null references categories on delete restrict,
  note text check (length(note) <= 500),
  day_of_month smallint not null check (day_of_month between 1 and 31),
  start_date date not null,
  last_generated_date date,
  split jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (type = 'expense' or scope = 'personal'),
  check (case scope when 'personal' then household_id is null and paid_by = owner_id
                    else household_id is not null end)
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('income', 'expense')),
  scope text not null check (scope in ('personal', 'shared')),
  household_id uuid references households on delete cascade,
  paid_by uuid not null references auth.users on delete cascade,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  date date not null,
  category_id uuid not null references categories on delete restrict,
  note text check (length(note) <= 500),
  recurring_rule_id uuid references recurring_rules on delete set null,
  created_at timestamptz not null default now(),
  check (type = 'expense' or scope = 'personal'), -- income is always personal
  check (case scope when 'personal' then household_id is null and paid_by = created_by
                    else household_id is not null end)
);
create index transactions_owner_date on transactions (created_by, date) where scope = 'personal';
create index transactions_household_date on transactions (household_id, date) where scope = 'shared';
-- One generated entry per rule per date, even if both phones run generation at once.
create unique index transactions_rule_date on transactions (recurring_rule_id, date) where recurring_rule_id is not null;

create table transaction_splits (
  transaction_id uuid not null references transactions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  share_cents integer not null check (share_cents >= 0),
  primary key (transaction_id, user_id)
);

create table settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  from_user uuid not null references auth.users on delete cascade,
  to_user uuid not null references auth.users on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  date date not null,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

create table monthly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  household_id uuid references households on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  expected_income_cents integer not null default 0 check (expected_income_cents >= 0),
  savings_target_cents integer not null default 0 check (savings_target_cents >= 0),
  check ((user_id is null) <> (household_id is null)),
  unique (user_id, month),
  unique (household_id, month)
);

create table category_limits (
  plan_id uuid not null references monthly_plans on delete cascade,
  category_id uuid not null references categories on delete cascade,
  limit_cents integer not null check (limit_cents >= 0),
  primary key (plan_id, category_id)
);
