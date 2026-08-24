-- Run after migration_004.
-- Reverses the earlier "door type's saving % applies to every case"
-- decision — a flat percentage per survey doesn't reflect that different
-- case types actually save different amounts from doors. Savings % moves
-- back to case_types (per case type, as in the original spreadsheet); door
-- types keep only their 4ft/5ft/7ft cost.

alter table case_types add column if not exists savings_percent numeric not null default 0;
alter table door_types drop column if exists energy_saving_percent;
