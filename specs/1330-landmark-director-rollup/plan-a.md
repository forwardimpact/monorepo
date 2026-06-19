# Plan 1330: Landmark director-tier rollup

Executes [design-a.md](design-a.md) for [spec.md](spec.md). Substrate-shape
resolution (a director identity chained above the six IT managers via
`manager_email`) plus a per-team breakdown surface in the health view that
appears only when the resolved scores span ≥2 teams.

## Approach

Add a `director` declaration to the DSL grammar and the IT department, generate
it as a real `organization_people` row that re-points the six IT team managers'
`manager_email` to it, then teach the health command to emit a per-team rollup
(keyed by `getdx_team_id`/`team_name`) with a scope line when scores span ≥2
teams. Resolution rides the existing recursive `get_team`; no query or
`--manager` flag code changes. Steps 1–3 (substrate) are independent of steps
4–6 (surface) and the two halves can be built in parallel, but the
verification step (8) needs both.

Libraries used: libsyntheticgen (DSL parser, entity generation), libmock (test
queries). No new dependencies.

## Step 1 — DSL grammar: `director` field on a department

Add a `director` handler to `parseDepartment`. A director carries a handle and
explicit `name`/`title`/`level`/`discipline` fields.

- Modified: `libraries/libsyntheticgen/src/dsl/parser-blocks.js`

`consumeFields` dispatches on the token's `.value` string (parser-helpers.js:42),
and the tokenizer emits any non-keyword word as an `IDENT` carrying its literal
value (tokenizer.js:283). So `director`, `level`, and `discipline` need **no**
keyword registration — the handler-map keys match the IDENT values directly.

```js
// inside parseDepartment consumeFields handler map, alongside team:
director: () => {
  const handle = advance().value; // AT_IDENT, '@' already stripped
  const d = { handle };
  expect("LBRACE");
  consumeFields(
    {
      name: () => { d.name = parseStringValue(); },
      title: () => { d.title = parseStringValue(); },
      level: () => { d.level = parseStringOrIdent(); },
      discipline: () => { d.discipline = parseStringOrIdent(); },
    },
    "director",
  );
  expect("RBRACE");
  dept.director = d;
},
```

Verify: a unit test parses a department with a `director` block and asserts
`dept.director` carries handle/name/title/level/discipline.

## Step 2 — Entity generation: emit director row, re-point team managers

In `buildEntities`/`generatePeople`, after team managers are created, for each
department whose AST carries a `director`, push one director person and set the
`manager_email` of that department's team managers to the director's email.

- Modified: `libraries/libsyntheticgen/src/engine/entities.js`

```js
// after createManagers(...) populates team managers:
for (const dept of ast.departments) {
  if (!dept.director) continue;
  const d = dept.director;
  const director = makePerson(
    d.name, d.level || "J090", d.discipline || "engineering_management",
    { id: null, department: dept.id }, domain,
    true /* is_manager */, null /* manager_email */,
  );
  director.team_id = null;
  director.getdx_team_id = undefined; // director has no leaf team
  people.push(director);
  for (const p of people) {
    if (p.is_manager && teamsInDept(teams, dept.id).some((t) => t.id === p.team_id)) {
      p.manager_email = director.email;
    }
  }
}
```

`makePerson` derives `email` via `toEmail(name, domain)`, so `name "Zeus"` →
`zeus@bionova.example`. Guard `makePerson` against a null `team` (director has
no team): set `team_id`/`department` from the passed dept, not `team.id`.

Verify: a unit test builds entities from a fixture DSL with an IT director and
asserts (a) one person with `email: zeus@bionova.example`, `is_manager: true`,
`manager_email: null`, `department: it`, `team_id: null`; (b) all six IT team
managers now carry `manager_email: zeus@bionova.example`; (c) non-IT managers
still carry `manager_email: null`.

## Step 3 — Seed substrate: declare the IT director

Add the director to the `department it` block in the DSL.

- Modified: `data/synthetic/story.dsl`

```
  department it {
    name "BioNova IT"
    parent headquarters
    headcount 65

    director @zeus {
      name "Zeus"
      title "Director of Engineering"
      level J090
      discipline engineering_management
    }

    team platform_engineering { ... }   // unchanged
    ...
  }
```

Verify: `bunx fit-terrain build` regenerates without error and the generated
roster contains `zeus@bionova.example` with the six IT managers reporting to it.

## Step 4 — Health view: per-team rollup when scope spans ≥2 teams

In `runHealthCommand`, after the team is resolved and scores fetched, detect the
distinct `getdx_team_id` set across the resolved members. With one team:
unchanged. With ≥2: build `view.teamRollup` and `view.scope`; omit the flat
`view.drivers`.

- Modified: `products/landmark/src/commands/health.js`

- The resolved `team` rows (from `getTeam`) carry `getdx_team_id`
  (`organization_people` column, migration `20250504000001`). Compute
  `teamIds = new Set(team.map((p) => p.getdx_team_id).filter(Boolean))`.
- If `teamIds.size >= 2`: for each team id (in first-seen order over the team
  rows), restrict to that team's members (`teamEmails` subset) and that team's
  score subset (`scores.filter((s) => s.getdx_team_id === id)`), then run the
  existing `buildDriverRows` over the subset to produce
  `{ teamId, teamName: <subset row.team_name>, drivers }`. Collect into
  `view.teamRollup`. Set `view.scope = { teamCount: teamIds.size, tierLabel: teamLabel }`.
  Do not set `view.drivers`. Per-team evidence filtering uses the team's
  `teamEmails` subset — so each block equals the `--manager <team-mgr>` output
  for that team (SC-5).
- Else: existing path (`view.drivers`), `view.scope` undefined.
- `computeDriverJoin` runs against the full score set in both modes (its
  counters are set-based, rollup-agnostic).

Refactor note: extract the existing score-set → driver-rows logic
(`buildDriverRows` + comments + driverJoin) into a helper callable once
(single-team) or per team (rollup). Keep the single-team output byte-identical.

Verify: `health.test.js` case — a stubbed `getTeam` whose rows span two
`getdx_team_id`s plus scores for both yields `view.teamRollup.length === 2`,
`view.scope.teamCount === 2`, and no `view.drivers`; the single-team fixture
still yields `view.drivers` and no `view.scope`.

## Step 5 — Health formatter: scope line + symmetric per-team blocks

Render the rollup in `toText`/`toMarkdown`/`toJson`.

- Modified: `products/landmark/src/formatters/health.js`

- When `view.scope` is present: emit a header line `Across N teams (<tierLabel>)`,
  then iterate `view.teamRollup` in order; for each, emit a team sub-header
  (`Team: <teamName>`) followed by the existing default driver table for that
  team's `drivers`. No sorting, no cross-team deltas (SC-6).
- `toJson` already serialises the whole `view`; assert it includes `teamRollup`
  and `scope`.
- When `view.scope` is absent: unchanged.

Verify: `health-formatter.test.js` — a view with `scope`+`teamRollup` renders the
scope line and one block per team in declaration order, no ranking language; a
view without `scope` renders byte-identical to today.

## Step 6 — CLI help: director-tier example

Add a `health` example invocation naming the director-tier `--manager` usage.

- Modified: `products/landmark/bin/fit-landmark.js`

Add to `examples`: `fit-landmark health --manager zeus@bionova.example` and, in
the `health` command's `manager` option description, note it resolves
transitively (a director email rolls up every team beneath it). The verbatim
example must resolve to the six IT teams against the seed (SC-3).

Verify: `fit-landmark health --help` (or the manifest test) shows the example;
the cli-command test asserts the example string is present.

## Step 7 — Regression test: team-manager projection equality (SC-5)

- Created: assertion in `products/landmark/test/health.test.js`

Run the command twice with the same stubbed data: once with a single-team
`getTeam` (one `getdx_team_id`) and once with a multi-team `getTeam` whose rows
include that team. Assert the multi-team `view.teamRollup` entry for that team
has a `drivers` array multiset-equal, on the team-manager columns (id, name,
score, vs_* anchors, contributingSkills counts), to the single-team run's
`view.drivers`. Confirms SC-5.

## Step 8 — Full verification against success criteria

Run the suite and the spec's verification commands.

- `bun run check` (format, lint, jsdoc, invariants, context) green.
- `bun run test` green for `libsyntheticgen`, `landmark`, and `map`.
- `bunx fit-terrain build` regenerates the seed; spot-check the generated roster
  for `zeus@bionova.example` and the six re-pointed managers (SC-1 substrate).
- Confirm SC-1/3 (six IT team slugs, no other dept), SC-2 (no person names in
  rollup rows), SC-4 (scope line), SC-6 (no ranking) from the rendered output.

## Risks

- **`makePerson` assumes a non-null `team`.** It reads `team.id`/`team.department`.
  The director has no team — step 2 must pass department context without a team
  object, or `makePerson` throws. Adapt the call site, not the existing team path.
- **`getdx_team_id` on member and score rows.** The rollup keys off
  `person.getdx_team_id` (migration `20250504000001`) and
  `score.getdx_team_id` (set by the generator, activity.js:256). Existing
  single-team fixtures omit `getdx_team_id`, which is correct: with one team in
  scope the rollup branch is not taken, so those tests are unaffected.
  Multi-team test fixtures must populate `getdx_team_id` on both the `getTeam`
  rows and the score rows.
- **FK insert order is already safe.** `manager_email` is a self-FK checked at
  statement end; `importPeople`'s two-batch split (no-manager first) inserts the
  director before the managers/engineers statement, so the added depth needs no
  ordering change. Do not refactor `importPeople`.

## Execution

Single engineering agent, sequential. Steps 1–3 (substrate) then 4–7 (surface)
then 8 (verification). Steps 1–3 and 4–6 are independent and may interleave, but
verification (8) gates completion.

— Staff Engineer 🛠️
