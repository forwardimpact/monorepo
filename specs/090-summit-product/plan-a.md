# Plan A — Summit Product (spec 090)

## Status

Draft plan for spec 090 (`specs/090-summit-product/spec.md`). The spec is
currently `draft` in `specs/STATUS`. This plan translates the approved spec
content into an execution-ready implementation sequence; advancing the status to
`planned` is the product-manager's call once both spec content and this plan
have been approved.

## Approach

Summit is a new CLI-only product that sits beside Pathway and consumes the same
infrastructure (Map data loader, libskill derivation, libcli framing). The spec
is large (970 lines, 8 commands, multiple optional integrations, a library
export for Landmark), so the plan is **decomposed into 8 parts** that land as
sequential commits. Each part produces a working milestone:

- **Part 01** ships a package that can parse rosters and answer "what does
  Summit see?" (`roster`, `validate`).
- **Part 02** makes Summit useful for the first time (`coverage`).
- **Parts 03–06** add the remaining analytical commands (`risks`, `what-if`,
  `growth`, `compare`, `trajectory`) on top of the Part 02 aggregation core.
- **Part 07** layers on the optional `--evidenced` and `--outcomes` integrations
  that read Map's activity schema through Supabase.
- **Part 08** completes the documentation, examples, release readiness, and
  STATUS advancement.

The overall strategy is **core first, then commands, then optional layers, then
docs.** Coverage (Part 02) is the foundational primitive — every other command
reduces to "aggregate, then transform". Defer evidence/outcomes until after all
deterministic commands work so the activity-layer integration lands as a clean
cross-cut rather than intermingled with core logic.

## Scope

This plan covers everything the spec lists under **"New work Summit must
implement"** (spec.md:910–919):

| Component                 | Lands in |
| ------------------------- | -------- |
| Roster loader             | Part 01  |
| Team aggregation logic    | Part 02  |
| Risk detection            | Part 03  |
| What-if simulation        | Part 04  |
| Growth alignment + export | Part 05  |
| Compare                   | Part 06  |
| Trajectory tracking       | Part 06  |
| Evidence integration      | Part 07  |
| Outcome weighting         | Part 07  |
| Docs / release readiness  | Part 08  |

Out of scope (explicitly deferred to other specs):

- Writing evidence rows — Guide's responsibility (mentioned in the spec's
  prerequisites as "Guide can interpret artifacts independently of Summit").
- Historical roster snapshots in Map's activity schema — Summit reads from git
  history only in this plan. A future spec can add
  `activity.organization_people_history` and a matching query module.
- Spec 080 (Landmark) — Landmark imports `computeGrowthAlignment` from Summit,
  but Summit ships without Landmark as a consumer.

## Non-negotiables

- **Follow spec 390 package layout** (`products/summit/` with only the allowed
  root subdirectories: `bin/`, `config/`, `src/`, `starter/`, `test/`,
  `templates/`). `bun run layout` and `bun run check:exports` must pass after
  every part.
- **No network calls in core.** `fit-summit coverage`, `risks`, `what-if`,
  `growth`, `compare`, `roster`, `validate` run entirely from local YAML or
  pre-loaded Map data. Only `--evidenced`, `--outcomes`, and the "read roster
  from Map" code path may open a Supabase connection, and all three must degrade
  gracefully when that connection is unavailable.
- **OO+DI.** Follow the libraries-and-products architecture rule in CLAUDE.md:
  classes accept collaborators through constructors, factory functions wire real
  implementations, tests inject mocks directly. The one exception is pure
  stateless math modules (the aggregation primitives) which may export pure
  functions.
- **Determinism.** Same inputs always produce the same output. No `Date.now()`
  in analytical code paths; the trajectory view reads the clock only to compute
  "quarters ago" from a commit timestamp.
- **Privacy model.** Every command honours the audience model from
  spec.md:75–87. Part 02 introduces the `--audience` flag and the
  `withAudienceFilter()` helper, and every subsequent part feeds outputs through
  it before rendering. **Plan-level elaboration:** the spec's CLI options table
  (spec.md:746–754) does not list `--audience`. The spec describes the audience
  model descriptively (per-view table, spec.md:77–82) without prescribing how a
  user selects their audience. This plan proposes
  `--audience <engineer|manager|director>` as the explicit mechanism because (a)
  it's the simplest reversible choice, (b) it keeps the privacy decision
  per-invocation rather than baking it into an install-time config, and (c)
  director-scope outputs are a common enough need to deserve a first-class flag.
  Default audience is `manager`. If the spec evolves to prefer a config-file
  approach, Part 02 is the single place that needs to change.

## Data Model

Summit works with a handful of structures that recur across parts. They are
introduced in Part 01/02 and consumed unchanged by every later part.

```ts
// roster.js — Part 01
type RosterPerson = {
  name: string,
  email: string,
  job: { discipline: string, level: string, track?: string },
  allocation?: number, // project teams only; defaults to 1.0
};

type RosterTeam = {
  id: string,
  type: "reporting" | "project",
  members: RosterPerson[],
};

type Roster = {
  source: "map" | "yaml",
  teams: Map<string, RosterTeam>,
  projects: Map<string, RosterTeam>,
};

// aggregation.js — Part 02
type PersonMatrix = {
  email: string,
  name: string,
  job: RosterPerson["job"],
  allocation: number,
  matrix: SkillMatrixEntry[], // from libskill deriveSkillMatrix
};

type SkillCoverage = {
  skillId: string,
  skillName: string,
  capabilityId: string,
  headcountDepth: number,       // count of people at working+
  effectiveDepth: number,       // allocation-weighted depth
  maxProficiency: string,       // highest proficiency held
  distribution: Record<string, number>, // proficiency → count
  holders: Array<{ email: string, proficiency: string, allocation: number }>,
};

type TeamCoverage = {
  teamId: string,
  teamType: "reporting" | "project",
  memberCount: number,
  effectiveFte: number,
  managerEmail: string | null, // for Map-sourced reporting teams only
  capabilities: Map<string, CapabilityCoverage>,
  skills: Map<string, SkillCoverage>,
};

// risks.js — Part 03
type TeamRisks = {
  singlePointsOfFailure: SkillCoverage[],
  criticalGaps: SkillCoverage[],
  concentrationRisks: Array<{ capabilityId: string, level: string, count: number }>,
};

// what-if.js — Part 04
type Scenario = {
  type: "add" | "remove" | "move" | "promote",
  // ... mutation parameters
};

type ScenarioDiff = {
  before: TeamCoverage,
  after: TeamCoverage,
  beforeRisks: TeamRisks,
  afterRisks: TeamRisks,
  capabilityChanges: Array<{ skillId: string, before: number, after: number }>,
  riskChanges: { added: RiskRef[], removed: RiskRef[] },
};

// growth.js — Part 05 (also exported publicly)
type GrowthRecommendation = {
  skillId: string,
  impact: "critical" | "spof-reduction" | "coverage-strengthening",
  candidates: Array<{ email?: string, name?: string, currentLevel: string, targetLevel: string }>,
  driverContext?: { driverId: string, percentile: number, vsOrg: number },
};
```

The key insight: every command is "compute `TeamCoverage`, then answer a
question about it". Part 02 makes this the core primitive; later parts are thin
transformers on top.

## Package Layout

```
products/summit/
├── package.json             Part 01
├── justfile                 Part 01 (optional local tasks)
├── bin/
│   └── fit-summit.js        Part 01 (CLI entry, grown across parts)
├── config/                  (none — Summit has no runtime config)
├── src/
│   ├── index.js             Part 01 (package exports)
│   ├── aggregation/
│   │   ├── index.js         Part 02 (public aggregation surface)
│   │   ├── coverage.js      Part 02
│   │   ├── risks.js         Part 03
│   │   ├── what-if.js       Part 04
│   │   ├── growth.js        Part 05
│   │   ├── compare.js       Part 06
│   │   └── trajectory.js    Part 06
│   ├── roster/
│   │   ├── index.js         Part 01 (barrel)
│   │   ├── yaml.js          Part 01 (parses summit.yaml)
│   │   ├── map.js           Part 01 (reads from Map activity)
│   │   ├── schema.js        Part 01 (validation)
│   │   └── loader.js        Part 01 (orchestrates yaml + map sources)
│   ├── evidence/
│   │   ├── index.js         Part 07
│   │   └── client.js        Part 07 (thin wrapper over Map queries)
│   ├── outcomes/
│   │   ├── index.js         Part 07
│   │   └── drivers.js       Part 07 (match skills → drivers)
│   ├── git/
│   │   └── history.js       Part 06 (git log/show wrapper)
│   ├── commands/
│   │   ├── coverage.js      Part 02
│   │   ├── risks.js         Part 03
│   │   ├── what-if.js       Part 04
│   │   ├── growth.js        Part 05
│   │   ├── compare.js       Part 06
│   │   ├── trajectory.js    Part 06
│   │   ├── roster.js        Part 01
│   │   └── validate.js      Part 01
│   ├── formatters/
│   │   ├── index.js         Part 02
│   │   ├── shared.js        Part 02 (bars, tables, colors)
│   │   ├── coverage/
│   │   │   ├── text.js      Part 02
│   │   │   └── json.js      Part 02
│   │   ├── risks/           Part 03
│   │   ├── what-if/         Part 04
│   │   ├── growth/          Part 05
│   │   ├── compare/         Part 06
│   │   ├── trajectory/      Part 06
│   │   └── roster/          Part 01
│   └── lib/
│       ├── audience.js      Part 02 (privacy filters)
│       ├── proficiency.js   Part 02 (working+ predicate, re-exports)
│       ├── cli.js           Part 01 (shared CLI wiring)
│       └── supabase.js      Part 01 (Supabase client factory — used
│                            by Map-sourced roster from day one; Part
│                            07 adds new callers but not a new client)
├── starter/
│   └── summit.example.yaml  Part 01 (example roster in spec format)
├── templates/               (none — Summit renders inline)
└── test/
    ├── roster.test.js       Part 01
    ├── coverage.test.js     Part 02
    ├── risks.test.js        Part 03
    ├── what-if.test.js      Part 04
    ├── growth.test.js       Part 05
    ├── compare.test.js      Part 06
    ├── trajectory.test.js   Part 06
    ├── evidence.test.js     Part 07
    ├── outcomes.test.js     Part 07
    ├── cli.test.js          Part 02 (grown across parts)
    └── fixtures/
        ├── roster.yaml
        └── map-data/        (minimal Map data: 3 skills, 2 capabilities,
                              1 discipline, 2 tracks, 2 levels — mirrors
                              the starter)
```

## Key Dependencies

All dependencies are first-party except `yaml` (shared with Pathway/Map) and
`@supabase/supabase-js` (shared with Map). Resolve versions to the latest
published releases at implementation time.

```json
{
  "dependencies": {
    "@forwardimpact/map": "^0.15.18",
    "@forwardimpact/libskill": "^4.0.0",
    "@forwardimpact/libcli": "^0.1.0",
    "@forwardimpact/libutil": "^0.1.64",
    "@forwardimpact/libtelemetry": "^0.1.0",
    "@supabase/supabase-js": "^2.103.0",
    "yaml": "^2.8.3"
  }
}
```

`@supabase/supabase-js` is a Part 01 dependency, not a Part 07 dependency: the
Map-sourced roster path needs a Supabase client from day one
(`loadRosterFromMap` calls `getOrganization(supabase)`). Part 07 reuses the same
`createSummitClient` factory for evidence and outcomes — it does not introduce a
new client. The evidence code path throws a clear `SupabaseUnavailableError`
when env vars are missing rather than trying to degrade silently.

## Reference Patterns

- **CLI wiring** — `products/pathway/bin/fit-pathway.js:1–239` is the canonical
  template. Mirror the
  `definition = { name, version, commands, options, examples }` shape and the
  `createCli → parse → dispatch` structure.
- **Command handlers** — `products/pathway/src/commands/command-factory.js`
  shows the factory pattern for "entity commands". Summit's commands are not
  pure entity lookups, so they will not use `createEntityCommand` directly — but
  the handler signature `async ({ data, args, options }) => void` should be kept
  consistent.
- **Data loader** — `createDataLoader` from `@forwardimpact/map/loader` returns
  everything Summit needs for derivation (`capabilities`, `disciplines`,
  `tracks`, `levels`, `drivers`, `behaviours`). Usage:
  `products/pathway/bin/fit-pathway.js:219–222`.
- **Skill matrix derivation** —
  `deriveSkillMatrix({ discipline, level, track, skills })` is the only libskill
  function Summit's core analytical pipeline calls. Summit does **not** use
  `deriveDevelopmentPath` — that function compares a self-assessment to a target
  job, which is not the question growth alignment asks. See
  `libraries/libskill/src/derivation.js:205–245` for `deriveSkillMatrix` and
  plan-a-05.md's "Why not deriveDevelopmentPath?" note for the rationale.
- **Roster parsing** — The shape of Map's `parseYamlPeople()` helper
  (`products/map/src/activity/parse-people.js`) is a good reference but Summit's
  YAML has a richer structure (teams + projects with allocation), so Summit
  writes its own parser rather than extending Map's.
- **Supabase client** — `products/map/src/lib/client.js` shows the
  `createMapClient()` pattern Summit will mirror. Part 01 adds
  `src/lib/supabase.js` with the same env-var contract (Map-sourced rosters need
  it from day one); Part 07 adds new callers for evidence and outcomes.
- **Activity queries** — Summit imports subpath exports directly:
  `@forwardimpact/map/activity/queries/org` for roster, `.../evidence` for Part
  07, `.../snapshots` for Part 07 outcomes.
- **Proficiency constants** — `SkillProficiency`, `SKILL_PROFICIENCY_ORDER`,
  `getSkillProficiencyIndex`, `skillProficiencyMeetsRequirement` all come from
  `@forwardimpact/map/levels`. Summit's `src/lib/proficiency.js` re-exports them
  plus a `MEETS_WORKING` predicate for the "working+" threshold used everywhere.

## Shared Conventions

All parts must observe the following to keep the package internally consistent:

1. **File naming** — kebab-case for modules, not camelCase. Matches Pathway/Map
   conventions.
2. **JSDoc on exported functions** — every exported function needs a `@param`
   and `@returns` block. Internal helpers may be terse.
3. **No default exports** — named exports only.
4. **Error messages** — prefix with the Summit command name and be actionable.
   Copy the "what's missing, how to fix" tone from the spec.md:710–721
   empty-states table.
5. **JSON output** — every command that renders text must also support
   `--format json`. JSON formatters live next to text formatters and consume the
   same view object.
6. **Test organisation** — one `.test.js` file per top-level module. Tests use
   Bun's `import { test } from "node:test"` and
   `import assert from "node:assert/strict"` pattern already used in Pathway
   tests.
7. **No TypeScript** — the monorepo is JS with JSDoc types, matching the rest of
   `products/`.

## Execution

Each part is independently committable but they must land in order because later
parts import from earlier ones. Recommended execution:

| Order | Part | Agent              | Depends on    |
| ----- | ---- | ------------------ | ------------- |
| 1     | 01   | `staff-engineer`   | —             |
| 2     | 02   | `staff-engineer`   | 01            |
| 3     | 03   | `staff-engineer`   | 02            |
| 4     | 04   | `staff-engineer`   | 02, 03        |
| 5     | 05   | `staff-engineer`   | 02, 03        |
| 6     | 06   | `staff-engineer`   | 02, 03, 04    |
| 7     | 07   | `staff-engineer`   | 02, 03, 05    |
| 8     | 08   | `technical-writer` | all preceding |

**Why Part 06 depends on 04.** `compare` reuses `diffCoverage` and `diffRisks`
from Part 04 (`src/aggregation/what-if.js`) — the diff primitives were
introduced there because what-if is the first command that needs them. Compare
is a thin transformer on top. Part 06 also reuses Part 03's risks detector for
the same reason.

**Parallelism.** After Part 03 lands, Parts 04 and 05 are independent and could
in principle run on concurrent feature branches; Part 06 must wait for Part 04
because it imports the diff primitives. In practice, because all of Parts 04–06
grow the same `bin/fit-summit.js` command table and the same
`src/commands/index.js` barrel, landing them sequentially avoids merge conflicts
and is cheaper than resolving them. Default to sequential execution on a single
`feat/summit` branch; only parallelise if the implementer explicitly wants to
optimise wall-clock time.

**Part 07 timing.** Part 07 can be deferred indefinitely without blocking a
first release — core Summit is useful without evidence or outcomes. A reasonable
variant of this plan would ship Parts 01–06 + 08 as `summit@0.1.0` and land Part
07 as `summit@0.2.0`. The implementer should decide at Part 06 close-out whether
to continue straight into 07 or cut a release first.

**Part 08 agent.** Part 08 is documentation-only (CLAUDE.md reference, website
overview and internals updates, CONTRIBUTING.md mention, release readiness
notes, STATUS advancement). Route it to `technical-writer` since the code parts
are already complete.

## Risks

| Risk                                                              | Severity | Mitigation                                                                                                                                       |
| ----------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aggregation API gets wrong before what-if/growth build on it      | High     | Treat Part 02 as a design exercise. Include unit tests that pin the `TeamCoverage` shape. Every later part imports it unchanged.                 |
| Git history parsing is novel to the codebase                      | Medium   | Part 06 introduces a small wrapper around `git log`/`git show` with injected `exec` for testability. Degrade gracefully when git is unavailable. |
| Supabase client is network-coupled, hard to test                  | Medium   | Part 07 injects the client through DI. Test doubles return canned query results.                                                                 |
| Privacy audiences could leak names to director scope              | High     | Part 02 introduces `withAudienceFilter()` and every command pipes its output through it. Part 02 tests cover the filter explicitly.              |
| Allocation arithmetic errors (effective depth)                    | Medium   | Part 02 tests cover allocations `{0, 0.4, 0.6, 1.0}` and assert effective depth to 2 decimal places.                                             |
| `--focus` and `--allocation` what-if flags composability          | Medium   | Part 04 defines a `ScenarioSpec` type that unions all mutation options; the handler validates before calling simulate.                           |
| Trajectory without historical Map data                            | Low      | Spec explicitly accepts the git-only path. Part 06 implements git-only and documents the Map path as a future extension.                         |
| `computeGrowthAlignment` export shape diverges from Landmark spec | Medium   | Coordinate with spec 080. Part 05 uses the exact signature from spec.md:575–584.                                                                 |
| Lint/format/test failure in any part blocks all subsequent parts  | Low      | Each part ends with `bun run check && bun run test`. Every part must ship green.                                                                 |

## Success Criteria

The plan is "done" (spec 090 → `done`) when:

1. `products/summit/` exists with all files listed in "Package Layout" and is
   exported via the `products/*` workspace wildcard.
2. `fit-summit --help` lists all 8 commands (`coverage`, `risks`, `what-if`,
   `growth`, `compare`, `trajectory`, `roster`, `validate`).
3. Every command runs to completion against a minimal fixture team and produces
   the output shapes shown in the spec.
4. `@forwardimpact/summit` exports `computeGrowthAlignment` with the signature
   defined in spec.md:575–584.
5. `bun run check` (format + lint + layout + exports) passes.
6. `bun run test` passes with Summit tests covering roster loading, coverage
   aggregation, risk detection, what-if diffing, growth ranking, compare,
   trajectory, evidence integration, and outcome weighting.
7. `website/summit/index.md` and `website/docs/internals/summit/index.md` match
   the actual CLI behaviour (not the spec imagination).
8. `specs/STATUS` lists `090 done`.

## Part Index

- **[plan-a-01.md](plan-a-01.md)** — Package scaffold, roster loading (YAML +
  Map source), `roster` and `validate` commands.
- **[plan-a-02.md](plan-a-02.md)** — Core aggregation primitives, `coverage`
  command for reporting teams and project teams, audience filter, JSON/text
  formatters.
- **[plan-a-03.md](plan-a-03.md)** — Structural risk detection (single points of
  failure, critical gaps, concentration risks) and `risks` command.
- **[plan-a-04.md](plan-a-04.md)** — What-if simulation (add/remove/
  move/promote/allocate), scenario diffing, and `what-if` command.
- **[plan-a-05.md](plan-a-05.md)** — Growth alignment, `growth` command, and the
  `computeGrowthAlignment` export for Landmark.
- **[plan-a-06.md](plan-a-06.md)** — `compare` (team-vs-team diff) and
  `trajectory` (git-history-sourced quarterly evolution).
- **[plan-a-07.md](plan-a-07.md)** — `--evidenced` and `--outcomes`
  cross-cutting layers that read Map's activity schema.
- **[plan-a-08.md](plan-a-08.md)** — CLAUDE.md/CONTRIBUTING.md updates, website
  overview and internals documentation rewrite, release readiness note, STATUS
  advancement to `done`.
