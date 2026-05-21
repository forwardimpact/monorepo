# Plan 1090 — Substrate roster reframed for the supervisor's persona-pick job

## Approach

Bottom-up in one PR: add three pure AST helpers to `libsyntheticgen`,
promote `@forwardimpact/libsyntheticgen` to `dependencies` in
`products/map/package.json`, factor the substrate test stub into a shared
helper, add two new modules under `products/map/src/lib/`, widen
`findInvariantSatisfyingPersonas`, replace the roster default with a
table, add `substrate pick`, update the one smoke consumer site, rewrite
kata-interview SKILL.md Step 3a, and regenerate catalogs. Each step's
verify gate runs the tests that depend on the prior step's symbols.

Libraries used: `@forwardimpact/libsyntheticgen` (`createDslParser`, new
`findTeamById` / `findDepartmentForTeam` / `findMostRecentScenarioForTeam`),
`@forwardimpact/libutil` (`Finder`), `@forwardimpact/libcli`
(`formatTable`, `formatError`).

## Steps

### 1. Add DSL helpers to libsyntheticgen

**Created:**

- `libraries/libsyntheticgen/src/dsl/helpers.js` — three pure functions
  consuming the AST shape `createDslParser().parse(source)` emits
  (verified against `libraries/libsyntheticgen/src/dsl/parser.js:136-137`:
  `ast.departments` and `ast.teams` are sibling flat arrays; each team
  carries `department: <id>` per `parser-blocks.js:52`):
  - `findTeamById(ast, teamId)` — linear scan of the flat `ast.teams[]`
    list, returning the matching team block or `null`.
  - `findDepartmentForTeam(ast, team)` — given a team block (must carry
    `team.department`), returns the matching `ast.departments[]` block or
    `null`.
  - `findMostRecentScenarioForTeam(ast, teamId)` — filters
    `ast.scenarios ?? []` to entries whose `affects[].team_id === teamId`;
    among those, returns the entry maximising `(timerange_start, id)` by
    string compare (the DSL emits `YYYY-MM` date tokens per
    `data/synthetic/story.dsl:322` and `parser.js:77-82`, which collate
    correctly under lex order); returns `null` when no scenario affects
    the team.
- `libraries/libsyntheticgen/test/dsl-helpers.test.js` — `node:test`-based,
  one `describe` per helper. Builds a hand-rolled AST literal matching
  the parser-blocks shape and asserts:
  - `findTeamById` returns the team and `null` (missing id).
  - `findDepartmentForTeam` returns the parent department; returns
    `null` when a team's `department` field names a non-existent id.
  - `findMostRecentScenarioForTeam` picks the most-recent scenario by
    `timerange_start`, tie-breaks by `id` ascending (max-id wins on
    tie), returns `null` when no scenario affects the team, and
    tolerates `ast.scenarios` undefined.

**Modified:**

- `libraries/libsyntheticgen/src/index.js` — append:
  `export { findTeamById, findDepartmentForTeam, findMostRecentScenarioForTeam } from "./dsl/helpers.js";`

**Verify:** `bun test libraries/libsyntheticgen/test/dsl-helpers.test.js`
exits 0; the rest of the libsyntheticgen suite still passes.

### 2. Promote libsyntheticgen in the products/map manifest

**Modified:**

- `products/map/package.json` — move
  `"@forwardimpact/libsyntheticgen": "^0.1.0"` from `devDependencies`
  (line 95) to `dependencies`. Insertion slot is alphabetical between
  `libsecret` and `libtelemetry`. `@forwardimpact/libutil` is already
  declared in `dependencies` at line 84 — no change to that row.
  `check-metadata.mjs --fix` (step 10) canonicalises ordering if the
  slot is off.

**Verify:** `bun install` succeeds; the workspace symlink
`node_modules/@forwardimpact/libsyntheticgen` resolves from the
products/map workspace. No standalone test gate here — the
`check-workspace-imports.mjs` guard runs as part of step 10's
`bun run check` after the runtime imports land in step 3.

### 3. Add persona-enricher + pick-memory libs

**Created:**

- `products/map/src/lib/persona-enricher.js` — exports:
  - `loadStory()` — resolves `data/synthetic/story.dsl` by constructing
    `new Finder(fs, console, process)` (the sync `node:fs` module — its
    `findUpward` uses `fs.existsSync` per
    `libraries/libutil/src/finder.js:40`) and calling
    `findUpward(process.cwd(), "data/synthetic/story.dsl", 5)`. Returns
    `null` when not found. When found, reads the file via
    `fs/promises.readFile`, parses via `createDslParser().parse(source)`
    (note: factory takes no args; `parse` takes the source — see
    `libraries/libsyntheticgen/src/dsl/index.js:24-35`), returns the
    AST. Wraps parser errors as
    `new Error(\`story.dsl parse failed at <path>: <msg>\`)` and
    rethrows so the verbs exit non-zero (Risk B).
  - `enrichPersonaRow(row, ast)` — pure function. When `ast === null`
    OR `row.getdx_team_id` is null/undefined OR does not begin with
    `gdx_team_`, returns
    `{ ...row, repos: null, department_name: null, scenario: null }`.
    Otherwise: strips the `gdx_team_` prefix to get `teamId`, calls
    `findTeamById(ast, teamId)`. When the team is found, calls
    `findDepartmentForTeam(ast, team)` and
    `findMostRecentScenarioForTeam(ast, teamId)`; assembles
    `{ ...row, repos: team?.repos ?? null, department_name:
    department?.name ?? null, scenario: scenario ?? null }`.
- `products/map/test/lib/persona-enricher.test.js` (the
  `products/map/test/lib/` directory is created here; the existing
  layout is `test/activity/` for command tests, `test/lib/` is the
  natural mirror of `src/lib/`). Three test cases: (a)
  `enrichPersonaRow` with `ast === null` returns the row with three
  null fields; (b) with a hand-rolled AST and a row whose
  `getdx_team_id` matches, returns `repos`, `department_name`,
  `scenario`; (c) with `getdx_team_id` lacking the `gdx_team_` prefix
  or naming a non-existent team, returns the three null fields without
  throwing.
- `products/map/src/lib/pick-memory.js` — exports:
  - `readPickMemory(memoryPath, windowN)` — `fs/promises.readFile`,
    splits on `\n`, drops the header line
    (`picked_at,persona_email,run_id`), drops blanks, parses each
    remaining line as `[picked_at, persona_email, run_id]`, returns
    the last `windowN` `persona_email` values as a `Set<string>`.
    Returns an empty `Set` when the file does not exist (ENOENT →
    empty). `windowN === 0` returns an empty set without reading.
  - `appendPickMemory(memoryPath, { persona_email, run_id })` — ensures
    the parent directory exists (`fs.mkdir({ recursive: true })`); if
    the file does not exist, writes the header line first
    (`picked_at,persona_email,run_id\n`); appends one row with
    `picked_at = new Date().toISOString()` and the supplied
    `persona_email` / `run_id` (default empty string). CSV-quoting
    deliberately omitted — all three values are bounded shapes (email,
    ISO timestamp, numeric GitHub run id) with no commas or newlines;
    a JSDoc note in the file records the constraint.
- `products/map/test/lib/pick-memory.test.js` — two test cases against
  `fs.mkdtemp`-rooted paths: (a) read-then-append round trip preserves
  emails and respects the window cap; (b) `readPickMemory` returns an
  empty set when the file is absent.

**Verify:** `bun test products/map/test/lib/persona-enricher.test.js
products/map/test/lib/pick-memory.test.js` exits 0.

### 4. Factor `makeStub` into a shared substrate test helper

**Created:**

- `products/map/test/activity/_substrate-stubs.js` — exports
  `makeStub(seed = {})` extracted from the two existing copies in
  `products/map/test/activity/substrate-roster.test.js:42-93` and
  `products/map/test/activity/substrate-persona-query.test.js:16-74`.
  The two existing definitions are functionally equivalent but use
  different argument shapes (roster takes a positional `seed` and
  reads `seed.snapshots ?? []`; query destructures
  `{ snapshots = [], … } = {}`). The shared helper adopts the roster
  signature (`(seed = {})` + `seed.<key> ?? []`) — the query tests
  already pass an object literal so this signature is back-compatible
  with both call sites. One extension over the existing definitions:
  the `switch (table)` block gains a `case "getdx_teams":` arm that
  reads `seed.teams ?? []` (property name chosen for symmetry with
  `humans`, `artifacts`). The arm has no `.eq()` filter — the query
  helper in step 5 selects all `getdx_teams` and joins client-side, so
  the existing builder's `.then()` thenable suffices unmodified.

**Modified:**

- `products/map/test/activity/substrate-roster.test.js` — delete the
  inline `makeStub` definition; replace with
  `import { makeStub } from "./_substrate-stubs.js";`. No assertion
  changes here — step 5 amends fixtures and assertions for the new
  shape.
- `products/map/test/activity/substrate-persona-query.test.js` —
  identical import swap; no assertion changes here — step 5 amends
  fixtures and assertions.

**Verify:** `bun test products/map/test/activity/substrate-roster.test.js
products/map/test/activity/substrate-persona-query.test.js` still
passes against the un-amended fixtures (the import swap is a refactor;
the substantive query/fixture changes land in step 5).

### 5. Widen `findInvariantSatisfyingPersonas`

**Modified:**

- `products/map/src/commands/substrate-persona-query.js` —
  - The `organization_people` select widens to
    `"email,name,github_username,discipline,level,track,manager_email,getdx_team_id"`.
  - Build `peopleByEmail: Map<string, row>` and
    `peersByTeamId: Map<string|null, Array<{email,name,github_username,level}>>`
    from the already-loaded `humans` array (no second round trip).
    Humans with `getdx_team_id == null` are skipped during peer-map
    construction (no team coupling possible). Peer arrays are sorted
    by `email` ASC.
  - Add one Supabase fetch against `getdx_teams`:
    `select("getdx_team_id,name")`; build `teamsById: Map<string,
    {name}>`. The thenable resolves via `.then()` on the
    `select(...)` builder (existing stub pattern; the helper from step
    4 supports it).
  - Tighten the invariant filter with `(h.manager_email ?? null) !==
    null` per design Decision 4.
  - Each surviving row is mapped to:

    ```js
    {
      email, name, github_username,
      discipline, level, track,
      parent_email: h.manager_email,            // RENAMED from manager_email
      getdx_team_id: h.getdx_team_id,
      team_name: teamsById.get(h.getdx_team_id)?.name ?? null,
      parent: peopleByEmail.get(h.manager_email)
        ? {
            email: peopleByEmail.get(h.manager_email).email,
            name:  peopleByEmail.get(h.manager_email).name,
            github_username: peopleByEmail.get(h.manager_email).github_username,
            level: peopleByEmail.get(h.manager_email).level,
          }
        : null,
      teammates: (peersByTeamId.get(h.getdx_team_id) ?? [])
        .filter((p) => p.email !== h.email)
        .slice(0, 3),
      teammates_truncated:
        (peersByTeamId.get(h.getdx_team_id) ?? []).filter(
          (p) => p.email !== h.email,
        ).length > 3,
      manages_count, evidence_count, practice_directs_count,
      snapshot_id, item_id,
    }
    ```

  - `diagnoseBindingConstraint` gains a fourth row
    (`parent_email_known`: `humans.filter(h => h.manager_email != null)`)
    so the binding-constraint diagnostic explains a top-of-tree-only
    pool correctly.
- `products/map/test/activity/substrate-persona-query.test.js` —
  - The **passing-case** test (lines 141-181, currently named
    `"returns a persona that satisfies all four invariants"`) is the
    only fixture that needs structural changes. Its `humans` array
    (lines 147-166) gains `manager_email: "chief@x"` on alice and a
    new `chief@x` row (kind=human, level `"L9"`, `manager_email: null`,
    `getdx_team_id: null`) so alice satisfies invariant (a)+(b)+(c)
    and Decision 4's non-null filter. Bob unchanged. The chief row is
    filtered out of candidate output by the new non-null rule — it
    serves only as alice's parent join. The test gains a
    `teams: [{ getdx_team_id: "T1", name: "Team One" }]` seed; alice
    and bob each gain `getdx_team_id: "T1"`; chief stays `null`. Both
    passing-case assertions migrate from `manager_email` to
    `parent_email`; new assertions cover `team_name === "Team One"`,
    `parent.email === "chief@x"`, `parent.level === "L9"`,
    `teammates.length === 1` (alice's only peer is bob), and
    `teammates_truncated === false`.
  - The **binding-constraint** test (lines 104-139, named
    `"filters out humans that fail any invariant; diagnoses binding
    constraint"`) is unchanged: alice still carries `manager_email:
    null`, so Decision 4's filter removes her before the existing
    invariants are checked, and the test's `out.personas.length === 0`
    + `/binding constraint:/` regex assertions hold without
    modification.
  - Two other tests
    (`"returns empty + diagnostic when no snapshots exist"`,
    `"returns empty + diagnostic when no scores for snapshot"`,
    `"returns empty + diagnostic when no human rows"`,
    `"excludes service_account rows from the humans pool"`) need no
    fixture changes — they assert on diagnostics from earlier
    failure modes that fire before the new filter.
  - New test case: humans pool of one top-of-tree row
    (`manager_email: null`) plus a non-empty snapshot/scores fixture
    yields empty `personas` with the diagnostic naming the binding
    constraint (`parent_email_known` will be the binding constraint
    when no human has a parent).

**Verify:**
`bun test products/map/test/activity/substrate-persona-query.test.js`
exits 0.

### 6. Replace roster default with table, route both formats through the enricher

**Modified:**

- `products/map/src/commands/substrate-roster.js` —
  - Imports: drop `formatHeader`, `formatBullet`; add `formatTable` and
    `import { loadStory, enrichPersonaRow } from "../lib/persona-enricher.js";`.
    Keep `formatError`.
  - After `findInvariantSatisfyingPersonas`, load the AST once
    (`const ast = await loadStory();`) and map each row through
    `enrichPersonaRow(row, ast)`. Both output paths render the
    enriched rows.
  - JSON path: serialise the enriched `payload`. Existing
    `selection_metadata` shape preserved.
  - Default path: replace the loop with one
    `process.stdout.write(formatTable(headers, rows) + "\n")` call
    (the trailing `\n` mirrors the existing roster verb's per-line
    terminator). Header set:
    `["email", "name", "discipline", "level", "track", "team_name", "manages_count", "parent_email"]`.
    Rows pull each persona's matching scalar values; `formatTable`
    renders missing cells via `String(cell || "")`
    (`libraries/libcli/src/format.js:79`). No bullet, no leading
    header line — the table's own header row is the spec criterion 1
    surface (design § Risk C accepts the empty-string rendering for
    missing `track`).
- `products/map/test/activity/substrate-roster.test.js` —
  `supabasePersonaArtifacts` (the shared fixture at lines 12–40, which
  is the only fixture in this file expecting alice to qualify) gains
  the same shape edits as the persona-query passing-case fixture:
  alice's `manager_email: null` → `"chief@x"`; new `chief@x` row
  (kind=human, level `"L9"`, `manager_email: null`,
  `getdx_team_id: null`); `teams: [{ getdx_team_id: "T1", name: "Team
  One" }]`; alice + bob each gain `getdx_team_id: "T1"`. The
  empty-corpus test uses `makeStub({})` and needs no fixture change —
  the new arm reads `seed.teams ?? []` and returns the empty join
  naturally.
  - The `--format json` test gains assertions on `team_name === "Team
    One"`, `parent_email === "chief@x"`, `parent.email === "chief@x"`,
    `teammates_truncated === false`, and `repos === null` /
    `department_name === null` / `scenario === null` (the test fixture
    runs from the monorepo root, where `data/synthetic/story.dsl`
    exists, but the seed's `getdx_team_id` value `"T1"` does not match
    any DSL team, so `enrichPersonaRow` returns the three DSL fields
    as `null` — no test-injection seam needed).
  - The text-output test asserts the output starts with the table
    header line (`/^email\s+name\s+/`) and contains `alice@x`; the
    bullet character `\u2022` no longer appears.
  - The empty-corpus test is unchanged.

**Verify:** `bun test products/map/test/activity/substrate-roster.test.js`
exits 0.

### 7. Add `substrate pick` verb

**Created:**

- `products/map/src/commands/substrate-pick.js` — exports
  `runPickCommand({ supabase, options, env = process.env, cwd = process.cwd() })`:
  1. Call `findInvariantSatisfyingPersonas({ supabase })`.
  2. If `personas.length === 0`, write the diagnostic to stderr (same
     `formatError` shape as the roster verb), return 1.
  3. Resolve `memoryPath = path.join(cwd, "wiki/kata-interview/picks.csv")`.
     Resolve `memoryWindow = Number.parseInt(options?.memoryWindow ?? "5", 10)`
     (clamp to `>= 0`; `0` means no diversification).
  4. `recentEmails = await readPickMemory(memoryPath, memoryWindow)`.
  5. Filter `personas` to those whose `email` is not in
     `recentEmails`. If empty, write
     `formatError("substrate pick: no candidate diversifies against last <N> picks")`
     to stderr, return 1.
  6. Load AST via `loadStory()`, enrich the first remaining persona via
     `enrichPersonaRow(row, ast)`.
  7. Emit envelope on stdout (JSON by default; `--format text` falls
     back to the single-row table renderer from step 6):

     ```js
     { personas: [enrichedRow],
       selection_metadata: {
         signals: ["memory_diversification", "jtbd_role_alignment"],
         memory_window: memoryWindow,
       },
     }
     ```

  8. `await appendPickMemory(memoryPath, { persona_email: row.email,
     run_id: env.GITHUB_RUN_ID ?? "" })`. (Order: emit-then-append
     mirrors design § Data flow; if `appendPickMemory` throws the
     supervisor still has the picked row on stdout, and the verb
     surfaces the write failure on stderr via a thrown `Error`.)
- `products/map/test/activity/substrate-pick.test.js` — `node:test`
  cases, importing `makeStub` from `_substrate-stubs.js`:
  - Empty corpus → exits 1, stderr matches `/substrate pick:/`.
  - Non-empty corpus, no memory file → emits one-row envelope on
    stdout, exits 0, creates `picks.csv` with the header + one row at
    `<tmpdir>/wiki/kata-interview/picks.csv`.
  - Successive invocations against the same memory file return
    different `persona_email` values; the second invocation excludes
    the first (seed with two qualifying humans).
  - When memory is saturated (every qualifying persona present within
    `memoryWindow`), exits 1 with the diversification diagnostic.
  - Tests inject `cwd` via the `runPickCommand` option so memory
    writes land under `fs.mkdtemp` — no real `wiki/` mutation.

**Verify:** `bun test products/map/test/activity/substrate-pick.test.js`
exits 0; the roster/query/smoke suites still pass.

### 8. Update `substrate-smoke.js` consumer

**Modified:**

- `products/map/src/commands/substrate-smoke.js` —
  `assertDiscoveryResolves` (line 183-194): change
  `!persona.manager_email` → `!persona.parent_email`; JSDoc and
  assertion message updated to match.
- `products/map/test/activity/substrate-smoke.test.js` — four test-site
  updates (verified via
  `grep -n "manager_email" products/map/test/activity/substrate-smoke.test.js`):
  - Line 134: rename test name `"rejects persona missing manager_email"`
    → `"rejects persona missing parent_email"`.
  - Line 141: assertion regex `/missing email\/manager_email/` →
    `/missing email\/parent_email/`.
  - Lines 149 + 159: persona literals `{ email: "a@x", manager_email:
    "a@x" }` → `{ email: "a@x", parent_email: "a@x" }`.
  - Line 230 (the `persona` literal inside the
    `buildSmokeArgv substitutes placeholders` describe block):
    field `manager_email: "alice@x"` → `parent_email: "alice@x"`.

**Verify:** `bun test products/map/test/activity/substrate-smoke.test.js`
exits 0.

### 9. Wire `substrate pick` into the CLI

**Modified:**

- `products/map/bin/fit-map.js` — two edits:
  1. Insert a new `substrate pick` entry into `definition.commands`
     between the existing `substrate roster` (current line 110-117)
     and `substrate issue` (current line 118-135) entries:

     ```js
     {
       name: "substrate pick",
       description:
         "Pick one invariant-satisfying persona diversified against recent picks (writes wiki/kata-interview/picks.csv)",
       options: {
         "memory-window": {
           type: "string",
           description: "Recent-pick window size (default 5)",
         },
         format: { type: "string", description: "Output format (text|json), default json" },
       },
     },
     ```

  2. Add a `case "pick":` branch to `dispatchSubstrate` (between
     `roster` and `issue`, current line 488-512) that dynamic-imports
     `substrate-pick.js` and forwards
     `{ supabase, options: { memoryWindow: values["memory-window"],
     format: values.format } }`. Mirrors the existing roster branch in
     shape.

**Verify:** `bunx fit-map substrate --help` lists the new verb;
`bunx fit-map substrate pick --help` shows `--memory-window` and
`--format`.

### 10. Update kata-interview SKILL.md Step 3a

**Modified:**

- `.claude/skills/kata-interview/SKILL.md` § Step 3a (lines 91–108) —
  rewrite to:
  1. `bunx fit-map substrate pick --format json` returns one enriched
     persona row already diversified against the last 5 picks (the
     command appends to `wiki/kata-interview/picks.csv` on success).
     The supervisor reads `email`, `name`, `github_username`,
     `team_name`, `department_name`, `parent.name` /
     `parent.github_username` / `parent.level`, `repos`, `teammates`,
     and `scenario` from the row — no follow-up reads of
     `data/synthetic/story.dsl` or `prose-cache.json` are required to
     fill the persona-template `## You` block.
  2. `bunx fit-map substrate issue --email <picked> --cwd
     "$AGENT_CWD" --stash "$RUNNER_TEMP/.persona-jwt"` mints `.env`
     and `.substrate.json` and stashes the JWT.
  3. If either verb exits non-zero, write a diagnostic naming the
     verb and exit the skill — do not proceed to Step 4.

  Remove the "memory diversification (skip personas in your last 5
  log entries)" prose and the parenthetical field listing — the
  command now owns both.

**Verify:** read the rewritten Step 3a end-to-end; no `rg`/`grep`
appears against `wiki/product-manager-*.md` or `data/synthetic/`; the
text no longer instructs the supervisor to invoke `substrate roster`
for the pick (the `roster` verb remains valid as the "show me the
menu" surface — it is just no longer the pick path).

### 11. Regenerate catalog / docs / context artefacts

Run `bun run context:fix`. This refreshes catalog tables and any
auto-generated metadata derived from the changed `package.json`s.
The CI guards (`check-workspace-imports.mjs`,
`check-metadata.mjs`, format, lint, jsdoc, biome, test) run as part of
`bun run check`.

**Verify:** `bun run check` exits 0 across the full check suite.
`git diff --stat` shows the expected file set: the new files (helpers,
enricher lib, pick-memory lib, pick command, four new test files, one
new test helper), the modified files (libsyntheticgen index, map
manifest, query helper, roster command, smoke command, fit-map.js CLI,
SKILL.md), and any auto-generated catalog regen rows tied to the
manifest move.

## Risks

- **DSL grammar drift.** Step 1's helpers consume parser-blocks shapes
  at `parser-blocks.js:49,224,252`. The helpers' tests use hand-rolled
  AST literals — they do not exercise the parser, so a parser-shape
  change that breaks runtime use will not surface from the helper
  tests alone. End-to-end signal comes from the roster/pick verbs'
  integration with `loadStory()` against the live
  `data/synthetic/story.dsl` during local development.
- **Wiki sync of `picks.csv`.** Design § Risk D notes the wiki sync
  commits `wiki/` back to `main`. Sync is driven by `bunx fit-wiki
  push` / `pull` (the `justfile` recipes), not a workflow file. The
  new top-level `wiki/kata-interview/` directory is unknown to that
  pipeline today; if its sync logic excludes unknown subdirectories,
  durability degrades to single-run diversification (still
  correct — just less coverage). Implementer runs
  `bunx fit-wiki push --dry-run` against a tree containing
  `wiki/kata-interview/picks.csv` during step 11 and opens a
  follow-up issue if the file is not staged. The plan does not block
  on a fit-wiki change.

## Execution

Single PR on `plan/spec-1090-substrate-roster-supervisor-reframe`.
Steps 1 → 11 are strictly sequential — each step's verify gate runs
the tests that depend on the prior step's symbols. No parallelism
opportunity across steps. Best fit: `staff-engineer` via
`kata-implement`.

— Staff Engineer 🛠️
