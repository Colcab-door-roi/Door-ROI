-- Run after migration_015.
-- A spine run is joined either with back-to-back joint kits or with a full
-- centre superstructure - never both. The joint kit cost also needs to
-- split by spine module size (2.1m/2.5m), same as the superstructure
-- already does, but stays a flat cost per kit rather than a per-metre
-- rate, since a kit is a discrete connector, not a linear item.
alter table plugin_freezer_settings drop column if exists back_to_back_joint_kit_cost;
alter table plugin_freezer_settings add column if not exists back_to_back_joint_kit_cost_2_1m numeric not null default 0;
alter table plugin_freezer_settings add column if not exists back_to_back_joint_kit_cost_2_5m numeric not null default 0;

alter table store_items add column if not exists spine_connection_method text check (spine_connection_method in ('joint_kit', 'superstructure'));
