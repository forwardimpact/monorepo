-- GetDX Snapshot Comments
-- Stores individual comments from GetDX snapshot responses.

create table if not exists activity.getdx_snapshot_comments (
  comment_id text primary key,
  snapshot_id text not null references activity.getdx_snapshots(snapshot_id) on delete cascade,
  email text references activity.organization_people(email) on delete set null,
  team_id text references activity.getdx_teams(getdx_team_id) on delete set null,
  text text not null,
  timestamp timestamptz not null,
  raw jsonb,
  inserted_at timestamptz not null default now()
);

create index if not exists idx_getdx_snapshot_comments_snapshot
  on activity.getdx_snapshot_comments(snapshot_id);
create index if not exists idx_getdx_snapshot_comments_email
  on activity.getdx_snapshot_comments(email);
create index if not exists idx_getdx_snapshot_comments_team
  on activity.getdx_snapshot_comments(team_id);
