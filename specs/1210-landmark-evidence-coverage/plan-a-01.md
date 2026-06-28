# Plan 1210-a Part 01: Schema slice

Land the `provenance` carrier end-to-end so the producer and surface
parts can rely on it. Proto field at tag 7, DB column with NOT-NULL +
`'human_attested'` default, validation module shared by handler and
producers, `WriteEvidence` handler maps incoming value through the guard
and rejects out-of-set inputs. Existing `WriteEvidence` callers continue
to work — they hit the DB default.

Libraries used: none new.

## Step 1.1 — Add `provenance` to `WriteEvidenceRequest`

Modified: `services/map/proto/map.proto`

Add a single optional string field at tag 7:

```proto
message WriteEvidenceRequest {
  // Artifact UUID
  string artifact_id = 1;
  // Skill id from the engineering standard
  string skill_id = 2;
  // Proficiency level id
  string level_id = 3;
  // Marker text verbatim from GetMarkersForProfile
  string marker_text = 4;
  // Whether the artifact demonstrates this marker
  bool matched = 5;
  // 1-3 sentence rationale
  string rationale = 6;
  // Provenance class: synthetic_placeholder | artifact_interpreted |
  // agent_attested | human_attested. Omitted/empty maps to the DB
  // default (human_attested) in the WriteEvidence handler.
  optional string provenance = 7;
}
```

Verify: `git diff services/map/proto/map.proto` shows the field add and no
other change.

## Step 1.2 — Regenerate codegen

Command: `just codegen`

Modified (regenerated): `generated/types/types.js`,
`generated/types/metadata.js`, `generated/services/map/service.js`,
`generated/services/map/client.js`, `generated/definitions/map.js` (and any
other file `just codegen` touches).

Verify: `git status generated/` lists the regenerated files; commit them
in the same commit as the proto edit. `bun run context` passes.

## Step 1.3 — DB migration

Created:
`products/map/supabase/migrations/20260603000000_evidence_provenance.sql`

```sql
ALTER TABLE activity.evidence
  ADD COLUMN provenance TEXT NOT NULL DEFAULT 'human_attested';
```

Notes for the implementer:

- The default `human_attested` catches any path that bypasses the
  `WriteEvidence` handler (direct DB inserts, manual RPC callers
  omitting the field).
- **No backfill `UPDATE` is run.** The earlier migration
  `20250504000002_evidence_not_null.sql` set every historical NULL
  rationale to the literal `'synthetic'` to satisfy NOT NULL, so a
  predicate `WHERE rationale = 'synthetic'` no longer reliably
  identifies round-robin rows — it would mass-mislabel hand-attested
  rows whose rationale was originally NULL. Existing rows therefore
  land at the DB default `human_attested` immediately after migration.
- **Residue path.** Part 02's round-robin DELETE narrows to
  `provenance = "synthetic_placeholder"` — it does **not** touch
  legacy rows that landed at `provenance = "human_attested"` on
  migration. On Part 02's next transform run, the producer's
  `.upsert(rows, { ignoreDuplicates: true })` proposes new rows for
  every entry in `getdx/evidence.json`; when a proposed row's
  `(artifact_id, skill_id, level_id, marker_text)` quadruple matches
  an existing legacy `human_attested` row, the upsert silently keeps
  the legacy row's `human_attested` tag (no UPDATE). The provenance
  on legacy round-robin rows therefore stays `human_attested`
  **permanently** unless an operator manually re-tags them. Spec §
  Out of scope ("Backfilling existing `rationale: synthetic` rows
  to the new provenance vocabulary") names this residue as
  acceptable; downstream consumers reading the per-provenance
  breakdown (Part 04) will see a `human_attested` count inflated by
  this residue until the legacy rows roll off (e.g. their artifact
  is purged, removing the FK, or their `getdx/evidence.json` entry
  changes shape so the quadruple no longer matches).
- **Release coupling.** Parts 01 and 02 must ship in the same release.
  Landing Part 01 alone leaves every existing round-robin row tagged
  `human_attested` indefinitely, which silently inflates the
  human-attested class in criterion 5's breakdown until Part 02
  re-runs. The cross-cutting note in plan-a.md repeats this constraint.
- The existing unique index
  (`20250504000004_evidence_upsert_key.sql` on
  `(artifact_id, skill_id, level_id, marker_text)`) is unchanged; the
  determinism contract uses it as the conflict key on the round-robin
  producer's `upsert` in Part 02.
- The filename prefix must sort after the latest migration on `main`
  (currently `20260514000000_organization_people_kind.sql`); adjust the
  date to merge day if a later migration lands first.

Verify: against a fresh supabase boot, the migration runs cleanly and
`\d+ activity.evidence` shows the new column with NOT-NULL + default.

## Step 1.4 — Validation module + package exports

Created: `products/map/src/activity/provenance.js`

Modified: `products/map/package.json`

Add one line to the `exports` block, alongside the existing
`./activity/transform/evidence` entry:

```json
"./activity/provenance": "./src/activity/provenance.js",
```

Without this entry, `scripts/check-workspace-imports.mjs` (run by
`bun run context`) fails the PR — every importer in Parts 01, 02, 03,
and 04 uses the same path.

```js
/**
 * Provenance class vocabulary for evidence rows.
 * Shared between WriteEvidence (services/map) and the activity transform
 * producers (products/map/src/activity/transform/).
 */

export const PROVENANCE_CLASSES = Object.freeze([
  "synthetic_placeholder",
  "artifact_interpreted",
  "agent_attested",
  "human_attested",
]);

const VALID = new Set(PROVENANCE_CLASSES);

/**
 * Throw if `value` is not one of PROVENANCE_CLASSES. Empty / undefined is
 * allowed — callers map it to the DB default before insert.
 * @param {string | undefined | null} value
 */
export function assertProvenance(value) {
  if (value === undefined || value === null || value === "") return;
  if (!VALID.has(value)) {
    throw new Error(
      `Invalid provenance "${value}". Must be one of: ${PROVENANCE_CLASSES.join(", ")}.`,
    );
  }
}
```

Notes:

- `Object.freeze` matches the existing pattern at
  `libraries/libskill/src/derivation.js:33` (`ORDER_SKILL_TYPE`) and
  prevents downstream mutation of the array.
- Empty-string handling is in the guard so the `WriteEvidence` handler
  doesn't need to branch — protobuf maps an absent optional field to the
  empty string by default.

Verify: import the module from a node REPL or from a smoke unit test;
calling `assertProvenance("artifact_interpreted")` returns; calling
`assertProvenance("nonsense")` throws.

## Step 1.5 — `WriteEvidence` handler

Modified: `services/map/index.js`

Edit the `WriteEvidence` method (`services/map/index.js:95-119`):

```js
import { assertProvenance } from "@forwardimpact/map/activity/provenance";

// ...

async WriteEvidence(req) {
  const provenance = req.provenance ?? "";

  const row = {
    artifact_id: req.artifact_id ?? req.artifactId,
    skill_id: req.skill_id ?? req.skillId,
    level_id: req.level_id ?? req.levelId,
    marker_text: req.marker_text ?? req.markerText,
    matched: req.matched,
    rationale: req.rationale,
  };

  if (!row.artifact_id) throw new Error("artifact_id is required");
  if (!row.skill_id) throw new Error("skill_id is required");
  if (!row.rationale) throw new Error("rationale is required");
  if (!row.level_id) throw new Error("level_id is required");
  if (row.matched == null) throw new Error("matched is required");

  assertProvenance(provenance);
  if (provenance) row.provenance = provenance;

  await this.#validateMarkerGrounding(row);

  const { error } = await this.#supabase.from("evidence").upsert([row], {
    onConflict: "artifact_id,skill_id,level_id,marker_text",
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`WriteEvidence: ${error.message}`);
  return { content: "1 row written" };
}
```

Notes:

- The guard runs after the existing required-field checks so empty
  payloads still fail on the original "rationale is required" /
  "artifact_id is required" paths with their existing messages; the new
  guard fires only when a non-empty value is supplied. This preserves
  the prior input-validation order for omitted-required-field cases.
- `provenance` is conditionally added to `row` so omitted / empty
  payloads let the DB default fire (criterion 2 + design § Provenance).
- The package export was added in Step 1.4.

Verify: `bun test services/map` passes; smoke a direct `WriteEvidence`
call with `provenance: "agent_attested"` against a local supabase and
read the row back to confirm the column is populated.

## Step 1.6 — Handler tests

Modified: `services/map/test/map.test.js`

The existing file has one `describe("MapService", …)` block at line 57
with sibling `it("WriteEvidence …", …)` cases at lines 124, 170, 217.
Add three new `it()` cases inside the same `describe("MapService", …)`
block, alongside the existing WriteEvidence cases:

1. **Default applies when `provenance` is omitted.** Call `WriteEvidence`
   without the field; assert the row inserted by the mock supabase has
   no `provenance` key (so the DB default fires).
2. **Valid `provenance` value passes through.** Call with
   `provenance: "agent_attested"`; assert the inserted row carries
   `provenance: "agent_attested"`.
3. **Invalid `provenance` value rejected before insert.** Call with
   `provenance: "made_up"`; assert the call rejects with a message that
   includes `made_up` and `Must be one of:`; assert no row was inserted.

Notes:

- Reuse the existing test setup in `services/map/test/map.test.js` —
  whatever mock supabase + pathway client harness the file uses. Add the
  three cases inside the existing `WriteEvidence` describe.
- The existing `#validateMarkerGrounding` step must be mocked or
  short-circuited the same way the existing test cases do it.

Verify: `bun test services/map/test/map.test.js` — all three new cases
plus the prior cases pass.

## Verification

```text
bun test services/map
bun run context
```

`bun run context` exercises the codegen freshness check. `bun test
services/map` covers the handler + validation guard. The DB migration is
verified out-of-band by booting a local supabase and inspecting the
column.
