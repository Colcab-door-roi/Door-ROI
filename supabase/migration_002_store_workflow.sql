-- Run this in the Supabase SQL editor after schema.sql + seed.sql.
-- Adds: categories, per-store visits with repeatable line items, admin-editable
-- settings (default electricity rate, reclad/LED costs, legal disclaimer),
-- and links case_types to a category.

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table case_types add column if not exists category_id uuid references categories(id);

create table if not exists app_settings (
  id boolean primary key default true,
  default_electricity_rate numeric not null default 2.5,
  legal_disclaimer text not null default '',
  constraint app_settings_singleton check (id)
);

insert into app_settings (id) values (true) on conflict (id) do nothing;

-- Door/reclad/canopy LED/undershelf LED costs: ~90% of jobs are priced in 4ft,
-- 5ft, or 7ft segments with a fixed cost per segment size. A case length that
-- exactly matches 4/5/7ft uses that fixed cost; any other length is priced
-- proportionally off the 4ft rate: (length / 4) * cost_4ft.
create table if not exists cost_rates (
  cost_type text primary key,
  label text not null,
  cost_4ft numeric not null default 0,
  cost_5ft numeric not null default 0,
  cost_7ft numeric not null default 0
);

insert into cost_rates (cost_type, label, cost_4ft, cost_5ft, cost_7ft) values
  ('door', 'Door', 0, 0, 0),
  ('reclad', 'Reclad', 0, 0, 0),
  ('canopy_led', 'Canopy LED', 0, 0, 0),
  ('undershelf_led', 'Undershelf LED', 0, 0, 0)
on conflict (cost_type) do nothing;

create table if not exists store_visits (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  sales_rep_name text not null,
  visit_date date not null default current_date,
  plant_type_id uuid not null references plant_types(id),
  electricity_rate numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists store_items (
  id uuid primary key default gen_random_uuid(),
  store_visit_id uuid not null references store_visits(id) on delete cascade,
  category_id uuid not null references categories(id),
  case_type_id uuid not null references case_types(id),
  qty_ft numeric not null,
  reclad boolean not null default false,
  canopy_led boolean not null default false,
  undershelf_led boolean not null default false,
  created_at timestamptz not null default now()
);

alter table categories enable row level security;
alter table app_settings enable row level security;
alter table cost_rates enable row level security;
alter table store_visits enable row level security;
alter table store_items enable row level security;

create policy "Public read access" on categories for select using (true);
create policy "Public read access" on app_settings for select using (true);
create policy "Public read access" on cost_rates for select using (true);
create policy "Public read access" on store_visits for select using (true);
create policy "Public read access" on store_items for select using (true);

create policy "Public write access" on categories for all using (true) with check (true);
create policy "Public write access" on app_settings for all using (true) with check (true);
create policy "Public write access" on cost_rates for all using (true) with check (true);
create policy "Public write access" on store_visits for all using (true) with check (true);
create policy "Public write access" on store_items for all using (true) with check (true);

-- Starter categories from the requested list
insert into categories (name) values
  ('Dairy'),
  ('Perishables'),
  ('Cake'),
  ('Grab & Go'),
  ('Butchery'),
  ('Soft drinks'),
  ('Wine')
on conflict (name) do nothing;
