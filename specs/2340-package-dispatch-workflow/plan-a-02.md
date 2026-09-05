# Plan 2340-a Part 02: `kata-agent` runs the dispatch

Tier-3 source. It merges only after tier 2 tags `gemba-bootstrap`, because
step 3 pins that release.

## Step 1: Declare the five new inputs

Files modified: `products/kata/actions/kata-agent/action.yml`.

Add `task-event` beside `task-text` and `task-file` under
`# --- Agent configuration ---`:

```yaml
  task-event:
    description: Path to a native GitHub event payload JSON, typically github.event_path (mutually exclusive with task-text and task-file). The gemba-harness CLI composes the task from the payload.
    required: false
```

Add the three bridge inputs under `# --- Discussion (discuss mode) ---`,
beside `discussion-id` and `resume-context`:

```yaml
  callback-url:
    description: URL that receives the run's terminal conclusion. A non-empty value enables the callback step. The step delivers on success and on failure.
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

Verify: `rg -e 'task-event' -e 'callback-url' -e 'correlation-id' -e
'inbox-url' -e 'bun-version' products/kata/actions/kata-agent/action.yml`
matches all five (success criteria 1, 2, and 5).

## Step 2: Stamp the token the action mints

The stamp is a step output, not a `GITHUB_ENV` write. `GITHUB_ENV` is job-wide
and would leak past the action boundary.

Files modified: `products/kata/actions/kata-agent/action.yml`.

Insert this step directly after `Generate installation token` and before the
checkout:

```yaml
    # Pair the mint time with the identity of the job execution that issued the
    # token, in one stamp. The stamp rides the same step env as GH_TOKEN below,
    # so no carried or resumed session state can pair a token with another
    # token's stamp. create-github-app-token exports no expiry, so `exp`
    # derives from the ~1h (3600s) installation-token TTL. This step captures
    # `mint` one step AFTER the mint, so `mint` trails the true mint by the
    # inter-step latency. The 120s margin keeps `exp` a conservative
    # UNDER-estimate: the accounting must never report a dead token as alive.
    # Run id plus run attempt make "issuing job execution ≠ current ⇒ presumed
    # revoked" a local comparison. A re-run attempt shares GITHUB_RUN_ID and
    # revokes attempt 1's token. The auth-anomaly playbook consumes the stamp.
    - name: Stamp installation token
      id: stamp
      shell: bash
      run: |
        set -euo pipefail
        mint=$(date +%s)
        echo "value=mint=${mint};exp=$((mint + 3600 - 120));run=${GITHUB_RUN_ID};attempt=${GITHUB_RUN_ATTEMPT}" >> "$GITHUB_OUTPUT"
```

Verify: `rg KATA_GH_TOKEN_STAMP products/kata/actions/kata-agent/action.yml`
matches step 4's env line (success criterion 4, first half).

## Step 3: Forward the Bun version and repin the bootstrap

Files modified: `products/kata/actions/kata-agent/action.yml`.

The `gemba-bootstrap` step gains one `with:` key and moves to the release that
part 01 produced. Take the 40-character SHA from the tier-2 tag.

```yaml
    - uses: forwardimpact/gemba-bootstrap@<tier-2-sha> # v1.0.21
      with:
        token: ${{ inputs.wiki == 'true' && steps.ci-app.outputs.token || '' }}
        app-slug: ${{ inputs.app-slug }}
        app-id: ${{ inputs.app-id }}
        # An empty value reaches the bootstrap, which resolves its own pinned
        # default. The version literal keeps one home.
        bun-version: ${{ inputs.bun-version }}
        clis: ${{ inputs.wiki == 'true' && 'gemba-wiki gemba-harness gemba-trace' || 'gemba-harness gemba-trace' }}
```

Verify: the pinned SHA resolves to the `v1.0.21` tag on
`forwardimpact/gemba-bootstrap`, and `action.yml` at that SHA declares
`bun-version` with `default: ""`.

## Step 4: Hand the event and the bridge env to the harness

Files modified: `products/kata/actions/kata-agent/action.yml`.

The `Assess and Act` step gains four env entries and one `with:` key.

| Block   | Addition                                                  |
| ------- | --------------------------------------------------------- |
| `env:`  | `KATA_GH_TOKEN_STAMP: ${{ steps.stamp.outputs.value }}`    |
| `env:`  | `CALLBACK_URL: ${{ inputs.callback-url }}`                 |
| `env:`  | `CORRELATION_ID: ${{ inputs.correlation-id }}`             |
| `env:`  | `INBOX_URL: ${{ inputs.inbox-url }}`                       |
| `with:` | `task-event: ${{ inputs.task-event }}`                     |

Place `task-event` beside `task-text` and `task-file`. The `gemba-harness`
action forwards all three and lets the CLI enforce exclusivity. Place
`KATA_GH_TOKEN_STAMP` directly under `GH_TOKEN` with this comment:

```yaml
        # Token freshness stamp. It rides the same step env as GH_TOKEN so the
        # accounting can never pair a token with another token's stamp. See the
        # "Stamp installation token" step and .claude/agents/x-auth-anomaly.md.
```

The `discuss` command reads `CALLBACK_URL`, `INBOX_URL`, and `CORRELATION_ID`
from this env. `facilitate` ignores them.

Verify: `rg 'task-event' products/kata/actions/kata-agent/action.yml` matches
the input and its forwarding.

## Step 5: Deliver the callback

Files modified: `products/kata/actions/kata-agent/action.yml`.

Insert this step directly after `Assess and Act` and before
`Refresh wiki (post-run)`. The bridge then gets its verdict before the wiki
round trip, and cost still reports last.

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
        gemba-harness callback \
          --trace-file="$TRACE_FILE" \
          --callback-url="$CALLBACK_URL" \
          --correlation-id="$CORRELATION_ID" \
          --run-url="$RUN_URL" \
          --discussion-id="$DISCUSSION_ID"
```

Verify: `rg curl products/kata/actions/kata-agent/action.yml` returns nothing
(success criterion 3, second half), and the eleven steps run in the order
[design-a.md § Step sequence](design-a.md) lists.

## Step 6: Document the new surface

Files modified: `products/kata/actions/kata-agent/README.md`.

| Section                | Change                                                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opening paragraph      | Add one sentence: the action stamps the token it mints, and the agent reads the stamp as `KATA_GH_TOKEN_STAMP`.                                                                                                                                                            |
| Agent Configuration    | Add a `task-event` row: `Yes*`, no default, "Path to a native GitHub event payload (`${{ github.event_path }}`); the CLI composes the task". Change the `\*` footnote to "Supply exactly one of `task-text`, `task-file`, or `task-event`."                                |
| Discuss mode           | Retitle to `Discuss mode and the bridge contract`. Add `callback-url`, `correlation-id`, and `inbox-url` rows to its table. Add one paragraph: a non-empty `callback-url` makes the action POST the terminal payload after the run, on success and on failure alike.       |
| Optional Overrides     | Add a `bun-version` row: `No`, default `""`, "Bun version for the bootstrap; empty takes the bootstrap's default".                                                                                                                                                        |
| New `Event mode` block | One short usage block: a dispatch workflow that passes `task-event: ${{ github.event_path }}`, `mode: ${{ inputs.discussion_id != '' && 'discuss' \|\| 'facilitate' }}`, and the four bridge inputs.                                                                       |

Keep the README external-audience: `npx`, no `bun`, no monorepo paths, per
[products/CLAUDE.md § Audience](../../products/CLAUDE.md).

Verify: `rg 'task-event' products/kata/actions/kata-agent/` matches
`action.yml` and `README.md` (success criterion 1).

## Step 7: Repository checks

Files modified: none.

Run `bun run check` and `bun run test`. Both pass. The
`sibling-composite-actions` enumeration is unchanged, because this part adds no
action and retires none.

Verify: both commands exit zero.
