-- Run after migration_013.
-- Adds a third item mode alongside Case/Line-up and GDF: comparing an
-- existing remote (plumbed-in) freezer run against a proposed plug-in
-- freezer replacement.
--
-- Both freezer catalogs are fixed-size products (not per-metre rates like
-- case types) — plug-in units come in standard lengths (e.g. 1.8m end,
-- 2.1m/2.5m spine), and so do the remote runs they replace (e.g. 7ft end
-- ≈1.9m, 8ft spine ≈2.44m, 12ft spine ≈3.66m). "Spine" units merchandise
-- from two sides; the narrow plug-in units need two placed back-to-back to
-- match that depth, so spine remote units need double the plug-in count an
-- end unit of the same length would.

create table if not exists remote_freezer_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shape text not null check (shape in ('end', 'spine')),
  length_m numeric not null,
  refrigeration_watts_per_m numeric not null,
  direct_energy_watts_per_m numeric not null,
  created_at timestamptz not null default now()
);

alter table remote_freezer_types enable row level security;
create policy "Public read access" on remote_freezer_types for select using (true);
create policy "Public write access" on remote_freezer_types for all using (true) with check (true);

create table if not exists plugin_freezer_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shape text not null check (shape in ('end', 'spine')),
  length_m numeric not null,
  kwh_per_day numeric not null,
  cost_per_unit numeric not null,
  created_at timestamptz not null default now()
);

alter table plugin_freezer_types enable row level security;
create policy "Public read access" on plugin_freezer_types for select using (true);
create policy "Public write access" on plugin_freezer_types for all using (true) with check (true);

-- Freezers use a different COP to the rest of the cases on the same plant.
-- Seed from the existing COP so nothing divides by zero until admin sets a
-- real value.
alter table plant_types add column if not exists freezer_cop numeric not null default 0;
update plant_types set freezer_cop = cop where freezer_cop = 0;

alter table store_items add column if not exists is_plugin_freezer boolean not null default false;
alter table store_items add column if not exists remote_freezer_type_id uuid references remote_freezer_types(id);
alter table store_items add column if not exists remote_qty integer;
alter table store_items add column if not exists plugin_freezer_type_id uuid references plugin_freezer_types(id);
