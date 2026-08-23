# Fridge Energy Savings Calculator — Project Notes

## Purpose
Web app (PWA, mobile-friendly) for sales reps to capture a full retail store
visit — every fridge case, its category, and any reclad/LED upgrades — and
generate a PDF ROI report on the spot.

## Stack decisions
- **Frontend**: React + Vite (fast, works great as a PWA, deploys cleanly to
  Cloudflare Pages)
- **Hosting/deploy**: Cloudflare Pages (project `colcab-roi`), connected to
  GitHub repo for auto-deploy on push to `main`
- **Database**: Supabase Postgres (project `xmtwzyoaikfthcuxczpq`)
- **Auth**: none yet (open link). Admin screen uses a soft passcode gate only
  (`VITE_ADMIN_PASSCODE`) — not real security, since anon key + passcode both
  ship in the client bundle. Fine for a small trusted internal team; upgrade
  to Supabase Auth + RLS scoped to `auth.uid()` before wider exposure.
- **PDF generation**: jsPDF, client-side, opened via blob URL in a new tab.

## Data model (as of migration_002)
- `case_types` — per-case W/ft, % savings with doors, now also linked to a
  `category_id`. **Only "Dairy Std" has a category assigned so far** (set
  during testing) — the other 10 seeded case types still need categorizing
  via Admin, and the newer categories (Cake, Grab & Go, Soft drinks, Wine)
  have no case types at all yet — those need real W/ft + savings% data from
  the business before reps can use them.
- `plant_types` — unchanged (Simplex/Multiplex/Waterloop/DX + COP).
- `categories` — admin-managed (add/delete): Dairy, Perishables, Cake,
  Grab & Go, Butchery, Soft drinks, Wine.
- `app_settings` — singleton row: default electricity rate (R/kWh, prefills
  the store-visit form, overridable per visit) + legal disclaimer text shown
  on PDF reports.
- `cost_rates` — one row per cost type (door, reclad, canopy_led,
  undershelf_led), each with a `cost_4ft`/`cost_5ft`/`cost_7ft`. **All default
  to 0 — need real pricing entered in Admin before ROI numbers are
  meaningful.** Resolution rule: exact 4/5/7ft match uses that fixed price;
  any other length uses `(length ÷ 4) × cost_4ft`.
- `store_visits` — one per store audit: store name, sales rep, date
  (auto-filled), plant type (selected once per visit), electricity rate.
- `store_items` — repeatable line items per visit: category, case type,
  length (ft), reclad/canopy LED/undershelf LED flags.

## Report / ROI logic
Per line item: energy savings via the existing `calculateSavings` (same
formula verified against the original spreadsheet). Upgrade cost = door cost
+ (reclad cost if checked) + (canopy LED cost if checked) + (undershelf LED
cost if checked), each resolved via the 4/5/7ft rule above. Report totals
annual kWh saved, annual R saved, total upgrade investment, and a simple
payback-in-years figure.

## Known gaps / follow-ups
- Most case types and all of the new categories (Cake, Grab & Go, Soft
  drinks, Wine) have no real data yet — needs the business's actual numbers.
- Cost rates (door/reclad/canopy LED/undershelf LED) are all 0 — needs real
  pricing.
- Legal disclaimer text is empty — needs real wording from the business.
- Store-visit flow is single-session (no persistence of "in progress" visits
  across a page reload/different device) — reasonable for now since a rep
  does one store in one sitting, but worth knowing if that changes.

## Repo
- Local: C:\Users\cdwso\Documents\fridge-energy-savings
- GitHub: github.com/Colcab-door-roi/Door-ROI
- Live: https://colcab-roi.pages.dev
