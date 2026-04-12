# Plan A · Part 05 — Initiatives pipeline + initiative commands

Parent plan: [plan-a.md](./plan-a.md). Spec: [spec.md](./spec.md). Depends on
[Part 03](./plan-a-03.md) being merged (extends `health.js` via the pre-placed
`<initiatives section>` anchors). Runs in parallel with Part 04, which edits the
disjoint `<comments section>` anchors.

This part adds the `activity.getdx_initiatives` table, extends Map's GetDX
extract/transform pipeline to populate it from the GetDX Initiatives API,
exports a new query module, ships `fit-landmark initiative list|show|impact`,
and extends Part 03's health view with an active-initiatives section per driver
(spec § Initiative tracking explicitly requires this — it is **not** polish).

Structurally similar to Part 04 but for the initiatives table. The impact
command is the novel piece: it joins initiative completion dates against
`getdx_snapshot_team_scores` across before/after snapshots to compute percentile
deltas. The cross-snapshot join lives in Landmark, not Map — see § Design
decision below.

## Scope

**In scope**

- New migration creating `activity.getdx_initiatives` with the columns spec §
  Data Contracts enumerates.
- Extend Map's GetDX extract with an Initiatives API fetch.
- Add `transformInitiatives` and wire into `transformAllGetDX`.
- New query module `products/map/src/activity/queries/initiatives.js` exporting
  `listInitiatives`, `getInitiative`, and `getInitiativeImpact`.
- Subpath export entry in `products/map/package.json`.
- Landmark: `initiative list`, `initiative show`, `initiative impact`
  subcommands on a single `initiative` command file.
- Tests for extract, transform, query, and the three Landmark subcommands.

**Out of scope**

- Any write path to initiatives (Landmark is read-only).
- Driver linking UI changes beyond what the schema requires.

### Design decision — impact join lives in Landmark, not Map

The cross-snapshot join logic (pick the snapshot before an initiative's
`completed_at`, pick the one after, compute the delta) is **analytical
computation**, not a raw query. Map's existing query modules in
`products/map/src/activity/queries/` are thin `SELECT` wrappers — none of them
implement multi-row analysis. Putting the join there would break that convention
and force Landmark's domain logic into Map's surface area.

Instead:

- Map exports raw queries only: `listInitiatives`, `getInitiative`, plus the
  existing `listSnapshots` and `getSnapshotScores`.
- Landmark owns the analytical join in a new helper:
  `products/landmark/src/lib/initiative-helpers.js`, exporting
  `computeInitiativeImpact({ completed, snapshots, scoresBySnapshot })` as a
  pure function operating on already-fetched rows. The function is unit-testable
  with in-memory fixtures; no Supabase contact.
- `runImpact` in `src/commands/initiative.js` performs the fetches (completed
  initiatives, all snapshots, scores per relevant snapshot) and passes the
  result arrays into `computeInitiativeImpact`.

## Files

### Created

```
products/map/supabase/migrations/
  <next-sequence>_getdx_initiatives.sql

products/map/src/activity/queries/
  initiatives.js

products/map/test/activity/
  transform-getdx-initiatives.test.js
  query-initiatives.test.js

products/landmark/src/lib/
  initiative-helpers.js

products/landmark/src/commands/
  initiative.js

products/landmark/src/formatters/
  initiative.js

products/landmark/test/
  initiative.test.js
  initiative-helpers.test.js
```

### Modified

- `products/map/supabase/functions/_shared/activity/extract/getdx.js` — add
  `extractInitiatives` helper and call it once per extract (not per snapshot,
  since initiatives are org-scoped in GetDX).
- `products/map/supabase/functions/_shared/activity/transform/getdx.js` — add
  `transformInitiatives` and call it from `transformAllGetDX`; update the return
  shape to include `initiatives: number`.
- `products/map/package.json` — add
  `"./activity/queries/initiatives": "./src/activity/queries/initiatives.js"`.
- `products/landmark/bin/fit-landmark.js` — wire `runInitiativeCommand`.
- `products/landmark/src/formatters/index.js` — register initiative formatter.
- `products/landmark/src/commands/health.js` — add initiatives fetch **only
  between the `<initiatives section>` anchors** placed by Part 03. Do not touch
  the `<comments section>` region (that is Part 04's territory).
- `products/landmark/src/formatters/health.js` — render per-driver active
  initiatives between the matching `<initiatives section>` anchors.
- `products/landmark/test/health.test.js` — extend with assertions that
  initiatives render per driver when present, and that missing initiatives table
  records a warning without failing the command.

## Implementation details

### Migration

Schema follows spec § Data Contracts:

```sql
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
```

Notes:

- `completed_at` is added beyond the spec's enumeration because the impact
  computation needs it as the join key. `due_date` is the scheduled date;
  `completed_at` is derived from GetDX's status transition. If GetDX does not
  expose a completion timestamp, fall back to the first snapshot where
  `completion_pct` reaches 100 (computed at transform time).
- `tags` stored as JSONB for flexibility.
- `scorecard_id` is the join key to `getdx_snapshot_team_scores.item_id` — spec
  says initiatives target drivers through scorecard items, so
  `scorecard_id === driver.id` for linked initiatives. Unlinked initiatives (no
  scorecard) leave this null.

### Extract

```js
async function extractInitiatives(supabase, config) {
  // GetDX Initiatives API endpoint — confirm exact path during
  // implementation. Store the raw response under
  // getdx/initiatives-list/<timestamp>.json for idempotent replay.
  const url = `${config.baseUrl}/initiatives.list`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.apiToken}` },
  });
  if (!response.ok) {
    return { error: `initiatives.list → HTTP ${response.status}` };
  }
  const payload = await response.json();
  await storeDocument(
    supabase,
    `getdx/initiatives-list/${Date.now()}.json`,
    payload,
  );
  return { ok: true };
}
```

Accumulate errors into the extract's return value; do not fail the whole extract
on an initiatives fetch error.

**Risk:** the spec does not pin the exact GetDX Initiatives API path. The
implementer should cross-reference GetDX docs at implementation time. If the
path is wrong, only this function needs patching — the rest of the pipeline
treats the payload as opaque JSON.

### Transform

`transformInitiatives(supabase)`:

1. List documents under `getdx/initiatives-list/`.
2. Parse the most recent document (initiatives are state-of-the-world, not
   event-sourced — always prefer the latest extract).
3. For each initiative in the array, build an upsert row:
   - `id`, `name`, `description` from the payload.
   - `scorecard_id` from the payload's scorecard field.
   - `owner_email` from the payload's owner field.
   - `due_date`, `priority` from the payload.
   - `passed_checks`, `total_checks`, `completion_pct` from the payload's
     aggregate fields.
   - `tags` as JSONB.
   - `completed_at` from the payload if present, else computed as
     `passed_checks === total_checks && total_checks > 0 ? now() : null`.
   - `raw` = the entire payload entry.
4. Upsert on `id` with a **completion-preserving merge**: if the row already
   exists and the old `completed_at` is non-null, keep the old value. Use:

   ```sql
   on conflict (id) do update set
     name = excluded.name,
     description = excluded.description,
     scorecard_id = excluded.scorecard_id,
     owner_email = excluded.owner_email,
     due_date = excluded.due_date,
     priority = excluded.priority,
     passed_checks = excluded.passed_checks,
     total_checks = excluded.total_checks,
     completion_pct = excluded.completion_pct,
     tags = excluded.tags,
     completed_at = coalesce(getdx_initiatives.completed_at, excluded.completed_at),
     raw = excluded.raw,
     inserted_at = now()
   ```

   This makes the transform idempotent: replaying the same extract cannot shift
   `completed_at` forward, so the before/after snapshot selection in impact
   computation stays deterministic.

5. Return `{ initiatives: <count>, errors: [...] }`.

### Query module (thin SELECT wrappers only)

Map's query module exports **two** functions — `listInitiatives` and
`getInitiative` — that stay in line with the existing Map query convention (thin
`SELECT` wrappers, no cross-row analysis). The impact computation lives in
Landmark (see § Design decision above).

```js
export async function listInitiatives(supabase, options = {}) {
  let query = supabase
    .from("getdx_initiatives")
    .select("*")
    .order("due_date", { ascending: true });
  if (options.ownerEmail) query = query.eq("owner_email", options.ownerEmail);
  if (options.managerEmail) {
    // Team roster → list of emails → filter by owner_email IN (...)
    const { data: team } = await supabase
      .from("organization_people")
      .select("email")
      .eq("manager_email", options.managerEmail);
    const emails = (team ?? []).map((t) => t.email);
    if (emails.length === 0) return [];
    query = query.in("owner_email", emails);
  }
  if (options.status === "active") query = query.is("completed_at", null);
  if (options.status === "completed") query = query.not("completed_at", "is", null);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getInitiative(supabase, id) {
  const { data, error } = await supabase
    .from("getdx_initiatives")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

```

### Landmark helper: `initiative-helpers.js`

Pure function operating on already-fetched rows. No Supabase inside.

```js
/**
 * @param {object} params
 * @param {Array<object>} params.completed - Completed initiatives.
 * @param {Array<object>} params.snapshots - All snapshots (ordered DESC).
 * @param {Map<string, Map<string, number>>} params.scoresBySnapshot -
 *   snapshotId → (scorecardId → score).
 * @returns {Array<{initiative, before, after, delta}>}
 */
export function computeInitiativeImpact({ completed, snapshots, scoresBySnapshot }) {
  const sorted = [...snapshots].sort((a, b) =>
    a.scheduled_for.localeCompare(b.scheduled_for),
  );
  const results = [];
  for (const init of completed) {
    if (!init.scorecard_id || !init.completed_at) {
      results.push({ initiative: init, before: null, after: null, delta: null });
      continue;
    }
    // Latest snapshot before completion.
    let before = null;
    for (const s of sorted) {
      if (s.scheduled_for <= init.completed_at) before = s;
      else break;
    }
    // Earliest snapshot after completion.
    const after = sorted.find((s) => s.scheduled_for > init.completed_at) ?? null;
    if (!before || !after) {
      results.push({ initiative: init, before: null, after: null, delta: null });
      continue;
    }
    const beforeScore = scoresBySnapshot.get(before.snapshot_id)?.get(init.scorecard_id) ?? null;
    const afterScore = scoresBySnapshot.get(after.snapshot_id)?.get(init.scorecard_id) ?? null;
    results.push({
      initiative: init,
      before: beforeScore,
      after: afterScore,
      delta:
        beforeScore != null && afterScore != null ? afterScore - beforeScore : null,
    });
  }
  return results;
}
```

`runImpact` in the initiative command is responsible for fetching:

1. `listInitiatives(supabase, { ...filter, status: "completed" })`
2. `listSnapshots(supabase)`
3. For each unique `(snapshot_id, scorecard_id)` pair referenced by the
   completed initiatives,
   `getSnapshotScores(supabase, snapshot_id, { managerEmail })` once and index
   the result by `item_id` into `scoresBySnapshot`.
4. Call `computeInitiativeImpact({ completed, snapshots, scoresBySnapshot })`.

### Landmark: `initiative` command

One file dispatches three subcommands:

```js
export const needsSupabase = true;

export async function runInitiativeCommand({ args, options, supabase, mapData, format }) {
  const [sub] = args;
  switch (sub) {
    case "list":   return runList({ options, supabase, format });
    case "show":   return runShow({ options, supabase, format });
    case "impact": return runImpact({ options, supabase, mapData, format });
    default:       throw new UsageError("initiative: expected `list`, `show`, or `impact`");
  }
}
```

- `list` → `listInitiatives(supabase, { managerEmail: options.manager })`. Empty
  → `NO_INITIATIVES`. Table-missing error → same empty state.
- `show` → requires `--id`. `getInitiative(supabase, options.id)`. Null →
  `"No initiative found with id ${id}."` empty state.
- `impact` → orchestrates fetches (see § Landmark helper) and calls
  `computeInitiativeImpact`. Renders per the spec's mocked output (§ Initiative
  impact, lines 510–541). Initiatives with null `scorecard_id` render the "no
  driver linked" note.

Catch `42P01` errors on the initiatives query and return `NO_INITIATIVES`,
matching Part 04's pattern for `NO_COMMENTS`.

### Formatter

`initiative.js` formatter renders the spec § Initiative impact output exactly:
initiative name, target driver id, before/after percentile, delta, and any
engineer voice quote (deferred — engineer voice is Part 04's concern;
initiatives formatter only renders voice if the view object has a `voice` field,
which Part 06 polish can add later).

### Health view integration — active initiatives per driver

Edit **only** between the `// <initiatives section>` anchors Part 03 placed in
`src/commands/health.js` and `src/formatters/health.js`. Do not touch the
`<comments section>` region (Part 04's territory).

In `src/commands/health.js`, between the `<initiatives section>` anchors:

```js
// <initiatives section> — Part 05
let activeInitiatives = [];
try {
  activeInitiatives = await listInitiatives(supabase, {
    managerEmail: options.manager,
    status: "active",
  });
} catch (err) {
  if (isRelationNotFoundError(err)) {
    activeInitiatives = [];
    meta.warnings.push("Active initiatives unavailable — table not present.");
  } else {
    throw err;
  }
}
// Attach to each driver by scorecard_id match.
for (const driver of view.drivers) {
  driver.initiatives = activeInitiatives.filter(
    (i) => i.scorecard_id === driver.id,
  );
}
// </initiatives section>
```

`isRelationNotFoundError` was added to `src/lib/supabase.js` by Part 04; if this
part lands before Part 04 (tie-break), add it here instead. Parts 04 and 05 must
coordinate: whichever lands first adds the helper, the second asserts it already
exists.

In `src/formatters/health.js`, between the matching anchors, render up to 3
active initiatives per driver as one line each (name + completion_pct).

## Tests

- `transform-getdx-initiatives.test.js` — feeds mocked
  `getdx/initiatives-list/<ts>.json` into `transformInitiatives`, asserts upsert
  payload, including `completed_at` fallback logic.
- `query-initiatives.test.js` — stubs Supabase query builder, verifies filter
  chaining for `listInitiatives`, `getInitiative`, and especially
  `getInitiativeImpact` (before/after snapshot selection, delta calculation,
  handling of unlinked initiatives).
- `initiative.test.js`:
  - `list` with and without `--manager`.
  - `show` with valid and invalid `--id`.
  - `impact` with a completed initiative that has scorecard alignment (real
    delta), a completed initiative without alignment (null delta), and an
    in-progress initiative (skipped in impact view).
  - `NO_INITIATIVES` empty state for the three subcommands.
- `initiative-helpers.test.js`:
  - Happy path: completed initiative between two snapshots produces a non-null
    delta.
  - Edge: no snapshots before completion → null before/after.
  - Edge: no snapshots after completion → null after/delta.
  - Edge: `scorecard_id` null → null delta.
  - Edge: score missing in one of the snapshots → null delta.
  - Idempotency: identical input yields identical output regardless of snapshot
    array input order (the helper sorts internally).
- `health.test.js` — extended with:
  - Active initiatives render per driver when the fetch returns rows.
  - Missing initiatives table records the warning, does not fail.

## Verification

1. `just migrate` — migration applies cleanly.
2. `fit-map getdx sync` — new extract stores initiatives document.
3. `fit-map activity transform` — new transform step populates the table.
4. `bun test products/map/test/activity` — new tests green.
5. `bun test products/landmark/test` — new tests green (including the extended
   `health.test.js`).
6. `bun run layout && bun run check:exports && bun run check` — layout, exports
   (confirms `./activity/queries/initiatives` subpath is wired), and lint/format
   all green.
7. Grep confirms only `<initiatives section>` anchors were edited in `health.js`
   and `formatters/health.js` — the `<comments section>` region remains
   untouched. Any edit outside the initiatives anchors is a contract violation
   and must be reverted.
8. Smoke tests:
   - `bunx fit-landmark initiative list --manager alice@example.com`
   - `bunx fit-landmark initiative show --id <id>`
   - `bunx fit-landmark initiative impact --manager alice@example.com`

## Risks

- **GetDX Initiatives API shape is the primary unknown.** Same mitigation as
  Part 04: the extract stores raw payload; the transform is the only layer that
  parses. Patch the transform if the shape differs.
- **Before/after snapshot selection is sensitive to `completed_at` fidelity.**
  If GetDX does not supply a completion timestamp, the fallback (first snapshot
  at 100%) is imperfect — it may delay the "before" marker by up to one quarter.
  Document this limitation in the formatter output when the fallback path is
  used.
- **`scorecard_id === driver.id` join assumes parity.** Real installations may
  need an explicit mapping layer. This part does not build one; Part 06
  documents the assumption.

## Deliverable

A merged PR that ships `fit-landmark initiative list|show|impact` and the
supporting Map pipeline. Spec § Initiative tracking and § Initiative impact are
fully implemented except for the optional health-view integration, which is
tracked as a Part 06 polish item.
