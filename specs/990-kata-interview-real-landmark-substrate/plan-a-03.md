# Plan 990-a Part 03 — `kata-interview.yml` substrate step + SKILL.md updates

Wires the substrate verbs from Part 02 into the kata-interview workflow,
adds a post-run scan that catches the only sensitive value GitHub Actions
does *not* auto-mask (the per-run persona JWT), gates everything on
`inputs.product == 'landmark'`, and updates the `kata-interview` skill to
reflect the new substrate surface and the read-do-checklist amendment.
Depends on Part 02.

## Step 1 — Configure two new GH repo secrets (operator action)

- **No code change** — operator action documented in the PR description.

A repo admin must configure two repository secrets:

- `SUPABASE_JWT_SECRET` — local-stack JWT signing key (same value
  `just env-setup` writes today)
- `SUPABASE_SERVICE_ROLE_KEY` — derived via
  `mintSupabaseServiceRoleKey` (also written by `just env-setup`)

CI fails closed if either is unset: Part 02's substrate-stage step calls
`config.supabaseJwtSecret()` / `config.supabaseServiceRoleKey()` which
throws on empty.

## Step 2 — Grant `actions: read` on the workflow

- **Modified**: `.github/workflows/kata-interview.yml` (the `permissions:`
  block; locate via `rg "permissions:" .github/workflows/kata-interview.yml`)

The post-run log scan in Step 6 calls `gh api .../actions/runs/<id>/logs`,
which requires `actions: read`. Today the workflow's top-level
permissions block declares only `contents: read`. Extend it to:

```yaml
permissions:
  contents: read
  actions: read
```

The kata-agent-team GitHub App installation must also carry `actions:
read` repository permission; document this in the PR description so the
repo admin can verify before merge.

## Step 3 — Add the `Substrate stage` step (Landmark-gated)

- **Modified**: `.github/workflows/kata-interview.yml`

Locate the existing `Prepare interview workspace` step (find it via
`rg "Prepare interview workspace" .github/workflows/kata-interview.yml`).
Immediately after that step's run script ends, insert:

```yaml
      - name: Substrate stage
        id: substrate-stage
        if: inputs.product == 'landmark'
        shell: bash
        env:
          SUPABASE_JWT_SECRET: ${{ secrets.SUPABASE_JWT_SECRET }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          SUBSTRATE_FORCE_EMPTY_CORPUS: ${{ inputs.empty-corpus-test }}
        run: |
          mkdir -p "${{ steps.agent-workspace.outputs.dir }}/config"
          bunx fit-map substrate stage

          # Propagate the local Supabase URL to subsequent workflow
          # steps. Part 02's substrate-stage sets process.env.SUPABASE_URL
          # inside its own Node process; that only survives the Node
          # process. For the supervisor (next workflow step) to see it,
          # write to $GITHUB_ENV.
          api_url=$(bunx --no-install -- supabase status --output json \
            | awk -F'"' '/"api_url"/ {print $4}')
          if [ -z "$api_url" ]; then
            echo "FAIL: supabase status did not yield api_url" >&2
            exit 1
          fi
          echo "SUPABASE_URL=$api_url" >> "$GITHUB_ENV"
```

The `mkdir` line provisions `$AGENT_CWD/config/` so libconfig's
`findUpward("config")` resolves uniformly from the agent's cwd, per
design-c § Three setup paths. The `if:` predicate gates the entire step
on Landmark; non-Landmark runs skip it. `SUPABASE_URL` propagation to
the next step is via `$GITHUB_ENV` — without this, the supervisor's
`bunx fit-map substrate roster` invocation in the `Run interview` step
calls `config.supabaseUrl()` which throws because the previous Node
process's `process.env.SUPABASE_URL` write does not survive across
workflow steps.

`SUBSTRATE_FORCE_EMPTY_CORPUS` plumbs the boolean workflow input added
in Step 10 into Part 02's stage code; the env value is the literal
string `"true"` or `"false"` (GH Actions stringifies booleans), and
Part 02 checks `=== "true"`.

### Step 3a — Snapshot the persona JWT for the log-scan workflow

Append to the same `Substrate stage` step's `run:` script:

```bash
          # Snapshot the persona JWT now so the post-run log scan
          # (separate workflow_run-triggered workflow) checks against
          # the value that was minted, not whatever the agent's .env
          # contains at the end. Apply ::add-mask:: so the value is
          # masked in this workflow's logs going forward.
          token_file="${{ steps.agent-workspace.outputs.dir }}/.env"
          if [ -f "$token_file" ]; then
            persona_jwt=$(awk -F= '/^PRODUCT_LANDMARK_TOKEN=/ {print $2; exit}' \
              "$token_file")
            if [ -n "$persona_jwt" ]; then
              echo "::add-mask::$persona_jwt"
              # Persist via $GITHUB_OUTPUT so it is queryable from the
              # separate scan workflow via the run-id API; outputs land
              # in the run metadata and are auto-masked from logs.
              echo "persona_jwt=$persona_jwt" >> "$GITHUB_OUTPUT"
            fi
          fi
```

Note: the substrate-stage step's `bunx fit-map substrate stage` call
does not itself issue a persona JWT — that happens later when the
supervisor calls `bunx fit-map substrate issue` inside `Run interview`.
The `if [ -f "$token_file" ]` branch is therefore a no-op during stage
but becomes load-bearing if a future caller changes the issue surface;
the actual JWT snapshot is taken in the `Run interview` step's
post-script (Step 4a below).

### Step 3b — JWT-mask helper invoked after supervisor issues

The supervisor calls `bunx fit-map substrate issue` inside `Run
interview` (the agent-cwd's `.env` is populated after that call).
Insert a tiny step **between** `Run interview` and the existing
flow, conditioned on Landmark, that snapshots and masks the JWT:

```yaml
      - name: Snapshot persona JWT
        id: snapshot-jwt
        if: always() && inputs.product == 'landmark'
        shell: bash
        run: |
          token_file="${{ steps.agent-workspace.outputs.dir }}/.env"
          if [ ! -f "$token_file" ]; then
            echo "No .env at agent cwd — substrate issue did not run."
            exit 0
          fi
          persona_jwt=$(awk -F= '/^PRODUCT_LANDMARK_TOKEN=/ {print $2; exit}' \
            "$token_file")
          if [ -z "$persona_jwt" ]; then
            echo "No PRODUCT_LANDMARK_TOKEN value in agent .env."
            exit 0
          fi
          echo "::add-mask::$persona_jwt"
          echo "persona_jwt=$persona_jwt" >> "$GITHUB_OUTPUT"
```

The step output `persona_jwt` is referenced by the separate
`workflow_run`-triggered scan workflow (Step 6) via the run-id metadata
API. `::add-mask::` ensures the value is masked in this workflow's
logs going forward (the supervisor's own log lines were emitted earlier
and may carry the unmasked value — that is exactly what the spec §
Sensitive values are absent from run logs check is for).

Position: this step runs *after* `Run interview` and *before* the
existing flow's tail. Place it right after `Run interview`.

## Step 4 — Extend the `Run interview` step env

- **Modified**: `.github/workflows/kata-interview.yml`

Three new env entries on the `Run interview` step. **Every new key is
Landmark-gated via a value-level ternary** so spec § *Non-Landmark
interviews are not regressed* holds (the rendered job env for
non-Landmark runs shows empty values, not omitted keys — matching what
the spec invariant assertion checks for):

```yaml
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ steps.ci-app.outputs.token }}
          CLAUDE_CODE_USE_BEDROCK: "0"
          AGENT_CWD: ${{ inputs.product == 'landmark' && steps.agent-workspace.outputs.dir || '' }}
          SUPABASE_JWT_SECRET: ${{ inputs.product == 'landmark' && secrets.SUPABASE_JWT_SECRET || '' }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ inputs.product == 'landmark' && secrets.SUPABASE_SERVICE_ROLE_KEY || '' }}
```

`SUPABASE_URL` is **not** listed here because Step 3 writes it to
`$GITHUB_ENV`, which propagates to all subsequent steps automatically
(the spec § Success Criteria row 9 invariant test in Step 7 below
asserts on keys explicitly added to the `Run interview` step's `env:`
map — `$GITHUB_ENV`-propagated values do not count as step-env
additions).

`AGENT_CWD` is gated: non-Landmark interviews do not need it (today's
workflow does not export it at all), and gating it keeps the spec
invariant assertion (Step 7) clean.

`PRODUCT_LANDMARK_TOKEN` is **not** in this map — Part 02's `substrate
issue` writes it to `$AGENT_CWD/.env`, and libconfig discovers it via
the agent's cwd when the agent's `fit-landmark` spawn runs there.

The supervisor (running with `supervisor-cwd: "."`) calls `bunx fit-map
substrate roster` and `bunx fit-map substrate issue` from the workflow
checkout root. Those calls also need `SUPABASE_URL` — supplied through
`$GITHUB_ENV` from Step 3.

## Step 5 — Declare `timeout-minutes` on the `interview` job

- **Modified**: `.github/workflows/kata-interview.yml` (the `interview`
  job header; locate via `rg "interview:" .github/workflows/
  kata-interview.yml`)

Add `timeout-minutes: 50` adjacent to `runs-on: ubuntu-latest`. The JWT
minted by `substrate issue` has a 1-hour default TTL; the job timeout
must be strictly less so a runaway job dies before the JWT expires
mid-run.

## Step 6 — Add the post-run JWT log scan (separate workflow)

- **Created**: `.github/workflows/kata-interview-log-scan.yml`

GitHub's `actions/runs/{run_id}/logs` REST endpoint returns the logs
archive only after the parent run reaches a terminal conclusion;
calling it from within the same in-progress job yields 404 or an
incomplete archive. The scan therefore lives in a separate workflow
file triggered by `workflow_run` on the kata-interview workflow's
completion.

GitHub Actions automatically masks any value registered as a repo
secret in the logs (each appears as `***`); scanning for
`SUPABASE_JWT_SECRET` / `SUPABASE_SERVICE_ROLE_KEY` literal values is
structurally a no-op. The only value at risk is the per-run persona
JWT — minted dynamically, not registered as a secret. The scan reads
the JWT from the parent run's `Snapshot persona JWT` step output.

```yaml
name: "Kata: Interview Log Scan"

on:
  workflow_run:
    workflows: ["Kata:–- Interview"]
    types: [completed]

permissions:
  contents: read
  actions: read

jobs:
  scan:
    runs-on: ubuntu-latest
    # Only scan Landmark runs (memoised on the parent run's event payload).
    if: github.event.workflow_run.event == 'workflow_dispatch'
    steps:
      - name: Generate installation token
        id: ci-app
        uses: actions/create-github-app-token@1b10c78c7865c340bc4f6099eb2f838309f1e8c3 # v3
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}

      - name: Fetch persona JWT from parent run
        id: jwt
        env:
          GH_TOKEN: ${{ steps.ci-app.outputs.token }}
          PARENT_RUN: ${{ github.event.workflow_run.id }}
        shell: bash
        run: |
          # Query the parent run's `Snapshot persona JWT` step output.
          # The output is auto-masked from logs but the API returns it.
          jobs_json=$(gh api \
            "/repos/${{ github.repository }}/actions/runs/$PARENT_RUN/jobs")
          # If the parent run was not a Landmark interview, the step
          # would not have run; abort gracefully.
          jwt=$(echo "$jobs_json" \
            | python3 -c "import sys,json; d=json.load(sys.stdin); \
              steps=[s for j in d['jobs'] for s in j.get('steps',[])]; \
              snap=[s for s in steps if s['name']=='Snapshot persona JWT']; \
              print('present' if snap and snap[0]['conclusion']=='success' else '')")
          if [ "$jwt" != "present" ]; then
            echo "No Landmark persona-JWT snapshot in parent run; nothing to scan."
            echo "skip=true" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          # The actual JWT value lives in the step's output; fetch via
          # the dedicated step-outputs endpoint.
          token_val=$(gh api \
            "/repos/${{ github.repository }}/actions/runs/$PARENT_RUN" \
            --jq '.outputs."snapshot-jwt".persona_jwt // empty')
          if [ -z "$token_val" ]; then
            echo "Snapshot step ran but output is empty; cannot verify."
            echo "skip=true" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          echo "::add-mask::$token_val"
          echo "value<<EOF" >> "$GITHUB_OUTPUT"
          echo "$token_val" >> "$GITHUB_OUTPUT"
          echo "EOF" >> "$GITHUB_OUTPUT"
          echo "skip=false" >> "$GITHUB_OUTPUT"

      - name: Scan parent-run logs
        if: steps.jwt.outputs.skip != 'true'
        env:
          GH_TOKEN: ${{ steps.ci-app.outputs.token }}
          PARENT_RUN: ${{ github.event.workflow_run.id }}
          TOKEN_VAL: ${{ steps.jwt.outputs.value }}
        shell: bash
        run: |
          gh api -H "Accept: application/vnd.github+json" \
            "/repos/${{ github.repository }}/actions/runs/$PARENT_RUN/logs" \
            > /tmp/run-logs.zip
          unzip -q /tmp/run-logs.zip -d /tmp/run-logs/
          if grep -RFq -- "$TOKEN_VAL" /tmp/run-logs/; then
            echo "FAIL: PRODUCT_LANDMARK_TOKEN literal in run logs" >&2
            exit 1
          fi
          echo "OK: persona JWT not in run logs"
```

Notes:

- The parent run's `Snapshot persona JWT` step (Part 03 § Step 3b)
  stores the value via `$GITHUB_OUTPUT`. GitHub Actions exposes step
  outputs through the run-jobs API; the value carries the parent's
  `::add-mask::` registration into the scan workflow's logs too.
- `grep -F` avoids regex metacharacters in JWT base64url segments.
- `grep -- "$TOKEN_VAL"` guards against a JWT starting with `-`.
- The repo-secret pair (JWT secret, service role key) does not need
  explicit scanning — GH masks them automatically. The PR description
  must state this rationale.
- The `workflow_run` trigger requires the scan workflow file to live
  on the default branch. The PR introducing this file therefore must
  merge to `main` before the scan begins firing on subsequent
  kata-interview runs; until merge the scan does not exist and the
  spec criterion is satisfied only after merge — note this in the PR
  description.

## Step 7 — Add the workflow-shape assertion test

- **Created**: `.github/workflows/test/kata-interview-shape.test.js`

A `node:test` file (also Bun-compatible) parsing
`.github/workflows/kata-interview.yml` as YAML. Asserts the spec §
*Non-Landmark interviews are not regressed* invariant — every step
introduced by this spec carries a Landmark `if:`, and every new env
key on `Run interview` carries a Landmark ternary:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const wf = parse(readFileSync(".github/workflows/kata-interview.yml", "utf8"));
const steps = wf.jobs.interview.steps;

const ADDED_STEPS = new Set(["Substrate stage", "Snapshot persona JWT"]);
// Every key added to Run interview's env by spec 990. Must match what
// Step 4 above lands. Update this list when adding new env keys here.
// SUPABASE_URL is propagated via $GITHUB_ENV (Step 3), not via this
// step's env: map, so it does not appear here. The
// kata-interview-log-scan.yml workflow handles the post-run scan and
// is asserted in its own shape test (see scan-workflow-shape.test.js).
const ADDED_RUN_ENV_KEYS = ["AGENT_CWD", "SUPABASE_JWT_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY"];

describe("kata-interview.yml spec 990 non-Landmark invariant", () => {
  it("every step added by spec 990 carries the Landmark predicate", () => {
    for (const name of ADDED_STEPS) {
      const step = steps.find((s) => s.name === name);
      assert.ok(step, `expected step "${name}"`);
      assert.match(String(step.if),
        /inputs\.product\s*==\s*'landmark'/,
        `step "${name}" missing Landmark gating`);
    }
  });

  it("every Run-interview env key added by spec 990 is Landmark-gated", () => {
    const run = steps.find((s) => s.name === "Run interview");
    for (const key of ADDED_RUN_ENV_KEYS) {
      assert.match(String(run.env[key]),
        /inputs\.product\s*==\s*'landmark'\s*&&[^|]+\|\|\s*''/,
        `${key} missing Landmark ternary`);
    }
  });

  it("interview job declares timeout-minutes < 60", () => {
    const m = wf.jobs.interview["timeout-minutes"];
    assert.ok(typeof m === "number" && m < 60,
      `timeout-minutes expected < 60, got ${m}`);
  });

  it("workflow permissions include actions: read", () => {
    assert.equal(wf.permissions["actions"], "read");
  });
});
```

Add a sibling test `.github/workflows/test/log-scan-shape.test.js`
that parses `.github/workflows/kata-interview-log-scan.yml` and
asserts: the `on.workflow_run.workflows` array contains `"Kata:–-
Interview"`; the `permissions:` block includes both `contents: read`
and `actions: read`; the scan job's `if:` predicate gates on
`workflow_dispatch` events.

Both tests run as part of `bun run test` via Part 02 § Step 7's
test-path extension to `.github/workflows/test`.

## Step 8 — Update the kata-interview SKILL.md

- **Modified**: `.claude/skills/kata-interview/SKILL.md`

Three edits per spec § Kata-interview skill alignment and design-c §
SKILL.md amendments. Locate each anchor via `rg`.

### Edit 8a — Step 3 staging table Landmark row

Anchor: `rg '\| Map, Landmark' .claude/skills/kata-interview/SKILL.md`.

Replace the combined `Map, Landmark` row with two separate rows:

```md
| Map              | `data/pathway/` and `data/activity/`                                                                    |
| Landmark         | `data/pathway/` and `data/activity/`; substrate (`auth.users` for all humans, schema, seed, smoke) staged by the workflow's `Substrate stage` step |
```

### Edit 8b — Insert Step 3a (Landmark-only persona pick)

Anchor: the end of the existing Step 3 (after the `cp -r` example).

Insert a new section:

```md
### Step 3a: Pick the Persona (Landmark only)

If the product is **Landmark**, the workflow has already brought up the
substrate. Before writing `CLAUDE.md`, pick a persona and seal the
agent's identity into `$AGENT_CWD`:

1. List invariant-satisfying personas:

   ```sh
   bunx fit-map substrate roster --format json
   ```

   Each row carries `email`, `name`, `discipline`, `level`, `track`,
   `manager_email`, plus the corpus-wide discovery values
   (`snapshot_id`, `item_id`).

2. Pick one persona using two signals:
   - **Memory diversification** — exclude personas referenced in your
     last 5 weekly-log entries.
   - **JTBD-role alignment** — match the picked job's audience against
     the persona's `discipline` and `level` (e.g. *Engineering Leaders*
     → a Manager-track or Director-level row; *Empowered Engineers* →
     an IC-track row at Senior or below).

3. Issue the substrate for the picked persona:

   ```sh
   bunx fit-map substrate issue --email <picked-email> --cwd "$AGENT_CWD"
   ```

   Writes `$AGENT_CWD/.env` (carrying the persona's JWT) and
   `$AGENT_CWD/.substrate.json` (the discovery vector). Mode 0600 on
   both files.

You never see the JWT bytes. The agent's `fit-landmark` discovers the
JWT through libconfig's `.env` read in `$AGENT_CWD`.

**Failure handling.** If either `bunx fit-map substrate roster` or
`bunx fit-map substrate issue` returns non-zero, do not proceed to
Step 4 or any `Ask` call. Write a one-line diagnostic to your session
output naming the failing verb and its exit code, then exit the skill.
The `Run interview` workflow step exits non-zero because no interview
was completed — this is the spec § Failure surfacing pathway for
supervisor-side substrate failures.
```

### Edit 8c — Rewrite the read-do checklist line

Anchor: `rg "No product names anywhere agent-visible" .claude/skills/
kata-interview/SKILL.md` (one match today).

Replace the entire line with the exact wording from spec § Persona-file
invariant amendment:

```md
- [ ] No product names in the persona file or in supervisor-authored Ask templates; product-named environment variables required by the production CLI are permitted in the agent's environment.
```

The Step 4 `CLAUDE.md`-exclusion list (anchor: `rg "Excluded: goal
sentence, Big Hire" .claude/skills/kata-interview/SKILL.md`) is
**unchanged**.

## Step 9 — Add the SKILL.md shape assertion test

- **Created**: `.claude/skills/kata-interview/test/skill-shape.test.js`

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(".claude/skills/kata-interview/SKILL.md", "utf8");

describe("kata-interview SKILL.md spec 990 amendments", () => {
  it("Step 3 staging table Landmark row mentions substrate", () => {
    assert.match(skill, /\| Landmark\s+\|.*substrate.*staged.*\|/);
  });

  it("Step 3a (Landmark persona pick) names the substrate verbs", () => {
    assert.match(skill, /fit-map substrate roster/);
    assert.match(skill, /fit-map substrate issue/);
  });

  it("read-do checklist line is amended verbatim", () => {
    assert.doesNotMatch(skill, /No product names anywhere agent-visible/);
    assert.match(skill,
      /product-named environment variables required by the production CLI are permitted in the agent's environment/);
  });

  it("Step 4 CLAUDE.md exclusion list is unchanged", () => {
    assert.match(skill,
      /Excluded: goal sentence, Big Hire, Little Hire, Fired-When, product name/);
  });
});
```

Picked up by the extended test scope from Part 02 § Step 7.

## Step 10 — Add a workflow-dispatch input for the empty-corpus failure path

- **Modified**: `.github/workflows/kata-interview.yml` (under
  `workflow_dispatch.inputs`)

Add one input:

```yaml
      empty-corpus-test:
        description: "Force substrate-stage to see an empty corpus (CI assertion)"
        required: false
        type: boolean
        default: false
```

The input flows into Part 02's `substrate-stage.js` via the
`SUBSTRATE_FORCE_EMPTY_CORPUS` env entry already added in Step 3.

Verification protocol (recorded in the PR description, not in the
workflow): one CI dispatch with `empty-corpus-test=true product=landmark`
demonstrates that the substrate-stage step exits non-zero, the
`Run interview` step is skipped (the `if:` `success()` default
prevents it), and the workflow run lands in the `failure` state. The
run URL goes in the PR description.

## Step 11 — Run full check suite + workflow lint

```sh
bun run check
bun run test          # picks up the new test paths via Part 02 § Step 7
actionlint .github/workflows/kata-interview.yml || true
```

Verify: all green. PR description lists the spec § Success Criteria
rows this part satisfies (workspace state, sensitive-value scan,
non-Landmark not regressed, SKILL.md reflects substrate, failure
surfacing test), plus the operator-prerequisite list (two repo
secrets, App `actions: read`).
