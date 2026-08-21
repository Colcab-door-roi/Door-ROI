-- Run this in the Supabase SQL editor to set up the schema, then run
-- seed.sql to load the real data imported from "Door ROI.xlsx".

create table if not exists case_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  w_per_ft_without_doors numeric not null, -- cooling load, W/ft, no doors fitted
  savings_percent numeric not null,        -- % reduction in load when doors are fitted
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists plant_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cop numeric not null, -- coefficient of performance of the refrigeration plant
  created_at timestamptz not null default now()
);

alter table case_types enable row level security;
alter table plant_types enable row level security;

create policy "Public read access" on case_types for select using (true);
create policy "Public read access" on plant_types for select using (true);

-- WRITE ACCESS: no real auth yet, so this is intentionally permissive —
-- anyone with the anon key (which ships in the client bundle, i.e. anyone)
-- can write. The Admin screen's passcode gate is a soft UI deterrent only,
-- not a real security boundary. Fine for a small trusted internal team;
-- upgrade to Supabase Auth + a policy scoped to auth.uid() before this is
-- exposed more broadly.
create policy "Public write access" on case_types for all using (true) with check (true);
create policy "Public write access" on plant_types for all using (true) with check (true);
