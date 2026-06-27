# Plan 1030-a — Proficiency Table Reference Resolution

Implements [design-a](design-a.md). Restructures the two reference-page
proficiency tables to the canonical `Proficiency · Autonomy · Scope` shape;
`reference/yaml-schema/` keeps `Index` as a 4th column.

## Approach

Edit each reference proficiency table in place to match the canonical cell
set at `products/authoring-standards/index.md:82-88`. The `reference/model/`
copy mirrors canonical exactly (3 columns). The `reference/yaml-schema/`
copy is `Proficiency · Index · Autonomy · Scope` (4 columns) — `Index`
stays in its current 2nd-column position, and the `Autonomy`/`Scope` cells
equal canonical byte-for-byte. Proficiency values keep their backticks
(matching canonical and the existing `reference/model/` table). The
Mermaid ordering chain on `reference/model/`, the Behaviour Maturity
table on both pages, and every other section stay untouched. Verify
with `bunx fit-doc build` and the spec's three `grep` round-trips. No
code, no test, no library change — both edits land in one commit.

Libraries used: none.

## Step 1 — `reference/model/index.md` proficiency table

**Modified:** `websites/fit/docs/reference/model/index.md`

Replace lines 74-80 (the `Proficiency · Description` table) with the
canonical 3-column shape. The H3 "### Skill Proficiencies (5 Levels)"
heading and the Mermaid `awareness → … → expert` block above stay
unchanged.

```diff
-| Proficiency    | Description                            |
-| -------------- | -------------------------------------- |
-| `awareness`    | Learning fundamentals, needs guidance  |
-| `foundational` | Applies basics independently           |
-| `working`      | Solid competence, handles ambiguity    |
-| `practitioner` | Deep expertise, leads and mentors      |
-| `expert`       | Authority, shapes direction across org |
+| Proficiency    | Autonomy              | Scope                    |
+| -------------- | --------------------- | ------------------------ |
+| `awareness`    | with guidance         | team                     |
+| `foundational` | with minimal guidance | team                     |
+| `working`      | independently         | team                     |
+| `practitioner` | lead, mentor          | area (2--5 teams)        |
+| `expert`       | define, shape         | business unit / function |
```

Cells are copied byte-for-byte from
`products/authoring-standards/index.md:82-88`.

**Verification:**

- `grep -c "Learning fundamentals" websites/fit/docs/reference/model/index.md` →
  `0`
- `grep -E "with guidance|independently|lead, mentor" websites/fit/docs/reference/model/index.md`
  → matches present

## Step 2 — `reference/yaml-schema/index.md` proficiency table

**Modified:** `websites/fit/docs/reference/yaml-schema/index.md`

Replace lines 43-49 (the `Proficiency · Index · Description` table) with
the canonical cells plus the existing `Index` column in its current 2nd
position. Add backticks to the proficiency values so the page matches
canonical exactly (and matches the `reference/model/` table styled in
Step 1). The H2 "## Skill Proficiencies" heading above stays unchanged.

```diff
-| Proficiency  | Index | Description                            |
-| ------------ | ----- | -------------------------------------- |
-| awareness    | 0     | Learning fundamentals, needs guidance  |
-| foundational | 1     | Applies basics independently           |
-| working      | 2     | Solid competence, handles ambiguity    |
-| practitioner | 3     | Deep expertise, leads and mentors      |
-| expert       | 4     | Authority, shapes direction across org |
+| Proficiency    | Index | Autonomy              | Scope                    |
+| -------------- | ----- | --------------------- | ------------------------ |
+| `awareness`    | 0     | with guidance         | team                     |
+| `foundational` | 1     | with minimal guidance | team                     |
+| `working`      | 2     | independently         | team                     |
+| `practitioner` | 3     | lead, mentor          | area (2--5 teams)        |
+| `expert`       | 4     | define, shape         | business unit / function |
```

`Autonomy`/`Scope` cells are byte-equal to canonical. `Index` values
(0..4) are unchanged from the pre-spec table.

**Verification:**

- `grep -c "Learning fundamentals" websites/fit/docs/reference/yaml-schema/index.md`
  → `0`
- `grep -E "with guidance|independently|lead, mentor" websites/fit/docs/reference/yaml-schema/index.md`
  → matches present
- `grep -E "^\| .?awareness.?\s+\| 0" websites/fit/docs/reference/yaml-schema/index.md`
  → match present (confirms `Index` column preserved in proficiency context —
  spec success criterion 3)

## Step 3 — Build and spec-criteria sweep

No file changes. Baseline first so pre-existing `fit-doc` warnings on
unrelated pages don't poison the regression check, then run the spec's
success-criteria battery:

```sh
# Baseline on origin/main so unrelated build messages can be excluded.
git stash --keep-index --include-untracked
bunx fit-doc build --src=websites/fit --out=dist 2>&1 | tee /tmp/1030-base.log
git stash pop

# After the Step 1+2 edits land:
bunx fit-doc build --src=websites/fit --out=dist 2>&1 | tee /tmp/1030-head.log

# Criterion 1: divergent vocabulary removed.
grep -c "Learning fundamentals" \
  websites/fit/docs/reference/model/index.md \
  websites/fit/docs/reference/yaml-schema/index.md

# Criterion 2 (option a — the path this plan implements): canonical
# autonomy/scope vocabulary present on both files.
grep -cE "with guidance|independently|lead, mentor" \
  websites/fit/docs/reference/model/index.md \
  websites/fit/docs/reference/yaml-schema/index.md

# Criterion 3: yaml-schema proficiency table still carries the Index
# column. Anchor to the proficiency row shape (pipe + backticked
# proficiency + pipe + index digit) so the unrelated Behaviour Maturity
# table — which also has an `Index` column header — cannot satisfy the
# check on its own.
grep -cE '^\| `awareness` +\| 0 ' \
  websites/fit/docs/reference/yaml-schema/index.md
```

**Pass conditions:**

| Spec criterion | Pass condition |
|---|---|
| No `Learning fundamentals` vocabulary | First `grep -c` returns `0` on both files. |
| Canonical autonomy/scope vocabulary present | Second `grep -cE` returns `≥1` on both files (criterion's option (a) — the path this plan implements; option (b) "link to canonical" is not exercised). |
| `yaml-schema` exposes `Index` ordering | Third `grep -cE` returns `≥1` (the anchored regex proves both that the proficiency row exists and that its 2nd column is the `Index` digit). |
| `bunx fit-doc build` succeeds with no broken links | Exit code `0` on the head log; `diff /tmp/1030-base.log /tmp/1030-head.log` shows no new `MSG` lines reporting unresolved partials or links (the spec's "no broken links" condition). |

Spec success criterion 5 (next `cross-page-consistency` review removes
the technical-writer blocker row) clears at the next scheduled
documentation review run — out of scope for this plan; flagged in
Risks below.

## Risks

| Risk | Mitigation |
|---|---|
| Reviewers may flag canonical re-pull as out of scope if the canonical table changes between plan-write and merge. | Step 1/2 cells are pulled from `products/authoring-standards/index.md:82-88` at implementation time, not from this plan; if canonical has drifted by then, the implementer copies the then-current canonical cells (the contract is "match canonical exactly"). |
| Success criterion 5 (technical-writer blocker row removal) is not actioned by this plan. | The clearance event is the next scheduled `cross-page-consistency` review (per design § *Components*, last row). The plan ships only the table edits; criterion 5 closes itself when the technical-writer agent next picks up that review topic on its scheduled cadence. |

## Execution

Single agent, sequential. Recommend `staff-engineer` for traceability with the
spec/design author. Branch: `feat/1030-proficiency-table-reference-docs`.
Commit-message form:
`docs(website): align reference proficiency tables with canonical (1030)`. Steps
1 and 2 land in one commit; Step 3 is the verification sweep before PR push.
Both edits are bounded to a single table on each page (lines 74-80 and 43-49 of
the pre-spec files); no adjacent-section rewrite, no companion test, no library
touch.

— Staff Engineer 🛠️
