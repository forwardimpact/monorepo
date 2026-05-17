# Plan 990-a — Supervisor-Driven Persona Pick via `fit-map substrate`

Spec: [`spec.md`](spec.md) (`spec approved`). Design:
[`design-c.md`](design-c.md) (`design approved`). plan-a is the first plan;
no alternatives proposed.

## Approach

Close the identity-layering anomaly first, then build the substrate verbs
on top, then wire CI + skill last. Part 01 renames `LANDMARK_AUTH_TOKEN`
→ `PRODUCT_LANDMARK_TOKEN`, registers `token` as a known param on the
Landmark config, and extends the libconfig override loop to consult
`#envOverrides` (with empty-string-treated-as-absent semantics so the
Part 03 ternary cannot clobber a `.env` value). Part 02 adds three
`fit-map substrate` subcommands — `stage` (workspace-prep gate that
runs stack/url-discovery/migrate/seed/provision + a self-smoke that
exercises every gated Landmark command via a new `_commands`
introspection verb on `fit-landmark`), `roster` (read-only invariant-
satisfying persona list), `issue` (atomic `.env` + `.substrate.json`
write). Part 03 wires `kata-interview.yml` (substrate-stage step,
JWT-only log scan with `actions: read` permission, Run-interview env
additions all Landmark-gated) and updates the `kata-interview` skill
(Step 3 row, new Step 3a, read-do checklist amendment). Each part is
independently verifiable; later parts depend on earlier parts shipping
first.

## Parts

| Part | Title | Depends on |
|---|---|---|
| [`plan-a-01.md`](plan-a-01.md) | libconfig override-loop fix + `PRODUCT_LANDMARK_TOKEN` rename + docs sweep | — |
| [`plan-a-02.md`](plan-a-02.md) | `fit-map substrate {stage, roster, issue}` + `fit-landmark _commands` introspection + test-path extension | 01 (reads `config.token` via renamed env var) |
| [`plan-a-03.md`](plan-a-03.md) | `kata-interview.yml` substrate step + persona-JWT log scan + SKILL.md updates | 02 (calls the substrate verbs and relies on the test-path extension) |

## Cross-part shared contracts

| Contract | Source | Consumer | Note |
|---|---|---|---|
| `SUBSTRATE_FORCE_EMPTY_CORPUS=true` env var | Part 03 workflow input → step env | Part 02 `substrate-stage.js` short-circuit | Part 02 must check `process.env.SUBSTRATE_FORCE_EMPTY_CORPUS === "true"` even though the only caller landing in CI is Part 03's input |
| `bunx fit-landmark _commands` JSON manifest | Part 02 (new `commands-manifest.js` library file + bin top-level branch) | Part 02 self-smoke | Hidden CLI verb; not advertised in libcli `commands` array. The branch sits *before* the top-level `await createProductConfig` so introspection is independent of libconfig load. |
| `package.json` `"test"` script find-scope expansion | Part 02 § Step 7 | Part 03's `.github/workflows/test/` + `.claude/skills/kata-interview/test/` test files | Scoped to those two specific paths (not the whole `.claude/skills/` tree). Without this expansion, Part 03's CI invariants land but never execute |
| `SUPABASE_URL` via `$GITHUB_ENV` | Part 03 § Step 3 (workflow shell write) | Subsequent workflow steps (`Run interview`'s supervisor calls to `bunx fit-map substrate roster/issue`) | The Node process running `bunx fit-map substrate stage` sets `process.env.SUPABASE_URL` for its own children; cross-step propagation requires `$GITHUB_ENV` |
| `substrate issue --stash <path>` flag | Part 02 (`substrate-issue.js`) | Part 03 supervisor invocation (SKILL.md Step 3a) → Part 03 inline log-scan step (`$RUNNER_TEMP/.persona-jwt`) | Optional flag writes the bare JWT to a workflow-protected path outside `$AGENT_CWD`; the scan step reads from there because the agent has no access to `$RUNNER_TEMP` |

## Design deviations

Design-c § Supervisor experience names the JTBD-role alignment signal
as matching the picked job's audience against the roster row's `role`
field. The `activity.organization_people` schema on `origin/main` has
no `role` column — the actual columns are `discipline`, `level`,
`track`. The plan uses those three fields for the alignment signal
(Part 02 § Step 4a roster shape; Part 03 § SKILL.md edit 8b). This is
a deviation from the design's literal text; the design's intent
(persona-role match) is preserved with the actual schema vocabulary.

## Libraries used

New imports introduced by this plan: `@forwardimpact/libsecret`
(`mintSupabaseJwt`, `parseDuration`) — already used by the existing
`fit-map auth issue` command, no new dependency.

## Risks

| Risk | Why the implementer cannot see it |
|---|---|
| Self-smoke spawns `bunx fit-landmark` and that subprocess constructs `createProductConfig("landmark", { token: undefined })`, which only resolves the JWT via `process.env.PRODUCT_LANDMARK_TOKEN`. The smoke must pass the JWT via spawn-options `env`, not the parent `process.env`, or it leaks into other tools the test harness invokes. | Spawn-options `env` vs. shell-inherited `env` is a Node footgun: `spawnSync(cmd, args, { env: {...process.env, X: y} })` keeps the JWT scoped to the child only. Easy to miss without an explicit assertion. |
| GitHub Actions auto-masks any value registered as a repo secret to `***` in run logs, so scanning for `SUPABASE_JWT_SECRET` / `SUPABASE_SERVICE_ROLE_KEY` literals is structurally a no-op. Only the per-run persona JWT (minted dynamically, not registered) is at risk. Part 03's scan is therefore intentionally narrow. | The auto-masking behaviour is documented at the platform level, not in the workflow file itself; a reviewer who expects a broader scan needs the rationale spelled out. |
| The persona-query helper builds its `evidence_count` and `practice_directs_count` aggregates client-side (multiple round-trips against the Supabase JS client). On large rosters this could OOM the stage step. The synthetic corpus today is bounded (<200 humans), so it works; a future production substrate (out of scope) would need a Postgres view or RPC. | Round-trip count is not visible from the function signature; the alternative (Postgres view in a new migration) is forbidden by spec § Out-of-scope. |
| The atomic-write recovery contract in `substrate issue` is "rename `.env` first, then `.substrate.json`; on partial failure leave whichever landed and let the caller re-issue". This trades atomicity-across-files for simplicity. The kata-interview workspace is `mktemp -d`-fresh per run, so the worst case is one failed run, but a future caller running in a non-fresh cwd would see stale `.env` state. | The recovery shape is invisible from the spec criteria; the spec only requires "mode 0600" and "atomic rename" — the two-file atomicity gap is a deliberate design choice. |
| The `_commands` hidden subcommand on `fit-landmark` is invoked by parsing `process.argv[2]` before libcli's `createCli` runs. If a future contributor moves the libcli call earlier in `fit-landmark.js`, the hidden verb stops working. | The branch is two lines and looks vestigial; only a runtime test (added in Part 02 § Step 8) guards it. |
| `bunx fit-map substrate stage` discovers `SUPABASE_URL` from `supabase status --output json` after `supabase start`. If the local stack ever changes its status JSON shape (e.g. renames `api_url`), substrate-stage fails with a `[substrate stage: url-discovery]` error. | The Supabase CLI's status JSON schema is not pinned in `libconfig` or anywhere in-tree; only a smoke test against the actual CLI catches a rename. |

## Execution recommendation

Sequential by part; each part is its own PR titled `plan(990): <part summary>`.

- **Part 01** — `staff-engineer` (engineering agent). Renames a public
  env-var and touches `libconfig` core; needs the test-suite contract
  preservation check from spec § Success Criteria row 11.
- **Part 02** — `staff-engineer`. New product surface (`fit-map
  substrate *` and `fit-landmark _commands`) with full test
  coverage; isolated from Part 03.
- **Part 03** — `staff-engineer` for the workflow YAML (CI gating logic
  is engineering), paired with `technical-writer` for the SKILL.md
  changes in the same PR (Step 3 row, new Step 3a, read-do-checklist
  line). The Skill changes are purely documentation; pairing them in
  one PR keeps the spec § *kata-interview skill alignment* check
  coherent with the workflow it describes. **Cannot run in parallel
  with Part 02** — Part 03's CI smoke invokes the substrate verbs Part
  02 ships, and the test-path extension in Part 02 § Step 7 is what
  makes Part 03's new tests run.

Parts 01 and 02 must merge before Part 03 is opened; Part 02's tests
must be green before Part 03's workflow step references the verbs.
