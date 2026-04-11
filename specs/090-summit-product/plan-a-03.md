# Plan A — Part 03: Structural risk detection & `risks` command

## Goal

Add Summit's second analytical command: `fit-summit risks <team>`.
Implements three structural risk categories from spec.md:261–314:

1. **Single points of failure** — skills where exactly one person holds
   working+.
2. **Critical gaps** — skills the team's discipline/track suggests it
   needs but nobody holds at working+.
3. **Concentration risks** — multiple engineers clustered at the same
   level in the same capability.

All three categories are pure transformations over the `TeamCoverage`
primitive from Part 02 — no new aggregation passes.

## Inputs

- Spec 090: "Structural Risks" (spec.md:261–314), "JSON Output"
  (spec.md:793–807), Empty States (spec.md:704–725).
- Part 02's `TeamCoverage` / `SkillCoverage` / `ResolvedTeam` primitives.
- Discipline skill classification from libskill — specifically
  `getDisciplineSkillIds` and `getSkillTypeForDiscipline`.

## Approach

Risks are derived, not aggregated. Given a `TeamCoverage`, a resolved
team, and Map data, a pure function returns a `TeamRisks` object:

```ts
type TeamRisks = {
  singlePointsOfFailure: Array<{
    skillId: string,
    skillName: string,
    holder: { email?: string, name?: string, proficiency: string, allocation: number },
    severity: "low" | "medium" | "high",
  }>,
  criticalGaps: Array<{
    skillId: string,
    skillName: string,
    capabilityId: string,
    reason: string,
  }>,
  concentrationRisks: Array<{
    capabilityId: string,
    level: string,
    count: number,
    totalMembers: number,
  }>,
};
```

Severity tiers exist so Part 04's what-if diff can highlight risks that
*change* severity (e.g. going from 1.0-allocation holder to
0.4-allocation holder keeps the skill as an SPOF but increases severity).

## Files Created

### `products/summit/src/aggregation/risks.js`

Pure functions:

#### `detectSinglePointsOfFailure(coverage): Array<SingleFailureRisk>`

- Iterates `coverage.skills`.
- A skill qualifies as SPOF when `headcountDepth === 1`.
- Severity:
  - `high` when the single holder is allocated < 0.5
  - `medium` when `0.5 ≤ allocation < 1.0`
  - `low` when `allocation === 1.0` (still a risk, but no partial
    availability amplifier)
- Returns sorted by severity (high first) then skillId.

#### `detectCriticalGaps(resolvedTeam, coverage, data): Array<CriticalGap>`

- "What skills does this team likely need?" is inferred from
  `resolvedTeam.members`' disciplines/tracks:
  - Union of `discipline.coreSkills` and `discipline.supportingSkills`
    across all team disciplines.
  - Plus any skills in capabilities where a track's `skillModifiers` is
    > 0 (imported from `@forwardimpact/libskill/modifiers`
    `expandModifiersToSkills`).
- A skill is a critical gap when it's in the "needed" set AND its
  `headcountDepth === 0` in the team coverage.
- The `reason` string cites the mechanism: `"platform track broad skill
  for software_engineering"` or `"core skill for software_engineering
  discipline"`.
- Returns sorted by skillId.

#### `detectConcentrationRisks(resolvedTeam, coverage, data): Array<ConcentrationRisk>`

- Groups the team by `level.id` (from members' `job.level`).
- For each level with 3+ members:
  - For each capability where all those members have ≥ working in the
    same proficiency: flag as concentration risk with that count.
- The spec example (spec.md:293–296) is "3 of 5 engineers at Level III
  working level in delivery" — so the grouping is (level, capability,
  proficiency).
- Returns sorted by `count` descending.

#### `detectRisks({ resolvedTeam, coverage, data }): TeamRisks`

Orchestrator that calls all three and returns the combined object. Pure
and deterministic.

### `products/summit/src/commands/risks.js`

Handler flow:

1. Parse `teamId` / `--project`.
2. Load roster, resolve team, compute coverage (reuse Part 02 helpers).
3. Call `detectRisks({ resolvedTeam, coverage, data })`.
4. Resolve audience and apply `withAudienceFilter` (Part 02) to strip
   holder names from SPOF output at director scope.
5. Dispatch format: `risksToText`, `risksToJson`, `risksToMarkdown`.

### `products/summit/src/formatters/risks/text.js`

Renders three sections exactly matching spec.md:279–296:

```
  Platform team — structural risks

  Single points of failure:
    planning — only Bob (Level IV) holds working level
    If Bob is unavailable, this capability drops significantly.

  Critical gaps:
    incident_response — no engineer at working level
    The platform track lists incident_response as a broad skill.
    Consider: hiring, cross-training, or borrowing from another team.

  Concentration risks:
    delivery skills — 3 of 5 engineers at Level III working level
```

Use severity to pick color (red/yellow/green). Respect
`--audience director` by replacing names with "one engineer" phrasing.

### `products/summit/src/formatters/risks/json.js`

Output shape matches spec.md:793–807:

```json
{
  "team": "platform",
  "members": 5,
  "singlePoints": [...],
  "criticalGaps": [...],
  "concentrationRisks": [...]
}
```

At director audience, `singlePoints[i].holder` is `{ proficiency, allocation }`
only — `email` and `name` are omitted.

### `products/summit/src/formatters/risks/markdown.js`

Minimal bulleted list rendering for docs snippets.

### `products/summit/test/risks.test.js`

Coverage:

- SPOF detection: fixture with skill held by exactly 1 person at
  working+ → 1 SPOF; 2 holders → 0 SPOFs.
- SPOF severity tiers: 1.0 allocation → low; 0.6 → medium; 0.3 → high.
- Critical gaps: fixture discipline declaring `incident_response` as a
  broad skill + team with 0 holders at working+ → 1 critical gap with
  `reason` citing the discipline.
- Track-specific critical gaps: adding a `platform` track member
  surfaces a different set of gaps than `software_engineering` alone.
- Concentration risks: fixture with 3 Level III engineers in the same
  capability at working → 1 concentration risk with count 3.
- Audience filter: director audience drops holder names from SPOFs.
- Empty team: `detectRisks` on a zero-member team returns empty arrays
  without throwing.

## Files Modified

### `products/summit/bin/fit-summit.js`

Add `risks` to `COMMANDS`, the `commands` array, and the `examples`.

### `products/summit/src/index.js`

Append:

```js
export { detectRisks, detectSinglePointsOfFailure, detectCriticalGaps,
  detectConcentrationRisks } from "./aggregation/risks.js";
```

### `products/summit/src/aggregation/index.js`

Re-export the new functions alongside the Part 02 coverage exports.

### `products/summit/test/cli.test.js`

Smoke test: `bin/fit-summit.js risks platform --roster …` contains the
"Single points of failure" header.

## Verification

1. `bun run check` passes.
2. `bun run test` passes with new risks tests.
3. `bunx fit-summit risks platform --roster … --data …` prints all three
   sections. At least one is populated from the fixture data (if the
   fixture team has no risks the fixture needs expansion, not the
   detector).
4. `--format json` output validates against the shape in spec.md:793–807.
5. `--audience director` output omits holder names.

## Commit

```
feat(summit): add structural risk detection and risks command
```

## Risks

- **Critical gap definition relies on "needed skills" inference.** The
  spec allows some latitude here. This plan anchors on discipline
  core+supporting+broad skills plus track modifiers > 0. Document the
  decision in `risks.js` JSDoc so future contributors understand why
  they might see different gaps than expected.
- **Concentration thresholds are opinionated.** `3+ members at same
  level in same capability` is not specified by the spec; it's inferred
  from the spec.md:293–296 example. Surface the threshold as a constant
  in `risks.js` (`CONCENTRATION_THRESHOLD = 3`) so it can be tuned
  without a refactor.
- **Multi-discipline teams.** A team with mixed disciplines has a
  larger "needed" set — the union. That may produce too many critical
  gaps. Mitigation: when the team has ≥ 2 disciplines, compute per-
  discipline gaps and intersect, rather than unioning. Decide at
  implementation time based on fixture realism; document whichever
  approach wins.
- **Concentration risk false positives.** A team of 3 all at the same
  level and proficiency is a concentration risk, but also the only
  coverage. The detector must flag it as concentration; it's already
  a SPOF via a different rule — that's fine, overlapping risks are a
  feature not a bug.

## Notes for the implementer

- SPOF vs critical gap vs concentration are mutually non-exclusive. A
  skill can appear in multiple sections.
- Do not add severity to critical gaps — the spec treats them as
  binary. Part 07's `--evidenced` flag can re-assess severity, but
  that's a later-plan concern.
- Keep risks.js dependency-light — only `coverage.js`, `depth.js`,
  and libskill modifiers. No formatters, no I/O.
