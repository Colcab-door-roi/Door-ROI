-- Run after migration_011.
-- Simple passcode-based rep login (matches the existing admin passcode
-- pattern, not real Supabase Auth — admin sets and can view each rep's
-- passcode directly, consistent with this app's existing soft-security
-- posture). Session tracked client-side (localStorage), same as admin.

create table if not exists sales_reps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text not null,
  passcode text not null,
  last_login timestamptz,
  created_at timestamptz not null default now()
);

alter table sales_reps enable row level security;
create policy "Public read access" on sales_reps for select using (true);
create policy "Public write access" on sales_reps for all using (true) with check (true);

-- Simple event log for the "what changed in admin since you last logged in"
-- digest — logs which section changed and when, not field-level before/
-- after values.
create table if not exists admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  created_at timestamptz not null default now()
);

alter table admin_activity_log enable row level security;
create policy "Public read access" on admin_activity_log for select using (true);
create policy "Public write access" on admin_activity_log for all using (true) with check (true);

-- Store visits now belong to a logged-in rep. Nullable + sales_rep_name
-- kept for backward compatibility with surveys captured before this
-- feature existed (no rep_id to attach them to).
alter table store_visits add column if not exists sales_rep_id uuid references sales_reps(id);
alter table store_visits alter column sales_rep_name drop not null;
