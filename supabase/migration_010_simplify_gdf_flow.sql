-- Run after migration_009.
-- Simplifies GDF: no more per-case-type GDF variants cluttering the case
-- type list. GDF becomes its own top-level entry mode in the capture form
-- (toggle, not a case type selection) with ONE global baseline W/door set
-- in Admin (alongside Casem), used for every GDF line item.

alter table case_types drop column if exists is_gdf;
alter table case_types drop column if exists gdf_watts_per_door;

-- GDF line items have no case_type_id (nothing to pick), flagged via is_gdf.
alter table store_items alter column case_type_id drop not null;
alter table store_items add column if not exists is_gdf boolean not null default false;

-- Casem/GDF settings: baseline load moves here (global), plus an
-- installation cost added per Casem unit alongside its module cost.
alter table casem_settings add column if not exists baseline_watts_per_door numeric not null default 0;
alter table casem_settings add column if not exists installation_cost_per_unit numeric not null default 0;
