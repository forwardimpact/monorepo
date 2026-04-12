-- GetDX Initiatives
-- Stores initiative data from the GetDX Initiatives API.

create table if not exists activity.getdx_initiatives (
  id text primary key,
  name text not null,
  description text,
  scorecard_id text,
  owner_email text references activity.organization_people(email) on delete set null,
  due_date date,
  priority text,
  passed_checks integer,
  total_checks integer,
  completion_pct numeric,
  tags jsonb,
  completed_at timestamptz,
  raw jsonb,
  inserted_at timestamptz not null default now()
);

create index if not exists idx_getdx_initiatives_owner
  on activity.getdx_initiatives(owner_email);
create index if not exists idx_getdx_initiatives_completed_at
  on activity.getdx_initiatives(completed_at);
create index if not exists idx_getdx_initiatives_scorecard
  on activity.getdx_initiatives(scorecard_id);
