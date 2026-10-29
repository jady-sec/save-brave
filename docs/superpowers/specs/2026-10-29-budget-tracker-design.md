# Budget Tracker — Approved Design (v1)

Copied verbatim from the approved brief, 2026-10-29. Do not re-brainstorm.

## What it is
Each of us tracks our own monthly income and expenses and validates actual spending against an expected monthly budget, so we see where money goes and save more. We also split shared costs (groceries, rent, utilities). One uses an iPhone, the other an Android, and we may also use computers. Data must sync. Logging must take only a few taps.

## Goals
- Quick add of income/expense: amount, category, date, optional note, and a Personal/Shared toggle.
- Personal entries and all income are PRIVATE to their owner. Neither of us can see the other's personal entries or income.
- Shared entries are visible to both. Record who paid. Default split is 50/50; the split can be overridden per entry, Splitwise-style (custom amounts or percentages).
- Balance screen: running "who owes whom" computed from shared splits and settlements, plus a "Settle up" action that records a payment.
- Monthly plan per person: expected income, per-category limits, savings target. A household plan holds limits for shared categories.
- Budget vs actual: a person's actual = their personal spending + their SHARE of shared spending. Show per category (spent, remaining, over/under) and for the month (planned vs actual savings).
- In-app warnings at ~80% of a category limit and when exceeded.
- Plans carry forward to the next month and are editable.
- Recurring items (personal or shared, e.g. rent) created automatically.
- Monthly history to compare months; CSV export of the user's own visible transactions.

## Non-goals
No bank connections or statement import; no more than two people or multiple households; no multi-currency; no accounts/wallets; no receipt photos; no budget rollover; no offline entry in v1; no split-by-income-ratio in v1.

## Anti-goals
Slow entry (more than a few taps); money rounding errors; either person able to read the other's personal entries or income; a Balance that disagrees with the underlying entries.

## Decisions
- Installable PWA for phones and desktop browsers.
- Stack: React + TypeScript + Vite; Supabase (Postgres, passwordless email magic-link login, row-level security). Free-tier static hosting.
- Each person has their own login. One person creates the household and invites the other via a one-time code/link with an expiry.
- Money is stored as integer cents everywhere, never floats. When a split does not divide evenly, the extra cent goes to the payer.
- Either member can edit or delete shared entries; record the creator.
- Categories: personal categories per user; shared categories per household.
- Currency CAD (display only). Month = calendar month.
- Recurring items are generated when the app opens; missed months are back-filled.
- v1 needs a connection to save; last-loaded data is cached for viewing.
- Alerts are in-app only.
- Data model: households, household_members, invites, categories (scope personal|shared), transactions (type income|expense, scope personal|shared, paid_by, created_by, amount_cents, date, category_id, note), transaction_splits (transaction_id, user_id, share_cents), settlements (from_user, to_user, amount_cents, date), monthly_plans (user or household, month, expected_income_cents, savings_target_cents), category_limits, recurring_rules. Income is always personal. Balance = sum(paid by me on shared) - sum(my shares) + settlements, computed from records, never stored.
- Screens: Month overview, Add (fast sheet with Personal/Shared toggle and split editor), Transactions list with filter/search, Balance/Settle up, Plan editor, Recurring items, History, Settings (categories, household, export).
- Store only amounts, categories, dates, notes. No bank credentials or account numbers.

## How to work
- Milestones: 1 scaffold + PWA shell; 2 Supabase schema, RLS, auth; 3 household + invite flow; 4 personal transactions + fast add sheet; 5 shared transactions + splits + Balance/Settle up; 6 plans + budget-vs-actual + alerts; 7 recurring items; 8 history + CSV export; 9 polish, accessibility, deploy.
- TDD for logic: cents math, split rounding, balance, budget-vs-actual including own share, 80%/100% thresholds, recurring back-fill, month boundaries.
- RLS tests proving: user A cannot read user B's personal transactions, income, plans or personal categories; both can read shared rows only within their own household; a non-member cannot read anything; an expired or used invite cannot be reused.
- UI: frontend design skills, mobile-first, large tap targets, iOS Safari + Android Chrome.
- Verify (tests/build output) before claiming a milestone done; code review at the end of each milestone; commit per milestone on a feature branch.
- Supabase URL and anon key go in `.env.local` by the user. Never request secrets in chat; never use the service_role key; `.env.local` gitignored.
- Smallest thing that satisfies each milestone.
