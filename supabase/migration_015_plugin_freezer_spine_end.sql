-- Run after migration_014.
-- Reworks the Plug-in Freezer item to capture a whole lineup in one entry:
-- most real lineups have a Spine (double-depth) run in the middle with an
-- End unit capping each side, so one entry now records both halves
-- separately instead of forcing reps to split a lineup across two items.
--
-- No production data has used the single remote_freezer_type_id /
-- remote_qty / plugin_freezer_type_id columns from migration_014 yet, so
-- they're replaced outright rather than kept alongside the new ones.
alter table store_items drop column if exists remote_freezer_type_id;
alter table store_items drop column if exists remote_qty;
alter table store_items drop column if exists plugin_freezer_type_id;

alter table store_items add column if not exists spine_remote_freezer_type_id uuid references remote_freezer_types(id);
alter table store_items add column if not exists spine_remote_qty integer;
alter table store_items add column if not exists spine_plugin_freezer_type_id uuid references plugin_freezer_types(id);
alter table store_items add column if not exists end_remote_freezer_type_id uuid references remote_freezer_types(id);
alter table store_items add column if not exists end_remote_qty integer;
alter table store_items add column if not exists end_plugin_freezer_type_id uuid references plugin_freezer_types(id);

-- Global settings for the lineup-level costs that aren't per-product:
-- transport, the kit that joins two plug-in units back-to-back for a spine
-- swap, and the centre superstructure (framework) sold alongside the spine
-- run, priced per metre in the two standard spine module sizes.
create table if not exists plugin_freezer_settings (
  id boolean primary key default true,
  end_case_length_allowance_m numeric not null default 0.85,
  transport_cost_per_m numeric not null default 0,
  back_to_back_joint_kit_cost numeric not null default 0,
  centre_superstructure_2_1m_cost_per_m numeric not null default 0,
  centre_superstructure_2_5m_cost_per_m numeric not null default 0,
  constraint plugin_freezer_settings_singleton check (id)
);

insert into plugin_freezer_settings (id) values (true) on conflict (id) do nothing;

alter table plugin_freezer_settings enable row level security;
create policy "Public read access" on plugin_freezer_settings for select using (true);
create policy "Public write access" on plugin_freezer_settings for all using (true) with check (true);
