# Plan 1230-a — Part 03: Workflow renames + channel-agnostic dispatch

Rename `agent-react.yml` → `kata-dispatch.yml` and `agent-team.yml` →
`kata-shift.yml`, strip the Discussion event handling and
`addDiscussionComment` prompt blob from the dispatch workflow, and add the
`discussion_id` and `resume_context` `workflow_dispatch` inputs. Bypass
the `forwardimpact/fit-eval@v1` composite action where the new flags are
needed and invoke `node libraries/libeval/bin/fit-eval.js` directly.

Libraries used: none (YAML + bash only).

## Step 3.1 — Rename `agent-react.yml` → `kata-dispatch.yml`

Modified (via `git mv`):
- `.github/workflows/agent-react.yml` → `.github/workflows/kata-dispatch.yml`

Edit the new file:
- Header `name: "Agent: React"` → `name: "Kata: Dispatch"`.
- Concurrency group `agent-react-` prefix → `kata-dispatch-`.

Verify: `ls .github/workflows/{agent-react,kata-dispatch}.yml` — first absent, second present.

## Step 3.2 — Remove Discussion event triggers

Modified: `.github/workflows/kata-dispatch.yml`.

Delete:
- Lines 14–17 (the `discussion:` and `discussion_comment:` `on:` entries).
- In the `if:` expression at the renamed line ~59, remove the trailing
  `|| github.event_name == 'discussion' || github.event_name == 'discussion_comment'`.
- The `DISCUSSION_NUMBER` / `DISCUSSION_NODE_ID` / `DISCUSSION_TITLE` /
  `DISCUSSION_CATEGORY` env declarations and every reference to them in
  the `AUTHOR` / `AUTHOR_TYPE` / `ITEM_URL` fallback chains.
- The `discussion)` and `discussion_comment)` arms of the `case "$EVENT_NAME" in` switch (the entire blocks containing the `addDiscussionComment` prompt blob).

Verify: `grep -E 'discussion(_comment)?:' .github/workflows/kata-dispatch.yml` returns empty; broader `grep -E 'discussion(_comment)?' .github/workflows/kata-dispatch.yml` returns empty (matches spec § Success criteria row 1 — both the structural and the broad form pass).

## Step 3.3 — Add `discussion_id` and `resume_context` dispatch inputs

Modified: `.github/workflows/kata-dispatch.yml` `workflow_dispatch.inputs`.

Add after the existing `correlation_id` input:

```yaml
discussion_id:
  description: "Stable identifier for the threaded conversation (carried through traces)"
  required: false
  type: string
resume_context:
  description: "Serialized prior state when resuming a recessed run (JSON string)"
  required: false
  type: string
```

Verify: `gh workflow view kata-dispatch.yml --yaml | grep -E 'discussion_id|resume_context'` returns matches after push.

## Step 3.4 — Replace the `Assess and Act` step for bridge dispatches

Modified: `.github/workflows/kata-dispatch.yml`.

The current step invokes `forwardimpact/fit-eval@v1` with
`mode: "facilitate"`. The composite action does not expose `discuss` mode
or the new `--lead-*` / `--discussion-id` / `--resume-context` flags
without a sibling-repo retag. To avoid that cross-repo coupling, this step
splits into two:

1. **Existing composite-action path** — keep `forwardimpact/fit-eval@v1` with `mode: "facilitate"` and `lead-profile: "release-engineer"` (the lead-flag rename lands in Part 02 Step 2.2's sibling-repo PR) for the issue/PR/review events that don't carry a `discussion_id`. Add a step `if: github.event_name != 'workflow_dispatch' || inputs.discussion_id == ''` guard.

2. **New direct-CLI path for bridge dispatches** — when `inputs.discussion_id != ''`, run `node libraries/libeval/bin/fit-eval.js discuss` directly:
   ```yaml
   - name: Discuss (bridge-dispatched)
     id: discuss
     if: github.event_name == 'workflow_dispatch' && inputs.discussion_id != ''
     env:
       ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
       GH_TOKEN: ${{ steps.ci-app.outputs.token }}
     run: |
       node libraries/libeval/bin/fit-eval.js discuss \
         --task-text="$DISPATCH_PROMPT" \
         --lead-profile=release-engineer \
         --agent-profiles=product-manager,security-engineer,staff-engineer,technical-writer \
         --discussion-id="${{ inputs.discussion_id }}" \
         ${{ inputs.resume_context != '' && format('--resume-context={0}', inputs.resume_context) || '' }} \
         --max-turns=40 \
         --output="$RUNNER_TEMP/trace.ndjson"
       echo "trace-file=$RUNNER_TEMP/trace.ndjson" >> "$GITHUB_OUTPUT"
   ```

The downstream `Deliver callback` step (Step 3.5) reads the trace from
whichever of the two steps produced it.

Verify: `gh workflow view kata-dispatch.yml --yaml | grep -E 'fit-eval\.js discuss'` returns one match.

## Step 3.5 — Extend callback delivery for structured replies

Modified: `.github/workflows/kata-dispatch.yml` `Deliver callback` step.

Replace the existing `node libraries/libeval/bin/fit-eval.js callback ...`
invocation with:

```sh
node libraries/libeval/bin/fit-eval.js callback \
  --trace-file="$TRACE_FILE" \
  --callback-url="$CALLBACK_URL" \
  --correlation-id="$CORRELATION_ID" \
  --run-url="$RUN_URL" \
  --discussion-id="${{ inputs.discussion_id }}" \
  --include-replies
```

The `--discussion-id` and `--include-replies` flags exist after Part 02
Step 2.5 — Part 03 cannot merge until Part 02 is on `main`. The
prerequisite is enforced in plan-a.md's parts table.

The trace-file path now reads from `steps.assess.outputs.trace-file` **or**
`steps.discuss.outputs.trace-file`, whichever ran:

```yaml
TRACE_FILE: ${{ steps.assess.outputs.trace-file || steps.discuss.outputs.trace-file }}
```

The fallback `jq -n` payload in the "no trace file found" branch also
forwards `--arg did "$DISCUSSION_ID"` and includes it in the JSON.

Verify: `gh workflow run kata-dispatch.yml --field prompt='ping' --field correlation_id=test-1 --field discussion_id=GD_test --field callback_url=https://example.invalid/cb` (or local `act` equivalent if `act` is available) — the workflow runs the `discuss` step, produces a trace, and the callback step POSTs a body containing `replies: []` and `discussion_id: "GD_test"`. Use a literal correlation_id string — `${{ run_id }}` is a workflow expression and does not interpolate inside a shell invocation.

## Step 3.6 — Rename `agent-team.yml` → `kata-shift.yml`

Modified (via `git mv`):
- `.github/workflows/agent-team.yml` → `.github/workflows/kata-shift.yml`

Edit the new file: `name: "Agent: Team"` → `name: "Kata: Shift"`. No
behaviour changes.

Verify: `ls .github/workflows/{agent-team,kata-shift}.yml` — first absent, second present (matches spec § Success criteria row 2).

## Step 3.7 — Sweep all callers referencing the old workflow filenames or narrative names

Modified (all matches updated `agent-react` → `kata-dispatch` and `agent-team` → `kata-shift`):

- `services/msteams/index.js:11` — `const GITHUB_WORKFLOW_FILE = "agent-react.yml"` → `"kata-dispatch.yml"`. (Line 11, not 489 — the earlier draft cited the wrong line.) Also fix the docblock at line 125 referencing "agent-react workflows".
- `services/msteams/test/msteams.test.js` lines 458, 480, 501 — `hmacAuth.generateToken("agent-react")` → `"kata-dispatch"`. (Note: Part 04 renames this directory to `services/msbridge/`; whichever of 03 or 04 lands second picks up the path move via rebase.)
- `KATA.md` — every `agent-react` / `agent-team` narrative reference (≈14 occurrences). Replace verbatim.
- `.claude/agents/references/coordination-protocol.md` — 5 `agent-react` narrative references in bridge-logic prose. (The new "## Runtime mechanism" subsection lives in Part 06 Step 6.1 — Part 03 only flips the existing strings.)
- `.claude/agents/references/approval-signals.md` — 7 `agent-react` references.
- `.claude/agents/release-engineer.md`, `.claude/agents/product-manager.md`, `.claude/agents/improvement-coach.md` — `agent-react` mentions in agent prose.
- `.claude/skills/kata-spec/SKILL.md`, `.claude/skills/kata-plan/SKILL.md`, `.claude/skills/kata-setup/SKILL.md`, `.claude/skills/kata-release-merge/**/*.md`, `.claude/skills/kata-setup/references/workflow-react.md`, `.claude/skills/kata-setup/references/github-app.md`, `.claude/skills/kata-security-update/references/sha-inventory.md` — every literal mention.
- `.github/CLAUDE.md` — composite-action mentions.
- `libraries/libeval/src/commands/callback.js` — any internal comment referencing `agent-react`.
- `websites/fit/docs/internals/kata/index.md` — public-facing reference.

Wiki logs (`wiki/staff-engineer-2026-W21-part2.md`, `wiki/technical-writer-2026-W19-part4.md`) are historical and **not** edited — they record the names as they were at the time of writing.

Verify: `rg 'agent-(react|team)\.yml' -g '!wiki/**'` returns empty (matches the spec's verification gate); `rg '\bagent-react\b' -g '!wiki/**' -g '!specs/**'` returns empty (the broader narrative-name sweep).

## Step 3.8 — Smoke test after rename

Verify by manual trigger after merge:

```sh
gh workflow run kata-dispatch.yml \
  --field prompt='ping smoke test' \
  --field correlation_id='smoke-1230-03'
```

The run must complete the existing facilitate path end-to-end (no
`discussion_id` set → composite-action branch). A second trigger with
`--field discussion_id=GD_smoke` exercises the new `discuss` branch but
requires `services/ghbridge` (Part 05) for the callback to land somewhere
useful — until Part 05 is deployed, the callback delivery step posts to
the placeholder URL and the run terminates normally.

## Notes for the implementer

- Open the PR with title `plan(1230): rename workflows + remove Discussion handling` so reviewers see the renames in `git mv` form (preserves blame).
- The `git mv` commit and the body edits go on the same branch but in
  separate commits — implementer reviews the diff against the previous
  filename to confirm only the renames are detected as renames.
- The composite-action sibling-repo retag (Part 02 Step 2.2) is the
  prerequisite for the `lead-profile: "release-engineer"` `with:` block to
  take effect on the non-bridge path. If that PR has not merged, leave
  the legacy `facilitator-profile:` key on that branch only and queue a
  follow-on micro-PR.
