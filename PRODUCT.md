# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Tagline

Spend together. Save together.

Use it wherever the app introduces itself: sign-in screen, web manifest, page description, sign-in emails.

## Stack
React + TypeScript + Vite installable PWA; Supabase (Postgres, email OTP/magic-link auth, RLS). Free-tier static hosting.

## Users
A couple (two people). One uses an iPhone, the other an Android; both may use a computer. Each logs their own income and expenses, often on the go right after paying, and checks how the month is tracking against their plan.

## Product Purpose
Save Brave lets each person see where their money goes and save more by checking actual spending against an expected monthly budget, while splitting shared costs (rent, groceries, utilities) fairly. Success: logging takes a few taps, each person knows their savings vs plan, and the shared balance is always correct.

## Positioning
Private-by-default budgeting for two: each person's personal entries and income stay invisible to the other, while shared costs are split Splitwise-style and count toward each person's budget as their own share only.

## Operating Context
Quick entry at a till or right after a purchase, one-handed on a phone. Monthly review at home: plan vs actual, history across months. Occasional "settle up" between the two.

## Capabilities and Constraints
- Income/expense entries: amount, category, date, optional note, Personal/Shared.
- Shared entries: who paid, 50/50 default, custom amounts or percentages; running balance and settle up.
- Monthly plans per person and per household; 80% and over-limit in-app warnings; carry-forward.
- Recurring items, monthly history, CSV export.
- CAD only, calendar months, integer cents. Online required to save; last-loaded data viewable offline.
- Not in v1: bank import, multi-currency, receipts, rollover, more than two people.

## Brand Commitments
Name: **Save Brave**.

## Evidence on Hand
None. No testimonials, data, or assets exist; do not fabricate any.

## Product Principles
1. Entry speed beats completeness: the common add is three taps.
2. Privacy is non-negotiable: never show one person's personal data to the other.
3. Numbers must be exact and agree everywhere (balance = underlying entries).
4. Show where you stand this month at a glance; detail on demand.

## Accessibility & Inclusion
WCAG AA contrast, 44px minimum tap targets, labelled controls for screen readers, respects reduced motion. Over/under status is never colour-only.
