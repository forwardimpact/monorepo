# Plan: Map ELT Pipeline

How to implement the ELT pattern described in `spec.md`.

## Directory Structure

The existing `activity/ingestion/` directory is restructured into `extract/` and
`transform/` subdirectories. The `queries/` directory is unchanged.

```
products/map/
  activity/
    migrations/
      001_activity_schema.sql       # Existing — unchanged
    extract/
      github.js                     # Store raw webhook payload to storage
      getdx.js                      # Fetch + store raw GetDX API responses
      people.js                     # Store raw CSV/YAML upload to storage
    transform/
      github.js                     # Raw webhook → github_events + github_artifacts
      getdx.js                      # Raw API responses → getdx_* tables
      people.js                     # Raw CSV/YAML → organization_people
      index.js                      # Orchestrator: run all transforms
    queries/                        # Existing — unchanged
      org.js
      snapshots.js
      evidence.js
      artifacts.js
    storage.js                      # Raw storage helpers (bucket, paths, list)
  ingestion/                        # Deleted (replaced by extract/ + transform/)
```

## Raw Storage Layer

### Bucket and paths

A single Supabase Storage bucket `raw` holds all extracted documents:

```
raw/
  github/{delivery_id}.json
  getdx/snapshots-list/{iso-timestamp}.json
  getdx/snapshots-info/{snapshot_id}.json
  getdx/teams-list/{iso-timestamp}.json
  people/{iso-timestamp}.{csv,yaml}
```

### Storage helper module

```javascript
// products/map/activity/storage.js

/**
 * Raw document storage for the ELT pipeline.
 * Wraps Supabase Storage operations for the `raw` bucket.
 */

const BUCKET = 'raw'

/**
 * Store a raw document in Supabase Storage.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} path - Storage path within the raw bucket
 * @param {string|Buffer} content - Document content
 * @param {string} [contentType='application/json']
 * @returns {Promise<{stored: boolean, path: string, error?: string}>}
 */
export async function storeRaw(supabase, path, content, contentType = 'application/json') {
  const body = typeof content === 'string' ? content : content
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType, upsert: true })

  if (error) return { stored: false, path, error: error.message }
  return { stored: true, path }
}

/**
 * Read a raw document from Supabase Storage.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} path - Storage path within the raw bucket
 * @returns {Promise<string>}
 */
export async function readRaw(supabase, path) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(path)

  if (error) throw new Error(`readRaw(${path}): ${error.message}`)
  return await data.text()
}

/**
 * List raw documents under a prefix.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} prefix - Path prefix (e.g., 'github/', 'getdx/snapshots-info/')
 * @returns {Promise<Array<{name: string, created_at: string}>>}
 */
export async function listRaw(supabase, prefix) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(prefix, { sortBy: { column: 'created_at', order: 'desc' } })

  if (error) throw new Error(`listRaw(${prefix}): ${error.message}`)
  return data
}
```

## Extract Phase

### GitHub Extract

Receives the webhook payload and stores it as-is. No field extraction, no
artifact normalization, no email resolution.

```javascript
// products/map/activity/extract/github.js

import { storeRaw } from '../storage.js'

/**
 * Extract: store a raw GitHub webhook payload.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 * @param {string} params.deliveryId - X-GitHub-Delivery header
 * @param {string} params.eventType - X-GitHub-Event header
 * @param {object} params.payload - Raw webhook body
 * @returns {Promise<{stored: boolean, path: string, error?: string}>}
 */
export async function extractGitHubWebhook(supabase, { deliveryId, eventType, payload }) {
  const path = `github/${deliveryId}.json`
  const document = JSON.stringify({
    delivery_id: deliveryId,
    event_type: eventType,
    received_at: new Date().toISOString(),
    payload
  })
  return storeRaw(supabase, path, document)
}
```

### GetDX Extract

Fetches from the GetDX REST API and stores the raw JSON responses. Each API call
produces one stored document.

```javascript
// products/map/activity/extract/getdx.js

import { storeRaw } from '../storage.js'

/**
 * Extract: fetch and store raw GetDX API responses.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} config
 * @param {string} config.apiToken - GetDX API token
 * @param {string} config.baseUrl - GetDX API base URL
 * @returns {Promise<{files: Array<string>, errors: Array<string>}>}
 */
export async function extractGetDX(supabase, config) {
  const files = []
  const errors = []
  const timestamp = new Date().toISOString()

  // teams.list
  try {
    const teamsResponse = await fetchGetDX('/teams.list', config)
    const path = `getdx/teams-list/${timestamp}.json`
    const result = await storeRaw(supabase, path, JSON.stringify(teamsResponse))
    if (result.stored) files.push(path)
    else errors.push(result.error)
  } catch (err) {
    errors.push(`teams.list: ${err.message}`)
  }

  // snapshots.list
  try {
    const snapshotsResponse = await fetchGetDX('/snapshots.list', config)
    const snapshotsPath = `getdx/snapshots-list/${timestamp}.json`
    const snapshotsResult = await storeRaw(supabase, snapshotsPath, JSON.stringify(snapshotsResponse))
    if (snapshotsResult.stored) files.push(snapshotsPath)
    else errors.push(snapshotsResult.error)

    // snapshots.info for each snapshot
    const snapshots = snapshotsResponse.snapshots || []
    for (const snapshot of snapshots) {
      if (snapshot.deleted_at) continue
      try {
        const infoResponse = await fetchGetDX(
          `/snapshots.info?snapshot_id=${encodeURIComponent(snapshot.id)}`,
          config
        )
        const infoPath = `getdx/snapshots-info/${snapshot.id}.json`
        const infoResult = await storeRaw(supabase, infoPath, JSON.stringify(infoResponse))
        if (infoResult.stored) files.push(infoPath)
        else errors.push(infoResult.error)
      } catch (err) {
        errors.push(`snapshots.info(${snapshot.id}): ${err.message}`)
      }
    }
  } catch (err) {
    errors.push(`snapshots.list: ${err.message}`)
  }

  return { files, errors }
}

/**
 * Fetch JSON from the GetDX API.
 * @param {string} endpoint
 * @param {object} config
 * @returns {Promise<object>}
 */
async function fetchGetDX(endpoint, config) {
  const url = new URL(endpoint, config.baseUrl)
  const response = await fetch(url.href, {
    headers: { Authorization: `Bearer ${config.apiToken}` }
  })
  if (!response.ok) {
    throw new Error(`GetDX API ${endpoint}: ${response.status} ${response.statusText}`)
  }
  return response.json()
}
```

### People Extract

Stores the uploaded CSV or YAML file as-is.

```javascript
// products/map/activity/extract/people.js

import { storeRaw } from '../storage.js'

/**
 * Extract: store a raw people file upload.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} content - File content (CSV or YAML)
 * @param {string} format - 'csv' or 'yaml'
 * @returns {Promise<{stored: boolean, path: string, error?: string}>}
 */
export async function extractPeopleFile(supabase, content, format) {
  const timestamp = new Date().toISOString()
  const ext = format === 'csv' ? 'csv' : 'yaml'
  const contentType = format === 'csv' ? 'text/csv' : 'application/x-yaml'
  const path = `people/${timestamp}.${ext}`
  return storeRaw(supabase, path, content, contentType)
}
```

## Transform Phase

Transforms read raw documents from Supabase Storage and write structured rows to
database tables. Every transform is idempotent — running it twice on the same
raw data produces the same DB state (via upsert).

### GitHub Transform

Reads a stored webhook document, inserts into `github_events`, extracts
artifacts, resolves emails, and inserts into `github_artifacts`. This is the
same logic as the current `processWebhook()` but operating on stored data.

```javascript
// products/map/activity/transform/github.js

import { readRaw, listRaw } from '../storage.js'

/**
 * Transform a single stored GitHub webhook into DB rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} path - Storage path to the raw webhook document
 * @returns {Promise<{event: boolean, artifacts: number, errors: Array<string>}>}
 */
export async function transformGitHubWebhook(supabase, path) {
  const raw = JSON.parse(await readRaw(supabase, path))
  const { delivery_id, event_type, payload } = raw

  // Insert into github_events
  const { error: eventError } = await supabase.from('github_events').upsert({
    delivery_id,
    event_type,
    action: payload.action || null,
    repository: payload.repository?.full_name || 'unknown',
    sender_github_username: payload.sender?.login || null,
    occurred_at: payload.created_at || raw.received_at,
    raw: payload
  }, { onConflict: 'delivery_id' })

  // Extract and store artifacts (same logic as current extractArtifacts)
  const artifacts = extractArtifacts(event_type, payload)
  let artifactCount = 0
  const errors = eventError ? [eventError.message] : []

  for (const artifact of artifacts) {
    const email = await resolveEmail(supabase, artifact.github_username)
    const { error } = await supabase.from('github_artifacts').upsert({
      artifact_type: artifact.artifact_type,
      external_id: artifact.external_id,
      repository: artifact.repository,
      github_username: artifact.github_username,
      email,
      occurred_at: artifact.occurred_at,
      metadata: artifact.metadata,
      raw: artifact.raw
    }, { onConflict: 'external_id' })

    if (error) errors.push(`${artifact.external_id}: ${error.message}`)
    else artifactCount++
  }

  return { event: !eventError, artifacts: artifactCount, errors }
}

/**
 * Transform all unprocessed GitHub webhooks.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{events: number, artifacts: number, errors: Array<string>}>}
 */
export async function transformAllGitHub(supabase) {
  const files = await listRaw(supabase, 'github/')
  let totalEvents = 0
  let totalArtifacts = 0
  const allErrors = []

  for (const file of files) {
    const result = await transformGitHubWebhook(supabase, `github/${file.name}`)
    if (result.event) totalEvents++
    totalArtifacts += result.artifacts
    allErrors.push(...result.errors)
  }

  return { events: totalEvents, artifacts: totalArtifacts, errors: allErrors }
}

// ── Artifact extraction (unchanged from current github.js) ──

function extractArtifacts(eventType, payload) {
  switch (eventType) {
    case 'pull_request': return extractPullRequestArtifacts(payload)
    case 'pull_request_review': return extractReviewArtifacts(payload)
    case 'push': return extractCommitArtifacts(payload)
    default: return []
  }
}

function extractPullRequestArtifacts(payload) {
  const pr = payload.pull_request
  if (!pr) return []
  return [{
    artifact_type: 'pull_request',
    external_id: `pr:${payload.repository.full_name}#${pr.number}`,
    repository: payload.repository.full_name,
    github_username: pr.user?.login || null,
    occurred_at: pr.created_at || pr.updated_at,
    metadata: {
      number: pr.number, title: pr.title, state: pr.state,
      additions: pr.additions, deletions: pr.deletions,
      changed_files: pr.changed_files, merged: pr.merged || false,
      base_branch: pr.base?.ref, head_branch: pr.head?.ref
    },
    raw: pr
  }]
}

function extractReviewArtifacts(payload) {
  const review = payload.review
  if (!review) return []
  return [{
    artifact_type: 'review',
    external_id: `review:${payload.repository.full_name}#${payload.pull_request?.number}:${review.id}`,
    repository: payload.repository.full_name,
    github_username: review.user?.login || null,
    occurred_at: review.submitted_at,
    metadata: {
      pr_number: payload.pull_request?.number,
      state: review.state,
      body_length: review.body?.length || 0
    },
    raw: review
  }]
}

function extractCommitArtifacts(payload) {
  const commits = payload.commits || []
  return commits.map(commit => ({
    artifact_type: 'commit',
    external_id: `commit:${payload.repository.full_name}:${commit.id}`,
    repository: payload.repository.full_name,
    github_username: payload.sender?.login || null,
    occurred_at: commit.timestamp,
    metadata: {
      sha: commit.id, message: commit.message,
      added: commit.added?.length || 0,
      removed: commit.removed?.length || 0,
      modified: commit.modified?.length || 0
    },
    raw: commit
  }))
}

async function resolveEmail(supabase, githubUsername) {
  if (!githubUsername) return null
  const { data } = await supabase
    .from('organization_people')
    .select('email')
    .eq('github_username', githubUsername)
    .single()
  return data?.email || null
}
```

### GetDX Transform

Reads stored API response documents and populates the three GetDX tables.

```javascript
// products/map/activity/transform/getdx.js

import { readRaw, listRaw } from '../storage.js'

/**
 * Transform stored GetDX API responses into DB rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{teams: number, snapshots: number, scores: number, errors: Array<string>}>}
 */
export async function transformAllGetDX(supabase) {
  const errors = []
  let teamCount = 0
  let snapshotCount = 0
  let scoreCount = 0

  // Transform teams from the most recent teams-list document
  const teamsFiles = await listRaw(supabase, 'getdx/teams-list/')
  if (teamsFiles.length > 0) {
    const latestTeams = `getdx/teams-list/${teamsFiles[0].name}`
    const teamsResult = await transformTeams(supabase, latestTeams)
    teamCount = teamsResult.imported
    errors.push(...teamsResult.errors)
  }

  // Transform snapshots from the most recent snapshots-list document
  const snapshotsFiles = await listRaw(supabase, 'getdx/snapshots-list/')
  if (snapshotsFiles.length > 0) {
    const latestSnapshots = `getdx/snapshots-list/${snapshotsFiles[0].name}`
    const snapshotsResult = await transformSnapshots(supabase, latestSnapshots)
    snapshotCount = snapshotsResult.snapshots
    errors.push(...snapshotsResult.errors)
  }

  // Transform team scores from all snapshots-info documents
  const infoFiles = await listRaw(supabase, 'getdx/snapshots-info/')
  for (const file of infoFiles) {
    const scoresResult = await transformSnapshotScores(
      supabase, `getdx/snapshots-info/${file.name}`
    )
    scoreCount += scoresResult.scores
    errors.push(...scoresResult.errors)
  }

  return { teams: teamCount, snapshots: snapshotCount, scores: scoreCount, errors }
}

async function transformTeams(supabase, path) {
  const raw = JSON.parse(await readRaw(supabase, path))
  const teams = raw.teams || []

  // Build name → email lookup from org people
  const { data: people } = await supabase
    .from('organization_people')
    .select('email, name')
  const emailByName = new Map(people?.map(p => [p.name, p.email]) || [])

  const rows = teams.map(team => ({
    getdx_team_id: team.id,
    name: team.name,
    parent_id: team.parent_id || null,
    manager_id: team.manager_id || null,
    reference_id: team.reference_id || null,
    manager_email: team.manager_name ? emailByName.get(team.manager_name) || null : null,
    ancestors: team.ancestors || null,
    contributors: team.contributors ?? null,
    last_changed_at: team.last_changed_at || null,
    raw: team
  }))

  const { error } = await supabase
    .from('getdx_teams')
    .upsert(rows, { onConflict: 'getdx_team_id' })

  if (error) return { imported: 0, errors: [error.message] }
  return { imported: rows.length, errors: [] }
}

async function transformSnapshots(supabase, path) {
  const raw = JSON.parse(await readRaw(supabase, path))
  const snapshots = (raw.snapshots || []).filter(s => !s.deleted_at)
  const errors = []
  let count = 0

  for (const snapshot of snapshots) {
    const { error } = await supabase.from('getdx_snapshots').upsert({
      snapshot_id: snapshot.id,
      account_id: snapshot.account_id || null,
      scheduled_for: snapshot.scheduled_for || null,
      completed_at: snapshot.completed_at || null,
      completed_count: snapshot.completed_count ?? null,
      total_count: snapshot.total_count ?? null,
      last_result_change_at: snapshot.last_result_change_at || null,
      raw: snapshot
    }, { onConflict: 'snapshot_id' })

    if (error) errors.push(`Snapshot ${snapshot.id}: ${error.message}`)
    else count++
  }

  return { snapshots: count, errors }
}

async function transformSnapshotScores(supabase, path) {
  const raw = JSON.parse(await readRaw(supabase, path))
  const teamScores = raw.snapshot?.team_scores || []
  const errors = []

  // Derive snapshot_id from the path (filename is {snapshot_id}.json)
  const snapshotId = path.split('/').pop().replace('.json', '')

  const scoreRows = teamScores.map(entry => ({
    snapshot_id: snapshotId,
    getdx_team_id: entry.snapshot_team?.team_id || null,
    item_id: entry.item_id,
    item_type: entry.item_type || null,
    item_name: entry.item_name || null,
    response_count: entry.response_count ?? null,
    contributor_count: entry.contributor_count ?? null,
    score: entry.score ?? null,
    vs_prev: entry.vs_prev ?? null,
    vs_org: entry.vs_org ?? null,
    vs_50th: entry.vs_50th ?? null,
    vs_75th: entry.vs_75th ?? null,
    vs_90th: entry.vs_90th ?? null,
    snapshot_team: entry.snapshot_team || null,
    raw: entry
  }))

  if (scoreRows.length > 0) {
    const { error } = await supabase
      .from('getdx_snapshot_team_scores')
      .insert(scoreRows)

    if (error) {
      errors.push(`Scores for ${snapshotId}: ${error.message}`)
      return { scores: 0, errors }
    }
  }

  return { scores: scoreRows.length, errors }
}
```

### People Transform

```javascript
// products/map/activity/transform/people.js

import { readRaw, listRaw } from '../storage.js'

/**
 * Transform the most recent stored people file into DB rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{imported: number, errors: Array<string>}>}
 */
export async function transformPeople(supabase) {
  const files = await listRaw(supabase, 'people/')
  if (files.length === 0) return { imported: 0, errors: [] }

  const latest = `people/${files[0].name}`
  const content = await readRaw(supabase, latest)
  const format = latest.endsWith('.csv') ? 'csv' : 'yaml'
  const people = parsePeopleFile(content, format)

  return importPeople(supabase, people)
}

function parsePeopleFile(content, format) {
  if (format === 'csv') return parseCsv(content)
  return parseYaml(content)
}

// parseCsv, parseYaml, importPeople — same logic as current people.js
```

### Transform Orchestrator

```javascript
// products/map/activity/transform/index.js

import { transformAllGitHub } from './github.js'
import { transformAllGetDX } from './getdx.js'
import { transformPeople } from './people.js'

/**
 * Run all transforms in dependency order.
 * People must be imported before GitHub and GetDX (for email/manager resolution).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<object>}
 */
export async function transformAll(supabase) {
  const people = await transformPeople(supabase)
  const getdx = await transformAllGetDX(supabase)
  const github = await transformAllGitHub(supabase)

  return { people, getdx, github }
}
```

## Synthetic Data Integration Point

The key benefit of ELT is that the synthetic data pipeline (spec 060) can inject
data at the **Load** boundary — writing raw documents into Supabase Storage in
exactly the same format as the Extract step produces. The Transform step then
processes synthetic raw data identically to real data.

### Synthetic → Raw storage mapping

| Synthetic generator output | Raw storage path                          |
| -------------------------- | ----------------------------------------- |
| GitHub webhook payload     | `raw/github/{delivery_id}.json`           |
| `snapshots.list` response  | `raw/getdx/snapshots-list/{ts}.json`      |
| `snapshots.info` response  | `raw/getdx/snapshots-info/{snap_id}.json` |
| `teams.list` response      | `raw/getdx/teams-list/{ts}.json`          |
| Organization people file   | `raw/people/{ts}.yaml`                    |

The synthetic pipeline generates documents with the exact structure that the
Extract step produces for each source:

- **GitHub**: Individual webhook JSON documents with `delivery_id`,
  `event_type`, `received_at`, and `payload` fields. The `payload` matches the
  GitHub webhook schema for the event type (`push`, `pull_request`,
  `pull_request_review`).
- **GetDX snapshots.list**: A JSON document matching the GetDX API response:
  `{ "ok": true, "snapshots": [...] }`.
- **GetDX snapshots.info**: A JSON document matching the GetDX API response:
  `{ "ok": true, "snapshot": { "team_scores": [...] } }`.
- **GetDX teams.list**: A JSON document matching the GetDX API response:
  `{ "ok": true, "teams": [...] }`.

After loading, `transformAll()` processes them into the activity database
tables.

## Migration Path

### Phase 1 — Add raw storage layer

1. Create `activity/storage.js` with `storeRaw`, `readRaw`, `listRaw`.
2. Create the `raw` bucket in Supabase Storage (see spec 052).

### Phase 2 — Add Extract functions

1. Create `activity/extract/github.js` — wraps webhook payload in metadata and
   calls `storeRaw`.
2. Create `activity/extract/getdx.js` — fetches API and calls `storeRaw` for
   each response.
3. Create `activity/extract/people.js` — stores uploaded file via `storeRaw`.

### Phase 3 — Add Transform functions

1. Create `activity/transform/github.js` — reads from storage, produces
   `github_events` and `github_artifacts` rows. Artifact extraction and email
   resolution logic moves here from the current `ingestion/github.js`.
2. Create `activity/transform/getdx.js` — reads from storage, produces
   `getdx_snapshots`, `getdx_teams`, `getdx_snapshot_team_scores` rows. Parsing
   and manager email resolution logic moves here from the current
   `ingestion/getdx.js`.
3. Create `activity/transform/people.js` — reads from storage, produces
   `organization_people` rows.
4. Create `activity/transform/index.js` — orchestrates all transforms in
   dependency order.

### Phase 4 — Wire up edge functions

1. Update the GitHub webhook edge function to call `extractGitHubWebhook()` then
   `transformGitHubWebhook()` (or just extract, with transform on a schedule).
2. Update the GetDX sync edge function to call `extractGetDX()` then
   `transformAllGetDX()`.
3. Update the people upload edge function to call `extractPeopleFile()` then
   `transformPeople()`.

### Phase 5 — Delete old ingestion code

1. Delete `activity/ingestion/` directory.
2. Update all imports that referenced `ingestion/` modules.
3. Verify query functions still work (they only read from the same DB tables).

## Raw Document Schemas

### GitHub webhook document

Stored at `raw/github/{delivery_id}.json`:

```json
{
  "delivery_id": "abc123-def456",
  "event_type": "pull_request",
  "received_at": "2025-06-15T14:30:00.000Z",
  "payload": {
    "action": "opened",
    "number": 42,
    "pull_request": {
      "number": 42,
      "title": "Add cell viability scoring endpoint",
      "state": "open",
      "user": { "login": "athena-bio" },
      "created_at": "2025-06-15T14:30:00.000Z",
      "updated_at": "2025-06-15T14:30:00.000Z",
      "additions": 145,
      "deletions": 23,
      "changed_files": 4,
      "merged": false,
      "base": { "ref": "main" },
      "head": { "ref": "feature/cell-viability" }
    },
    "repository": { "full_name": "bionova/oncology-pipelines" },
    "sender": { "login": "athena-bio" }
  }
}
```

### GetDX `snapshots.list` response document

Stored at `raw/getdx/snapshots-list/{timestamp}.json`. Mirrors the exact API
response from `GET https://api.getdx.com/snapshots.list`:

```json
{
  "ok": true,
  "snapshots": [
    {
      "id": "MjUyNbaY",
      "account_id": "ABCD",
      "last_result_change_at": "2024-07-18T15:47:12.080Z",
      "scheduled_for": "2024-06-16",
      "completed_at": "2024-07-01T14:01:51.027Z",
      "completed_count": 3077,
      "deleted_at": null,
      "total_count": 3686
    }
  ]
}
```

### GetDX `snapshots.info` response document

Stored at `raw/getdx/snapshots-info/{snapshot_id}.json`. Mirrors the exact API
response from `GET https://api.getdx.com/snapshots.info?snapshot_id=...`:

```json
{
  "ok": true,
  "snapshot": {
    "team_scores": [
      {
        "snapshot_team": {
          "id": "NTIzMTM",
          "name": "Integrations",
          "team_id": "NTA1ODg",
          "parent": false,
          "parent_id": "NTIxNDc",
          "ancestors": ["LTE", "NTIzMTM", "NTIxNDc", "NTIwODI", "NTIwNzE"]
        },
        "item_id": "MTQ2",
        "item_type": "factor",
        "item_name": "Ease of release",
        "response_count": 1,
        "score": 0,
        "contributor_count": 5,
        "vs_prev": 0,
        "vs_org": -68,
        "vs_50th": -54,
        "vs_75th": -68,
        "vs_90th": -83
      }
    ]
  }
}
```

### GetDX `teams.list` response document

Stored at `raw/getdx/teams-list/{timestamp}.json`. Mirrors the exact API
response from `GET https://api.getdx.com/teams.list`:

```json
{
  "ok": true,
  "teams": [
    {
      "ancestors": ["LTE", "MTUxODcx", "NTA2MTg", "NTA2MTk", "NTA4Nzc"],
      "id": "NTA4Nzc",
      "parent_id": "NTA2MTk",
      "manager_id": "NTEyMDUw",
      "name": "Core Data",
      "parent": true,
      "last_changed_at": "2024-03-19T22:36:47.448Z",
      "contributors": 0,
      "reference_id": "06BEC4E0-5A61-354E-08A6-C39D756058AB"
    }
  ]
}
```

Note: the `teams.list` API response does not include a `manager_name` field. The
current ingestion code in `getdx.js` uses `manager_name` for the email lookup,
but this field must come from a separate API call or org data join. The
Transform step resolves `manager_email` via the organization people table, not
from the raw API response.
