# Plan 0640 Part 05 — Matrix audit and conditional collapse

Audit the three files the spec names for collapsible combinatorial
matrices. Collapse matrices the audit confirms exercise a single
implementation path. Verifies spec § Success Criterion 4.

The spec asserted these three files "cross-multiply
proficiency × modifier / maturity matrices". A planner-time read of the
files on `main` (`libraries/libskill/test/modifiers.test.js`,
`libraries/libskill/test/policies-predicates.test.js`,
`tests/model-types.test.js`) found flat per-function `describe`+`test`
blocks with internal `for (const x of …)` loops already wrapped in
single `test()` calls — i.e., already collapsed-style. The audit may
therefore find no genuine matrices to collapse, in which case the
audit table itself is the SC4 evidence and the part ships no test
changes. The audit may also find that what looks like flat
`describe`+`test` is hiding a parametric multiplication (the same case
shape duplicated across multiple `test()` blocks where one parametric
case plus a property check would cover the same surface); in that case
the collapse follows Step 2's recipe.

## Step 1 — Audit the three files

Created: `specs/0640-refactor-test-suite/plan-a-05-audit.md` (a working
note that lands with the implementation PR).

For each named file, read the production module under test and the
test file. Per top-level `describe` block, record:

```
| describe | function under test | case count | parametric over | real branches | disposition |
|---|---|---|---|---|---|
| isCapability | isCapability(key) | N | valid Capability values | none — single path | collapse to 2 boundary cases + 1 property check |
| getSkillsByCapability | getSkillsByCapability({skills, capability}) | N | capability × skills shape | (capability missing / present) | keep representative per branch |
| ... |
```

Production modules to walk:

- `libraries/libskill/src/modifiers.js` — exports `isCapability`,
  `getSkillsByCapability`, `buildCapabilityToSkillsMap`,
  `expandModifiersToSkills`, `extractCapabilityModifiers`,
  `extractSkillModifiers`, `resolveSkillModifier` (the spec's
  "modifier" surface is one of these, not a separately-named
  `applyModifier`).
- `libraries/libskill/src/policies/predicates.js` — exports `isAny`,
  `isNone`, `isCore`, `isSupporting`, `isHumanOnly`, `isAgentEligible`,
  `isBroad`, `isTrack`, `isDeep`, `isBreadth`, `hasMinLevel`,
  `hasLevel`, `hasBelowLevel`, `isInCapability`, `isInAnyCapability`,
  `allOf`, `anyOf`, `not` (the spec's "predicate" surface).
- Imports of `tests/model-types.test.js` —
  `@forwardimpact/map/levels` (`getSkillProficiencyIndex`,
  `clampSkillProficiency`, etc.) and `@forwardimpact/libskill`
  (`compareByCapability`, `deriveResponsibilities`, `deriveJob`).

The audit row for each `describe` block records:

- **Case count**: the number of `test()` (or `it()`) calls within the block.
- **Parametric axes**: input dimensions varied across cases.
- **Real branches**: switch/if branches in the function under test
  reached by those axes (walk the production source to confirm).
- **Disposition**: `collapse` (single implementation path → boundary +
  property), `keep` (real branches), or `out-of-scope` (function does
  not match the spec's "combinatorial matrix" framing).

Verification: the audit file lists every top-level `describe` block in
the three files with the four fields above.

## Step 2 — Collapse the rows the audit marks `collapse`

Modified: each test file with at least one `collapse`-disposition row.

For each row marked `collapse`, replace the block's contents with one
representative boundary case per parametric axis plus one property
check. Property checks are **hand-rolled with a seeded deterministic
input list**, not `Math.random()` — flake-free is the explicit
criterion (a flaky test directly violates spec SC4's "no loss of
covered code paths"). Pattern:

```js
// Example shape — actual function names and axes come from the audit.
import { test, describe } from "node:test";
import assert from "node:assert";
import { isCapability } from "../src/modifiers.js";
import { Capability } from "@forwardimpact/map/levels";

describe("isCapability", () => {
  // Boundary cases
  test("returns true for the smallest valid capability token", () => {
    assert.strictEqual(isCapability(Object.values(Capability)[0]), true);
  });
  test("returns false for the empty string", () => {
    assert.strictEqual(isCapability(""), false);
  });

  // Deterministic property check over a fixed input list.
  test("returns true for every value in Capability and false for arbitrary skill IDs", () => {
    for (const cap of Object.values(Capability)) {
      assert.strictEqual(isCapability(cap), true);
    }
    for (const id of ["coding", "testing", "architecture", "monitoring"]) {
      assert.strictEqual(isCapability(id), false);
    }
  });
});
```

The property loop iterates a **fixed list** of inputs from the
production module's own canonical set (e.g. `Object.values(Capability)`
or a hand-listed boundary set), not a random sample. This both keeps
the test deterministic and grounds the input domain in the production
contract.

No new dependency. Per [design Open Question 2 default], property
checks are hand-rolled — no `fast-check`.

Verification per touched file: `bun test <file>` reports `0 fail`;
`bun test --coverage <library>` shows per-function covered-line counts
on the source module that are equal or higher than pre-collapse. If a
function loses coverage, revert that block's collapse and re-classify
its audit row as `keep`.

## Step 3 — Coordinate with part 04's allow-list

If the collapse in Step 2 drops a file below 400 LOC, regenerate part
04's seed (`node scripts/check-oversized-tests.mjs --seed >
scripts/check-oversized-tests.allow.json`) on this part's branch
**only if part 04 has already merged**; otherwise leave the seed alone
— part 04's implementer regenerates the seed at part 04's
implementation time (see [plan-a-04 § Coordination](plan-a-04-file-splits.md)).
No same-commit cleanup is required.

Verification: if part 04 has merged when this part lands, `bun run
invariants:check-oversized-tests` exits zero on the branch HEAD; if
not, that invariant runs against part 04's existing seed and exits
zero by construction.

## Step 4 — Run the guard chain

`bun run check` end-to-end. `bun test` whole-suite reports `0 fail`.

## Verification — spec § Success Criteria covered

| # | Criterion | This part |
|---|---|---|
| 4 | Combinatorial matrices collapsed (where the audit finds any); audit evidence stands either way | Steps 1–2 |
| 6 | Full suite green | Step 4 |

— Staff Engineer 🛠️
