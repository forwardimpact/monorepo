# Plan 2170-a: Reusable interview action + CLI split

Implements [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Build bottom-up: land the two CLI verbs first (they are runtime dependencies of
the action), then the composite action that orchestrates them, then the wrapper
workflow that shrinks to call it, then the skill parameterization, the shape
test, the publish wiring, and the reference prose. Each CLI verb keeps the
existing injectable-deps pattern so its new behaviour is unit-tested without
Supabase, `gh`, or CI. The monorepo's own wrapper consumes the action by local
path (`./products/kata/actions/kata-interview`) to stay always-in-sync and avoid
a publish-before-pin bootstrap; external consumers use the published sibling.

Libraries used: libcli (command definition, dispatch, `options.multiple`),
libutil (runtime `fs` + `subprocess`).

## Step 1: `fit-map substrate stage --emit-env <path>`

Emit the discovered Supabase URL + anon key as env-file lines.

- **Modified:** `products/map/bin/fit-map.js`,
  `products/map/bin/dispatch-substrate.js`,
  `products/map/src/commands/substrate-stage.js`
- **Created:** `products/map/test/substrate-stage.test.js`

Changes:

- `fit-map.js` — add to the `substrate stage` command's `options`:
  `"emit-env": { type: "string", description: "Append SUPABASE_URL / SUPABASE_ANON_KEY lines to this env file" }`
  (no CI-only reference in the help string — external `npx fit-map` users read
  it, per products/CLAUDE.md § Audience).
- `dispatch-substrate.js` — in the `stage` case, pass
  `emitEnv: values["emit-env"]` into `runStageCommand`.
- `substrate-stage.js` — accept `emitEnv` in the destructured params; inside the
  `url-discovery` phase, after setting `runtime.proc.env.SUPABASE_URL` /
  `SUPABASE_ANON_KEY`, when `emitEnv` is set append
  `SUPABASE_URL=<url>\nSUPABASE_ANON_KEY=<key>\n` to that path via
  `runtime.fs.appendFile`.
- Verification: new test injects stub `createSupabaseCli` (whose `capture`
  returns `{"API_URL":…,"ANON_KEY":…}`) plus no-op stubs for the other phase
  loaders, runs with `emitEnv` at a temp path, and asserts the file holds both
  `KEY=value` lines. `bun test products/map/test/substrate-stage.test.js`.

## Step 2: `fit-harness scan-logs`

Scan a run's log archive for secret literals; fail closed.

- **Modified:** `libraries/libharness/bin/fit-harness.js`
- **Created:** `libraries/libharness/src/commands/scan-logs.js`,
  `libraries/libharness/test/scan-logs.test.js`

Changes:

- `scan-logs.js` — export `runScanLogsCommand(ctx)` and a pure
  `scanDirectory({ dir, secrets, runtime })`:
  - `scanDirectory` walks `dir`, and for each `{ label, value }` with non-empty
    `value`, records `label` if `value` occurs in any file; returns
    `{ failures: string[] }`.
  - `runScanLogsCommand` reads `ctx.options`: parse each repeated `--secret`
    (`label=literal`) into `secrets`, **splitting on the first `=` only** (JWTs
    and base64 keys contain `=`; a greedy split truncates the literal and
    silently disarms the scan). `ctx.options.secret` is a string for one
    occurrence and an array for many (libcli `multiple`) — normalize to an
    array. Resolve a logs dir — extract `--archive <zip>` via
    `runtime.subprocess.run("unzip", …)`, or when `--run-id`/`--repo` are given,
    download with `gh api /repos/<repo>/actions/runs/<id>/logs` to a temp zip
    then extract. Fail closed (`{ ok: false, code: 1, error }`) if download or
    extract fails. Print `FAIL: <label> literal in run logs` per failure; return
    `{ ok: failures.length === 0, code: failures.length ? 1 : 0 }`.
- `fit-harness.js` — `import { runScanLogsCommand }`; add a `commands[]` entry:
  `{ name: "scan-logs", args: [], handler: runScanLogsCommand, description: "Scan a run's log archive for secret literals; non-zero on any hit", options: { archive: {type:"string",…}, "run-id": {type:"string",…}, repo: {type:"string",…}, secret: {type:"string", multiple:true, description:"label=literal, repeatable"} } }`.
  Dispatch already routes through `cli.dispatch`.
- Verification: test asserts `scanDirectory` returns the label on a planted
  literal (temp dir) and `[]` on a clean dir, and that `runScanLogsCommand` with
  a nonexistent `--archive` returns `ok:false`.
  `bun test libraries/libharness/test/scan-logs.test.js`.

## Step 3: `kata-interview` composite action

- **Created:** `products/kata/actions/kata-interview/action.yml`,
  `products/kata/actions/kata-interview/README.md`

Model on `products/kata/actions/kata-agent/action.yml`. Inputs per design
§ Action interface (`website-url` required; `substrate` default `false`;
`substrate-force-empty-corpus`, `jwt-secret`, `service-role-key`; plus the
`kata-agent` shared knobs). Composite steps in order:

1. Kata killswitch (first step, as `kata-agent`).
2. Generate installation token; `actions/checkout` (fetch-depth 0).
3. `bootstrap@<sha>` with `clis: fit-terrain fit-trace fit-harness fit-wiki`.
4. Prepare workspace: `agent_dir=$(mktemp -d)`, `fit-terrain build`,
   `bun install -g supabase`; export `agent_dir` as a step output.
5. Substrate stage — `if: inputs.substrate == 'true'`: `bunx fit-map substrate
   stage --cwd "$agent_dir" --emit-env "$GITHUB_ENV"` (env `JWT_SECRET`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUBSTRATE_FORCE_EMPTY_CORPUS` from the
   `substrate-force-empty-corpus` input). `fit-map` is deliberately **not** in
   the bootstrap `clis:` — it ships in the `map@v*` release, so `bunx fit-map`
   is the documented exception (as the current workflow notes); do not add it to
   `clis`.
6. Compose task amendment from `product`/`job`/`task-amend` (as today).
7. Run interview — `harness@<sha>` (step `id: interview`), `mode: supervise`,
   `lead-profile: product-manager`, `supervisor-cwd: .`,
   `agent-cwd: $agent_dir`, `task-text: "Run the kata-interview skill."`, env
   `WEBSITE_URL`, `IS_SANDBOX=1`, and the substrate secrets gated by the
   `inputs.substrate == 'true' && … || ''` ternary.
8. `fit-trace cost "${{ steps.interview.outputs.trace-file }}" --markdown >>
   $GITHUB_STEP_SUMMARY` (`always()`).
9. Push wiki via `wiki@<sha>` (`always()`).
10. Scan logs — `if: always() && inputs.substrate == 'true'`: if the
    `$RUNNER_TEMP/.persona-jwt` stash exists, read it and `echo
    "::add-mask::$persona_jwt"` before use (the stash JWT is runtime-generated,
    not an auto-masked repo secret); if absent, degrade to an empty persona
    literal and continue (as today). Then `fit-harness scan-logs --run-id
    ${{ github.run_id }} --repo ${{ github.repository }} --secret
    persona-jwt=<stash> --secret jwt-secret=<secret> --secret
    service-role-key=<secret>` (skip empty literals).

Outputs: `trace-file`, `trace-dir` passed through from the harness step. README
documents every input/output for external consumers.

- Verification: `bun run --cwd . check` yaml parse in the shape test (Step 6);
  action file present with declared inputs.

## Step 4: Workflow wrapper

- **Modified:** `.github/workflows/kata-interview.yml`

Reduce to a `workflow_dispatch` wrapper: inputs `product`, `job`, `task-amend`,
`substrate` (boolean, default false), `website-url` (default
`https://www.forwardimpact.team`), `empty-corpus-test` (passed to the action's
`substrate-force-empty-corpus` input). Keep `concurrency` and
`timeout-minutes: 50` on the `interview` job. One step:
`uses: ./products/kata/actions/kata-interview` passing inputs and secrets
(`KATA_APP_ID`, `KATA_APP_PRIVATE_KEY`, `ANTHROPIC_API_KEY`,
`SUPABASE_JWT_SECRET`→`jwt-secret`,
`SUPABASE_SERVICE_ROLE_KEY`→`service-role-key`, `KATA_KILLSWITCH`→`killswitch`).
Remove all inline `python3`, `supabase status`, and log-scan bash.

- Verification:
  `rg 'python3|supabase status|== .landmark.' .github/workflows/kata-interview.yml`
  returns nothing; workflow references the action.

## Step 5: Skill parameterization

- **Modified:** `.claude/skills/kata-interview/SKILL.md`,
  `.claude/skills/kata-interview/references/job-handoff.md`
- SKILL.md Step 5 — state that the entry-point URL is provided in the
  `WEBSITE_URL` environment variable; the supervisor reads it and uses it in
  Ask 2 (error if unset, do not invent).
- `job-handoff.md` — replace the literal `https://www.forwardimpact.team` in the
  Ask 2 template and both worked examples with a `<website-url>` placeholder,
  noting it is the `WEBSITE_URL` value.
- Verification: `rg 'forwardimpact\.team' .claude/skills/kata-interview/`
  returns nothing.

## Step 6: Shape test

- **Modified:** `.github/workflows/test/kata-interview-shape.test.js`

Fully replace the existing `ADDED_STEPS` / `ADDED_RUN_ENV_KEYS` landmark
assertions (`.github/workflows/test/kata-interview-shape.test.js:24-57`) — they
match the old `product == 'landmark'` gating that Step 4 removes, so leaving
them breaks the suite. Parse both
`products/kata/actions/kata-interview/action.yml` and the wrapper workflow.
Assert: every substrate-only action step (`Substrate stage`, `Scan logs …`) has
`if` matching `inputs.substrate == 'true'`; the substrate-selecting`Run
interview` env keys carry the `inputs.substrate == 'true' && … || ''` ternary;
no `product == 'landmark'` literal appears in the action; the wrapper job's
`timeout-minutes` is a number `< 60`.

- Verification: `bun test .github/workflows/test/kata-interview-shape.test.js`.

## Step 7: Publish wiring

- **Modified:** `.github/workflows/publish-actions.yml`

Add `- "products/kata/actions/kata-interview/**"` to the `paths` filter and a
matrix entry `{ prefix: products/kata/actions/kata-interview, repo:
kata-interview }` (mirroring the `kata-agent` entry, whose bare `repo:` scopes
the App token via `repositories: ${{ matrix.action.repo }}`). The sibling
`forwardimpact/kata-interview` repo must exist and be seeded before the first
publish — `split-and-push` rejects a non-fast-forward into a repo with unrelated
history.

- Verification: `rg 'kata-interview' .github/workflows/publish-actions.yml`
  shows both the path filter and the matrix entry.

## Step 8: Reference prose

- **Modified:** `references/bionova-apps/design-a.md`

Add a short "Interviewing Polaris" section: a documented `interview.yml` in the
Polaris repo wrapping `forwardimpact/kata-interview@<sha>` with `website-url` =
the Polaris entry point, `substrate: true`, and Polaris'
`JWT_SECRET`/`SERVICE_ROLE_KEY`, noting the interview stages into a temp
`agent-cwd` so it needs no Polaris application code.

- Verification: `rg -n 'kata-interview' references/bionova-apps/design-a.md`
  shows the wrapper with `website-url` + `substrate`.

## Risks

- **libcli `options.multiple`** must collect repeated `--secret` into an array;
  Step 2's parser must tolerate both a single string and an array (libcli yields
  a string for one occurrence).
- **`unzip`/`gh` availability** — both are present on the bootstrapped runner;
  `scan-logs` fails closed if either is absent, so a missing tool surfaces as a
  loud non-zero, not a silent pass.
- **Local-path action `uses:`** — the wrapper's `./products/kata/actions/…`
  resolves against the workflow checkout; the sibling SHA-pin form is only for
  external consumers (design § Publish path).

## Execution

Single engineering agent, sequential: Steps 1–2 (CLI verbs, `bun test`) before
Step 3 (the action depends on them at runtime), then Steps 4–8 in order. The
skill and reference text (Steps 5, 8) are small and coupled to the action's
inputs, so they stay with the same agent rather than routing to
`technical-writer`.
