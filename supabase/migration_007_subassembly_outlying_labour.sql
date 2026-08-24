-- Run after migration_006.
-- Two store-wide (not per-line-item) costs, both priced per 4ft section and
-- applied to the survey's TOTAL footage across all cases (total_ft / 4 * cost):
--   - Subassembly, transport and labour: always applies.
--   - Outlying labour: only applies when the survey is flagged "outlying".

alter table app_settings add column if not exists subassembly_transport_labour_cost_4ft numeric not null default 0;
alter table app_settings add column if not exists outlying_labour_cost_4ft numeric not null default 0;

alter table store_visits add column if not exists outlying boolean not null default false;
