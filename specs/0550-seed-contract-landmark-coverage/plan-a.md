# 550 — Seed Contract: Landmark Coverage — Plan

## Approach

Five changes turn the approved design into working code. The comments fix (B) is
a one-line renderer path correction. The evidence transform (A) is the core new
work — a new module that reads synthetic evidence from storage, resolves person
emails to artifact UUIDs, and inserts rows into the `evidence` table. The
orchestrator (C), verify (D), and seed reporting (E) are wiring changes that
plug A into the existing pipeline. A test file covers the new transform in
isolation.

**Generation already exists.** The spec's deliverables 1 and 2 (synthetic
evidence generation and snapshot comments generation) are already implemented:
`generateEvidence()` in `libraries/libsyntheticgen/src/engine/activity.js` and
`renderGetDXComments` in `libraries/libsyntheticrender/src/render/raw.js`. Both
produce output that reaches Supabase Storage during seed. The gap is downstream:
comments are written to the wrong path (B fixes this) and evidence has no
transform to read it into the DB (A fills this gap).

**Why this ordering:** B is independent and risk-free — ship it first so
comments flow end-to-end. A is the prerequisite for C and E. D is independent
but logically groups with E (both touch `activity.js`). Tests are written
alongside A.

## Steps

### Step 1 — Fix comments renderer path (Component B)

**File:** `libraries/libsyntheticrender/src/render/raw.js`

**Change (line 287):**

```javascript
// Before
files.set(
  `getdx/snapshots/${snapshotId}/comments.json`,
  JSON.stringify({ ok: true, comments }, null, 2),
);

// After
files.set(
  `getdx/snapshots-comments/${snapshotId}.json`,
  JSON.stringify({ ok: true, comments }, null, 2),
);
```

**Rationale:** The existing `transformSnapshotComments` in
`products/map/src/activity/transform/getdx.js` (line 54) lists files from
`getdx/snapshots-comments/` and derives `snapshot_id` from the filename. The
renderer currently writes to `getdx/snapshots/{id}/comments.json` — a nested
path the transform never finds. This one-line fix aligns the renderer with the
established `getdx/{resource-type}/` directory convention that all other GetDX
resources use.

**Verification:** After `just synthetic`, confirm files appear under
`data/activity/raw/getdx/snapshots-comments/` (not under
`getdx/snapshots/{id}/`).

---

### Step 2 — Create evidence transform (Component A)

**New file:** `products/map/src/activity/transform/evidence.js`

**Structure:**

```javascript
import { readRaw } from "../storage.js";

/**
 * Transform synthetic evidence from storage into evidence table rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{inserted: number, skipped: number, errors: Array<string>}>}
 */
export async function transformEvidence(supabase)
```

**Returns:** `{ inserted: number, skipped: number, errors: string[] }`

**Algorithm:**

1. Read `getdx/evidence.json` from storage via
   `readRaw(supabase, "getdx/evidence.json")`. Wrap the `readRaw` call in a
   try/catch — `readRaw` throws on download failure (storage.js line 41). If the
   catch fires, return `{ inserted: 0, skipped: 0, errors: [] }`. This is not
   defensive: the file legitimately does not exist when seed runs on data
   generated before evidence generation was added. The catch handles an expected
   operational condition at the storage boundary.

2. Parse the JSON. Expected shape: `{ evidence: [...] }` where each row has
   `{ person_email, skill_id, proficiency, observed_at, ... }`.

3. Delete existing synthetic evidence:
   `supabase.from("evidence").delete().eq( "rationale", "synthetic")`. This
   achieves idempotency — the evidence table PK is a server-generated UUID with
   no natural key for upsert.

4. Query all artifacts grouped by email:

   ```javascript
   const { data: artifacts } = await supabase
     .from("github_artifacts")
     .select("artifact_id, email, artifact_type, metadata")
     .not("email", "is", null);
   ```

   Build a `Map<email, artifact[]>` for O(1) lookup.

5. For each evidence row from the JSON:
   - Look up the person's artifacts by `person_email`.
   - If no artifacts exist for that person, increment `skipped` and continue.
   - Select the next artifact via round-robin (track an index per email).
   - Extract `marker_text` from the artifact's metadata in priority order:
     `metadata.title` → `metadata.message` → `"{skill_id} evidence"`.
   - Build the DB row:

     | Field         | Value                                               |
     | ------------- | --------------------------------------------------- |
     | `artifact_id` | From the selected artifact                          |
     | `skill_id`    | Direct from evidence row                            |
     | `level_id`    | `proficiency` field (skill proficiency, not career) |
     | `marker_text` | Extracted above                                     |
     | `matched`     | `true`                                              |
     | `rationale`   | `"synthetic"`                                       |
     | `created_at`  | `observed_at` from evidence row                     |

6. Batch insert all rows: `supabase.from("evidence").insert(rows)`.

7. Return `{ inserted: rows.length, skipped, errors }`.

**Imports:** `readRaw` from `../storage.js` (same pattern as `github.js` and
`getdx.js`).

**Edge cases:**

- File not found in storage → return zeros (not an error — seed may run without
  synthetic evidence).
- Person has artifacts but all lack metadata → fallback marker text
  `"{skill_id} evidence"`.
- Empty evidence array → return zeros after delete (still idempotent).

---

### Step 3 — Wire evidence into transform orchestrator (Component C)

**File:** `products/map/src/activity/transform/index.js`

**Changes:**

1. Add import (line 10):

   ```javascript
   import { transformEvidence } from "./evidence.js";
   ```

2. Update `transformAll` (lines 17-23):

   ```javascript
   export async function transformAll(supabase) {
     const people = await transformPeople(supabase);
     const getdx = await transformAllGetDX(supabase);
     const github = await transformAllGitHub(supabase);
     const evidence = await transformEvidence(supabase);

     return { people, getdx, github, evidence };
   }
   ```

3. Update the JSDoc return type to include `evidence: object`.

**Dependency order preserved:** Evidence runs after GitHub (artifacts must
exist) and after people (emails must exist). The existing
`people → getdx → github` order is unchanged.

---

### Step 4 — Update verify to check all tables (Component D)

**File:** `products/map/src/commands/activity.js`

Apply Step 4 before Step 5 — verify is above seed in the file (line 92 vs 147),
so edits here don't shift line numbers for seed/transform changes below.

**Changes to `verify()` (lines 92-138):**

1. Add two count queries after the existing `github_events` query:

   ```javascript
   const { count: evidenceCount, error: evidErr } = await supabase
     .from("evidence")
     .select("*", { count: "exact", head: true });
   if (evidErr) throw new Error(`evidence: ${evidErr.message}`);

   const { count: commentCount, error: comErr } = await supabase
     .from("getdx_snapshot_comments")
     .select("*", { count: "exact", head: true });
   if (comErr) throw new Error(`getdx_snapshot_comments: ${comErr.message}`);
   ```

2. Add to the `summary.render` items array:

   ```javascript
   { label: "evidence", description: `${evidenceCount ?? 0} rows` },
   { label: "getdx_snapshot_comments", description: `${commentCount ?? 0} rows` },
   ```

3. **Do not make evidence/comments counts a hard failure.** The existing verify
   only requires `organization_people > 0` and
   `(getdx_snapshots > 0 || github_events > 0)`. Evidence and comments are
   informational — they display counts but don't block verify from returning 0.
   This matches the spec: verify should "report counts," not require non-zero.

---

### Step 5 — Update seed reporting and transform command (Component E)

**File:** `products/map/src/commands/activity.js`

**Changes (apply after Step 4; line numbers below reflect the file after Step
4's additions to verify):**

1. **Add import** at the top of the file (after the existing transform imports,
   line 6):

   ```javascript
   import { transformEvidence } from "@forwardimpact/map/activity/transform/evidence";
   ```

2. **`transform()` function, `case "all"`:** Add evidence report after the
   github report and extend the `ok` check:

   ```javascript
   // Before
   report("github", summarizeCounts(r.github));
   const ok =
     r.people.errors.length === 0 &&
     r.getdx.errors.length === 0 &&
     r.github.errors.length === 0;

   // After
   report("github", summarizeCounts(r.github));
   report("evidence", {
     inserted: r.evidence.inserted,
     skipped: r.evidence.skipped,
     errors: r.evidence.errors.length,
   });
   const ok =
     r.people.errors.length === 0 &&
     r.getdx.errors.length === 0 &&
     r.github.errors.length === 0 &&
     r.evidence.errors.length === 0;
   ```

3. **`transform()` function:** Add a new `case "evidence"` before the
   `case "all"` block (consistent with existing people/getdx/github cases):

   ```javascript
   case "evidence": {
     const r = await transformEvidence(supabase);
     report("evidence", {
       inserted: r.inserted,
       skipped: r.skipped,
       errors: r.errors.length,
     });
     return r.errors.length === 0 ? 0 : 1;
   }
   ```

4. **`seed()` function:** Add evidence report after the github transform report:
   ```javascript
   // After existing: report("Transform github", summarizeCounts(result.github));
   report("Transform evidence", {
     inserted: result.evidence.inserted,
     skipped: result.evidence.skipped,
     errors: result.evidence.errors.length,
   });
   ```

---

### Step 6 — Add package export

**File:** `products/map/package.json`

Add to the `exports` map between the individual transform module exports and the
aggregate transform index export. Insert after `./activity/transform/people`
(line 55) and before `./activity/transform` (line 56):

```json
"./activity/transform/evidence": "./src/activity/transform/evidence.js",
```

This follows the pattern of the other per-module transform exports
(`./activity/transform/github`, `./activity/transform/getdx`,
`./activity/transform/people`) and allows the `case "evidence"` in the transform
command to import it by package name.

---

### Step 7 — Add evidence transform test

**New file:** `products/map/test/activity/transform-evidence.test.js`

Test the `transformEvidence` function with a fake Supabase client following the
pattern in the existing transform tests (`transform-github.test.js`,
`transform-getdx.test.js`).

**Test cases:**

1. **Happy path** — Evidence JSON with 3 rows, 2 people with artifacts, 1
   without. Verify: 2 rows inserted, 1 skipped, delete called with
   `rationale = 'synthetic'`, artifact round-robin distributes correctly.

2. **Idempotency** — Run transform twice with same data. Verify: delete called
   before each insert, final row count unchanged.

3. **Missing evidence file** — `readRaw` throws (file not found). Verify: the
   try/catch returns `{ inserted: 0, skipped: 0, errors: [] }` (graceful
   degradation at the storage boundary).

4. **marker_text extraction** — Artifacts with title (PR), message (commit), and
   neither (review). Verify: correct fallback chain.

5. **Empty evidence array** — File exists but `evidence: []`. Verify: delete
   still runs (cleans up), returns zeros.

**Fake Supabase structure:** Stub `.from()`, `.select()`, `.delete()`, `.eq()`,
`.insert()`, `.not()`, and `readRaw` (via module mock) following the existing
pattern in `transform-github.test.js`.

## Blast Radius

### Created

| File                                                    | Purpose            |
| ------------------------------------------------------- | ------------------ |
| `products/map/src/activity/transform/evidence.js`       | Evidence transform |
| `products/map/test/activity/transform-evidence.test.js` | Tests              |

### Modified

| File                                             | Change                                  |
| ------------------------------------------------ | --------------------------------------- |
| `libraries/libsyntheticrender/src/render/raw.js` | Comments path fix (1 line)              |
| `products/map/src/activity/transform/index.js`   | Import + call evidence transform        |
| `products/map/src/commands/activity.js`          | Verify counts, seed/transform reporting |
| `products/map/package.json`                      | Add evidence transform export           |

### Deleted

None.

## Risks

1. **Storage read failure tolerance.** The evidence file may not exist if
   synthetic generation was run before evidence generation was added. The
   transform catches the `readRaw` throw and returns zeros — see Step 2
   algorithm item 1 for the rationale on why this is a boundary condition, not
   defensive code.

2. **Artifact distribution skew.** If one person has many evidence rows but few
   artifacts, multiple evidence rows will share the same artifact_id. This is
   acceptable — real Guide evidence can also produce multiple rows per artifact.
   The round-robin distributes as evenly as possible.

3. **Batch insert size.** Supabase JS client handles array inserts well for
   typical synthetic data sizes (tens to low hundreds of rows). If evidence
   generation scales significantly, chunking may be needed. Not a concern at
   current scale.

4. **Delete-then-insert race.** In seed, transforms run sequentially (not
   concurrently). No race condition between delete and insert within the same
   function call.

## Libraries Used

| Package                 | Export                               | Usage                                               |
| ----------------------- | ------------------------------------ | --------------------------------------------------- |
| `@forwardimpact/libcli` | `SummaryRenderer`, `formatSubheader` | Already imported in activity.js — no new dependency |

No new dependencies are introduced. The evidence transform's only non-Supabase
import is `readRaw` from `../storage.js` — an internal module within
`@forwardimpact/map`, not a cross-package dependency. No shared `lib*` packages
are consumed by the new transform module.

## Execution

Single agent (`staff-engineer`), sequential steps. All changes are in
`products/map` and `libraries/libsyntheticrender` — no documentation or wiki
changes needed.

**Verification sequence after all steps:**

1. `bun run format` — ensure no formatting regressions
2. `bun test --filter map` — existing + new tests pass
3. `bun test --filter landmark` — Landmark tests still pass
4. `just synthetic && just seed` — full pipeline produces non-zero evidence and
   comment counts in verify output
5. Run all twelve Landmark views for a synthetic person to confirm non-empty
   output (spec success criterion 2):
   ```
   fit-landmark coverage --email <email>
   fit-landmark evidence --email <email>
   fit-landmark health --email <manager-email>
   fit-landmark initiative
   fit-landmark marker --email <email>
   fit-landmark org
   fit-landmark practice --email <manager-email>
   fit-landmark practiced --email <manager-email>
   fit-landmark readiness --email <email>
   fit-landmark snapshot
   fit-landmark timeline --email <email>
   fit-landmark voice --email <email>
   ```
   Use an email and manager-email from the synthetic roster. Every command
   should return at least one row of output.
