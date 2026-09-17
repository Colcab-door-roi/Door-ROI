-- Run after migration_019.
-- The per-line quote discount is a percentage of that line's amount
-- (rep enters "5" for 5% off), not a flat Rand figure — rename the
-- column to match.
alter table store_items rename column discount_amount to discount_percent;
