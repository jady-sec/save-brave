# Budget Tracker v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A two-person installable PWA where each person tracks private income/expenses against a monthly plan, and shared costs are split with a running balance and settle-up.

**Architecture:** Static React SPA talks directly to Supabase (PostgREST + Auth). Privacy is enforced only in Postgres via RLS; every multi-row write (transaction + splits, household create, invite redeem) goes through a Postgres function so it is atomic and validated server-side. All money math lives in pure, unit-tested TS modules in `src/lib/`; screens only fetch, call those, and render.

**Tech Stack:** React 18 + TypeScript + Vite, `react-router-dom`, `@supabase/supabase-js`, `vite-plugin-pwa`, Vitest. RLS tests run on `@electric-sql/pglite` (real Postgres in WASM — Docker is not installed on this machine) with a stub `auth` schema.

**Spec:** `docs/superpowers/specs/2026-10-29-budget-tracker-design.md`

## Global Constraints

- Money is integer cents in DB (`integer`, `check (amount_cents > 0)`) and in TS (`number`, always `Number.isInteger`). Never `parseFloat` a user amount.
- Uneven split: the extra cent goes to the payer.
- Income is always personal (DB check constraint `type <> 'income' or scope = 'personal'`).
- Currency display: `Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })`.
- Month = calendar month, keyed `'YYYY-MM'`; dates are Postgres `date` / TS `'YYYY-MM-DD'` strings, computed from **local** date parts (never `toISOString()`).
- Balance is computed from records, never stored.
- Only amounts, categories, dates, notes are stored. No account numbers.
- `.env.local` (user-filled: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) stays gitignored. No service_role key anywhere. The user applies migrations to the hosted project themselves.
- Tap targets ≥ 44×44 px; works in iOS Safari and Android Chrome.
- One commit per milestone on branch `feat/v1`; tests + build output shown and code review (superpowers:requesting-code-review) before each commit.
- UI milestones (1, 4, 5, 6, 9) use the `impeccable:impeccable` skill for design.

## Review Focus

1. **iOS installed PWA login:** a magic link opens Safari, not the home-screen app, so the session lands in the wrong place. Expect: the login screen also accepts the 6-digit code from the same email (Task 2.4).
2. **Late-night entries near month end:** an entry made at 23:30 on Oct 31 in Toronto must count in October. Expect: `todayLocal()` uses local date parts (Task 1.2 test).
3. **Both phones open the app at once:** recurring generation runs twice. Expect: exactly one transaction per rule per date (unique index + `on conflict do nothing`, Task 7.1 DB test).
4. **Amount typing:** `"12.5"`, `"1,234.56"`, `"12."`, `"12.345"`, `"-5"`, `"0"`. Expect: first three parse to 1250/123456/1200, last three rejected (Task 1.2 test).
5. **CSV opened in Excel/Sheets:** a note like `=HYPERLINK(...)` must not execute. Expect: cells beginning with `= + - @` are prefixed with `'` (Task 8.2 test).

Also worth knowing: Supabase's built-in email sender is rate-limited on the free tier (a few emails/hour). Fine for two people; if it bites, configure custom SMTP in the dashboard.

---

## File Structure

```
index.html, vite.config.ts, tsconfig.json, package.json, .gitignore
public/icon-192.png, icon-512.png
src/main.tsx                 — mount, router, SW registration
src/App.tsx                  — routes + bottom nav + auth gate + household gate
src/styles.css               — tokens, base styles
src/lib/money.ts             — parseCents, formatCents
src/lib/month.ts             — todayLocal, monthKey, monthBounds, addMonths, daysInMonth
src/lib/split.ts             — computeSplit
src/lib/balance.ts           — computeBalance
src/lib/budget.ts            — alertLevel, budgetVsActual
src/lib/recurring.ts         — dueDates
src/lib/csv.ts               — toCsv
src/lib/types.ts             — row types mirroring the DB
src/lib/supabase.ts          — createClient from env
src/lib/api.ts               — every DB call the UI makes
src/lib/cache.ts             — cached(key, fetcher): localStorage last-good copy
src/lib/*.test.ts            — unit tests next to each module
src/components/AmountInput.tsx, CategoryPicker.tsx, SplitEditor.tsx, BottomNav.tsx, Alert.tsx
src/screens/Login.tsx, Household.tsx, Overview.tsx, AddSheet.tsx, Transactions.tsx,
            Balance.tsx, Plan.tsx, Recurring.tsx, History.tsx, Settings.tsx
supabase/migrations/0001_schema.sql   — tables, constraints, indexes
supabase/migrations/0002_rls.sql      — enable RLS, policies, grants
supabase/migrations/0003_rpc.sql      — household/invite/save_transaction functions
supabase/migrations/0004_recurring.sql (M7)
tests/db/harness.ts          — PGlite + auth stub + asUser()
tests/db/rls.test.ts, rpc.test.ts
```

## Shared Types (`src/lib/types.ts`, Task 2.1)

```ts
export type Scope = 'personal' | 'shared';
export type TxType = 'income' | 'expense';
export interface Category { id: string; scope: Scope; name: string; owner_id: string | null; household_id: string | null }
export interface Split { user_id: string; share_cents: number }
export interface Tx { id: string; type: TxType; scope: Scope; household_id: string | null; paid_by: string; created_by: string;
  amount_cents: number; date: string; category_id: string; note: string | null; recurring_rule_id: string | null; splits: Split[] }
export interface Settlement { id: string; household_id: string; from_user: string; to_user: string; amount_cents: number; date: string }
export interface Plan { id: string; user_id: string | null; household_id: string | null; month: string;
  expected_income_cents: number; savings_target_cents: number; limits: { category_id: string; limit_cents: number }[] }
export interface RecurringRule { id: string; type: TxType; scope: Scope; owner_id: string; household_id: string | null; paid_by: string;
  amount_cents: number; category_id: string; note: string | null; day_of_month: number; start_date: string;
  last_generated_date: string | null; split: SplitInput | null; active: boolean }
export type SplitInput = { mode: 'equal' } | { mode: 'amounts'; cents: Record<string, number> } | { mode: 'percent'; pct: Record<string, number> };
```

---

## Milestone 1 — Scaffold + PWA shell

### Task 1.1: Vite app, PWA, nav shell

**Files:** Create `package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/components/BottomNav.tsx`, placeholder `src/screens/*.tsx`, `public/icon-*.png`. Modify `.gitignore` (add `dist`, `dbs.txt`).

- [ ] `git init`, empty initial commit on `main`, `git checkout -b feat/v1`.
- [ ] `npm create vite@latest . -- --template react-ts`; add `react-router-dom @supabase/supabase-js`, dev `vite-plugin-pwa vitest @electric-sql/pglite`.
- [ ] `vite.config.ts`: `VitePWA({ registerType: 'autoUpdate', manifest: { name: 'Budget', short_name: 'Budget', display: 'standalone', start_url: '/', theme_color, icons: [192, 512] } })`; Vitest `environment: 'node'`.
- [ ] `index.html`: `viewport-fit=cover`, `apple-mobile-web-app-capable`, `apple-touch-icon`. CSS uses `env(safe-area-inset-*)` and 16px base font on inputs (prevents iOS zoom).
- [ ] Routes: `/` Overview, `/tx` Transactions, `/balance`, `/plan`, `/recurring`, `/history`, `/settings`; Add is a sheet opened from a floating "+" on every screen. Bottom nav: Overview, Transactions, +, Balance, More (Plan/Recurring/History/Settings).
- [ ] Verify: `npm run build` succeeds and emits `dist/sw.js` + `dist/manifest.webmanifest`; `npx vitest run` exits 0 (no tests yet: `--passWithNoTests`).

### Task 1.2: Money + month helpers (TDD)

**Files:** Create `src/lib/money.ts`, `src/lib/month.ts`, tests beside them.

**Produces:** `parseCents(input: string): number | null`, `formatCents(cents: number): string`, `todayLocal(now?: Date): string`, `monthKey(date: string): string`, `monthBounds(month: string): { start: string; endExclusive: string }`, `addMonths(month: string, n: number): string`, `daysInMonth(month: string): number`.

- [ ] Write failing tests:
  - `parseCents`: `"12"→1200`, `"12.5"→1250`, `"12.34"→1234`, `"12."→1200`, `"1,234.56"→123456`, `" 7.05 "→705`, `"0.1"+"0.2"` style: `"0.30"→30`; `""`, `"0"`, `"-5"`, `"12.345"`, `"abc"`, `"1.2.3"`, `"99999999"` (over 21,474,836.47 int max) → `null`.
  - `formatCents(123456)` matches `/1,234\.56/` and contains `$`; `formatCents(-500)` shows minus.
  - `todayLocal(new Date(2026, 9, 31, 23, 30))` → `'2026-10-31'` (local constructor, so it holds in any TZ).
  - `monthBounds('2026-12')` → `{ start: '2026-12-01', endExclusive: '2027-01-01' }`; `addMonths('2026-01', -1)` → `'2025-12'`; `daysInMonth('2028-02')` → 29, `'2026-02'` → 28.
- [ ] Run `npx vitest run src/lib` → FAIL (modules missing).
- [ ] Implement. `parseCents`: strip commas/space, regex `^\d+(\.\d{0,2})?$`, build cents from the integer and padded fraction strings (no float math), reject `<= 0` or `> 2147483647`.
- [ ] Run → PASS. `npm run build` → OK.
- [ ] Code review, commit `M1: scaffold PWA shell, money and month helpers`.

---

## Milestone 2 — Schema, RLS, auth

### Task 2.1: DB test harness + schema

**Files:** Create `tests/db/harness.ts`, `supabase/migrations/0001_schema.sql`, `src/lib/types.ts`.

**Produces (harness):** `makeDb(): Promise<PGlite>` (creates roles `anon`, `authenticated`; schema `auth` with `auth.users(id uuid pk, email text)` and `auth.uid()` returning `current_setting('request.jwt.claims', true)::json->>'sub'`; then applies `supabase/migrations/*.sql` in order); `addUser(db, email): Promise<string>`; `asUser<T>(db, uid | null, sql, params?): Promise<T[]>` — runs in a transaction with `set local role authenticated|anon` and the claims set, then rolls back the role.

- [ ] Spike first: confirm PGlite supports `create role` + `set role` + RLS with one throwaway test. If it does not, stop and tell the user (fallback: install Docker and use `supabase test db` with pgTAP).
- [ ] Schema (`0001`): `households(id, name, created_by, created_at)`; `household_members(household_id, user_id unique, joined_at)` — `user_id unique` enforces one household per user; `invites(id, household_id, code_hash text, created_by, expires_at, used_at, used_by)`; `categories(id, scope, name, owner_id, household_id, check personal⇒owner_id not null and household_id null, shared⇒household_id not null and owner_id null)`; `transactions(id, type, scope, household_id, paid_by, created_by, amount_cents, date, category_id references categories on delete restrict, note text check length ≤ 500, recurring_rule_id, created_at, checks: income⇒personal; personal⇒household_id null and paid_by = created_by; shared⇒household_id not null)`; `transaction_splits(transaction_id references transactions on delete cascade, user_id, share_cents check ≥ 0, pk(transaction_id,user_id))`; `settlements(id, household_id, from_user, to_user, amount_cents, date, created_by, check from_user <> to_user)`; `monthly_plans(id, user_id, household_id, month char(7), expected_income_cents default 0, savings_target_cents default 0, check exactly one of user_id/household_id, unique(user_id, month), unique(household_id, month))`; `category_limits(plan_id references monthly_plans on delete cascade, category_id, limit_cents check ≥ 0, pk(plan_id, category_id))`; `recurring_rules` (columns as in `RecurringRule`, `split jsonb`, `day_of_month check 1..31`). Unique index `transactions(recurring_rule_id, date) where recurring_rule_id is not null`.
- [ ] Test `schema.test.ts`: migrations apply cleanly; inserting income with scope shared fails; inserting `amount_cents = 0` fails.
- [ ] Run `npx vitest run tests/db` → PASS.

### Task 2.2: RLS policies (TDD — highest risk)

**Files:** Create `supabase/migrations/0002_rls.sql`, `tests/db/rls.test.ts`.

**Produces:** SQL helper `public.is_member(hh uuid) returns boolean` (`security definer`, `set search_path = public`, stable) — avoids recursive RLS on `household_members`.

- [ ] Fixture in `beforeAll`: users A and B in household H1, user C in household H2, user D in no household. A has a personal category, personal expense, income, and a personal plan; H1 has a shared category, a shared expense paid by A with splits A/B, a settlement, a household plan; C has the same in H2. Seed as superuser.
- [ ] Write failing tests (each `asUser`):
  - B sees 0 of A's personal transactions, 0 of A's income, 0 of A's plans/limits, 0 of A's personal categories, 0 of A's personal recurring rules.
  - A and B each see H1's shared transaction, its 2 split rows, the settlement, H1's household plan, and H1's shared category.
  - C sees nothing from H1 (transactions, splits, settlements, plans, categories, members, household row). A sees nothing from H2.
  - D (non-member) and `anon` see 0 rows in every table.
  - B cannot `update`/`delete` A's personal transaction (0 rows affected) and cannot insert a personal transaction with `created_by = A`.
  - B can update and delete H1's shared transaction; C cannot (0 rows).
  - No one can `select` from `invites` except the creator.
  - Meta-test: every table in `public` has `relrowsecurity = true` (query `pg_class`), so a future table cannot ship without RLS.
- [ ] Run → FAIL.
- [ ] Implement `0002`: `enable row level security` on every table; `revoke all on all tables in schema public from anon`; `grant select, insert, update, delete … to authenticated`. Policies:
  - personal rows (transactions, categories, recurring_rules, user plans): `created_by/owner_id/user_id = auth.uid()` for all commands (`using` + `with check`).
  - shared rows: `is_member(household_id)`; `with check` also requires `created_by = auth.uid()` on insert.
  - `transaction_splits` and `category_limits`: `exists (select 1 from parent where parent.id = …)` — inherits parent visibility via the parent's RLS.
  - `households`, `household_members`: select where `is_member(id/household_id)`; no direct insert (RPCs only).
  - `invites`: select where `created_by = auth.uid()`; no direct insert/update.
- [ ] Run → PASS.

### Task 2.3: Household + invite RPCs (TDD)

**Files:** Create `supabase/migrations/0003_rpc.sql`, `tests/db/rpc.test.ts`.

**Produces:** `create_household(p_name text) returns uuid`; `create_invite() returns text` (8-char code from an unambiguous alphabet via `gen_random_bytes`, stores `encode(digest(code,'sha256'),'hex')`, `expires_at = now() + interval '48 hours'`, marks caller's previous unused invites used); `redeem_invite(p_code text) returns uuid`. All `security definer`, `set search_path = public`, `revoke execute from anon`.

- [ ] Write failing tests: creating a household twice fails ("already in a household"); D redeems A's code → D in H1; redeeming the same code again (by anyone) fails; a code with `expires_at` in the past fails; a wrong code fails; a third person redeeming a valid code for a full household (2 members) fails; a user already in a household cannot redeem; redeem lowercases/trims input.
- [ ] Run → FAIL. Implement (redeem uses `select … for update` on the invite row so two concurrent redeems cannot both succeed). Run → PASS.

### Task 2.4: Supabase client + login screen

**Files:** Create `src/lib/supabase.ts`, `src/screens/Login.tsx`. Modify `src/App.tsx`.

**Produces:** `supabase` client; `useSession(): Session | null | undefined` (undefined = loading) in `App.tsx`.

- [ ] `supabase.ts` throws a clear error if `import.meta.env.VITE_SUPABASE_URL`/`_ANON_KEY` are missing.
- [ ] Login: email field → `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } })`; then a 6-digit code field → `supabase.auth.verifyOtp({ email, token, type: 'email' })`. Both paths work.
- [ ] **STOP — user action:** tell the user to (1) run the three migrations on their project (`npx supabase link` + `npx supabase db push`, or paste them into the SQL editor), (2) in Auth → Email Templates → Magic Link, add `{{ .Token }}` to the body, (3) add the dev URL `http://localhost:5173` to Auth → URL Configuration → Redirect URLs. Never ask for the DB password or keys in chat.
- [ ] Verify: `npx vitest run` all green, `npm run build` OK; manual check that login works on `npm run dev`.
- [ ] Code review, commit `M2: schema, RLS with tests, household/invite RPCs, OTP login`.

---

## Milestone 3 — Household + invite flow

### Task 3.1: Household screen

**Files:** Create `src/screens/Household.tsx`, `src/lib/api.ts` (start). Modify `src/App.tsx`, `src/screens/Settings.tsx`.

**Produces (api.ts):** `getMe(): Promise<{ userId: string; householdId: string | null; members: { user_id: string; email: string }[] }>`; `createHousehold(name: string)`; `createInvite(): Promise<string>`; `redeemInvite(code: string): Promise<string | null>` (null = wrong/used/expired code; RPC raises only for "too many attempts", "household is full", "already in a household"). Member emails come from a `household_member_emails` view (security-invoker, joins `auth.users` email only for `is_member` rows) — add to `0003`.

- [ ] Gate in App: signed in with no household → Household screen offers "Create household" or "Join with code". Personal features still work without a household (shared toggle hidden).
- [ ] Creator sees "Invite partner": shows code + share link `/?join=CODE` + expiry time. Opening the link pre-fills the join field after login.
- [ ] Settings shows household name and members.
- [ ] Add RPC test for the view: C cannot see H1 emails. Verify tests + build; manual two-browser check (two emails).
- [ ] Code review, commit `M3: household creation and invite flow`.

---

## Milestone 4 — Personal transactions + fast Add sheet

### Task 4.1: save_transaction RPC (TDD)

**Files:** Modify `supabase/migrations/0003_rpc.sql` (or add `0003b` if already applied by the user — new file per change once the user has pushed), `tests/db/rpc.test.ts`.

**Produces:** `save_transaction(p jsonb) returns uuid` — **security invoker** (RLS still applies). Keys: `id?`, `type`, `scope`, `amount_cents`, `date`, `category_id`, `note`, `paid_by`, `splits?: [{user_id, share_cents}]`, `recurring_rule_id?`. Insert or update; for shared, replaces splits. Category, payer, split-member and scope-immutability checks already live in `0004_integrity.sql` triggers (M2 review fix). New in M4: a **deferred constraint trigger** (`deferrable initially deferred`) on `transactions` and `transaction_splits` enforcing that every shared transaction's splits cover both members and `sum(share_cents) = amount_cents` at commit, so direct PostgREST writes cannot bypass it. With `recurring_rule_id`, insert uses `on conflict do nothing` and returns null if the row already existed.

- [ ] Failing tests: personal insert works; split sum ≠ amount rejected; split with C's id rejected; using B's personal category rejected; changing scope on update rejected; B updating A's shared entry replaces splits; duplicate `(recurring_rule_id, date)` returns null and leaves one row.
- [ ] Implement, PASS.

### Task 4.2: Categories, Add sheet, Transactions list

**Files:** Create `src/components/AmountInput.tsx`, `CategoryPicker.tsx`, `src/screens/AddSheet.tsx`, `src/screens/Transactions.tsx`, `src/lib/cache.ts`. Modify `api.ts`, `Settings.tsx`.

**Produces (api.ts):** `listCategories(): Promise<Category[]>`, `saveCategory(c)`, `deleteCategory(id)` (FK restrict → show "category in use"); `listTransactions(month: string): Promise<Tx[]>` (embedded `transaction_splits`); `saveTransaction(input): Promise<string>`; `deleteTransaction(id)`. **cache.ts:** `cached<T>(key: string, fetcher: () => Promise<T>): Promise<{ data: T; stale: boolean }>` — on success stores JSON under `cache:<userId>:<key>`; on network error returns stored copy with `stale: true`; `clearCache()` called on sign-out.

- [ ] First login seeds default personal categories (Groceries-personal, Eating out, Transport, Fun, Other; income: Salary, Other income) via `saveCategory`, only if the user has none.
- [ ] Add sheet, ≤ 3 taps for the common case: opens with amount field focused (`inputmode="decimal"`), Expense default, last-used category preselected, date = `todayLocal()`; tap category chip → Save. Income toggle hides Personal/Shared (forced personal). Save disabled until `parseCents` is non-null. On failure show "Not saved — check connection" and keep the input.
- [ ] Transactions: month switcher, list grouped by date, filter by type/scope/category, text search on note (client-side), tap to edit/delete. Shows "Offline — showing last loaded data" banner when `stale`.
- [ ] Verify: tests + build; manual add/edit/delete on phone-size viewport.
- [ ] Code review, commit `M4: personal transactions and fast add sheet`.

---

## Milestone 5 — Shared transactions, splits, Balance

### Task 5.1: computeSplit + computeBalance (TDD)

**Files:** Create `src/lib/split.ts`, `src/lib/balance.ts`, tests.

**Produces:** `computeSplit(amount: number, payer: string, members: [string, string], input: SplitInput): Split[]` (throws `Error` with a user-facing message on invalid input); `computeBalance(me: string, shared: Pick<Tx,'paid_by'|'splits'>[], settlements: Pick<Settlement,'from_user'|'to_user'|'amount_cents'>[]): number` — positive = partner owes me.

- [ ] Failing tests:
  - equal: `1001` paid by A → A 501, B 500; `1000` → 500/500; result always sums to amount.
  - percent `{A:70,B:30}` of `1001` paid by B → A 700, B 301 (non-payer floored, payer gets remainder); percents not summing to 100, negative, or non-integer → throws.
  - amounts `{A:300,B:700}` of 1000 → as given; sum ≠ amount → throws; negative → throws.
  - balance: A pays 1000 split 500/500 → A +500, B −500; plus settlement B→A 500 → both 0; settlement A→B increases A's balance.
  - Invariant: for random generated sets of shared txs + settlements, `computeBalance(A) + computeBalance(B) === 0`.
- [ ] Run → FAIL. Implement: balance = Σ amount where paid_by=me − Σ my share + Σ settlements from me − Σ settlements to me. Run → PASS.

### Task 5.2: Shared toggle, SplitEditor, Balance screen

**Files:** Create `src/components/SplitEditor.tsx`, `src/screens/Balance.tsx`. Modify `AddSheet.tsx`, `Transactions.tsx`, `api.ts`.

**Produces (api.ts):** `listShared(): Promise<Tx[]>` (all-time shared with splits, for balance), `listSettlements(): Promise<Settlement[]>`, `addSettlement(to_user: string, amount_cents: number, date: string)`, `deleteSettlement(id)`. Settlement insert policy requires `from_user = auth.uid()` — add to RLS + test.

- [ ] Add sheet: Personal/Shared toggle (visible only with a partner). Shared shows "Paid by: Me / Partner" (default me) and "Split 50/50 · Edit". SplitEditor tabs: Equal / Amounts / Percent, live-previews `computeSplit` result in dollars, shows its error inline and disables Save. Shared categories come from the household.
- [ ] Transactions list marks shared items and shows "your share".
- [ ] Balance: big "Partner owes you $X" / "You owe partner $X" / "All settled"; list of shared entries + settlements (newest first). "Settle up" prefills the full owed amount (editable) and records a settlement from the debtor's side only (if partner owes me, I can't record their payment — show "Ask partner to settle up"). shortcut: only the debtor records settlements; relax if it gets annoying.
- [ ] Verify tests + build; manual two-account check that balance matches on both devices.
- [ ] Code review, commit `M5: shared transactions, splits, balance and settle up`.

---

## Milestone 6 — Plans, budget vs actual, alerts

### Task 6.1: alertLevel + budgetVsActual (TDD)

**Files:** Create `src/lib/budget.ts`, test.

**Produces:**
- `alertLevel(spent: number, limit: number): 'ok' | 'warn' | 'over'` — `over` if `spent > limit`; `warn` if `spent * 100 >= limit * 80`; else `ok`. Limit 0: `over` if spent > 0, else `ok`.
- `budgetVsActual(me: string, txs: Tx[], personalPlan: Plan | null, householdPlan: Plan | null): { income: number; spent: number; plannedSavings: number; actualSavings: number; rows: BudgetRow[] }` where `BudgetRow = { category_id: string; scope: Scope; limit: number | null; spent: number; mine: number; remaining: number | null; level: 'ok'|'warn'|'over'|null }`.
- Rules: `income` = my income; `spent` = my personal expenses + my `share_cents` of shared expenses; `actualSavings = income − spent`; `plannedSavings = personalPlan.savings_target_cents`. Personal rows: spent = mine. Shared rows: `spent` = household total for the category, compared against the household limit; `mine` = my share. (Interpretation: shared limits are household limits, so alerts on them use the household total; my month total uses only my share.)

- [ ] Failing tests: 799/1000 → ok, 800/1000 → warn, 1000/1000 → warn, 1001/1000 → over, 0/0 → ok, 1/0 → over. Budget: income 500000, personal groceries 10000, shared rent 200001 paid by B split A 100000 / B 100001 → A's `spent` = 110000, `actualSavings` = 390000; rent row `spent` 200001, `mine` 100000; B's personal expenses never appear in A's result (they are not in A's input — assert the function ignores personal txs whose `created_by ≠ me` anyway); category without a limit has `limit: null`, `level: null`.
- [ ] Run → FAIL, implement, PASS.

### Task 6.2: Plan editor, Overview, alerts

**Files:** Create `src/components/Alert.tsx`. Modify `src/screens/Plan.tsx`, `src/screens/Overview.tsx`, `api.ts`.

**Produces (api.ts):** `getPlan(owner: 'me' | 'household', month: string): Promise<Plan | null>` — returns the plan for `month`, else the most recent plan before it (this *is* carry-forward: no copying); `savePlan(owner, month, fields, limits)` — upserts the row for exactly `month`, replacing its limits.

- [ ] Plan editor: month switcher; "Carried from <month>" note when the plan came from an earlier month; expected income, savings target, per-category limits (personal tab / household tab). Save writes this month only.
- [ ] Overview (current month): planned vs actual savings, income, spent; category rows with bar, spent / limit, remaining or "over by"; top banner lists categories at `warn` ("80% of Groceries used") and `over` ("Groceries over by $12.40"). Uses `Alert` with `role="status"`.
- [ ] Verify tests + build; manual check.
- [ ] Code review, commit `M6: monthly plans, budget vs actual, alerts`.

---

## Milestone 7 — Recurring items

### Task 7.1: dueDates (TDD) + generation

**Files:** Create `src/lib/recurring.ts` + test, `supabase/migrations/0004_recurring.sql` (RLS for `recurring_rules` if not in 0002, plus `advance_recurring(p_rule uuid, p_date date)` updating `last_generated_date` only forward), `src/screens/Recurring.tsx`. Modify `api.ts`, `App.tsx`, `tests/db/rpc.test.ts`.

**Produces:** `dueDates(rule: Pick<RecurringRule,'day_of_month'|'start_date'|'last_generated_date'>, today: string): string[]` — every occurrence date after `last_generated_date` (or from `start_date` inclusive), up to and including `today`, with `day_of_month` clamped to month length. `runRecurring(today: string): Promise<number>` in `api.ts` — for each active rule visible to me, saves each due date via `save_transaction` with `recurring_rule_id` (shared splits from `computeSplit(rule.amount, rule.paid_by, members, rule.split ?? {mode:'equal'})`), then `advance_recurring`.

- [ ] Failing tests: start `2026-07-15`, never generated, today `2026-10-29` → `['2026-07-15','2026-08-15','2026-09-15','2026-10-15']`; today `2026-10-14` → excludes October; last generated `2026-09-15` → only October; day 31 from `2026-01-31` to `2026-04-30` → Jan 31, Feb 28, Mar 31, Apr 30; leap year Feb 2028 → 29; start in the future → `[]`.
- [ ] DB test: calling `save_transaction` twice for the same rule+date (simulating both phones) → one transaction, one set of splits.
- [ ] Run → FAIL, implement, PASS.
- [ ] `App.tsx` calls `runRecurring(todayLocal())` once after login + household load, then refreshes data; errors are shown, not swallowed.
- [ ] Recurring screen: list rules, add/edit (same form fields as Add sheet + day of month), pause/delete. Deleting a rule keeps generated transactions.
- [ ] Verify tests + build; code review; commit `M7: recurring items with back-fill`.

---

## Milestone 8 — History + CSV export

### Task 8.1: History screen

**Files:** Modify `src/screens/History.tsx`, `api.ts`.

**Produces (api.ts):** `listTransactionsRange(fromMonth: string, toMonth: string): Promise<Tx[]>`.

- [ ] Last 12 months table: per month income, spent (own share rule), saved, planned savings, hit/miss. Tap a month → Overview for that month (Overview takes `?m=YYYY-MM`). Reuses `budgetVsActual` per month; no new math.

### Task 8.2: toCsv (TDD) + export

**Files:** Create `src/lib/csv.ts` + test. Modify `Settings.tsx`.

**Produces:** `toCsv(rows: string[][]): string` — RFC 4180 quoting (`"` doubled; quote fields containing `,` `"` `\n` `\r`), `\r\n` line ends, prefix `'` to cells starting with `=`, `+`, `-`, `@`, tab or CR. Amount cells use `centsToPlain(cents: number): string` → `"12.34"`, built with integer division and `%` (no `/100` float) (add to `money.ts`, test `5 → "0.05"`, `123456 → "1234.56"`).

- [ ] Failing tests: quoting, injection prefix, `centsToPlain`; negative amounts are not used in CSV (expense/income is a column), so `-` prefix only triggers on notes.
- [ ] Implement, PASS.
- [ ] Settings → "Export CSV": date range picker (default all), columns `date,type,scope,category,amount,your_share,paid_by,note`; only rows the user can already see (RLS guarantees it). Download via `Blob` + `<a download>`; on iOS Safari falls back to `navigator.share({ files })` when available.
- [ ] Verify tests + build; code review; commit `M8: history and CSV export`.

---

## Milestone 9 — Polish, accessibility, deploy

### Task 9.1: Polish + accessibility

- [ ] Run `impeccable:impeccable` audit/polish pass over all screens.
- [ ] Every input has a `<label>`; icon buttons have `aria-label`; focus visible; colour contrast ≥ 4.5:1; alerts not colour-only (icon + text); sheet traps focus and closes on Esc; respects `prefers-reduced-motion`.
- [ ] Manual check at 375×812 in the browser pane plus the user on real iPhone and Android.

### Task 9.2: Deploy

- [ ] Host on Cloudflare Pages (free, static, SPA fallback via `public/_redirects`: `/* /index.html 200`). Env vars `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set **by the user** in the Pages dashboard.
- [ ] **STOP — user action:** user creates the Pages project from the repo (or `npx wrangler pages deploy dist`), adds the production URL to Supabase Auth redirect URLs and Site URL.
- [ ] Verify: full test suite + `npm run build` output; install to home screen on both phones; log in with code; add personal + shared entry; balance matches on both.
- [ ] Final whole-branch code review, commit `M9: polish, accessibility, deploy config`, then superpowers:finishing-a-development-branch.

---

## Explicitly not built (per spec / YAGNI)

Offline entry, bank import, multi-currency, receipts, rollover, income-ratio splits, push/email alerts, decimal percentages in splits, editing a transaction's scope, more than two members, leaving/deleting a household.
