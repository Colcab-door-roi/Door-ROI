# Fridge Energy Savings Calculator — Project Notes

## Purpose
Web app (PWA, mobile-friendly) for sales reps to run a full retail store
survey — every fridge case, its category, and any reclad/LED upgrades — with
a fixed plant type and door type per survey, and generate a PDF ROI report
on the spot.

## Stack decisions
- **Frontend**: React + Vite (fast, works great as a PWA, deploys cleanly to
  Cloudflare Pages)
- **Hosting/deploy**: Cloudflare Pages (project `colcab-roi`), connected to
  GitHub repo for auto-deploy on push to `main`
- **Database**: Supabase Postgres (project `xmtwzyoaikfthcuxczpq`)
- **Storage**: Supabase Storage, public bucket `report-assets` (PDF header/
  footer JPGs uploaded from Admin)
- **Auth**: none yet (open link). Admin screen uses a soft passcode gate only
  (`VITE_ADMIN_PASSCODE`) — not real security, since anon key + passcode both
  ship in the client bundle. Fine for a small trusted internal team; upgrade
  to Supabase Auth + RLS scoped to `auth.uid()` before wider exposure.
  **Rep login with per-rep survey history/edit access was explicitly deferred**
  — worth its own design pass (account provisioning model, RLS rework) when
  ready to tackle it.
- **PDF generation**: jsPDF, client-side (now async — fetches header/footer
  images first), opened via blob URL in a new tab, plus an explicit named
  download (`<store name> <date>.pdf`) triggered alongside it since browser
  PDF viewers don't reliably honor a PDF's internal title metadata for
  "Save As".

## Data model (as of migration_004)
- `case_types` — per-case W/ft only now. `savings_percent` was removed —
  savings now come from the door type chosen once per survey, not the case.
- `plant_types` — unchanged (Simplex/Multiplex/Waterloop + COP). (DX was
  removed by the user via Admin at some point.)
- `door_types` — name, `energy_saving_percent`, and 4ft/5ft/7ft cost. Chosen
  once per store survey (like plant type) and applied to every case in it.
  Replaces the old flat "door" cost_rate.
- `categories` — admin-managed (add/delete), purely a per-line-item field on
  `store_items` — **does not** filter/gate the case type dropdown (tried
  that, reverted it — case type list always shows everything).
- `app_settings` — singleton row: default electricity rate, annual
  electricity price increase % (feeds the escalating payback calc), legal
  disclaimer text, header/footer image URLs (public `report-assets` bucket).
- `cost_rates` — one row per cost type (reclad, canopy_led, undershelf_led —
  door moved to `door_types`), each with `cost_4ft`/`cost_5ft`/`cost_7ft`.
  Resolution rule: exact 4/5/7ft match uses that fixed price; any other
  length uses `(length ÷ 4) × cost_4ft`. Same rule now used for door cost.
- `store_visits` — one per store survey: store name, sales rep, date
  (auto-filled), plant type + door type (both selected once per survey),
  electricity rate.
- `store_items` — repeatable line items per survey: category, case type,
  length (ft), reclad/canopy LED/undershelf LED flags, free-text notes.

## Report / ROI logic
Per line item: energy savings via `calculateSavings()` — case type's W/ft
baseline, reduced by the survey's chosen **door type's** `energy_saving_percent`
(not the case type — that field was removed). Upgrade cost = door cost +
(reclad/canopy LED/undershelf LED costs if checked), each resolved via the
4/5/7ft rule. Report totals annual kWh saved, annual R saved, total upgrade
investment, and payback via `calculatePaybackYears()` — simulates year by
year with savings escalating at `annual_price_increase_percent`/yr (0% =
same as flat `investment ÷ annual saving`), capped at 50 years.

PDF layout: 7-column table (Category, Case type, Length, Options, kWh
saved/yr, R saved/yr, Cost) sized to fit A4 with margin to spare; row height
is computed from wrapped content so multi-line Options/notes never overlap
the next row. Notes render as an italic line under their row. Header/footer
JPGs (if uploaded in Admin) are drawn on every page, sized to fit within a
max height while preserving aspect ratio; page-break logic reserves space
for the footer.

## Known gaps / follow-ups
- Most case types and all of the newer categories (Cake, Grab & Go, Soft
  drinks, Wine) have no real case-type data yet — needs the business's
  actual W/ft numbers.
- Only one door type exists as a rough test entry pattern (was created and
  deleted during verification) — needs the business's real door products,
  costs, and saving percentages entered in Admin.
- `annual_price_increase_percent` defaults to 0 (flat payback, no
  escalation) — set a real assumption in Admin if desired.
- No header/footer images uploaded yet.
- Legal disclaimer text is empty — needs real wording from the business.
- Store-visit flow is single-session (no persistence of "in progress"
  surveys across a page reload/different device) — reasonable for now since
  a rep does one store in one sitting, but worth knowing if that changes.
- Rep login/history — deferred, see Auth note above.

## Repo
- Local: C:\Users\cdwso\Documents\fridge-energy-savings
- GitHub: github.com/Colcab-door-roi/Door-ROI
- Live: https://colcab-roi.pages.dev
