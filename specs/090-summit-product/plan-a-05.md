# Plan A — Part 05: Growth alignment & `computeGrowthAlignment` export

## Goal

Ship `fit-summit growth <team>` and publicly export `computeGrowthAlignment` so
Landmark (spec 080) can import it. This is the only part that creates a
cross-product library contract, so the exported signature must match
spec.md:575–584 exactly.

## Inputs

- Spec 090: "Growth Alignment" (spec.md:409–438), "Outcome-Weighted Growth"
  (spec.md:440–475 — outcome weighting lands in Part 07, not here), "Growth
  Logic Export" (spec.md:569–591).
- Part 02's `TeamCoverage`.
- Part 03's `detectRisks` (SPOFs and critical gaps drive impact tiers).
- Part 02's `derivePersonMatrix` — Summit already has each member's current
  skill proficiencies, so candidate ranking uses that matrix directly rather
  than calling libskill's `deriveDevelopmentPath`.
  (`deriveDevelopmentPath({ selfAssessment, targetJob })` is a
  self-assessment-vs-target-job gap analysis, not a "likely growth direction"
  function; it's the wrong tool for Summit's use case.)

## Approach

Growth is a three-step pipeline:

1. **Identify team gaps** — critical gaps, SPOFs, and under-covered skills.
2. **Rank by impact** — critical gap > SPOF reduction > coverage strengthening.
3. **Match candidates** — for each gap, find team members whose next development
   step is close to the gap's required proficiency.

The output is a list of `GrowthRecommendation` per spec.md:577–584. Outcome
weighting is deferred to Part 07, which re-ranks the same list with driver
scores.

## Files Created

### `products/summit/src/aggregation/growth.js`

Pure functions. This file is the one that must export `computeGrowthAlignment`
with the spec.md:577–584 signature:

```js
/**
 * Compute growth recommendations for a team.
 * @param {object} params
 * @param {Array<object>} params.team             roster team members (RosterPerson[])
 * @param {object} params.mapData                 loaded Map data
 * @param {Array<object>} [params.evidence]       optional evidence aggregates
 * @param {Array<object>} [params.driverScores]   optional GetDX driver scores
 * @returns {Array<GrowthRecommendation>}
 */
export function computeGrowthAlignment({ team, mapData, evidence, driverScores }) { ... }
```

Evidence and driverScores are optional and produce driverContext on
recommendations when present (Part 07 is the consumer). In Part 05, Summit never
passes them; they become non-null in Part 07.

#### `computeGrowthAlignment({ team, mapData, evidence?, driverScores? })`

**Error behaviour (public contract).** The function is Summit's one
cross-product library export, so its failure modes must be stable for Landmark
to rely on:

- A `team` entry whose `job.discipline` is not present in `mapData.disciplines`
  → **throws** `GrowthContractError` with code `UNKNOWN_DISCIPLINE` and the
  offending person's email. Silent skipping would hide data quality problems
  from Landmark.
- A `team` entry whose `job.level` is not in `mapData.levels` → throws
  `GrowthContractError` with code `UNKNOWN_LEVEL`.
- A `team` entry whose `job.track` is set but not in `mapData.tracks` → throws
  `GrowthContractError` with code `UNKNOWN_TRACK`.
- An empty `team` array → returns `[]` (no recommendations; not an error). This
  lets Landmark render "no team data" rather than catching an exception for an
  expected empty case.
- `evidence` or `driverScores` both default to `undefined`; when absent, the
  function behaves as if they were empty. Passing `null` explicitly is treated
  the same as `undefined`.

The public error class is exported from the package root:

```js
export class GrowthContractError extends Error {
  constructor(code, message, context) {
    super(message);
    this.code = code;
    this.context = context;
  }
}
```

Algorithm:

1. Resolve each team member into a `PersonMatrix` via `derivePersonMatrix` (Part
   02). The matrix contains the current proficiency per skill, which is the only
   "current state" input growth needs.
2. Compute `coverage` via
   `computeCoverage({ id: "__growth", type: "reporting", members: personMatrices, effectiveFte: ... }, mapData)`.
3. Compute `risks` via `detectRisks({ resolvedTeam, coverage, data: mapData })`.
4. Build a per-person lookup: `Map<email, Map<skillId, proficiency>>` derived
   from each `PersonMatrix.matrix`. Skills not in the matrix map to `null`
   (meaning "not in this person's discipline/track at all").
5. For each skill `s` in `mapData.skills`:
   - Determine the `impact` tier:
     - `"critical"` if `risks.criticalGaps` contains `s`
     - `"spof-reduction"` if `risks.singlePointsOfFailure` contains `s`
     - `"coverage-strengthening"` otherwise, only if the team's
       `coverage.skills[s].maxProficiency` is below expert
     - Skip skills where every team member is already at expert
   - Find candidates: iterate every team member; their current proficiency for
     `s` is `personLookup.get(email).get(skillId)`. Classify each member:
     - current proficiency `null` (skill not in discipline/track) → excluded
     - current proficiency already `≥ working` → excluded (they already
       contribute)
     - current proficiency `foundational` → highest priority candidate
     - current proficiency `awareness` → medium priority candidate
     - current proficiency missing entirely → lowest priority candidate (they'd
       need to start from zero)
   - If `evidence` was passed (Part 07), exclude candidates whose email appears
     in `evidence.get(skillId).practitioners` — they already practice the skill
     and don't need growth help.
   - Sort candidates by proximity (foundational > awareness > missing), then by
     job level ascending (lower levels get priority — earlier in their career,
     more impact).
   - Emit a `GrowthRecommendation` with `skillId`, `impact`, `candidates`, and
     (Part 07) `driverContext`.
6. Sort recommendations: critical first, then SPOF-reduction, then
   coverage-strengthening.

**Why not `deriveDevelopmentPath`?** `libskill.deriveDevelopmentPath` takes
`{ selfAssessment, targetJob }` and returns a ranked list of gaps between the
two. Summit already has every member's current matrix (Part 02's
`PersonMatrix`), so the "where are they now" half is free. Summit also doesn't
have a single "target job" per member — the target is the team's gap skill, not
a whole job. Calling `deriveDevelopmentPath` would require fabricating a
synthetic target job per skill per member, which is strictly more work than the
direct-lookup approach above.

#### `rankCandidates(skillId, team, data): Array<Candidate>`

Separated for testability. Returns candidates sorted by closeness to working+
for the target skill, then by level (lower levels are better candidates because
growth is more impactful at earlier career stages).

### `products/summit/src/commands/growth.js`

Handler flow:

1. Parse `teamId` / `--project`.
2. Load roster, data. Resolve team.
3. `recommendations = computeGrowthAlignment({ team: resolvedTeam.members.map(m => ({ email: m.email, name: m.name, job: m.job })), mapData: data })`.
4. Resolve audience:
   - `engineer` — show only own-team recommendations; strip other teams'
     candidate names.
   - `manager` — full specificity with candidate names.
   - `director` — omit named candidates, show only structural gaps and impact
     tiers.
5. Render via `growthToText` / `growthToJson` / `growthToMarkdown`.

### `products/summit/src/formatters/growth/text.js`

Mirrors the spec.md:418–433 layout:

```
  Growth opportunities aligned with team needs:

  High impact (addresses critical gaps):
    incident_response — Dan (Level II) or Carol (Level III) could develop
    this skill. ...

  Medium impact (reduces single points of failure):
    planning — Alice or Carol could develop this to reduce bus factor.
    ...

  Low impact (strengthens existing coverage):
    task_completion — already well-covered. ...
```

The narrative strings are templated from the recommendation object. When
`--audience director`, replace "Dan or Carol" with "one or more team members at
Level II or above".

### `products/summit/src/formatters/growth/json.js`

Emits the raw `recommendations` array plus the team id. Director scope drops the
`candidates[].email` and `candidates[].name` fields.

### `products/summit/test/growth.test.js`

- Critical gaps rank above SPOFs.
- SPOFs rank above coverage-strengthening.
- Candidates are sorted by proximity (foundational > awareness).
- Candidate exclusion: people at expert already are not listed.
- Director audience removes candidate names.
- Called with only `{ team, mapData }` — no evidence, no driverScores — works
  and returns recommendations without `driverContext`.
- Signature test: `computeGrowthAlignment` accepts the exact parameter names
  from spec.md:577–584 (explicit destructuring assertion).

## Files Modified

### `products/summit/bin/fit-summit.js`

Add `growth` command.

### `products/summit/package.json`

No changes — growth is already covered by `./aggregation` subpath.

### `products/summit/src/aggregation/index.js`

Add `computeGrowthAlignment` and `rankCandidates`.

### `products/summit/src/index.js`

Top-level export. The import path Landmark will use is
`import { computeGrowthAlignment } from "@forwardimpact/summit"` — this must
work:

```js
export { computeGrowthAlignment } from "./aggregation/growth.js";
```

### `products/summit/test/cli.test.js`

Smoke test: `bin/fit-summit.js growth platform --roster … --data …` contains
"Growth opportunities".

## Verification

1. `bun run check` passes.
2. `bun run test` passes with new growth tests.
3. Signature verification:
   `bunx --workspace=@forwardimpact/summit node -e "import('./src/index.js').then(m => console.log(m.computeGrowthAlignment.length))"`
   prints `1` (destructured single-param function).
4. Manual smoke: `bunx fit-summit growth platform --roster … --data …` renders
   three impact sections.
5. `--audience director` omits names.

## Commit

```
feat(summit): add growth alignment command and public computeGrowthAlignment export
```

## Risks

- **Library contract stability.** Once this part ships, Landmark may start
  importing `computeGrowthAlignment`. The signature freeze is serious — changing
  it later is a breaking change for Landmark. Treat this part's signature as a
  contract, not an internal choice.
- **Candidate ranking is opinionated.** "Foundational > awareness" and "lower
  levels > higher levels" are design choices not spelled out in the spec.
  Document them in the JSDoc so contributors can challenge them later.
- **Expert-level exclusion** — A member already at expert for a skill shouldn't
  be a candidate to develop it further. Easy to miss; add a test.
- **Evidence parameter shape leaks Part 07 concern.** The `evidence` and
  `driverScores` parameters are defined here but only consumed in Part 07. Part
  05 implements them as pass-through that silently does nothing when absent;
  Part 07 wires up the full logic. This is deliberate — the signature must be
  stable from Part 05 onward.
- **Multi-discipline teams.** A team with mixed disciplines has different
  candidate pools per discipline (because each member's matrix is computed
  against their own discipline). This falls out naturally from the per-person
  lookup table — the outer loop over `mapData.skills` touches every skill
  regardless of discipline, and each member's own matrix decides whether they
  are a candidate. Just make sure the outer loop does not dedupe candidates
  across disciplines.

## Notes for the implementer

- The signature comes first. Write the test that asserts the exact parameter
  names from spec.md:577–584, then implement.
- Do **not** call `deriveDevelopmentPath` in `computeGrowthAlignment`. Summit
  has all the information it needs in the `PersonMatrix` objects already
  produced by Part 02. `deriveDevelopmentPath` is a "here's your gap to this
  specific job" function, which is not the question growth alignment answers.
- Keep growth.js logic-only. The formatters own the narrative prose; the
  aggregation function returns structured data.
