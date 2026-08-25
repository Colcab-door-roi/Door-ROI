-- Run after migration_010.
-- Vertical LEDs: per-line-item option like reclad/canopy/undershelf, but
-- priced with a single flat 4ft rate always applied proportionally
-- (qty_ft / 4 * cost), not the exact-match 4/5/7ft segmented model.

alter table app_settings add column if not exists vertical_led_cost_4ft numeric not null default 0;
alter table store_items add column if not exists vertical_led boolean not null default false;
