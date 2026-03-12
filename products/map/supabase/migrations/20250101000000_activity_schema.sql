-- =============================================================================
-- Map Activity Schema
-- =============================================================================
-- Operational data for the Forward Impact data product.
-- This schema stores people, GetDX snapshots, GitHub activity, and evidence.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS activity;

GRANT USAGE ON SCHEMA activity TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA activity
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA activity
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Organization People
-- -----------------------------------------------------------------------------
-- Unified person model. Email is the cross-system join key (HR, GetDX, GitHub).
-- discipline, level, track carry the Pathway job profile.
-- -----------------------------------------------------------------------------

CREATE TABLE activity.organization_people (
  email                   TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  github_username         TEXT UNIQUE,
  discipline              TEXT NOT NULL,
  level                   TEXT NOT NULL,
  track                   TEXT,
  manager_email           TEXT REFERENCES activity.organization_people(email),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- GetDX Snapshots
-- -----------------------------------------------------------------------------
-- Quarterly survey cycle metadata from GetDX.
-- -----------------------------------------------------------------------------

CREATE TABLE activity.getdx_snapshots (
  snapshot_id             TEXT PRIMARY KEY,
  account_id              TEXT,
  scheduled_for           DATE,
  completed_at            TIMESTAMPTZ,
  completed_count         INT,
  total_count             INT,
  last_result_change_at   TIMESTAMPTZ,
  imported_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw                     JSONB NOT NULL
);

-- -----------------------------------------------------------------------------
-- GetDX Teams
-- -----------------------------------------------------------------------------
-- GetDX team hierarchy. manager_email bridges to organization_people.
-- -----------------------------------------------------------------------------

CREATE TABLE activity.getdx_teams (
  getdx_team_id           TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  parent_id               TEXT,
  manager_id              TEXT,
  reference_id            TEXT,
  manager_email           TEXT REFERENCES activity.organization_people(email),
  ancestors               JSONB,
  contributors            INT,
  last_changed_at         TIMESTAMPTZ,
  raw                     JSONB NOT NULL,
  imported_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- GetDX Snapshot Team Scores
-- -----------------------------------------------------------------------------
-- Aggregated factor/driver scores per team per snapshot.
-- item_id matches driver.id in framework YAML (shared ID namespace).
-- -----------------------------------------------------------------------------

CREATE TABLE activity.getdx_snapshot_team_scores (
  id                      BIGSERIAL PRIMARY KEY,
  snapshot_id             TEXT NOT NULL REFERENCES activity.getdx_snapshots(snapshot_id),
  getdx_team_id           TEXT,
  item_id                 TEXT NOT NULL,
  item_type               TEXT,
  item_name               TEXT,
  response_count          INT,
  contributor_count       INT,
  score                   NUMERIC,
  vs_prev                 NUMERIC,
  vs_org                  NUMERIC,
  vs_50th                 NUMERIC,
  vs_75th                 NUMERIC,
  vs_90th                 NUMERIC,
  snapshot_team           JSONB,
  raw                     JSONB NOT NULL,
  imported_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- GitHub Events
-- -----------------------------------------------------------------------------
-- Raw webhook events from GitHub.
-- -----------------------------------------------------------------------------

CREATE TABLE activity.github_events (
  delivery_id             TEXT PRIMARY KEY,
  event_type              TEXT NOT NULL,
  action                  TEXT,
  repository              TEXT NOT NULL,
  sender_github_username  TEXT,
  occurred_at             TIMESTAMPTZ,
  raw                     JSONB NOT NULL,
  imported_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- GitHub Artifacts
-- -----------------------------------------------------------------------------
-- Normalized artifacts extracted from GitHub events (PRs, reviews, commits).
-- email links to organization_people via github_username lookup.
-- -----------------------------------------------------------------------------

CREATE TABLE activity.github_artifacts (
  artifact_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type           TEXT NOT NULL,
  external_id             TEXT NOT NULL UNIQUE,
  repository              TEXT NOT NULL,
  github_username         TEXT,
  email                   TEXT REFERENCES activity.organization_people(email),
  occurred_at             TIMESTAMPTZ,
  metadata                JSONB NOT NULL,
  raw                     JSONB,
  imported_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Evidence
-- -----------------------------------------------------------------------------
-- Guide writes evidence rows after interpreting GitHub artifacts against
-- skill markers. Landmark reads them for presentation.
-- -----------------------------------------------------------------------------

CREATE TABLE activity.evidence (
  evidence_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id             UUID NOT NULL REFERENCES activity.github_artifacts(artifact_id),
  skill_id                TEXT NOT NULL,
  level_id                TEXT,
  marker_text             TEXT NOT NULL,
  matched                 BOOLEAN NOT NULL,
  rationale               TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant access on all tables created above
GRANT ALL ON ALL TABLES IN SCHEMA activity TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA activity TO anon, authenticated, service_role;
