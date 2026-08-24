-- Run after migration_008.
-- GDF case types need their own baseline door/frame electrical load
-- (W per door, no Casem) — mirrors how ft-based case types carry
-- w_per_ft_without_doors. Casem's saving becomes a % reduction on that
-- baseline load, not a flat W/door figure.

alter table case_types add column if not exists gdf_watts_per_door numeric not null default 0;

alter table casem_settings add column if not exists savings_percent numeric not null default 0;
alter table casem_settings drop column if exists savings_watts_per_door;
