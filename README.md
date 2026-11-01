<p align="center">
  <img src="public/icon-192.png" width="96" alt="Save Brave icon: a savings jar with three coins" />
</p>

<h1 align="center">Save Brave</h1>
<p align="center"><strong>Spend together. Save together.</strong></p>

<p align="center">
  A private budgeting app for couples. Each person tracks their own money, shared costs are split fairly,
  and you save toward goals together. Installable on iPhone and Android as a home-screen app.
</p>

---

## Why

Most budgeting apps assume one person, or make a couple share everything. Save Brave is **private by default**:
your personal income and spending are invisible to your partner, while shared costs (rent, groceries, utilities)
are split Splitwise-style and count toward each person's budget as *their own share* only.

## Features

**Everyday**
- **Fast entry**: amount, category, Save. Repeat chips for things you buy often; Paid-by remembers who usually pays.
- **Personal or shared** entries, split 50/50, by amount or by percentage.
- **Balance and settle up**: who owes whom, always derived from the entries themselves.
- **Recurring items** (rent, subscriptions) added automatically each month, plus a *Coming up* card for the week ahead.
- **Search** by note, category or amount, in one month or across all of them.
- **Works offline** for viewing; saving needs a connection.

**Planning and insight**
- **Monthly plan**: expected income, savings target, per-category limits with 80% and over-limit warnings.
- **Insights**: spending pace against the same day last month, where the money went, savings per month,
  and per-category trends against your 3-month average.
- **Savings goals**, personal or together, with a jar that fills up and who-put-in-what.
- **Monthly recap**: a swipeable month-in-review story in the first week of each month.
- **History** of the last 12 months, and CSV export.

**Together**
- **Live updates**: your partner's entries show up within a second.
- **Phone notifications** when your partner adds a shared entry or settles up.
- **Names and avatars**, a day streak, celebrations when a goal is reached.

**Feel**
- Bold-outline design with an orange header, hard shadows and bright tiles; Lexend type.
- **Dark mode** switch, opening animation, pull-to-refresh, category icons.

## Privacy and security

Privacy is enforced by the database, not just the UI.

- **Row Level Security** on every table. Personal entries, plans and goals are readable only by their owner; shared
  rows only by members of that household. Profiles and push devices are visible to yourself and your partner only.
- **Tested**: the PGlite test suite (`tests/db/`) runs every migration and checks, as each user, what they can and
  can't read or change, including partners, strangers and anonymous callers.
- **No service key anywhere.** The app and the notification function run with the public anon key plus the signed-in
  user's token, so the database's rules always apply.
- **Stores only** amounts, categories, dates, notes, and a chosen name and avatar. No bank credentials, card or account
  numbers. Notification text never includes your notes.
- **Strict Content-Security-Policy**: the page can only load its own files and talk to Supabase.
- **Money is integer cents** throughout; splits are validated in the database so shares always add up.

## Tech stack

| Layer | Choice |
| --- | --- |
| App | React 18, TypeScript, React Router, Vite, installable PWA (vite-plugin-pwa / Workbox) |
| Backend | Supabase: Postgres with RLS, email one-time-code sign-in, Realtime, an Edge Function for Web Push |
| Hosting | Cloudflare Workers static assets, with a daily cron that keeps the free Supabase project awake |
| Tests | Vitest for logic; PGlite runs the real migrations in-process for database and privacy tests |

## Project layout

```
src/
  screens/       Month (Overview), Entries, Balance, Insights, Goals, Plan, Recurring, History, Settings, Recap…
  components/    Screen shell, bottom nav, add sheet pieces, avatars, category badges, celebrations
  lib/           Pure logic with tests: money, splits, balance, budget, trends, insights, recap, streaks, search…
  lib/api.ts     Every database call the UI makes
supabase/
  migrations/    0001–0014: schema, RLS, RPCs, profiles, realtime, push, goals, category icons
  functions/notify/   Edge Function that sends partner notifications (runs as the caller)
tests/db/        Database and privacy tests against the real migrations
worker/          Cloudflare Worker: serves the app, daily keep-alive
public/          Icons, security headers, push service-worker handlers
```

## Running it yourself

**Prerequisites:** Node 20+, a free [Supabase](https://supabase.com) project, a free Cloudflare account.

1. **Install**
   ```bash
   npm install
   ```
2. **Configure**: create `.env.local` (it is gitignored) with your project's public values:
   ```
   VITE_SUPABASE_URL=https://<your-project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your anon / publishable key>
   VITE_VAPID_PUBLIC_KEY=<from: npx web-push generate-vapid-keys>
   ```
3. **Database**: link the project and apply the migrations.
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
4. **Notifications** (optional): set the VAPID secrets and deploy the function.
   ```bash
   npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
   npx supabase functions deploy notify --use-api
   ```
5. **Run locally**
   ```bash
   npm run dev
   ```
6. **Deploy**
   ```bash
   npm run build
   npx wrangler deploy
   npx wrangler secret put SUPABASE_URL        # for the daily keep-alive
   npx wrangler secret put SUPABASE_ANON_KEY
   ```
   In Supabase → Authentication → URL Configuration, set the Site URL to your deployed address.

Sign-in uses email one-time codes; set the "Magic Link" and "Confirm signup" email templates to include
`{{ .Token }}`.

## Tests

```bash
npm test
```

Around 280 tests: unit tests for the money and date logic, and database tests that apply every migration to an
in-memory Postgres (PGlite) and check row security as different users.

## Status

Built for two people and in daily use. Not in scope: bank import, multiple currencies, receipt photos,
households of more than two.
