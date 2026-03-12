# Map ELT Pipeline

Replace Map's monolithic ingestion functions with a proper Extract, Load,
Transform (ELT) pattern so that raw external data is preserved before any
processing, enabling replay, auditing, and synthetic data injection.

## Why

Map's current ingestion pipeline conflates three distinct concerns into single
function calls:

1. **Extract + Transform in one step.** `processWebhook()` receives a GitHub
   webhook, stores the raw event, _and_ immediately extracts normalized
   artifacts — all in the same call. If extraction logic changes (new artifact
   types, new metadata fields), historical events cannot be reprocessed because
   the raw-to-artifact mapping is not repeatable from persisted state alone.

2. **Extract from remote API + Transform in one step.** `importSnapshots()`
   calls the GetDX REST API, fetches snapshot metadata, fetches team scores,
   resolves manager emails, and writes to three database tables — all in one
   function. There is no intermediate persisted state between "data arrived from
   GetDX" and "data is in the database tables." If the transform logic changes,
   the only option is to re-fetch from the live API.

3. **No common raw storage layer.** GitHub webhooks are stored as JSONB in
   `github_events.raw`, but GetDX responses are not persisted as raw documents
   at all — only transformed rows reach the database. There is no unified place
   to find "what data did we receive from external systems."

These problems block two workflows:

- **Synthetic data injection.** The synthetic data pipeline (spec 060) needs to
  produce data that enters the same processing path as real data. Without a
  clean boundary between "received data" and "processed data," synthetic data
  must either mimic the fully-transformed database rows (duplicating transform
  logic) or be loaded through special-purpose import functions (duplicating
  ingestion code paths). Neither option is maintainable.

- **Transform evolution.** When artifact extraction logic improves (e.g., adding
  `draft` status to PRs, or extracting issue references from commits), there is
  no way to reprocess historical raw data through the new transform without
  re-fetching from external systems — which may have changed or be unavailable.

The ELT pattern solves both by introducing a clear persistence boundary after
extraction, so that transforms always operate on locally-stored raw data
regardless of whether that data came from a live API, a webhook, or a synthetic
generator.

## What

Restructure Map's activity data pipeline into three explicit phases:

### Extract

Receive raw data from external systems and persist it unchanged.

| Source       | Trigger                         | Raw data format                                                   |
| ------------ | ------------------------------- | ----------------------------------------------------------------- |
| GitHub       | Webhook POST to edge function   | Individual webhook payload JSON documents                         |
| GetDX        | Scheduled edge function call    | `snapshots.list` and `snapshots.info` API response JSON documents |
| GetDX        | Scheduled edge function call    | `teams.list` API response JSON document                           |
| Organization | Manual upload via edge function | CSV or YAML people file                                           |

Each raw document is stored as an individual object in Supabase Storage with
metadata (source, timestamp, content type) attached. No parsing, no field
mapping, no joins — just persistence of exactly what was received.

### Load

The Extract step _is_ the Load step — raw documents land directly in Supabase
object storage. There is no separate load phase because the extract functions
write to storage as their final action. The term "Load" in ELT refers to this
raw persistence.

### Transform

Read raw documents from object storage and produce structured rows in the
activity database tables. Transforms are idempotent: running the same transform
on the same raw data always produces the same database state.

| Raw input                 | Transform                        | Output table(s)                      |
| ------------------------- | -------------------------------- | ------------------------------------ |
| GitHub webhook document   | Extract artifacts, resolve email | `github_events` + `github_artifacts` |
| `snapshots.list` response | Parse snapshot metadata          | `getdx_snapshots`                    |
| `snapshots.info` response | Parse team scores, resolve team  | `getdx_snapshot_team_scores`         |
| `teams.list` response     | Parse teams, resolve manager     | `getdx_teams`                        |
| Organization CSV/YAML     | Parse people records             | `organization_people`                |

Key property: **the Transform step is the same regardless of whether the raw
data came from a live external system or from the synthetic data pipeline.**
This is the core design goal.

### Raw storage convention

All raw documents live in Supabase Storage under a single bucket with a
path-based namespace:

```
raw/
  github/{delivery_id}.json           Individual webhook payloads
  getdx/snapshots-list/{timestamp}.json   snapshots.list API responses
  getdx/snapshots-info/{snapshot_id}.json snapshots.info API responses
  getdx/teams-list/{timestamp}.json       teams.list API responses
  people/{timestamp}.{csv,yaml}           Organization uploads
```

Each document is the exact response body from the external system (or the exact
request body for webhooks), stored as-is with no modification.

## Scope

### In scope

- Define raw storage bucket structure and naming conventions.
- Split `processWebhook()` into Extract (store raw) and Transform (extract
  artifacts) as separate functions.
- Split `importSnapshots()` and `importTeams()` into Extract (fetch + store raw
  API responses) and Transform (parse stored responses into DB rows).
- Make all transforms operate on stored raw documents, not live API responses.
- Preserve existing query functions and database schema unchanged.
- Preserve existing `github_events.raw` column (populated by the Transform step
  from the stored raw document, maintaining backward compatibility).

### Out of scope

- Changing the activity database schema (existing tables and columns remain).
- Changing query functions in `activity/queries/`.
- Building the Supabase infrastructure (see spec 052).
- Modifying the synthetic data pipeline (see spec 060 plan v3).
- Adding new data sources beyond GitHub, GetDX, and organization people.
