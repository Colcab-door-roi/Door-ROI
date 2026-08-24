-- Run after migration_005.
-- Anti-condensation heaters on heated glass draw power directly (not
-- through the refrigeration compressor/COP), offsetting some of the
-- savings from fitting doors. 0 = unheated door, no effect on the
-- calculation.
alter table door_types add column if not exists heater_watts_per_ft numeric not null default 0;
