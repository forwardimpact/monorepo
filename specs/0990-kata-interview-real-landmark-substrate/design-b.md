# Design 0990-b — One Composite `fit-map substrate` Verb

Spec: `specs/0990-kata-interview-real-landmark-substrate/spec.md` (status:
`spec approved` on `origin/main`). Alternative to [`design-a.md`](design-a.md).
**Same workflow-step shape** as design-a (because spec § Success Criteria
explicitly require CI-step placement for assertions before `Run interview`), but
collapses design-a's three new artifacts — a `just substrate-up` recipe,
`scripts/pick-substrate-persona.js`, and `scripts/assert-substrate.js` — into
**one composite verb on `fit-map`**. The supervisor running `kata-interview` can
invoke the same verb locally or for in-session re-prep with one command instead
of three; the kata-interview task-prompt addition stays minor (one staging-table
row + one read-do-checklist line, same as design-a).

## How this differs from design-a

| | design-a | design-b |
|---|---|---|
| New code under version control | Justfile recipe + `scripts/pick-substrate-persona.js` + `scripts/assert-substrate.js` | One subcommand tree on `fit-map`: `substrate up` + `substrate verify` |
| Supervisor-side reproduction | `just substrate-up && bun scripts/pick-substrate-persona.js && bun scripts/assert-substrate.js` | `bunx fit-map substrate up --out <path>` (+ `verify --manifest <path>`) |
| CLI discoverability | Justfile recipe + bare scripts (no `--help`) | Surfaces in `fit-map --help` alongside `activity`, `people`, `auth`, `getdx` |
| libconfig + service-role plumbing | Re-implemented in two scripts | Inherited from existing `fit-map` (`createProductConfig("map")`, `createMapClient`) |
| Workflow YAML steps | Substrate-up, persona-pick, JWT-mint, assertion-smoke (each landmark-gated) | Substrate-up (calls `up`), substrate-verify (calls `verify`); two steps total |
| Persona-pick / assertion separation | Two scripts | Two subcommands under one verb sharing one connection + one config load |
| SKILL.md amendments | Step 3 staging-table row split + read-do-checklist line rewrite | Same |

A consolidated CLI surface, not a different deployment model: the JWT
still lands in the agent's env via a value-level workflow ternary; the
assertions still run as CI steps; non-Landmark interviews stay
unchanged.

## Architecture at a glance

```mermaid
sequenceDiagram
    participant W as kata-interview.yml
    participant U as fit-map substrate up
    participant V as fit-map substrate verify
    participant DB as Supabase (local)
    participant A as Run interview (fit-eval)

    W->>U: invoke (if landmark)
    U->>U: ensure-env (env-setup if .env missing)
    U->>DB: activity start + migrate + seed + people provision
    U->>DB: pick human persona satisfying (a)(b)(c)
    U->>U: mintSupabaseJwt(persona, SUPABASE_JWT_SECRET)
    U->>W: ::add-mask:: jwt; writes .substrate.json (discovery only, no JWT) + $GITHUB_OUTPUT
    W->>V: invoke (if landmark)
    V->>DB: assert JWT shape + persona row + discovery resolution + COMMANDS-map smoke + three named row-class smokes
    V->>W: exit 0 (or non-zero → workspace-prep step fails, agent step skipped)
    W->>A: env: LANDMARK_AUTH_TOKEN = ${{ inputs.product == 'landmark' && steps.up.outputs.jwt || '' }}
    A->>A: agent reads .substrate.json, runs gated commands
```

## Components

| Component | Location | Role |
|---|---|---|
| `fit-map substrate` | `products/map/bin/fit-map.js` (new top-level command on the libcli definition) + `products/map/src/commands/substrate.js` (new) | Single composite verb with two subcommands. `up` sequences `activity start → activity migrate → activity seed → people provision → persona-pick → mintSupabaseJwt → manifest-write`, calling existing handlers via direct import (`activity.start/migrate/seed`, `runProvisionCommand`, `mintSupabaseJwt` from `@forwardimpact/libsecret`). `verify` runs every spec § Success Criteria check that doesn't need the GH-Actions log surface. Both share `createProductConfig("map")` and one `createMapClient` connection. |
| `kata-interview.yml` | `.github/workflows/` (modified) | Gains two Landmark-gated steps placed **after `Prepare interview workspace` and before `Run interview`** — one calls `fit-map substrate up`, the other `fit-map substrate verify`. Adds one value-level ternary entry on `Run interview`'s `env:` map for `LANDMARK_AUTH_TOKEN`, sourced from substrate-up's `$GITHUB_OUTPUT`. A third Landmark-gated step (post-`Run interview`) downloads run logs and asserts the literal JWT / `SUPABASE_JWT_SECRET` / `SUPABASE_SERVICE_ROLE_KEY` values do not appear unmasked, satisfying spec § Sensitive values are absent from run logs. Exact step decomposition is plan scope. |
| `.substrate.json` (discovery only) | `${{ steps.agent-workspace.outputs.dir }}/.substrate.json`, written by `up` | JSON `{ persona_email, manager_email, snapshot_id, item_id, generated_at }`. **No JWT in this file.** The JWT travels through `$GITHUB_OUTPUT` (masked) to the `Run interview` step's `env:` map, then into the agent's `process.env`. |
| `.claude/skills/kata-interview/SKILL.md` | modified | The Step 3 staging-table row for Map+Landmark is split: the Landmark row says the substrate (identity + discovery file) is staged automatically. The read-do-checklist line `No product names anywhere agent-visible` is rewritten per the spec's Persona-file invariant amendment. Step 4's `CLAUDE.md` exclusion list is unchanged. |

## Interfaces

`fit-map substrate up`

- Required: `--product <name>` — only `landmark` activates the pipeline today;
  other names exit 0 with a no-op (keeps the verb future-proof for additional
  products).
- Required: `--out <path>` — path for the discovery `.substrate.json`.
- Optional: `--emit-env <path>` — when set, also appends
  `landmark_auth_token=<jwt>` (preceded by an `::add-mask::<jwt>` line) to the
  file at `<path>` (intended to be `$GITHUB_OUTPUT`).
- Phases, fail-fast: ensure-env → stack-up → migrate → seed → provision →
  persona-pick → mint → manifest-write. On any phase failure: non-zero exit with
  the phase name and a one-line diagnostic in stderr (e.g.
  `persona-pick: 0 rows matched 'manager-of-one' across 42 human rows`).
- Idempotent on `.env`: if `.env` already carries `SUPABASE_URL`, skips
  `env-reset`. Customised local `.env` files are not clobbered.

`fit-map substrate verify`

- Required: `--manifest <path>` — the discovery file written by `up`.
- Reads `LANDMARK_AUTH_TOKEN` from `process.env` (CI step sets it via the
  workflow env in the same way `Run interview` will).
- Asserts: JWT shape + claims (`aud`, `role`, `email`, `exp > now`); persona row
  in `organization_people` with `kind = 'human'`; all four discovery values
  resolve to ≥1 row in the table the matching command queries; every
  `needsSupabase: true` entry in `fit-landmark`'s `COMMANDS` map (expanded via
  the libcli `commands` array) exits zero when invoked with options drawn from
  the manifest; `org team --manager <persona>` / `evidence --email <persona>` /
  `practice --manager <persona>` each return non-empty top-level row collections
  under `--format json`.
- Exits non-zero with a one-line diagnostic per failing check. As a CI step
  between `Prepare interview workspace` and `Run interview`, a non-zero exit
  fails the workflow before the agent runs — satisfying spec § Failure
  surfacing.

## Persona-pick and discovery values

Same invariants as design-a. Inside `substrate up`:

1. Scan `organization_people` for `kind = 'human'` rows lexicographically by
   email.
2. Reject rows where no other `organization_people` row has `manager_email`
   equal to this row's email (manager-of-one).
3. Reject rows where the same join `fit-landmark evidence --email <e>` performs
   returns 0 (evidence-of-self).
4. Reject rows where the same query `fit-landmark practice --manager <e>`
   performs returns 0 (practice-of-directs).
5. First survivor wins. `manager_email` = persona email (the persona IS the
   manager probed by `org team` / `practice`). `snapshot_id` = latest
   `getdx_snapshots` row by `imported_at`. `item_id` = any
   `getdx_snapshot_team_scores` row in the persona's team scope whose
   `driver_id` resolves in `drivers.yaml` (so `snapshot trend --item <id>`
   returns a payload).

## Key decisions

| Decision | Choice | Rejected alternatives |
|---|---|---|
| Where the new code lives | `fit-map` top-level command `substrate` | (a) A new CLI `fit-substrate` — duplicates libconfig + supabase-client plumbing; splits operator surface across binaries. (b) A `kata-*` skill that shells out — skills are guidance, not infrastructure; CI cannot depend on a skill's runtime. (c) Extend `fit-terrain` — terrain is read-only data generation, not Supabase orchestration. (d) Keep design-a's three artifacts — three surfaces to discover, three places to load config, three READMEs. |
| Substrate execution venue | **CI workflow steps**, calling the verb | (a) Supervisor-driven in-session execution via a new `AgentEnv` MCP tool that mutates `process.env` — rejected because (i) spec § Success Criteria mandate CI-step placement for several assertions (`after the workspace-prep step and before the Run interview step`); (ii) the agent SDK spawns each runner in a Claude Code CLI subprocess whose env is snapshotted at spawn, so a post-spawn parent-Node mutation does not reach subsequent Bash subprocesses in the same turn; (iii) `libeval/src/redaction.js` builds its env-allowlist snapshot at Redactor construction (see file header: `Stateless after construction: env is captured once so in-process process.env writes ... cannot smuggle a value past the redactor`), so a mid-session JWT mutation would not be redacted from trace lines. The supervisor can still invoke `fit-map substrate up` directly via Bash for local debug or in-session re-prep, but the **load-bearing** invocation is the CI step. |
| JWT transport into the agent's env | Value-level ternary on `Run interview`'s `env:` map, sourced from `substrate up`'s `$GITHUB_OUTPUT` | (a) Persist the JWT to `.substrate.json` for the agent to source — token-on-disk one Read tool call away from the interviewee. (b) Pass via `$GITHUB_ENV` — persists the JWT in the runner env beyond the step's scope. |
| Discovery-vector encoding | JSON file at `${{ steps.agent-workspace.outputs.dir }}/.substrate.json` | (a) Env vars on `Run interview` — bloats env for four values that are read once at agent start. (b) A row in agent's `CLAUDE.md` — Step 4's `CLAUDE.md` exclusion list still forbids product names; the discovery file dodges that surface. |
| Persona-selection determinism | Lexicographic-first over invariant-satisfying set | (a) Hash workflow inputs to seed RNG — adds complexity without product benefit. (b) Random pick — unnecessary non-determinism. |
| `verify` cross-product dependency | `fit-map substrate verify` invokes `fit-landmark` as a CLI subprocess (does NOT import its `COMMANDS` map) | (a) Import `fit-landmark`'s `COMMANDS` map from `fit-map` — cross-product internal-import couples the two products and breaks `fit-landmark`'s "unchanged" success criterion in spirit. (b) Re-declare the gated-command list inside `fit-map substrate verify` — drift risk; if `fit-landmark` gains a new gated command, the verifier silently misses it. CLI-subprocess invocation reads the user-visible command list from `fit-landmark --help --json` (or equivalent libcli surface) so drift is caught at the boundary `fit-landmark` itself exposes. |
| Secret masking for env-setup secrets | `env-setup.js` invoked once normally, then once with `--add-mask --output <throwaway>` to register masks for `SUPABASE_JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` before any later step output | (a) Single invocation to `$GITHUB_ENV` — loses libconfig's `.env`-file contract. (b) A `--mask-only` mode — cleaner long-term, deferred. |
| Secret masking for the minted JWT | `fit-map substrate up --emit-env $GITHUB_OUTPUT` emits `::add-mask::<jwt>` before the `landmark_auth_token=…` line | (a) Rely on env-setup masks — JWT is newly minted, not one of the env-setup secrets, so its bytes are not pre-registered. |
| Substrate caching | None in v1 | Spec defers caching to a follow-up. |

## Data flow

1. **Workspace prep (unchanged).** `Prepare interview workspace` runs
   `bunx fit-terrain build` and `bun install -g supabase`, emits
   `dir=$agent_dir` to `$GITHUB_OUTPUT`.
2. **Substrate up (new, Landmark-gated step).** Calls
   `bunx fit-map substrate up --product landmark --out ${{ steps.agent-workspace.outputs.dir }}/.substrate.json --emit-env $GITHUB_OUTPUT`.
   Boots Supabase, ingests synthetic content, picks persona, mints JWT, writes
   the discovery file, and emits a masked `landmark_auth_token` to the workflow
   output.
3. **Substrate verify (new, Landmark-gated step).** Calls
   `bunx fit-map substrate verify --manifest ${{ steps.agent-workspace.outputs.dir }}/.substrate.json`
   with `LANDMARK_AUTH_TOKEN` set in the step's `env:` to
   `steps.up.outputs.landmark_auth_token`. Asserts all spec § Success Criteria
   rows that don't require the GH-Actions log surface. Non-zero exit fails the
   workflow here, before `Run interview`.
4. **Run interview (existing step, one env line added).**
   `LANDMARK_AUTH_TOKEN: ${{ inputs.product == 'landmark' && steps.up.outputs.landmark_auth_token || '' }}`
   lands the JWT in the supervisor + agent process env. The supervisor runs
   `kata-interview`, copies `data/pathway`/`data/activity` per the staging
   table, drafts `CLAUDE.md` (no product names), and Asks the agent. Agent's
   `fit-landmark` invocations inherit `LANDMARK_AUTH_TOKEN`.
5. **Log scan (new, Landmark-gated post-step).** Downloads the workflow's run
   logs (via `actions/download-artifact` or the `gh run view --log` surface,
   plan scope) and exits non-zero if any literal value appears unmasked.

## Trade-offs at a glance

| Concern | Decision | Cost |
|---|---|---|
| Surface consolidation | One verb subsumes one recipe + two scripts | Adds ~150 lines under `products/map/src/commands/substrate.js`; deletes zero existing surface; expands `fit-map` to seven top-level commands. |
| `verify` invokes `fit-landmark` as a subprocess | Drift caught at the surface `fit-landmark` itself exposes | Adds N subprocess spawns to the verify step (one per gated subcommand); seconds-level cost. |
| Local-CI parity | `bunx fit-map substrate up && bunx fit-map substrate verify` works locally | Contributors and supervisors share one debug recipe with CI. |
| Wall-clock | Boot Docker fresh each run | ~30–60 s added before `Run interview`; spec out-of-scopes a numeric budget. |
| Supervisor token-on-disk window | JWT never written to the agent CWD; lives in `process.env` only after the `Run interview` step starts | Eliminates the design-a-style write-and-erase race entirely. |
| Corpus satisfiability | Implementation verifies, before merge, that the seeded substrate admits a persona satisfying all three invariants | Empirical probe: `bunx fit-map substrate up --out /tmp/sub.json` against a clean checkout. If no match exists, spec amendment is required (widen invariants or extend synthetic content). |

## SKILL.md amendments

The on-`main` Step 3 staging table groups Map and Landmark in one row.
This design splits the row so the Landmark row can name the substrate
(identity + discovery file) as auto-staged — the verb name surfaces in
the supervisor-side instructions only, not in the persona file or Ask
templates. The read-do-checklist line is rewritten per the spec's
Persona-file invariant amendment. Step 4's `CLAUDE.md` exclusion list
is unchanged.
