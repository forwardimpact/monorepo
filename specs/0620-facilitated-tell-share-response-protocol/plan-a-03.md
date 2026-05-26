# Plan 620a, Part 03 — Coaching workflow + `protocol_violation` invariants

Spec: [`spec.md`](./spec.md). Design: [`design-a.md`](./design-a.md). Overview:
[`plan-a.md`](./plan-a.md).

## Scope

Two small surfaces:

1. Rewrite `.github/workflows/kata-coaching.yml`'s `task-text` to carry the
   coaching framing libeval's generic prompts deliberately omit.
2. Add two `protocol_violation` entries to
   `.claude/skills/kata-trace/references/invariants.md` — one per mode.

No code changes. No skill changes (Part 02 owns those).

## Approach

The coaching framing lives here because libeval stays generic (SC 4) and the
skill name lives in Part 02. This part depends on Part 01 (runtime must accept
`systemPromptAmend` and emit `protocol_violation`) and on Part 02 (the skill
name `kata-session` and the one-on-one overlay must exist for the task-text to
reference them).

The invariants reuse the existing kata-trace catalogue shape. The evidence
function — "count `protocol_violation` events in the combined trace; assert
`Conclude` cardinality equals 1 on success" — is written once as prose in the
invariant entry and applies to both modes (facilitated and supervised) with the
only difference being which trace artifact is consulted.

## Libraries used

None. This part touches one workflow YAML and one reference markdown.

## Blast radius

**Modified** (2 files):

- `.github/workflows/kata-coaching.yml` — `task-text` replaced (lines 52–56 in
  the current file, within the `with:` block of the `1-on-1 Coaching Session`
  step).
- `.claude/skills/kata-trace/references/invariants.md` — append a new
  `## Orchestrator traces` section at the end, containing one row per mode.

**Created / Deleted**: none.

## Step-by-step

### Step 1 — Rewrite `kata-coaching.yml` task-text

The current task-text (lines 52–56):

> "Facilitate a 1-on-1 coaching session with the participant agent. Guide them
> through the five coaching kata questions. Have them analyze their own most
> recent trace using kata-trace. Help them identify obstacles and design their
> next experiment."

Replace with a block that:

- Names the mode.
- Names the target participant (via `${{ inputs.agent }}`, same as today — but
  referenced as "target participant" not "participant agent").
- Points to `kata-session` by name, and to its one-on-one overlay specifically.
- Instructs the coach to derive the participant-side summary from the overlay
  and pass it to libeval via `systemPromptAmend`.
- Does **not** prescribe Q1 content (SC 8).
- Does **not** assign participant-side work (SC 8: no "have them analyze their
  trace using kata-trace").
- Does **not** name participant tools (SC 8).
- Does **not** carry enforcement phrasing (SC 8: no "then Answer", no "stop
  making tool calls", no "respond via Answer").

Proposed replacement (YAML folded-block style to match the current file; adjust
whitespace per file formatting):

```yaml
task-text: >-
  Facilitate a 1-on-1 coaching session in kata-session mode with
  participant "${{ inputs.agent }}".

  Load the kata-session skill. Its one-on-one overlay
  (.claude/skills/kata-session/references/one-on-one.md) describes the
  session shape, the five-question wording for 1-on-1 mode, and a
  participant-side summary template.

  Before the first Ask, derive the participant-side summary from the
  one-on-one overlay and pass it to libeval as systemPromptAmend on the
  participant config. libeval delivers it into the participant's system
  prompt before any Ask is sent.
```

Key properties verified by reading the YAML:

- Names the mode ("kata-session", "1-on-1"). ✓
- Names the target participant via `${{ inputs.agent }}`. ✓
- Points to `kata-session` by skill name and to the overlay by path. ✓
- Instructs the coach to derive + pass the summary. ✓
- Does not prescribe Q1 content; does not assign participant work; does not name
  participant tools; does not carry enforcement phrasing. ✓

Shape is not reduced to a single sentence (spec § Rewritten task-text explicitly
allows this) and does not need to match `kata-storyboard.yml`.

**Do not edit** the `task-amend` input, concurrency group, timeout, or any other
workflow key. The rewrite is confined to the `task-text` value.

**Verify** — precise greps targeting SC 8's clauses directly rather than broad
alternations:

- **No participant-tool naming** (SC 8: "does not name tools the participant
  should use"):
  ```bash
  grep -nE 'kata-trace|kata-metrics|kata-implement|Bash|Read|Grep|Glob'
  .github/workflows/kata-coaching.yml
  ```
  Zero matches in the `task-text:` block.
- **No enforcement phrasing** (SC 8: "stop making tool calls", "then Share"):
  ```bash
  grep -nE 'then Answer|then Share|respond via|stop making|must Answer|before your turn'
  .github/workflows/kata-coaching.yml
  ```
  Zero matches.
- **No Q1 content prescription / no participant-work assignment**:
  ```bash
  grep -nE 'Q1|first question|analyze.*trace|have (them|the participant)'
  .github/workflows/kata-coaching.yml
  ```
  Zero matches.
- **Positive: task-text primes the propagation step** (SC 7 (d)):
  ```bash
  grep -nE 'kata-session|systemPromptAmend|one-on-one'
  .github/workflows/kata-coaching.yml
  ```
  At least one match per token inside the `task-text:` block.

### Step 2 — Add `protocol_violation` invariants

Append a new section to `.claude/skills/kata-trace/references/invariants.md`
after the "Cross-cutting invariants" section (currently the last section). The
invariants file is a layer-7 reference with no line budget beyond the 128-line
L7 guideline — current file is ~78 lines; the addition brings it to ~105 lines,
within budget.

Append:

```markdown
## Orchestrator traces

Applicable to combined traces produced by `fit-eval facilitate` and
`fit-eval supervise`. Both invariants use the same two evidence
queries — the only axis of difference is which trace the queries run
against.

**Query V — protocol_violation cardinality.** Count `protocol_violation`
events emitted by the orchestrator:

    jq -c 'select(.source == "orchestrator" and .event.type == "protocol_violation")' \
        combined-trace.ndjson | wc -l

Must return `0` on a healthy run.

**Query C — Conclude cardinality.** Count `Conclude` tool calls emitted
by the facilitator / supervisor (the orchestrator's `tool_use` blocks
name the tool explicitly):

    jq -c 'select(.event.type == "assistant") | .event.message.content[]? |
           select(.type == "tool_use" and .name == "Conclude")' \
        combined-trace.ndjson | wc -l

Must return `1` on a healthy run.

| Invariant                                         | Evidence to find                       | Severity |
| ------------------------------------------------- | -------------------------------------- | -------- |
| Facilitated-mode request-response contract held   | Query V == 0 AND Query C == 1 against the combined trace of a `fit-eval facilitate` run | **High** |
| Supervised-mode request-response contract held    | Query V == 0 AND Query C == 1 against the combined trace of a `fit-eval supervise` run  | **High** |

A run with one or more `protocol_violation` events is a high-severity
finding: the runtime observed an agent ignoring its reply obligation
across the single allowed reminder. A Conclude count other than 1
indicates either a silent-deadlock exit (zero Concludes) or a
double-conclude bug (more than one).
```

**Verify:**

- `wc -l .claude/skills/kata-trace/references/invariants.md` ≤ 128.
- `grep -n "protocol_violation" .claude/skills/kata-trace/references/invariants.md`
  returns at least two matches (one per entry).
- Query V and Query C parse and return integers. Dry-run against the combined
  trace captured by the kata-storyboard workflow run following Part 03's merge
  (artifact retention on successful scheduled runs keeps the artifact available
  for at least the 90-day default). Do not reference a specific historical run
  id in the reference file.

## Risks

- **jq query fragility.** The invariant queries depend on
  `combined-trace.ndjson` being the canonical name kata-action uploads (see
  `.github/actions/kata-action/action.yml` § Upload combined trace). If a future
  spec renames that artifact, both invariants break. Mitigation: the evidence
  prose names the combined trace by shape ("combined trace produced by
  `fit-eval facilitate`") so the intent survives a name change and the query
  text can be rewritten mechanically.
- **Summary-success coupling.** The current facilitator emits a `summary` event
  with `success: true` when `ctx.concluded`. The invariant's "success == true"
  branch is redundant with "Conclude cardinality == 1" — if the session
  concluded, success is true; if it didn't, there is no single `Conclude`. Kept
  together because the two signals are independent at emission: a run that
  concluded but emitted a protocol_violation is still a violation, and the
  invariant correctly flags it.
- **Cross-mode copy-paste drift.** Two near-identical invariant rows invite a
  future editor to update one and forget the other. The preamble explicitly
  calls out shared evidence so reviewers grep for both entries together.

## Verification

- SC 8: `kata-coaching.yml` `task-text` properties asserted by the greps in
  Step 1.
- SC 9: invariant entries present; `jq` queries run against real artifacts.

Full-plan validation (per the spec's validation note — one kata-coaching run,
one kata-storyboard run, one supervise run) is the implementer's responsibility
after all three parts are on `main`. It is not a Part 03 step because it
requires Parts 01 + 02 + 03 to all be merged first.

## Agent routing

`staff-engineer`. Workflow YAML and invariant catalogue sit close to
orchestration behavior, not to end-user documentation. TW is not required — this
is skill/agent infrastructure.
