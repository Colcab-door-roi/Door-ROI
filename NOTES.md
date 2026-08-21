# Fridge Energy Savings Calculator — Project Notes

## Purpose
Web app (PWA, mobile-friendly) for colleagues to calculate energy savings on
upright retail fridges when doors are fitted. Avoids native app store /
OS-update overhead.

## Stack decisions
- **Frontend**: React + Vite (fast, works great as a PWA, deploys cleanly to
  Cloudflare Pages)
- **Hosting/deploy**: Cloudflare Pages, connected to GitHub repo for
  auto-deploy on push
- **Database**: Supabase (Postgres) — holds fridge models, door-fit
  coefficients, baseline consumption data, etc.
- **Auth**: none for now (open link). Add Supabase Auth later without
  reworking the data layer.
- **Admin edit screen**: passcode-gated for now (env secret checked via a
  Cloudflare Pages Function using the Supabase service role key server-side —
  never expose service role key to the browser). Upgrade to real accounts
  later.
- **Source of truth for data**: Supabase tables, seeded/migrated from the
  spreadsheet the user provides. Spreadsheet itself is just the one-time (or
  occasional) import source, not something the app reads live.

## Repo
- Local: C:\Users\cdwso\Documents\fridge-energy-savings
- GitHub: (pending — user creating empty repo, will paste URL)

## Open items
- [ ] Get GitHub repo URL from user
- [ ] Get spreadsheet with fridge/energy data points
- [ ] Design Supabase schema from spreadsheet structure
- [ ] Scaffold Vite React app + PWA manifest
- [ ] Build calculator UI
- [ ] Build admin data-edit screen (passcode gated)
- [ ] Wire up Supabase client
- [ ] Connect Cloudflare Pages to GitHub repo for auto-deploy
