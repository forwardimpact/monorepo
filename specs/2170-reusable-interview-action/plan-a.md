# Plan 2170-a: Reusable interview action + substrate re-layering

Implements [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Build bottom-up. Three independent CLI additions — a generic `fit-terrain
substrate up` verb, an `--emit-env` output on the existing `fit-map substrate
stage`, and a `fit-harness scan-logs` verb — then the composite action whose
domain steps are injected commands, then the wrapper, the skill, the shape test,
the publish wiring, and the reference prose. CLI verbs keep the injectable-deps
pattern so behaviour is unit-tested without Supabase, `gh`, or CI. Nothing moves
between packages (a move would cycle `libterrain → map`). The monorepo wrapper
consumes the action by local path (`./products/kata/actions/kata-interview`);
external consumers use the published sibling. The generic layer is opinionated
on Supabase by design.

Libraries used: libcli (command def, dispatch, `options.multiple`), libutil
(runtime `fs` + `subprocess`), libterrain (new `substrate up` verb with its own
Supabase spawner).

## Step 1: `fit-terrain substrate up`

Add a generic Supabase bring-up verb (bring-up + emit only). Nothing moves out
of `products/map` — a move would close a `libterrain → @forwardimpact/map`
cycle and break `fit-map`'s in-process env and `activity.js`.

- **Modified:** `libraries/libterrain/bin/fit-terrain.js` (add the command to
  the existing `createCli` definition, wired like its siblings)
- **Created:** `libraries/libterrain/src/commands/substrate-up.js` (with its own
  thin `supabase` spawner over `runtime.subprocess`, `cwd` explicit — no
  package-root resolution), `libraries/libterrain/test/substrate-up.test.js`

Changes:

- `substrate-up.js` — export `runSubstrateUp({ cwd, emitEnv, runtime })`:
  `supabase start` from `<cwd>`; parse `status --output json`; if `emitEnv`,
  append `SUPABASE_URL=<API_URL>\nSUPABASE_ANON_KEY=<ANON_KEY>\n` via
  `runtime.fs.appendFile`. No `db reset`/seed — those are the consumer's. Inject
  the spawner for tests. `libterrain` already declares `@supabase/supabase-js`.
- `fit-terrain.js` — add the `substrate up` command with options `cwd`,
  `emit-env`, following the file's existing command/dispatch shape.
- Verification: unit test with a stubbed spawner asserts both `KEY=value` lines
  are written to a temp path.
  `bun test libraries/libterrain/test/substrate-up.test.js`.

## Step 2: `fit-map substrate stage --emit-env`

Add an emit output to the existing stage — no delegation, no phase refactor.

- **Modified:** `products/map/bin/fit-map.js` (add `emit-env` option to the
  `substrate stage` command), `products/map/bin/dispatch-substrate.js` (thread
  `emitEnv: values["emit-env"]`), `products/map/src/commands/substrate-stage.js`
- **Created:** `products/map/test/substrate-stage.test.js`

Changes:

- `substrate-stage.js` — accept `emitEnv`; inside the existing `url-discovery`
  phase, after setting `runtime.proc.env.SUPABASE_URL`/`SUPABASE_ANON_KEY`, when
  `emitEnv` is set append the two lines via `runtime.fs.appendFile`. All other
  phases (`init`, `copy-activity`, `seed`, `provision`, `smoke`) and the
  in-process env they rely on are untouched.
- Verification: test injects the phase stubs and a stubbed `capture` returning
  `{"API_URL":…,"ANON_KEY":…}`, runs with `emitEnv` at a temp path, and asserts
  both lines. `bun test products/map/test/substrate-stage.test.js`.

## Step 3: `fit-harness scan-logs`

Scan a run's log archive for secret literals; fail closed.

- **Modified:** `libraries/libharness/bin/fit-harness.js`
- **Created:** `libraries/libharness/src/commands/scan-logs.js`,
  `libraries/libharness/test/scan-logs.test.js`

Changes:

- `scan-logs.js` — export `runScanLogsCommand(ctx)` and pure
  `scanDirectory({ dir, secrets, runtime })`. Take runtime from
  `ctx.deps.runtime`; read flags from `ctx.options`. Parse each `--secret`
  (`label=literal`) **splitting on the first `=` only** (JWTs/base64 keys
  contain `=`). `ctx.options.secret` is **always an array** (libcli `multiple` →
  node `parseArgs`) — iterate it. Resolve a logs dir: extract `--archive <zip>`
  via `runtime.subprocess.run("unzip", …)`, or
  `gh api /repos/<repo>/actions/runs/<id>/logs` → temp zip → extract for
  `--run-id`/`--repo`. Fail closed on download/extract failure. `scanDirectory`
  records a label if its non-empty literal occurs in any file; print
  `FAIL: <label> literal in run logs` per hit; return
  `{ ok: failures.length === 0, code: failures.length ? 1 : 0 }`.
- `fit-harness.js` — import the handler; add a `commands[]` entry `scan-logs`
  with options `archive`, `run-id`, `repo`, `secret` (`multiple: true`).
- Verification: test asserts `scanDirectory` hit (label) / clean (`[]`) and
  `runScanLogsCommand` fail-closed on a nonexistent `--archive`.
  `bun test libraries/libharness/test/scan-logs.test.js`.

## Step 4: `kata-interview` composite action

- **Created:** `products/kata/actions/kata-interview/action.yml`,
  `products/kata/actions/kata-interview/README.md`

Model on `kata-agent`. Inputs per design § Action interface: `website-url`
(required), `product`, `job`, `task-amend`, `substrate-setup-command`,
`persona-select-command`, `jwt-secret`, `service-role-key`, plus the shared
knobs. Composite steps:

1. Kata killswitch (first).
2. Generate token; `actions/checkout` (fetch-depth 0).
3. `bootstrap@<sha>` with `clis: fit-terrain fit-trace fit-harness fit-wiki`
   (`fit-terrain` now also provides substrate bring-up — no `fit-map` in
   `clis`).
4. Prepare workspace: `agent_dir=$(mktemp -d)`, `fit-terrain build`,
   `bun install -g supabase`; export `agent_dir`.
5. Substrate setup — `if: inputs.substrate-setup-command != ''`: run that
   command with `AGENT_CWD=$agent_dir`, `GITHUB_ENV` available, and
   `JWT_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` env. It must emit
   `SUPABASE_URL`/`SUPABASE_ANON_KEY` to `$GITHUB_ENV`.
6. Compose task amendment from `product`/`job`/`task-amend`.
7. Run interview — `harness@<sha>` (`id: interview`), `mode: supervise`,
   `lead-profile: product-manager`, `supervisor-cwd: .`,
   `agent-cwd: $agent_dir`, `task-text: "Run the kata-interview skill."`, env
   `WEBSITE_URL`, `PERSONA_SELECT_COMMAND` (from the input), `IS_SANDBOX=1`, and
   the substrate secrets gated by the
   `inputs.substrate-setup-command != '' && … || ''` ternary.
8. Report cost (`always()`) via `TRACE_FILE:
   ${{ steps.interview.outputs.trace-file }}` step env.
9. Push wiki via `wiki@<sha>` (`always()`).
10. Scan logs — `if: always() && inputs.substrate-setup-command != ''`: if the
    `$RUNNER_TEMP/.persona-jwt` stash exists, read + `echo "::add-mask::"` it;
    else empty. `fit-harness scan-logs --run-id ${{ github.run_id }} --repo
    ${{ github.repository }} --secret persona-jwt=<stash> --secret
    jwt-secret=<secret> --secret service-role-key=<secret>` (skip empties).

The persona-JWT stash (item 10) is produced inside the harness step (item 7):
the supervisor runs `$PERSONA_SELECT_COMMAND`, whose FI form is
`fit-map substrate pick` → `issue --stash "$RUNNER_TEMP/.persona-jwt"` (skill
Step 3a). No action step writes it — the missing-file guard covers an unset
command.

Outputs: `trace-file`, `trace-dir` from the harness step. README documents every
input/output. Composite actions cannot declare `concurrency`/`timeout-minutes`
or read `secrets.*` — hence the wrapper and the secret inputs.

- Verification: the Step 7 shape test parses `action.yml`.

## Step 5: Workflow wrapper

- **Modified:** `.github/workflows/kata-interview.yml`

`workflow_dispatch` wrapper: inputs `product`, `job`, `task-amend`,
`website-url` (default `https://www.forwardimpact.team`), `empty-corpus-test`.
Keep `concurrency` + `timeout-minutes: 50`. One step
`uses: ./products/kata/actions/kata-interview` supplying the FI commands:
`substrate-setup-command: bunx fit-map substrate stage --cwd "$AGENT_CWD" --emit-env "$GITHUB_ENV"`
and `persona-select-command:` the FI pick+issue sequence (via a small script or
`bunx fit-map` calls), plus secrets (`KATA_APP_ID`, `KATA_APP_PRIVATE_KEY`,
`ANTHROPIC_API_KEY`, `SUPABASE_JWT_SECRET` →`jwt-secret`,
`SUPABASE_SERVICE_ROLE_KEY`→`service-role-key`, `KATA_KILLSWITCH`→`killswitch`);
map `empty-corpus-test` into the setup command's `SUBSTRATE_FORCE_EMPTY_CORPUS`.
Remove all inline `python3`/`supabase status`/ log-scan bash. `bunx fit-map`
here is the sole remaining documented exception.

- Verification:
  `rg 'python3|supabase status|== .landmark.' .github/workflows/kata-interview.yml`
  returns nothing.

## Step 6: Skill parameterization

- **Modified:** `.claude/skills/kata-interview/SKILL.md`,
  `.claude/skills/kata-interview/references/job-handoff.md`
- Step 3 staging table — generalize the substrate-backed row: the workspace is
  staged by the injected substrate-setup step, not a hardcoded `fit-map
  substrate stage`. Remove the `npx fit-map` reference from that row.
- Step 3a — when `PERSONA_SELECT_COMMAND` is set, the supervisor runs it (it
  seals `.env`/`.substrate.json` into `$AGENT_CWD` and stashes a JWT); when
  unset, build identity from `story.dsl` and issue no JWT. Drop the direct
  `fit-map substrate pick/issue` instructions in favour of the command contract.
- Step 5 — read the entry point from `WEBSITE_URL` (error if unset).
- `job-handoff.md` — replace the literal URL in the Ask 2 template and both
  worked examples with a `<website-url>` placeholder.
- Verification: `rg 'forwardimpact\.team' .claude/skills/kata-interview/` and
  `rg 'fit-map substrate' .claude/skills/kata-interview/SKILL.md` return
  nothing.

## Step 7: Shape test

- **Modified:** `.github/workflows/test/kata-interview-shape.test.js`

Fully replace the `ADDED_STEPS`/`ADDED_RUN_ENV_KEYS` landmark assertions. Parse
`action.yml` + the wrapper. Assert: substrate-only action steps (setup, scan)
gate on `inputs.substrate-setup-command != ''`; substrate-selecting
`Run interview` env keys carry that ternary; no `product == 'landmark'` literal
in the action; the wrapper job's `timeout-minutes` is a number `< 60`.

- Verification: `bun test .github/workflows/test/kata-interview-shape.test.js`.

## Step 8: Publish wiring

- **Modified:** `.github/workflows/publish-actions.yml`

Add `- "products/kata/actions/kata-interview/**"` to `paths` and a matrix entry
`{ prefix: products/kata/actions/kata-interview, repo: kata-interview }`
(mirroring `kata-agent`, whose bare `repo:` scopes the token). The sibling
`forwardimpact/kata-interview` repo must exist and be seeded before the first
publish — `split-and-push` rejects a non-fast-forward.

- Verification: `rg 'kata-interview' .github/workflows/publish-actions.yml`
  shows both the path filter and the matrix entry.

## Step 9: Reference prose

- **Modified:** `references/bionova-apps/design-a.md`

Add an "Interviewing Polaris" section: a Polaris `interview.yml` wrapping
`forwardimpact/kata-interview@<sha>` with `website-url` = the Polaris entry
point and `substrate-setup-command: npx fit-terrain substrate up --cwd
"$AGENT_CWD" --emit-env "$GITHUB_ENV"` followed by Polaris' seed; patient
interviews omit `persona-select-command` (anonymous). Note it needs no `fit-map`
and no map schema, and stages into a temp `agent-cwd`.

- Verification:
  `rg -n 'kata-interview|substrate up' references/bionova-apps/design-a.md`.

## Risks

- **`--secret` parsing** — `options.multiple` yields an array in every case;
  split each on the first `=`. The fail-open trap is a greedy split, not arity.
- **No spawner move** — `fit-terrain substrate up` carries its own spawner;
  `products/map/src/lib/supabase-cli.js` stays put (used by `activity.js` and
  the stage), so there is no `libterrain → map` cycle and no `activity.js` cwd
  change.
- **`unzip`/`gh` availability** — present on the runner; `scan-logs` fails
  closed if absent.
- **Persona-command contract** — the skill and the FI command must agree on the
  `.env`/`.substrate.json`/stash outputs (which `fit-map substrate issue`
  already writes); the contract is stated in the skill.

## Execution

Single engineering agent, sequential. Steps 1–3 (independent CLI additions,
each `bun test`) can be done in any order but all precede Step 4 (the action
invokes them). Steps 5–9 follow. Skill/reference text (6, 9) stays with the same
agent — it is coupled to the action's inputs.
