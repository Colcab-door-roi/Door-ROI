-- Run after migration_020.
-- Backs the admin "quotes this week" report: each time a rep generates a
-- Door ROI report, the store visit's quote value (excl. VAT) and the
-- generation time are stamped here. One row per store visit — regenerating
-- a quote just refreshes these two columns rather than adding a duplicate.
alter table store_visits add column if not exists quote_value numeric;
alter table store_visits add column if not exists quote_generated_at timestamptz;
