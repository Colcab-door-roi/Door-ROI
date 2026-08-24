-- Run after migration_007.

-- 1) VAT rate for the report summary (ex VAT total, VAT amount, incl VAT total).
alter table app_settings add column if not exists vat_percent numeric not null default 15;

-- 2) Per-line-item toggle: reclad/LEDs can be done without fitting doors at
-- all, so door savings and door cost only apply when this is checked.
alter table store_items add column if not exists doors boolean not null default true;

-- 3) GDF (Glass Door Freezer) support — sized in number of doors, not feet.
-- Casem (RH-adaptive door heater controller) only affects direct heater
-- consumption, not the W/ft refrigeration model, so this is a parallel
-- calculation path, not an extension of the existing one. A GDF lineup can
-- combine multiple physical units (e.g. 4dr + 4dr + 3dr + 3dr = 14 doors
-- across 4 units) — each physical unit gets its own Casem module, so cost
-- scales with unit count while savings scale with door count; these are
-- captured as two separate numbers since they can differ.
alter table case_types add column if not exists is_gdf boolean not null default false;
alter table store_items alter column qty_ft drop not null;
alter table store_items add column if not exists qty_doors numeric;
alter table store_items add column if not exists qty_gdf_units numeric;
alter table store_items add column if not exists casem boolean not null default false;

create table if not exists casem_settings (
  id boolean primary key default true,
  cost_per_unit numeric not null default 0,
  savings_watts_per_door numeric not null default 0,
  constraint casem_settings_singleton check (id)
);
insert into casem_settings (id) values (true) on conflict (id) do nothing;

alter table casem_settings enable row level security;
create policy "Public read access" on casem_settings for select using (true);
create policy "Public write access" on casem_settings for all using (true) with check (true);
