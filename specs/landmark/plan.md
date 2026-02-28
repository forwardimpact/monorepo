# Plan: Landmark GitHub App

Implement Landmark as a Supabase-backed GitHub App that collects engineering
activity from GitHub Organizations, uses Guide to interpret artifacts against
skill markers, and produces two views: personal evidence for engineers and
practice patterns for teams.

## Architecture

```
GitHub Organization
  │
  │ webhook events
  ▼
Edge Function (ingestion)
  │
  ├──→ Supabase Storage    /events/YYYY/MM/DD/{delivery_id}.json
  │    (raw payloads)
  │
  └──→ Postgres            events (thin index)
       (structured data)
                           ┌──────────────────────┐
                           │  pg_cron (scheduled)  │
                           │  extracts artifacts   │
                           │  from raw events      │
                           └──────────┬───────────┘
                                      ▼
                                  artifacts
                                      │
                      ┌───────────────┤ on-demand or nightly
                      ▼               ▼
                   Guide           evidence
               (interpretation)  (cached results)
                                      │
                      ┌───────────────┴───────────────┐
                      ▼                               ▼
               personal evidence              practice patterns
              (engineer sees own)           (team-level, anonymous)
```

Three distinct phases, each running at its own cadence:

1. **Ingestion** — real-time. Edge Function receives webhook, writes raw payload
   to Storage, inserts index row into Postgres. Returns 200 immediately.

2. **Extraction** — scheduled. A pg_cron job processes unextracted events, reads
   raw payloads from Storage, and writes structured artifacts to Postgres. Runs
   every few minutes.

3. **Interpretation** — on-demand with caching. When an engineer queries their
   own evidence, Guide assesses their unscored artifacts against markers.
   Results are cached in the evidence table. An optional nightly job pre-warms
   evidence for the full roster.

## Access Model

Landmark produces two views with different access rules. This is not a
configuration option — it is the architecture.

### Personal Evidence

An engineer sees their own artifacts and Guide's interpretation of them. Nobody
else sees this view unless the engineer shares it.

- Queried by the engineer themselves via CLI
- Scoped to their GitHub username — the CLI resolves this from git config or
  explicit `--user` flag
- No manager access, no admin override, no "view as" capability
- The engineer can export their evidence to share in career conversations — this
  is a deliberate act, not a default

### Practice Patterns

Engineering leadership sees aggregate patterns across a team, capability, or
organization. No individuals named.

- Queried by team or capability:
  `fit-landmark practice system_design --team platform`
- Shows proportions and trends, not lists of people
- "Most feature PRs include architecture sections" — not "Alice's PRs include
  architecture sections"
- Minimum team size for aggregate queries: 5 engineers. Below this threshold,
  patterns could identify individuals by elimination.

### Supabase Row-Level Security

RLS policies enforce the access model at the database level. Even if someone
writes a custom query, the database enforces visibility.

```sql
-- Engineers can only see their own evidence
CREATE POLICY evidence_self_only ON evidence
  FOR SELECT
  USING (
    artifact_id IN (
      SELECT id FROM artifacts WHERE person = current_setting('app.github_user')
    )
  );

-- Practice pattern views use aggregate functions only
-- No policy needed — the view definition enforces anonymity
CREATE VIEW practice_patterns AS
  SELECT
    skill_id,
    level,
    marker_index,
    marker_text,
    team,
    count(*) FILTER (WHERE matched) AS matched_count,
    count(*) AS total_count
  FROM evidence
  JOIN artifacts ON evidence.artifact_id = artifacts.id
  JOIN roster ON artifacts.person = roster.github
  GROUP BY skill_id, level, marker_index, marker_text, team
  HAVING count(DISTINCT artifacts.person) >= 5;
```

The `HAVING` clause enforces the minimum team size. The view never exposes
individual artifact IDs, person names, or specific PRs.

## Phase 1: Ingestion

### GitHub App Setup

Register a GitHub App with these webhook event subscriptions:

| Event                         | Why                                  |
| ----------------------------- | ------------------------------------ |
| `pull_request`                | PR opened, closed, merged, edited    |
| `pull_request_review`         | Reviews submitted                    |
| `pull_request_review_comment` | Inline review comments               |
| `issue_comment`               | PR-level conversation (issues + PRs) |
| `push`                        | Commit activity on default branches  |

The app requires **read-only** permissions:

| Permission    | Access |
| ------------- | ------ |
| Pull requests | Read   |
| Contents      | Read   |
| Metadata      | Read   |
| Members       | Read   |

No write permissions. Landmark never modifies repositories. It does not post
comments, set status checks, or create annotations. It collects and stays
silent.

### Edge Function: Webhook Handler

The Edge Function does three things sequentially:

1. Validate the webhook signature (`X-Hub-Signature-256`)
2. Write the raw JSON payload to Storage
3. Insert a thin index row into Postgres

```
POST /functions/v1/github-webhook

  1. Verify HMAC-SHA256 signature against app secret
  2. Store raw payload:
     Storage path: /events/{YYYY}/{MM}/{DD}/{delivery_id}.json
     Content-Type: application/json
  3. Insert index row:
     INSERT INTO events (delivery_id, event_type, action, repo, sender, org, created_at, storage_path)
  4. Return 200
```

The function does not parse event contents beyond the top-level fields needed
for the index row. All semantic extraction happens later.

### Storage Layout

Raw payloads partitioned by date for efficient replay targeting:

```
/events
  /2026
    /02
      /27
        /a1b2c3d4-e5f6.json    (20-50KB each)
        /f7g8h9i0-j1k2.json
      /28
        /...
    /03
      /...
```

Retention: indefinite. At ~1GB/day for a 1,000-developer organization, annual
storage cost is under $100. Raw events are the source of truth — all downstream
tables can be rebuilt from them.

### Events Table (Postgres Index)

```sql
CREATE TABLE events (
  delivery_id   UUID PRIMARY KEY,
  event_type    TEXT NOT NULL,     -- 'pull_request', 'pull_request_review', etc.
  action        TEXT,              -- 'opened', 'submitted', 'created', etc.
  repo          TEXT NOT NULL,     -- 'org/repo-name'
  sender        TEXT NOT NULL,     -- GitHub username
  org           TEXT NOT NULL,     -- GitHub organization
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  storage_path  TEXT NOT NULL,     -- '/events/2026/02/27/{delivery_id}.json'
  extracted     BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_events_extraction ON events (extracted, created_at)
  WHERE NOT extracted;
CREATE INDEX idx_events_sender ON events (sender, created_at);
CREATE INDEX idx_events_repo ON events (repo, created_at);
CREATE INDEX idx_events_type ON events (event_type, created_at);
```

Small rows (~200 bytes). At 30,000 events/day: ~2.2GB/year of index data.

## Phase 2: Extraction

A scheduled job reads unextracted events, fetches their raw payloads from
Storage, and writes structured artifacts to Postgres.

### Extraction Job

Runs via pg_cron or a Supabase scheduled Edge Function, every 5 minutes:

```
1. SELECT delivery_id, event_type, action, storage_path
   FROM events
   WHERE NOT extracted
   ORDER BY created_at
   LIMIT 500

2. For each event:
   a. Fetch raw payload from Storage
   b. Extract artifact fields based on event_type
   c. Upsert into artifacts table
   d. Mark event as extracted

3. UPDATE events SET extracted = true
   WHERE delivery_id IN (...)
```

### What Gets Extracted

Each event type produces a different artifact shape. The extraction logic is a
set of deterministic field mappings — no LLM, no heuristics beyond structural
parsing.

| Event type                    | Artifact type | Key fields extracted                                          |
| ----------------------------- | ------------- | ------------------------------------------------------------- |
| `pull_request.opened`         | `pr`          | title, body, author, files, additions, deletions, base branch |
| `pull_request.closed/merged`  | `pr` (update) | merged, merged_by, merge_commit, time-to-merge                |
| `pull_request_review`         | `review`      | reviewer, body, state (approved/changes_requested/commented)  |
| `pull_request_review_comment` | `comment`     | commenter, body, path, position, in_reply_to                  |
| `issue_comment` (on PR)       | `discussion`  | commenter, body, PR reference                                 |
| `push`                        | `push`        | pusher, commits (sha, message), ref, before/after             |

### Artifacts Table

```sql
CREATE TABLE artifacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person        TEXT NOT NULL,         -- GitHub username
  repo          TEXT NOT NULL,
  artifact_type TEXT NOT NULL,         -- 'pr', 'review', 'comment', 'discussion', 'push'
  external_id   TEXT NOT NULL,         -- 'pr:org/repo#342', 'review:org/repo#342/1'
  external_url  TEXT,                  -- GitHub permalink
  created_at    TIMESTAMPTZ NOT NULL,  -- event timestamp, not insertion time
  metadata      JSONB NOT NULL,        -- type-specific fields
  UNIQUE (external_id)
);

CREATE INDEX idx_artifacts_person ON artifacts (person, created_at);
CREATE INDEX idx_artifacts_repo ON artifacts (repo, created_at);
CREATE INDEX idx_artifacts_type ON artifacts (artifact_type, created_at);
```

The `external_id` ensures idempotency — multiple events for the same PR (opened,
synchronize, edited) upsert the same artifact row with updated metadata rather
than creating duplicates.

### Roster Table

Loaded from `landmark.yaml` via CLI or API. Maps GitHub usernames to Pathway job
profiles.

```sql
CREATE TABLE roster (
  github        TEXT PRIMARY KEY,
  discipline    TEXT NOT NULL,
  level         TEXT NOT NULL,
  track         TEXT,
  team          TEXT,                  -- team name for practice pattern grouping
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The `team` field groups engineers for practice pattern queries. Teams are the
organizational unit — "platform", "payments", "mobile". Aggregate views use this
field to scope patterns. Teams with fewer than 5 members are excluded from
aggregate queries to prevent identification by elimination.

```
$ fit-landmark roster sync landmark.yaml
  Synced 142 roster entries across 12 teams.
  3 new, 2 updated, 0 removed.
```

## Phase 3: Interpretation

Guide runs on-demand. When an engineer queries their own evidence, Landmark
checks which artifacts have been interpreted and which haven't. Uninterpreted
artifacts are sent to Guide with the relevant markers. Results are cached.

### Personal Evidence Flow

```
fit-landmark evidence --skill system_design
  │
  1. Resolve current user → @alice (from git config)
  2. Look up @alice in roster → se, L3, platform
  3. Derive skill expectations from Pathway → system_design at working level
  4. Load markers for system_design.working.human
  5. SELECT artifacts WHERE person = 'alice'
     AND artifact_type IN ('pr', 'review', 'comment')
     AND NOT EXISTS (cached evidence for this artifact + marker set)
  6. For each uninterpreted artifact:
     → Send to Guide: artifact metadata + markers + skill context
     ← Receive: which markers this artifact relates to, with rationale
  7. INSERT INTO evidence (artifact, marker, rationale)
  8. Return evidence for @alice + system_design, grouped by artifact
```

Steps 1–5 are cheap Postgres queries. Step 6 is the LLM call — it only runs for
artifacts that haven't been interpreted yet. Subsequent queries for the same
skill hit the cache.

The output groups by artifact, not by marker. The engineer sees their work
first, then how it relates to the framework — not a checklist of markers with
pass/fail status.

### Practice Pattern Flow

```
fit-landmark practice system_design --team platform
  │
  1. Look up all roster entries WHERE team = 'platform'
  2. Verify team size >= 5 (refuse if below threshold)
  3. Derive skill expectations for each person's job profile
  4. Aggregate evidence across all team members:
     - For each marker: what proportion of the team shows evidence?
     - Trend: is evidence for this marker increasing or decreasing?
  5. Return anonymous summary with proportions and trends
```

The query never returns individual names, artifact IDs, or PR links. It returns
statements about the team as a system: "most feature PRs include architecture
sections" or "few PRs document multiple approaches considered."

When evidence is weak for a marker, the output asks a process question — not
"who isn't doing this?" but "does the engineering process support this
practice?"

### Nightly Batch

An optional pg_cron job runs interpretation for the full roster. Same logic as
the personal evidence flow but iterates over all roster entries:

```
For each person in roster:
  For each skill in their job profile:
    Run the evidence flow (skips already-cached interpretation)
```

This pre-warms the cache so that morning queries are instant. It also ensures
practice pattern views have fresh data. The job can be scheduled for off-peak
hours (e.g., 3 AM) and rate-limited to control LLM costs.

The nightly batch produces evidence rows visible only to the individual
engineer. It does not generate reports, send notifications, or surface results
to anyone else.

### Evidence Table

```sql
CREATE TABLE evidence (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id   UUID NOT NULL REFERENCES artifacts(id),
  skill_id      TEXT NOT NULL,         -- 'system_design'
  level         TEXT NOT NULL,         -- 'working'
  marker_index  INT NOT NULL,          -- which marker in the array
  marker_text   TEXT NOT NULL,         -- the marker string (for audit)
  matched       BOOLEAN NOT NULL,      -- does this artifact relate to this marker?
  rationale     TEXT,                  -- Guide's reasoning (visible to the engineer)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, skill_id, level, marker_index)
);

CREATE INDEX idx_evidence_artifact ON evidence (artifact_id);
CREATE INDEX idx_evidence_skill ON evidence (skill_id, level);
```

The unique constraint ensures one interpretation per artifact per marker. When
markers change (new version of the framework), evidence rows for the old marker
text become stale — the nightly job or next on-demand query regenerates them.

Note: the `confidence` column from the earlier design was removed. A numeric
confidence score invites ranking and thresholding — exactly the kind of
quantification that turns evidence into scores. Guide's `rationale` text is
sufficient. The engineer reads the reasoning and decides for themselves.

## Event Replay

Raw events in Storage are the source of truth. The `artifacts` table is a
materialized view that can be rebuilt when extraction heuristics change.

### Why Replay

Extraction logic will evolve. Examples:

- A new artifact type is added (e.g., extracting linked design docs from PR
  bodies)
- The PR artifact starts capturing `requested_reviewers` to track review
  assignment patterns
- The comment extractor improves thread-grouping logic to better identify
  discussion resolution

When heuristics change, the existing artifacts table reflects the old logic.
Replay re-extracts from raw events using the new logic.

### Replay Process

```
fit-landmark replay [--since DATE] [--event-type TYPE] [--dry-run]
```

1. Query the events index for the target range:

   ```sql
   SELECT delivery_id, storage_path
   FROM events
   WHERE created_at >= :since
     AND (:event_type IS NULL OR event_type = :event_type)
   ORDER BY created_at
   ```

2. Fetch each raw payload from Storage

3. Run the current extraction logic over it — same code path as the scheduled
   extraction job

4. Upsert into artifacts (external_id ensures idempotency — existing rows are
   updated, not duplicated)

5. Invalidate downstream evidence for affected artifacts:
   ```sql
   DELETE FROM evidence
   WHERE artifact_id IN (
     SELECT id FROM artifacts WHERE external_id = ANY(:affected_ids)
   )
   ```

The next on-demand query or nightly batch regenerates evidence using Guide
against the updated artifacts.

### Replay at Scale

For a full replay of 1 year of events (~10M events, ~365GB of raw payloads):

- Storage reads are cheap — Supabase Storage is S3-compatible, bulk reads are
  pennies
- Extraction is CPU-bound but fast — deterministic field mapping, no LLM
- The bottleneck is Postgres write throughput for artifact upserts — batch in
  groups of 100–500, run over hours not minutes
- Evidence invalidation is a bulk DELETE — fast with the artifact_id index

Partial replays (last 30 days, specific event type) are the common case and
complete in minutes.

### Replay Safety

- Replay is idempotent. Running it twice with the same parameters produces the
  same artifacts.
- Replay does not touch the events index or raw Storage — those are immutable.
- Evidence is invalidated, not silently replaced. The absence of evidence is
  visible in queries until Guide re-interprets.
- `--dry-run` shows what would change without writing.

## Data Model Summary

```
events (index)           1:1     Storage (raw payloads)
  │
  │ extraction
  ▼
artifacts               N:1     roster (people → jobs, teams)
  │
  │ interpretation (Guide)
  ▼
evidence
  │
  ├──→ personal evidence     (engineer sees own, RLS-enforced)
  └──→ practice patterns     (team aggregate, anonymous, min 5 members)
```

| Table     | Growth rate    | Retention         | Rebuildable from  |
| --------- | -------------- | ----------------- | ----------------- |
| events    | ~30k rows/day  | Permanent         | —                 |
| Storage   | ~1GB/day       | Permanent         | —                 |
| artifacts | ~5k rows/day   | Permanent         | events + Storage  |
| evidence  | On-demand      | Until invalidated | artifacts + Guide |
| roster    | Manual updates | Current           | landmark.yaml     |

## Supabase Project Structure

```
supabase/
  functions/
    github-webhook/         Edge Function — ingestion endpoint
  migrations/
    001_events.sql          events table + indexes
    002_artifacts.sql       artifacts table + indexes
    003_roster.sql          roster table (with team column)
    004_evidence.sql        evidence table + indexes
    005_extraction_cron.sql pg_cron job for artifact extraction
    006_rls_policies.sql    row-level security for personal evidence
    007_practice_views.sql  aggregate views for practice patterns
```

## Implementation Order

1. Supabase project setup and database migrations
2. GitHub App registration (webhook URL, permissions, events)
3. Webhook Edge Function (signature validation, Storage write, index insert)
4. Extraction job (pg_cron, raw event → artifact mapping)
5. Roster sync CLI with team column (`fit-landmark roster sync`)
6. RLS policies for personal evidence isolation
7. Personal evidence flow (`fit-landmark evidence`)
8. Practice pattern aggregate views and CLI (`fit-landmark practice`)
9. Evidence caching and invalidation
10. Replay CLI (`fit-landmark replay`)
11. Nightly batch job
