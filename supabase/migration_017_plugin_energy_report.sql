-- Run after migration_016.
-- A wholly separate report type from the Door ROI survey: a clean energy
-- consumption spec sheet for a proposed set of plug-in freezer products,
-- used to win a sale on efficiency credentials rather than to justify
-- replacing an existing remote system. No remote freezer, no investment
-- cost, no payback - just daily/monthly/annual kWh and Rand running cost
-- for whatever plug-in products the rep proposes.

create table if not exists energy_reports (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  sales_rep_id uuid not null references sales_reps(id),
  visit_date date not null,
  electricity_rate numeric not null,
  created_at timestamptz not null default now()
);

alter table energy_reports enable row level security;
create policy "Public read access" on energy_reports for select using (true);
create policy "Public write access" on energy_reports for all using (true) with check (true);

create table if not exists energy_report_items (
  id uuid primary key default gen_random_uuid(),
  energy_report_id uuid not null references energy_reports(id) on delete cascade,
  category_id uuid not null references categories(id),
  plugin_freezer_type_id uuid not null references plugin_freezer_types(id),
  qty integer not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table energy_report_items enable row level security;
create policy "Public read access" on energy_report_items for select using (true);
create policy "Public write access" on energy_report_items for all using (true) with check (true);
