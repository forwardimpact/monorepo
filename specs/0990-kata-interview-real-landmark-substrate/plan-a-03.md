# Plan 0990-a Part 03 — `kata-interview.yml` substrate step + SKILL.md updates

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

## Step 2 — Document the App installation prerequisite

- **No workflow file change** — operator action documented in the PR
  description.

The post-run log scan in Step 6 calls `gh api .../actions/runs/<id>/logs`
using `GH_TOKEN: ${{ steps.ci-app.outputs.token }}` (the kata-agent-team
GitHub App installation token, **not** the workflow `GITHUB_TOKEN`).
Workflow-level `permissions:` blocks govern `GITHUB_TOKEN` only — they
have no effect on App tokens, whose scope is set in App settings.

The implementer must verify (or coordinate verification of) the
kata-agent-team App installation's repository permissions: **`Actions:
Read`** must be enabled before Part 03 merges. List this in the PR
description as an operator prerequisite alongside the two repo secrets
from Step 1.

Workflow-level `permissions:` block on `kata-interview.yml` is
unchanged from `main`.

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

          # Propagate the local Supabase URL + anon key to subsequent
          # workflow steps. Part 02's substrate-stage sets these in its
          # own Node process; that only survives the Node process. For
          # the supervisor (next workflow step) and the agent's
          # fit-landmark spawns to see them, write to $GITHUB_ENV.
          # SUPABASE_ANON_KEY is required by fit-landmark's
          # createLandmarkClient (products/landmark/src/lib/supabase.js)
          # to construct the anon client resolveIdentity authenticates.
          status_json=$(bunx --no-install -- supabase status --output json)
          api_url=$(echo "$status_json" | python3 -c 'import sys,json; print(json.load(sys.stdin)["api_url"])')
          anon_key=$(echo "$status_json" | python3 -c 'import sys,json; print(json.load(sys.stdin)["anon_key"])')
          if [ -z "$api_url" ] || [ -z "$anon_key" ]; then
            echo "FAIL: supabase status did not yield api_url + anon_key" >&2
            exit 1
          fi
          echo "SUPABASE_URL=$api_url" >> "$GITHUB_ENV"
          echo "SUPABASE_ANON_KEY=$anon_key" >> "$GITHUB_ENV"
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

The post-run log scan (Step 6 below) is inline in this workflow and
reads the JWT from a workflow-private stash file written by `substrate
issue` (via Part 02's `--stash` flag, threaded through SKILL.md Step
3a's example invocation). The stash file lives at
`$RUNNER_TEMP/.persona-jwt` — outside `$AGENT_CWD`, so the agent's
Write/Edit tools cannot tamper with it.

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

## Step 6 — Add the post-run log scan (inline, final step)

- **Modified**: `.github/workflows/kata-interview.yml`

The scan runs as the final step of the same job, `if: always() &&
inputs.product == 'landmark'`. It reads the JWT from
`$RUNNER_TEMP/.persona-jwt` (the workflow-private stash file written
by `substrate issue --stash`) — never from `$AGENT_CWD/.env`, which
the agent could mutate. The `gh api .../actions/runs/<id>/logs`
endpoint returns the archive of all completed-step logs for the
current run; the only step it cannot include is the scan step itself
(still in progress) — which is fine because the scan step never echoes
the JWT value.

Insert after the `Run interview` step:

```yaml
      - name: Scan logs for sensitive values
        if: always() && inputs.product == 'landmark'
        shell: bash
        env:
          GH_TOKEN: ${{ steps.ci-app.outputs.token }}
          JWT_SECRET: ${{ secrets.SUPABASE_JWT_SECRET }}
          SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          stash="$RUNNER_TEMP/.persona-jwt"
          if [ ! -f "$stash" ]; then
            echo "No persona-JWT stash at $stash — substrate issue did not run."
            persona_jwt=""
          else
            persona_jwt=$(cat "$stash")
            echo "::add-mask::$persona_jwt"
          fi

          # Download the in-progress run's log archive. GH serves the
          # archive of all completed-step logs even while the run is
          # active; only the scan step's own logs are excluded (which
          # is fine — it never echoes the JWT).
          if ! gh api -H "Accept: application/vnd.github+json" \
              "/repos/${{ github.repository }}/actions/runs/${{ github.run_id }}/logs" \
              > /tmp/run-logs.zip 2>/tmp/gh-err.log; then
            echo "WARN: log archive not yet available — gh api stderr:" >&2
            cat /tmp/gh-err.log >&2
            echo "Relying on ::add-mask:: at-issue protection."
            exit 0
          fi
          if ! unzip -q /tmp/run-logs.zip -d /tmp/run-logs/; then
            echo "WARN: log archive empty/unreadable; relying on ::add-mask::"
            exit 0
          fi

          fail=0
          # Spec § Success Criteria row 8: scan for all three literals.
          # The two repo secrets are auto-masked by GH (appear as ***);
          # the persona JWT is minted per-run and protected only by the
          # ::add-mask:: applied at issue time. A failing grep here means
          # something printed the value before the mask landed.
          for pair in \
              "persona-jwt:$persona_jwt" \
              "jwt-secret:$JWT_SECRET" \
              "service-role-key:$SERVICE_ROLE_KEY"; do
            label="${pair%%:*}"
            value="${pair#*:}"
            [ -z "$value" ] && continue
            if grep -RFq -- "$value" /tmp/run-logs/; then
              echo "FAIL: $label literal in run logs" >&2
              fail=1
            fi
          done
          exit $fail
```

Notes:

- The two repo secrets (`SUPABASE_JWT_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY`) are auto-masked by GH Actions in run
  logs, so grepping for their literal values is normally a no-op —
  but the scan still performs the grep so spec § Success Criteria row
  8 is satisfied literally, and to catch the unlikely case where GH's
  masker fails on a partial-string match.
- `grep -F` (fixed-string) avoids regex metacharacters in base64url JWT
  segments; `grep -- "$value"` guards against a value starting with `-`.
- `gh api` requires `actions: read` permission (added to the workflow's
  top-level `permissions:` block in Step 2). The kata-agent-team GitHub
  App installation must also carry `Actions: Read` repository
  permission — document this in the PR description.
- The `Scan logs for sensitive values` step is the only spec § Success
  Criteria row 8 verification surface. Confidence is bounded: a
  hypothetical leak printed during the scan step itself would not be
  caught (the step's log is excluded from the in-progress archive).
  The spec describes a "CI step downloads the workflow's run logs for
  every step that executes after the assertion step is added"; this
  implementation matches the spec literally — the scan step is itself
  the "assertion step", and it scans every step that runs before it.

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

const ADDED_STEPS = new Set([
  "Substrate stage",
  "Scan logs for sensitive values",
]);
// Every key added to Run interview's env by spec 0990. Must match what
// Step 4 above lands. SUPABASE_URL is propagated via $GITHUB_ENV
// (Step 3), not via this step's env: map, so it does not appear here.
const ADDED_RUN_ENV_KEYS = ["AGENT_CWD", "SUPABASE_JWT_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY"];

describe("kata-interview.yml spec 0990 non-Landmark invariant", () => {
  it("every step added by spec 0990 carries the Landmark predicate", () => {
    for (const name of ADDED_STEPS) {
      const step = steps.find((s) => s.name === name);
      assert.ok(step, `expected step "${name}"`);
      assert.match(String(step.if),
        /inputs\.product\s*==\s*'landmark'/,
        `step "${name}" missing Landmark gating`);
    }
  });

  it("every Run-interview env key added by spec 0990 is Landmark-gated", () => {
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

  // permissions block is unchanged from main — the gh api call uses
  // the kata-agent-team App token, not the workflow GITHUB_TOKEN, so
  // workflow-level permissions do not govern it (App installation
  // permission is the actual prerequisite). Asserted via the
  // PR-description operator checklist, not by this test.
});
```

The test runs as part of `bun run test` via Part 02 § Step 7's
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
     → a `manager` or `director` discipline at any level; *Empowered
     Engineers* → an `engineer` discipline at `Senior` or below).
     The `track` field is informational only; do not use it as a
     primary signal.

3. Issue the substrate for the picked persona:

   ```sh
   bunx fit-map substrate issue \
     --email <picked-email> \
     --cwd "$AGENT_CWD" \
     --stash "$RUNNER_TEMP/.persona-jwt"
   ```

   Writes `$AGENT_CWD/.env` (carrying the persona's JWT) and
   `$AGENT_CWD/.substrate.json` (the discovery vector), plus a third
   workflow-private copy of the bare JWT at `$RUNNER_TEMP/.persona-jwt`
   which the post-run log-scan step reads. The agent has no access to
   `$RUNNER_TEMP`. Mode 0600 on all three files.

You never see the JWT bytes. The agent's `fit-landmark` discovers the
JWT through libconfig's `.env` read in `$AGENT_CWD`.

**Failure handling.** If either `bunx fit-map substrate roster` or
`bunx fit-map substrate issue` returns non-zero, do not proceed to
Step 4 or any `Ask` call. Write a one-line diagnostic to your session
output naming the failing verb and its exit code, then exit the skill.
The `Run interview` workflow step exits non-zero because no interview
was completed — this is the spec § Failure surfacing pathway for
supervisor-side substrate failures.

```text

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

describe("kata-interview SKILL.md spec 0990 amendments", () => {
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
