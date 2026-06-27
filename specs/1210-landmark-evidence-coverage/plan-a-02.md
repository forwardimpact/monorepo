# Plan 1210-a Part 02: Round-robin producer migration

Swap the round-robin producer's `rationale: "synthetic"` for
`provenance: "synthetic_placeholder"`, narrow the pre-insert delete to
target only its own provenance class, and replace `.insert(rows)` with
`.upsert(rows, { onConflict, ignoreDuplicates: true })` so the
artifact-driven producer's rows survive a key collision in Part 03.

Libraries used: none new.

## Step 2.1 — Update the round-robin producer

Modified: `products/map/src/activity/transform/evidence.js`

Three edits inside `transformEvidence`:

```js
import { assertProvenance } from "../provenance.js";

// inside transformEvidence, replace the delete chain:
const { error: deleteError } = await supabase
  .from("evidence")
  .delete()
  .eq("provenance", "synthetic_placeholder");

// replace the insert path:
const errors = [];
if (rows.length > 0) {
  const { error } = await supabase.from("evidence").upsert(rows, {
    onConflict: "artifact_id,skill_id,level_id,marker_text",
    ignoreDuplicates: true,
  });
  if (error) {
    errors.push(error.message);
    return { inserted: 0, skipped, errors };
  }
}
```

Inside `buildRows`, change the row shape:

```js
rows.push({
  artifact_id: artifact.artifact_id,
  skill_id: ev.skill_id,
  level_id: ev.proficiency,
  marker_text: markerText,
  matched: true,
  rationale: "Round-robin placeholder from getdx/evidence.json — not derived from artifact content.",
  provenance: "synthetic_placeholder",
  created_at: ev.observed_at,
});
```

Notes:

- The `rationale` value is now an explanatory sentence, not the literal
  `"synthetic"` marker. The marker role moves to the new `provenance`
  column; the `rationale` column retains its proto-contracted "1-3
  sentence" role per `services/map/proto/map.proto:39` (Part 01 § Step 1.1).
- Round-robin marker text shapes remain free-form (`artifact.metadata.title
  || artifact.metadata.message || \`${ev.skill_id} evidence\``). The
  artifact-driven producer (Part 03) emits canonical marker text from
  the pathway standard. On a key collision with an artifact-interpreted
  row (e.g. a PR titled identically to a canonical marker), the
  orchestrator runs artifact-driven first (Part 03 Step 3.2) so the
  artifact-interpreted row lands first; the round-robin's
  `.upsert(rows, { ignoreDuplicates: true })` then silently drops the
  collision. **The producer's reported `inserted` count therefore
  upper-bounds the actual insert count** when collisions occur; tests
  in Part 02 Step 2.2 assert the upsert *was called*, not that every
  proposed row materialised, which is the correct contract.
- `assertProvenance` is imported and called once with the constant
  before the upsert. Drift-protection (next maintainer renames a
  class) lives in the producer, not in the test.

Verify: `git diff products/map/src/activity/transform/evidence.js` shows
exactly the three edits above plus the import.

## Step 2.2 — Update fixtures and tests

Modified: `products/map/test/activity/transform-evidence.test.js`

Three updates to the existing hand-rolled fake client + assertions:

1. **Recognise `.upsert(rows, options)` instead of `.insert(rows)`.**
   The fake's `evidence` branch becomes:

   ```js
   if (table === "evidence") {
     return {
       delete() {
         return {
           async eq(col, val) {
             deleteCalls.push({ table, col, val });
             return { error: null };
           },
         };
       },
       async upsert(rows, options) {
         insertCalls.push({ table, rows, options });
         return { error: insertError };
       },
     };
   }
   ```

2. **Update the delete assertion.** Replace
   `assert.strictEqual(fake.deleteCalls[0].val, "synthetic")` with
   `assert.strictEqual(fake.deleteCalls[0].col, "provenance")` and
   `assert.strictEqual(fake.deleteCalls[0].val, "synthetic_placeholder")`.

3. **Update the row assertions.** Replace the loop body
   `assert.strictEqual(row.rationale, "synthetic")` with
   `assert.strictEqual(row.provenance, "synthetic_placeholder")` and
   `assert.match(row.rationale, /Round-robin placeholder/)`.

4. **Add an upsert-options assertion in the happy-path test:**

   ```js
   assert.strictEqual(
     fake.insertCalls[0].options?.onConflict,
     "artifact_id,skill_id,level_id,marker_text",
   );
   assert.strictEqual(fake.insertCalls[0].options?.ignoreDuplicates, true);
   ```

Notes:

- The "idempotency" test (`fake.insertCalls.length` after two calls) is
  unchanged in shape; it now asserts `upsert` was called twice.
- The "insert error" test still works — the fake returns `{ error:
  insertError }` from `upsert` instead of `insert`.
- The "empty evidence array" test still works — `upsert` is not called
  when `rows.length === 0`.

Verify: `bun test products/map/test/activity/transform-evidence.test.js`
passes; all six existing cases pass with the new fake + assertions.

## Verification

```text
bun test products/map
```

The wider product suite catches any caller of the round-robin path that
also asserts on the literal `"synthetic"` rationale value. If a downstream
test fixture breaks (e.g. a golden fixture under
`products/map/test/golden/`), update the fixture alongside the producer
change in the same commit.
