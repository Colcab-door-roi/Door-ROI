-- Run after migration_017.
-- Marks an energy_report_items row as an auto-added end pair (from the
-- "Add matching end cases" checkbox on a spine product) rather than a
-- product the rep picked directly. Only affects how that row's physical
-- length is calculated: the end allowance (plugin_freezer_settings.
-- end_case_length_allowance_m), not the end product's own catalog length —
-- same convention already used by the Door ROI Plug-in Freezer flow.
alter table energy_report_items add column if not exists is_auto_end boolean not null default false;
