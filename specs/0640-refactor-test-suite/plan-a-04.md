# Plan 0640-a Part 04 — collapse combinatorial matrices

Implements spec § C (parametrization) and design Decision 6, Open Q2.
Independently executable; **owns `tests/model-types.test.js`** (resolves the
Part 03 overlap).

Libraries used: none (hand-rolled property loops per Open Q2 default; do not
admit `fast-check`).

## Audit-then-collapse rule (applies to every step)

Before collapsing, confirm the matrix exercises a **single implementation path**
(Decision 6). Where it does, replace the cross-multiplied cases with: the
boundary cases (min/max/just-over/just-under of each ordered axis) plus **one**
hand-rolled property loop asserting the invariant across the full axis. Where an
axis is a genuine branch (distinct code path per value), keep those as discrete
cases — do not fold a real branch into the property loop. No coverage loss: the
targeted functions' branch coverage is unchanged.

## Step 1 — `libskill/test/modifiers.test.js`

- Modified: `libraries/libskill/test/modifiers.test.js`

Audit the `for (const cap of Object.values(Capability))` enumerations
(lines 35, 124, 147, 156) and the capability × modifier expansion tests. Each
loop that asserts one invariant over every capability is the property check —
keep one such loop per invariant and add explicit boundary cases (a capability
with skills, one with none, an unrecognized key). Collapse repeated per-value
`test(...)` blocks that assert the same shape into the property loop.

Verify: `bun test libraries/libskill/test/modifiers.test.js`; case count drops,
suite green.

## Step 2 — `libskill/test/policies-predicates.test.js`

- Modified: `libraries/libskill/test/policies-predicates.test.js`

Audit the level-ordered predicates (`hasMinLevel`, `hasLevel`,
`hasBelowLevel` — lines 159–250) where each cross-multiplies a level against the
ordered level set. Collapse each to boundary cases (at-threshold, one-below,
one-above, the `below awareness` floor already present at line 242) plus one
property loop asserting monotonicity across the level order. Leave the discrete
predicate describes (`isAny`/`isNone`/`isCore`/… ) as-is — they test distinct
branches, not a matrix.

Verify: `bun test libraries/libskill/test/policies-predicates.test.js`.

## Step 3 — `tests/model-types.test.js` (audit decides disposition)

- Modified: `tests/model-types.test.js`

Audit first. Inspection shows this file is broad **per-helper** coverage
(`getSkillProficiencyIndex`, `clampSkillProficiency`,
`skillProficiencyMeetsRequirement`, capability/emoji helpers, `deriveJob`, …),
not a single cross-multiply. Two dispositions:

- If the per-helper tests are discrete (no cross-multiplied matrix), this is a
  **large-file split**, not a matrix collapse: split by behaviour family under
  the 400-LOC ceiling (Type Helpers / Capability Functions / emoji / derive*)
  per Part 03's split rule, since the file is 448 LOC.
- Collapse only the genuinely cross-multiplied sections (e.g. the
  proficiency/maturity `MeetsRequirement` ordered comparisons) to boundary +
  one property loop, the same as Steps 1–2.

Verify: `bun test tests/model-types.test.js`; resulting file(s) ≤400 LOC; suite
green.

## Step 4 — Part verification

Run `bun run check` and
`bun test libraries/libskill tests/model-types.test.js`. Confirms SC4 (matrices
replaced by boundary + property with unchanged covered paths) and, for Step 3's
split disposition, contributes to SC5.
