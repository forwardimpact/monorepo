# Plan: Landmark GitHub App

Implement Landmark as a GitHub App and CLI that collects engineering activity
from GitHub Organizations, uses Guide to interpret artifacts against skill
markers, and produces two views: personal evidence for engineers and practice
patterns for teams.

**Prerequisite:** The Map data store plan must be implemented first. Map
provides the Supabase project, database schemas (framework + activity), Edge
Function hosting, Storage, and pg_cron. Landmark builds on top of that
infrastructure.

## What Landmark Owns

Landmark is thin. It owns:

1. **GitHub App registration** — webhook subscriptions and permissions
2. **Webhook Edge Function** — lives in Map's Supabase project at
   `products/map/supabase/functions/github-webhook/`
3. **Extraction logic** — deterministic mapping from raw events to structured
   artifacts, runs as a Map pg_cron job
4. **CLI** (`fit-landmark`) — queries Map's database for evidence and patterns
5. **Roster sync** — writes `landmark.yaml` entries to Map's `activity.roster`

Landmark does **not** own:

- A Supabase project
- Database tables or migrations
- RLS policies
- Storage buckets

All of that is Map's responsibility. See `specs/map-data-store/plan.md` for the
full schema, RLS policies, and infrastructure details.

## Architecture

```
GitHub Organization
  │
  │ webhook events
  ▼
Map Supabase Project
  │
  ├──→ Edge Function (github-webhook)
  │      │
  │      ├──→ Storage          /events/YYYY/MM/DD/{delivery_id}.json
  │      │    (raw payloads)
  │      │
  │      └──→ Postgres         activity.events (thin index)
  │
  ├──→ pg_cron (extraction)
  │      │
  │      └──→ Postgres         activity.artifacts (structured)
  │
  └──→ Guide (interpretation, on-demand or nightly)
         │
         └──→ Postgres         activity.evidence (cached results)
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
             personal evidence              practice patterns
            (engineer sees own)           (team-level, anonymous)
```

Three distinct phases, each running at its own cadence:

1. **Ingestion** — real-time. Edge Function receives webhook, writes raw payload
   to Storage, inserts index row into `activity.events`. Returns 200
   immediately.

2. **Extraction** — scheduled. A pg_cron job processes unextracted events, reads
   raw payloads from Storage, and writes structured artifacts to
   `activity.artifacts`. Runs every few minutes.

3. **Interpretation** — on-demand with caching. When an engineer queries their
   own evidence, Guide assesses their unscored artifacts against markers.
   Results are cached in `activity.evidence`. An optional nightly job pre-warms
   evidence for the full roster.

## Access Model

Landmark produces two views with different access rules. This is not a
configuration option — it is the architecture. Access is enforced by Map's RLS
policies on the activity schema.

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
  `fit-landmark practice system_design --manager carol`
- Shows proportions and trends, not lists of people
- "Most feature PRs include architecture sections" — not "Alice's PRs include
  architecture sections"
- Minimum team size for aggregate queries: 5 engineers. Below this threshold,
  patterns could identify individuals by elimination.

Access control is enforced at the database level by Map's RLS policies and the
`activity.practice_patterns` aggregate view. See `specs/map-data-store/plan.md`
for the full RLS and view definitions.

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

The webhook URL points to Map's Supabase Edge Function:
`https://{project-ref}.supabase.co/functions/v1/github-webhook`

### Edge Function: Webhook Handler

Lives at `products/map/supabase/functions/github-webhook/`. The function does
three things sequentially:

1. Validate the webhook signature (`X-Hub-Signature-256`)
2. Write the raw JSON payload to Storage
3. Insert a thin index row into `activity.events`

```
POST /functions/v1/github-webhook

  1. Verify HMAC-SHA256 signature against app secret
  2. Store raw payload:
     Storage path: /events/{YYYY}/{MM}/{DD}/{delivery_id}.json
     Content-Type: application/json
  3. Insert index row:
     INSERT INTO activity.events
       (delivery_id, event_type, action, repo, sender, org, created_at, storage_path)
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

## Phase 2: Extraction

A scheduled pg_cron job in Map reads unextracted events, fetches their raw
payloads from Storage, and writes structured artifacts to `activity.artifacts`.

### Extraction Job

Runs every 5 minutes:

```
1. SELECT delivery_id, event_type, action, storage_path
   FROM activity.events
   WHERE NOT extracted
   ORDER BY created_at
   LIMIT 500

2. For each event:
   a. Fetch raw payload from Storage
   b. Extract artifact fields based on event_type
   c. Upsert into activity.artifacts
   d. Mark event as extracted

3. UPDATE activity.events SET extracted = true
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

The `external_id` on `activity.artifacts` ensures idempotency — multiple events
for the same PR (opened, synchronize, edited) upsert the same artifact row with
updated metadata rather than creating duplicates.

### Extraction Logic Location

The extraction code lives in the Landmark package at
`products/landmark/src/extraction.js`. It is a pure function library — given a
raw event payload and event type, it returns the artifact fields. The pg_cron
job calls this logic via a Postgres function or a scheduled Edge Function that
imports it.

### Roster

Loaded from `landmark.yaml` via CLI. Maps GitHub usernames to Pathway job
profiles. Written to Map's `activity.roster` table, which has foreign key
references to `public.disciplines`, `public.levels`, and `public.tracks`.

### Survey Tables

Survey definitions and aggregate results, loaded from YAML files.

```sql
CREATE TABLE surveys (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  scale_min     INT NOT NULL DEFAULT 1,
  scale_max     INT NOT NULL DEFAULT 5,
  scale_labels  JSONB,                -- { "1": "Strongly Disagree", ... }
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE survey_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id     TEXT NOT NULL REFERENCES surveys(id),
  manager       TEXT NOT NULL REFERENCES organization(github),
  respondents   INT NOT NULL,
  ratings       JSONB NOT NULL,       -- { "driver_id": { "mean": 4.1, "distribution": [0,1,1,3,3] } }
  UNIQUE (survey_id, manager)
);

CREATE INDEX idx_survey_results_survey ON survey_results (survey_id);
CREATE INDEX idx_survey_results_manager ON survey_results (manager);
```

Survey results are aggregate Likert scores per manager (team) per driver.
Individual responses stay anonymous — only team-level aggregation is stored. The
`manager` field references the organization table, identifying the team as the
manager's direct reports.

The `ratings` JSONB contains keys matching driver IDs from Map, each with a
`mean` and `distribution` array (count of responses at each scale point).

The `team` field groups engineers for practice pattern queries. Teams are the
organizational unit — "platform", "payments", "mobile". Teams with fewer than 5
members are excluded from aggregate queries to prevent identification by
elimination.

## Phase 3: Interpretation

Guide runs on-demand. When an engineer queries their own evidence via the CLI,
the system checks which artifacts have been interpreted and which haven't.
Uninterpreted artifacts are sent to Guide with the relevant markers. Results are
cached in `activity.evidence`.

### Personal Evidence Flow

```
fit-landmark evidence --skill system_design
  │
  1. Resolve current user → @alice (from git config)
  2. Look up @alice in activity.roster → se, L3, platform
  3. Derive skill expectations from Pathway → system_design at working level
  4. Load markers for system_design.working.human (from framework schema)
  5. SELECT FROM activity.artifacts WHERE person = 'alice'
     AND artifact_type IN ('pr', 'review', 'comment')
     AND NOT EXISTS (cached evidence for this artifact + marker set)
  6. For each uninterpreted artifact:
     → Send to Guide: artifact metadata + markers + skill context
     ← Receive: which markers this artifact relates to, with rationale
  7. INSERT INTO activity.evidence (artifact, marker, rationale)
  8. Return evidence for @alice + system_design, grouped by artifact
```

Steps 1–5 are cheap Postgres queries via PostgREST. Step 6 is the LLM call — it
only runs for artifacts that haven't been interpreted yet. Subsequent queries
for the same skill hit the cache.

The output groups by artifact, not by marker. The engineer sees their work
first, then how it relates to the framework — not a checklist of markers with
pass/fail status.

### Practice Pattern Flow

```
fit-landmark practice system_design --manager carol
  │
  1. Query activity.practice_patterns view for team + skill
  2. The view enforces:
     - Team size >= 5 (HAVING clause)
     - No individual names or artifact IDs
     - Aggregate counts only
  3. Format proportions and trends for display
  4. When evidence is weak, ask a process question
```

The query never returns individual names, artifact IDs, or PR links. It returns
statements about the team as a system: "most feature PRs include architecture
sections" or "few PRs document multiple approaches considered."

When evidence is weak for a marker, the output asks a process question — not
"who isn't doing this?" but "does the engineering process support this
practice?" When survey data is available, the output correlates perception
(survey ratings) with observable evidence (Landmark artifacts) through the
driver's contributing skills.

### Nightly Batch

An optional pg_cron job in Map triggers Guide to run interpretation for the full
roster. Same logic as the personal evidence flow but iterates over all roster
entries:

```
For each person in activity.roster:
  For each skill in their job profile:
    Run the evidence flow (skips already-cached interpretation)
```

This pre-warms the cache so that morning queries are instant. It also ensures
practice pattern views have fresh data. The job can be scheduled for off-peak
hours (e.g., 3 AM) and rate-limited to control LLM costs.

The nightly batch produces evidence rows visible only to the individual
engineer. It does not generate reports, send notifications, or surface results
to anyone else.

## Event Replay

Raw events in Storage are the source of truth. The `activity.artifacts` table is
a materialized view that can be rebuilt when extraction heuristics change.

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
   FROM activity.events
   WHERE created_at >= :since
     AND (:event_type IS NULL OR event_type = :event_type)
   ORDER BY created_at
   ```

2. Fetch each raw payload from Storage

3. Run the current extraction logic over it — same code path as the scheduled
   extraction job

4. Upsert into `activity.artifacts` (`external_id` ensures idempotency —
   existing rows are updated, not duplicated)

5. Invalidate downstream evidence for affected artifacts:
   ```sql
   DELETE FROM activity.evidence
   WHERE artifact_id IN (
     SELECT id FROM activity.artifacts WHERE external_id = ANY(:affected_ids)
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

All tables live in Map's Supabase project. Landmark reads and writes via
PostgREST using Map's URL and appropriate credentials.

```
activity.events (index)    1:1     Storage (raw payloads)
  │
  │ extraction (pg_cron)
  ▼
activity.artifacts         N:1     activity.roster (people → jobs, teams)
  │                                  │
  │                                  └── references public.disciplines,
  │                                      public.levels, public.tracks
  │ interpretation (Guide)
  ▼
activity.evidence
  │                        references public.skills (markers)
  │
  ├──→ personal evidence     (engineer sees own, RLS-enforced)
  └──→ practice patterns     (team aggregate + survey context, anonymous, min 5)
```

| Table              | Growth rate    | Retention         | Rebuildable from  |
| ------------------ | -------------- | ----------------- | ----------------- |
| activity.events    | ~30k rows/day  | Permanent         | —                 |
| Storage            | ~1GB/day       | Permanent         | —                 |
| activity.artifacts | ~5k rows/day   | Permanent         | events + Storage  |
| activity.evidence  | On-demand      | Until invalidated | artifacts + Guide |
| activity.roster    | Manual updates | Current           | landmark.yaml     |

Table definitions, indexes, RLS policies, and views are in
`specs/map-data-store/plan.md` under **Activity Tables** and **Row Level
Security**.

## Landmark Package Structure

```
products/landmark/
  bin/
    fit-landmark.js          CLI entry point
  src/
    extraction.js            Event → artifact field mapping (pure functions)
    evidence.js              Personal evidence query + Guide dispatch
    practice.js              Practice pattern query + formatting
    roster.js                Roster sync (YAML → activity.roster)
    replay.js                Event replay logic
    client.js                Supabase client wrapper (Map's project)
  package.json               Depends on @supabase/supabase-js, @forwardimpact/map
```

No `supabase/` directory. No migrations. No Edge Functions (those live in Map).

## Implementation Order

Assumes Map data store phases 1–4 are complete (Supabase project, framework
schema, import/export, activity schema with Edge Function and extraction job).

1. GitHub App registration (webhook URL → Map's Edge Function, permissions,
   events)
2. Extraction logic (`products/landmark/src/extraction.js`) — pure functions
   that the Map pg_cron job calls
3. Roster sync CLI (`fit-landmark roster sync`) — validates against Map's
   framework tables
4. Personal evidence flow (`fit-landmark evidence`) — queries activity schema,
   dispatches to Guide for uninterpreted artifacts
5. Practice pattern CLI (`fit-landmark practice`) — queries
   `activity.practice_patterns` view
6. Marker display CLI (`fit-landmark marker`) — queries framework schema
7. Replay CLI (`fit-landmark replay`) — re-extracts from raw events
8. Nightly batch configuration (pg_cron in Map, triggers Guide)
