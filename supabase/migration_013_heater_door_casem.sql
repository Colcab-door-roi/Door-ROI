-- Run after migration_012.
-- Adds Casem support to the ft-based (non-GDF) heated-door flow, alongside
-- the existing GDF Casem support. Casem eligibility is store-wide (door
-- type is chosen once per survey), but the number of physical Casem units
-- needed is captured per case/line-up item, since one survey's items can
-- represent multiple distinct lineups.

alter table casem_settings add column if not exists heater_door_savings_percent numeric not null default 0;

alter table store_visits add column if not exists casem boolean not null default false;

alter table store_items add column if not exists casem_units integer;

-- Manual cleanup (not run automatically — do this in Admin > Door types
-- once you've confirmed no in-progress survey still references it):
-- the door type "Glacier Heater Door with Casem" is superseded by this
-- checkbox — any door type with a heater W/ft now shows the Casem
-- checkbox automatically, so that door type entry is redundant.
