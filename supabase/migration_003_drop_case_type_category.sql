-- Run after migration_002. Case type selection should never be filtered or
-- gated by category — the case type dropdown always lists everything.
-- Category stays purely a per-line-item field on store_items.
alter table case_types drop column if exists category_id;
