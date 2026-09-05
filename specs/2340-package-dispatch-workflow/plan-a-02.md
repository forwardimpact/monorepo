# Plan 2340-a Part 02: `kata-agent` runs the dispatch

It merges only after part 04 tier 2 tags `gemba-bootstrap`, because step 3 pins
that release.

## Step 1: Declare the five new inputs

Files modified: `products/kata/actions/kata-agent/action.yml`.

Add `task-event` beside `task-text` and `task-file` under
`# --- Agent configuration ---`, and correct both neighbours, which name only
two of the three task sources today:

```yaml
  task-text:
    description: Inline task text (mutually exclusive with task-file and task-event)
    required: false
  task-file:
    description: Path to task file (mutually exclusive with task-text and task-event)
    required: false
  task-event:
    description: Path to a native GitHub event payload JSON, typically github.event_path (mutually exclusive with task-text and task-file). The gemba-harness CLI composes the task from the payload.
    required: false
    default: ""
```

Add the three bridge inputs under `# --- Discussion (discuss mode) ---`,
beside `discussion-id` and `resume-context`:

```yaml
  callback-url:
    description: URL that receives the run's terminal conclusion. A non-empty value enables the callback step, which delivers on success and on failure. Keep `trace` enabled, because the verb reads the trace to build the payload.
    required: false
    default: ""
  correlation-id:
    description: Correlation id the callback payload echoes back to the caller
    required: false
    default: ""
  inbox-url:
    description: Long-poll URL that injects messages into a live discuss run
    required: false
    default: ""
```

Add `bun-version` under `# --- Optional overrides ---`:

```yaml
  bun-version:
    description: Bun version the bootstrap installs. Leave it empty to take the bootstrap's pinned default.
    required: false
    default: ""
```

Update the action's top-level `description:` so it covers the new lifecycle:

```yaml
description: >
  Run a Kata agent workflow. The action generates and stamps an installation
  token, checks out the repository, bootstraps the environment, runs the agent
  with gemba-harness from text, a file, or a GitHub event, and delivers the
  run's conclusion to a callback URL when the caller names one.
```

Verify: `rg -e 'task-event' -e 'callback-url' -e 'correlation-id' -e
'inbox-url' -e 'bun-version' products/kata/actions/kata-agent/action.yml`
matches all five (success criteria 1, 2, and 5).

## Step 2: Stamp the token the action mints

Files modified: `products/kata/actions/kata-agent/action.yml`.

Insert this step directly after `Generate installation token` and before the
checkout:

```yaml
    # Pair the mint time with the identity of the job execution that issued the
    # token, in one stamp. The stamp is a step output rather than a GITHUB_ENV
    # write, because GITHUB_ENV is job-wide and would leak past the action
    # boundary. It rides the same step env as GH_TOKEN below, so no carried or
    # resumed session state can pair a token with another token's stamp.
    # create-github-app-token exports no expiry, so `exp` derives from the ~1h
    # (3600s) installation-token TTL. This step captures `mint` one step AFTER
    # the mint, so `mint` trails the true mint by the inter-step latency. The
    # 120s margin keeps `exp` a conservative UNDER-estimate: the accounting must
    # never report a dead token as alive. Run id plus run attempt make "issuing
    # job execution ≠ current ⇒ presumed revoked" a local comparison. A re-run
    # attempt shares GITHUB_RUN_ID and revokes attempt 1's token. The
    # auth-anomaly playbook consumes the stamp.
    - name: Stamp installation token
      id: stamp
      shell: bash
      run: |
        set -euo pipefail
        mint=$(date +%s)
        echo "value=mint=${mint};exp=$((mint + 3600 - 120));run=${GITHUB_RUN_ID};attempt=${GITHUB_RUN_ATTEMPT}" >> "$GITHUB_OUTPUT"
```

Verify: `rg -A8 'id: stamp' products/kata/actions/kata-agent/action.yml` shows
the step writing `value=` to `$GITHUB_OUTPUT`, and the step sits between the
mint and the checkout.

## Step 3: Forward the Bun version and repair three pins

Files modified: `products/kata/actions/kata-agent/action.yml`.

Move `gemba-bootstrap` to the release part 04 tier 2 produced. Read the
40-character SHA from the `v1.0.21` tag in the **`forwardimpact/gemba-bootstrap`
sibling repository**, never from a monorepo commit. Keep both existing comment
blocks, the one above `- uses:` and the one above `clis:`.

```yaml
    - uses: forwardimpact/gemba-bootstrap@<sibling-v1.0.21-sha> # v1.0.21
      with:
        token: ${{ inputs.wiki == 'true' && steps.ci-app.outputs.token || '' }}
        app-slug: ${{ inputs.app-slug }}
        app-id: ${{ inputs.app-id }}
        # An empty value reaches the bootstrap, which resolves its own pinned
        # default. The version literal keeps one home.
        bun-version: ${{ inputs.bun-version }}
        clis: ${{ inputs.wiki == 'true' && 'gemba-wiki gemba-harness gemba-trace' || 'gemba-harness gemba-trace' }}
```

Repair the two third-party pins in the same file. `kata-agent` sits behind
`kata-dispatch.yml` on both, and Dependabot never scans this directory, so
packaging the dispatch would move every dispatch run onto the older pair
permanently:

| Step                        | From                                          | To                                                   |
| --------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| `Generate installation token` | `1b10c78c7865c340bc4f6099eb2f838309f1e8c3 # v3` | `bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3`     |
| `Checkout`                  | `de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6` | `3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` |

Verify: the `gemba-bootstrap` pin resolves to the `v1.0.21` tag on the sibling,
`action.yml` at that SHA declares `bun-version` with `default: ""`, both prior
comments survive, and `rg -e 'checkout@3d3c42e5' -e 'app-token@bcd2ba49'
products/kata/actions/kata-agent/action.yml` matches both new pins.

## Step 4: Hand the event and the bridge env to the harness

Files modified: `products/kata/actions/kata-agent/action.yml`.

The `Assess and Act` step gains four env entries and one `with:` key.

| Block   | Addition                                               |
| ------- | ------------------------------------------------------ |
| `env:`  | `KATA_GH_TOKEN_STAMP: ${{ steps.stamp.outputs.value }}` |
| `env:`  | `CALLBACK_URL: ${{ inputs.callback-url }}`              |
| `env:`  | `CORRELATION_ID: ${{ inputs.correlation-id }}`          |
| `env:`  | `INBOX_URL: ${{ inputs.inbox-url }}`                    |
| `with:` | `task-event: ${{ inputs.task-event }}`                  |

Place `task-event` beside `task-text` and `task-file`. Place
`KATA_GH_TOKEN_STAMP` directly under `GH_TOKEN` with this comment:

```yaml
        # Token freshness stamp. It rides the same step env as GH_TOKEN so the
        # accounting can never pair a token with another token's stamp. See the
        # "Stamp installation token" step and .claude/agents/x-auth-anomaly.md.
```

The `discuss` command reads `CALLBACK_URL`, `INBOX_URL`, and `CORRELATION_ID`
from this env. `facilitate` ignores them.

Verify: `rg 'task-event' products/kata/actions/kata-agent/action.yml` matches
the input and its forwarding; `rg KATA_GH_TOKEN_STAMP
products/kata/actions/kata-agent/action.yml` matches this env line (success
criterion 4, first half); and the pinned `gemba-harness` SHA
(`8570a09c… # v1.0.5`) declares a `task-event` input, so the forwarded key is
not silently dropped.

## Step 5: Deliver the callback

Files modified: `products/kata/actions/kata-agent/action.yml`.

Insert this step directly after `Assess and Act` and before
`Refresh wiki (post-run)`, so the bridge gets its verdict before the wiki round
trip and cost still reports last.

```yaml
    # Deliver the run's conclusion to the caller that dispatched it, for
    # example a Microsoft Teams or GitHub Discussions bridge. The step runs on
    # both success and failure of the run step, so a caller always gets a
    # verdict. `gemba-harness callback` builds the payload from the trace, and
    # posts the same shape with `verdict: failed` when the run produced none.
    # So this step needs no file guard and no inline payload.
    - name: Deliver callback
      if: always() && inputs.callback-url != ''
      shell: bash
      env:
        CALLBACK_URL: ${{ inputs.callback-url }}
        CORRELATION_ID: ${{ inputs.correlation-id }}
        DISCUSSION_ID: ${{ inputs.discussion-id }}
        RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        TRACE_FILE: ${{ steps.assess.outputs.trace-file }}
      run: |
        set -euo pipefail
        gemba-harness callback \
          --trace-file="$TRACE_FILE" \
          --callback-url="$CALLBACK_URL" \
          --correlation-id="$CORRELATION_ID" \
          --run-url="$RUN_URL" \
          --discussion-id="$DISCUSSION_ID"
```

Verify: `rg curl products/kata/actions/kata-agent/action.yml` returns nothing
(success criterion 3, this file's half), and the eleven steps read in this
order:

    1 Kata killswitch             7 Assess and Act
    2 Generate installation token 8 Deliver callback
    3 Stamp installation token    9 Refresh wiki (post-run)
    4 Checkout                   10 Push wiki changes
    5 gemba-bootstrap            11 Report run cost
    6 Refresh wiki (pre-run)

## Step 6: Keep the redirect rationale with the cost step

Files modified: `products/kata/actions/kata-agent/action.yml`.

Part 04 tier 5 deletes the reference consumer's seven-line comment that guards
the cost step's `>>` redirect against a 64 KiB pipe truncation. Fold that
reasoning into the `Report run cost` step here, so it survives the deletion:

```yaml
    # Sum spend across every participant. Redirect with `>>` and never pipe:
    # a pipe truncates at 64 KiB and silently drops the tail of a long table.
    # gemba-trace cost tolerates a missing trace, because the run may fail
    # before it produces one. So this step needs no file guard.
```

Verify: `rg '64 KiB' products/kata/actions/kata-agent/action.yml` matches.

## Step 7: Document the new surface

Files modified: `products/kata/actions/kata-agent/README.md`.

| Section                | Change                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opening paragraph      | Add one sentence: the action stamps the token it mints, and the agent reads the stamp as `KATA_GH_TOKEN_STAMP`. In the same paragraph, correct the retired `fit-harness` link so it names `gemba-harness`.                                                          |
| Agent Configuration    | Add a `task-event` row: `Yes*`, no default, "Path to a native GitHub event payload (`${{ github.event_path }}`); the CLI composes the task". Change the `\*` footnote to "Supply exactly one of `task-text`, `task-file`, or `task-event`."                          |
| Discuss mode           | Retitle to `Discuss mode and the bridge contract`. Add `callback-url`, `correlation-id`, and `inbox-url` rows. Add one paragraph: a non-empty `callback-url` makes the action POST the terminal payload after the run, on success and on failure alike.              |
| Discuss mode           | Add one warning sentence: with `trace: "false"` and a `callback-url`, the verb has no trace to read and posts the no-trace placeholder, so a bridge caller keeps `trace` enabled (design-a.md § `kata-agent` interface).                                             |
| Optional Overrides     | Add a `bun-version` row: `No`, default `""`, "Bun version for the bootstrap; empty takes the bootstrap's default". Add the `killswitch` row the table omits today, because part 03 makes that input the sole killswitch gate for every generated workflow.           |
| New `Event mode` block | One short usage block: a dispatch workflow that passes `task-event: ${{ github.event_path }}`, `mode: ${{ inputs.discussion_id != '' && 'discuss' \|\| 'facilitate' }}`, and the four bridge inputs.                                                                 |

Keep the README external-audience: `npx`, no `bun`, no monorepo paths, per
[products/CLAUDE.md § Audience](../../products/CLAUDE.md).

Verify: `rg 'task-event' products/kata/actions/kata-agent/` matches
`action.yml` and `README.md` (success criterion 1), and `rg -e fit-harness
products/kata/actions/kata-agent/README.md` returns nothing.

## Step 8: Repository checks

Files modified: none.

Run `bun run check` and `bun run test`. Both pass. The
`sibling-composite-actions` enumeration is unchanged, because this part adds no
action and retires none.

Verify: both commands exit zero.
