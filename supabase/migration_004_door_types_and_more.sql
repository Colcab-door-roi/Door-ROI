-- Run after migration_003.
-- 1) Annual electricity price increase % (used for an escalating payback calc)
-- 2) Header/footer JPG storage for PDF reports
-- 3) Door types (name, 4/5/7ft cost, energy saving %) — replaces the flat
--    "door" cost_rate and the per-case-type savings_percent. Door type is
--    chosen once per store survey, same as plant type.
-- 4) Free-text notes per line item/case

alter table app_settings add column if not exists annual_price_increase_percent numeric not null default 0;
alter table app_settings add column if not exists header_image_url text;
alter table app_settings add column if not exists footer_image_url text;

create table if not exists door_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cost_4ft numeric not null default 0,
  cost_5ft numeric not null default 0,
  cost_7ft numeric not null default 0,
  energy_saving_percent numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table door_types enable row level security;
create policy "Public read access" on door_types for select using (true);
create policy "Public write access" on door_types for all using (true) with check (true);

-- The flat "door" cost_rate is superseded by per-door-type pricing above.
delete from cost_rates where cost_type = 'door';

-- case_types.savings_percent is superseded by the chosen door type's
-- energy_saving_percent (selected once per store survey).
alter table case_types drop column if exists savings_percent;

alter table store_visits add column if not exists door_type_id uuid references door_types(id);
alter table store_items add column if not exists notes text;

-- Public storage bucket for header/footer JPGs used on PDF reports.
insert into storage.buckets (id, name, public)
values ('report-assets', 'report-assets', true)
on conflict (id) do nothing;

create policy "Public read report-assets"
  on storage.objects for select
  using (bucket_id = 'report-assets');

create policy "Public write report-assets"
  on storage.objects for insert
  with check (bucket_id = 'report-assets');

create policy "Public update report-assets"
  on storage.objects for update
  using (bucket_id = 'report-assets');
