-- Run after migration_018.
-- Supports the Syspro-style quote layout on the Door ROI report: a Code
-- column on every cost-bearing admin item, sales rep contact details for
-- the closing signature block, and the customer-facing fields captured on
-- the New Store Survey form.

alter table sales_reps add column if not exists phone text;
alter table sales_reps add column if not exists email text;

alter table store_visits add column if not exists attention_name text;
alter table store_visits add column if not exists customer_tel text;
alter table store_visits add column if not exists customer_email text;
alter table store_visits add column if not exists store_location text;

alter table door_types add column if not exists code text;
alter table cost_rates add column if not exists code text;
alter table casem_settings add column if not exists code text;
alter table plugin_freezer_types add column if not exists code text;

alter table app_settings add column if not exists vertical_led_code text;
alter table app_settings add column if not exists subassembly_code text;
alter table app_settings add column if not exists outlying_code text;

-- Flat Rand amount knocked off a single quote line, entered per case/
-- line-up — matches the sample quote's "LINE DISCOUNT" column, which sits
-- before Amount (a per-line reduction, not a %).
alter table store_items add column if not exists discount_amount numeric not null default 0;
