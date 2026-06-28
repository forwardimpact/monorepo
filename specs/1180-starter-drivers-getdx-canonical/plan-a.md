# plan-a(1180): Starter drivers canonical to GetDX + health view empty-vs-no-match split

Concrete execution plan for [design-a(1180)](design-a.md). Six components
(C1–C6 in the design) ship in one feat PR on a single branch.

## Approach

One bundled PR. The spec's user-visible problem only resolves when both halves
land — criterion 3 (zero `Unknown item_id` on the clean-install path) needs
the starter change; criterion 4 (three distinct stdout states) needs the
landmark change. Sequencing across two PRs would leave `main` in a half-fixed
state for hours-to-days (starter fixed, formatter still saying `Drivers (0)`
for legacy consumers — or vice versa). The diff is bounded (~80 starter lines,
~150 landmark lines, plus tests) and the two halves are already isolated by
package boundary inside the diff, so review remains tractable.

## Steps

### Step 1: Export `ALL_DRIVERS` (C4)

One-line visibility change so the equality test can import the canonical
constant.

- **Modified**: `libraries/libsyntheticgen/src/engine/activity.js`
- Change line 13 from `const ALL_DRIVERS = [` to `export const ALL_DRIVERS = [`.
- **Verify**: `bun test libraries/libsyntheticgen/` — green, no behavioural
  change.

### Step 2: Replace starter `drivers.yaml` (C1)

Replace the 3-entry list with 16 entries whose ids equal the exported
`ALL_DRIVERS`.

- **Modified**: `products/map/starter/drivers.yaml`
- Keep the `# yaml-language-server: $schema=…` header line unchanged.
- Each entry carries `id`, `name`, `description`. **Omit**
  `contributingSkills` and `contributingBehaviours` (design § Reference
  arrays — this exercises the design's relaxation of spec § Scope row 1's
  "carry the existing reference arrays" phrasing, which the design
  explicitly addressed). Driver order follows `ALL_DRIVERS` order to make
  set-equality visual review obvious.
- `name` is the snake-case id with each underscore-separated token
  capitalized (`clear_direction` → `Clear Direction`). `description` is a
  single concise sentence on the outcome (e.g. `clear_direction` → "Teams
  know what to build and why."). Per-driver description copy quality is
  plan-level wording bounded by spec § Out of scope row 2.
- **Verify**: from a tmpdir, run `bunx fit-map init` then `bunx fit-map
  validate` in that dir. Expect exit 0 with zero `INVALID_REFERENCE` errors
  and zero `MISSING_OPTIONAL` warnings on the 16 driver entries (every
  entry has a description per the rule above).

### Step 3: Add starter `README.md` (C2)

Document GetDX as the canonical DX vendor.

- **Created**: `products/map/starter/README.md`
- Single short markdown file:

  ```markdown
  # Starter standard

  This starter is opinionated. It encodes **GetDX** as the canonical DX
  vendor, so `drivers.yaml` mirrors the 16-id GetDX taxonomy used by
  `libsyntheticgen` to seed synthetic snapshot scores.

  Edit any file under this directory to match your organization. To re-seed
  a clean copy, remove the file and re-run `npx fit-map init`.
  ```

- **Verify**: file lands in user installs at `data/pathway/README.md` after
  `npx fit-map init` (covered by `init.test.js` directory-non-empty check;
  no new assertion needed).

### Step 4: Add equality test (C3)

Anchor spec criterion 1 in CI.

- **Created**: `products/map/test/getdx-driver-ids.test.js`
- Loads starter `drivers.yaml` via `node:fs` + the `yaml` package (already a
  map dependency) and imports `ALL_DRIVERS` from
  `@forwardimpact/libsyntheticgen/engine/activity` (already in map's
  `devDependencies`).
- Asserts `new Set(starterIds)` equals `new Set(ALL_DRIVERS)` and both sets
  have size 16. Uses `node:test` + `node:assert/strict` to match the
  surrounding test style.
- **Verify**: `bun test products/map/test/getdx-driver-ids.test.js` green
  after Step 2; fails if either side drifts.

### Step 5: Add `view.driverJoin` diagnostic (C5)

Detect the three join states once in `runHealthCommand`.

- **Modified**: `products/landmark/src/commands/health.js`
- Insert the block **immediately after `attachComments(drivers,
  allComments)` (line 85) and before `meta.warnings = [...new
  Set(meta.warnings)]` (line 88)**:

  ```js
  const yamlIds = (mapData.drivers ?? []).length;
  const scoreIds = new Set(scores.map((s) => s.item_id)).size;
  const matched = drivers.length;
  let state = null;
  if (yamlIds === 0) state = "NO_DRIVERS";
  else if (scoreIds > 0 && matched === 0) state = "NO_MATCH";
  else if (matched > 0) state = "MATCHED";
  // else: yamlIds > 0 && scoreIds === 0 — design says fall through to
  // existing "no rows" rendering; leave state null so the formatter does
  // not branch.
  const driverJoin = { state, yamlIds, scoreIds, matched };
  ```

  This mirrors design § Health view join states exactly: `MATCHED`
  requires `matched > 0`; `NO_MATCH` requires `scoreIds > 0 && matched ===
  0`; the residual case (drivers configured but no team-scoped scores)
  produces `state: null` and falls through unchanged.
- Add `driverJoin` to the returned `view` object (alongside `drivers`,
  `summitAvailable`, etc.).
- `meta.warnings.push("Unknown item_id …")` at line 157-159 stays unchanged
  (design § Health view join states, final paragraph).
- **Verify**: `bun test products/landmark/test/health.test.js` — existing
  tests still pass (the diagnostic adds a field, does not alter existing
  shape); add four new test cases in Step 7.

### Step 6: Formatter dispatch on `driverJoin.state` (C6)

Branch text, markdown, and verbose paths on the new state. JSON path is
already covered because `toJson` spreads `view` (including `driverJoin`).

- **Modified**: `products/landmark/src/formatters/health.js`
- Add two small renderers shared by default and verbose modes:

  ```js
  function noDriversText() {
    return [
      "  Drivers (no drivers configured)",
      "  `data/pathway/drivers.yaml` is empty. Run `npx fit-map init` to",
      "  seed the 16-driver starter, then re-run.",
    ];
  }
  function noMatchText(driverJoin) {
    const { scoreIds, yamlIds } = driverJoin;
    return [
      "  Drivers (no matches)",
      `  Snapshot has ${scoreIds} driver ids, your \`data/pathway/drivers.yaml\` declares ${yamlIds}; none overlap.`,
      "  Edit `data/pathway/drivers.yaml` to align with the GetDX taxonomy",
      "  (`npx fit-map init` resets it).",
    ];
  }
  ```

  Mirror with `noDriversMarkdown(view)` / `noMatchMarkdown(view)` for the
  markdown path. The final wording above is the plan's commitment (design §
  Out-of-design row 1 deferred to plan).
- In `toText` (line 288) and `toMarkdown` (line 309), insert the
  NO_DRIVERS / NO_MATCH branches **immediately after the header push and
  blank line, returning early before `dedupeRecommendations` runs and
  before any default/verbose rendering**:

  ```js
  if (view.driverJoin?.state === "NO_DRIVERS") {
    lines.push(...noDriversText());
    return lines.join("\n");
  }
  if (view.driverJoin?.state === "NO_MATCH") {
    lines.push(...noMatchText(view.driverJoin));
    return lines.join("\n");
  }
  ```

  `state: null` (residual fall-through) and `state: "MATCHED"` both
  continue into the existing default/verbose branches; `meta.warnings`
  surfacing is unchanged (today's formatters do not render `meta.warnings`
  — they are written by the CLI dispatcher to stderr, so the early
  returns do not lose warnings).
- In `renderTextDriver` (the `Contributing skills:` push at line 159 and
  `Evidence:` push at line 160) and `renderMdDriver` (the matching pushes
  at lines 203 and 204), guard both pushes on
  `driver.contributingSkills.length > 0`:

  ```js
  if (driver.contributingSkills.length > 0) {
    lines.push(`      Contributing skills: ${formatSkillNames(driver)}`);
    lines.push(`      Evidence: ${formatEvidenceParts(driver)}`);
  }
  ```

  This is a real change for any driver with empty `contributingSkills` —
  including all 16 new starter drivers in the MATCHED path. Existing
  `health-formatter.test.js` cases pass because `makeDriver()` seeds
  non-empty arrays; new tests in Step 7 cover the empty-array path.
- **Verify**: `bun test products/landmark/test/health-formatter.test.js` —
  existing tests use `makeDriver()` with non-empty contributingSkills so the
  guard does not fire on them. New cases added in Step 7.

### Step 7: New landmark health test cases

Cover the four join states and the suppression guard.

- **Modified**: `products/landmark/test/health.test.js`
- Add four cases inside `describe("health command")`:
  - `NO_DRIVERS` — `mapData` with `drivers: []`, any scores; assert
    `result.view.driverJoin.state === "NO_DRIVERS"`.
  - `NO_MATCH` — `MAP_DATA` (which has `quality`, `reliability`) with scores
    whose `item_id` values are all outside that set; assert
    `result.view.driverJoin.state === "NO_MATCH"` and
    `result.view.driverJoin.matched === 0`.
  - `MATCHED` — existing `SCORES` (one row with `item_id: "quality"`);
    assert `result.view.driverJoin.state === "MATCHED"` and `matched === 1`.
  - `state: null` residual — `MAP_DATA` with empty `scores: []`; assert
    `result.view.driverJoin.state === null` and the existing
    `Drivers (0)` rendering still applies in Step 6's formatter.
- **Modified**: `products/landmark/test/health-formatter.test.js`
- Add three formatter cases:
  - `toText` with `driverJoin.state === "NO_DRIVERS"` — output contains
    `Drivers (no drivers configured)` and the `fit-map init` hint; does not
    contain the column header `Drivers (`.
  - `toText` with `driverJoin.state === "NO_MATCH"` and `scoreIds: 3,
    yamlIds: 2` — output contains `Drivers (no matches)` and "Snapshot has
    3 driver ids, your `data/pathway/drivers.yaml` declares 2".
  - `toText` verbose with a driver whose `contributingSkills: []` — output
    does NOT contain `Contributing skills:` or `Evidence:` lines for that
    driver.
- **Verify**: `bun test products/landmark/` green.

### Step 8: Run full local CI

Catch cross-package breakage before push.

- `bun run check` — type, lint, format, JSDoc, context.
- `bun test` — full repo test suite.
- **Verify**: zero failures. A failure in
  `products/landmark/test/snapshot.test.js` or any other snapshot consumer
  signals that the new `view.driverJoin` field is not being treated as additive
  — investigate before push.

### Step 9: End-to-end clean-install verification (spec criteria 3 + 5)

Exercise the documented user pipeline that the spec's criteria 3 and 5
anchor on. This is the criterion-3 verification verbatim and provides the
criterion-5 idempotency proof against user-modified content.

- In a fresh tmpdir, run `bunx fit-map init` → `bunx fit-terrain build`
  (against the canonical BioNova or successor seed) → `bunx fit-landmark
  health --manager <seeded-manager> 2>warnings.txt`. **Verify**: `wc -l
  warnings.txt` is 0 and the stdout `Drivers` section renders the matched
  table (not the NO_DRIVERS or NO_MATCH copy).
- Then edit the resulting `data/pathway/drivers.yaml` (e.g. change a `name`
  field), re-run `bunx fit-map init`, and confirm the edit is preserved
  byte-for-byte. **Verify**: `diff` between before/after shows no change to
  `drivers.yaml`.
- Record the actual stderr line count and any unexpected stdout shape in
  the PR body so the reviewer can re-execute if needed.

## Libraries used

Libraries used: `yaml` — already declared in `products/map/package.json`
`dependencies`. Test files use `node:test` + `node:assert/strict` built-ins.
No new workspace dependencies.

## Risks

- **Reference-array omission cascades.** Step 2 omits
  `contributingSkills`/`contributingBehaviours` on all 16 entries. Any
  current downstream consumer (e.g. another `bun test` somewhere in the
  repo) that loads starter `drivers.yaml` and expects non-empty arrays will
  see a behaviour change. Mitigation: Step 8 full `bun test` surfaces this;
  the only known consumer-of-loaded-starter path is `fit-map init` (a copy
  call) and `bunx fit-map validate` (covered).
- **Summit recommendations suppressed on the MATCHED path.** With
  `contributingSkills: []` on every new starter driver,
  `health.js:285`'s `d.contributingSkills.some((s) => s.skillId ===
  rec.skill)` returns false for every driver, so the Recommendations
  trailer of `Drivers (16)` will never populate from Summit on the clean
  install. The design's "Consequence (criterion 4 still holds, but is in
  tension)" paragraph acknowledges this; the follow-on spec authoring
  per-driver skill mappings is the unblock. No action this plan beyond
  surfacing it here.
- **JSON consumers branching on absent fields.** Any external consumer of
  `toJson` output that already keys on `view.drivers.length === 0` will see
  the same `0` plus a new `view.driverJoin` field. The field is additive;
  consumers ignoring unknown keys are unaffected. Mitigation: the design
  carries this field as additive and the formatter only branches on it
  when state is `NO_DRIVERS` or `NO_MATCH`.
- **`data/synthetic/story.dsl § standard.drivers` drift.** The DSL block
  mirrors `ALL_DRIVERS` today but is declarative-only (spec § Out of scope
  row 1). No action this plan; flagged so the implementer does not
  accidentally edit the DSL while updating the constant.

## Execution

`staff-engineer`, single sequential pass through Steps 1–9.

— Staff Engineer 🛠️
