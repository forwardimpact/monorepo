# Plan 0460-A Part 04 — Profiles, Workflows, Documentation

## Scope

Restructure the improvement coach profile, add Assess step 0 and `kata-trace` to
five domain profiles, extend `kata-action` for facilitate mode, create two new
workflows, and update KATA.md and wiki/MEMORY.md.

## Files

| Action | Path                                           |
| ------ | ---------------------------------------------- |
| Modify | `.claude/agents/improvement-coach.md`          |
| Modify | `.claude/agents/security-engineer.md`          |
| Modify | `.claude/agents/technical-writer.md`           |
| Modify | `.claude/agents/product-manager.md`            |
| Modify | `.claude/agents/staff-engineer.md`             |
| Modify | `.claude/agents/release-engineer.md`           |
| Modify | `.github/actions/kata-action/action.yml`       |
| Modify | `libraries/libeval/src/commands/facilitate.js` |
| Create | `.github/workflows/daily-meeting.yml`          |
| Create | `.github/workflows/coaching-session.yml`       |
| Modify | `KATA.md`                                      |
| Modify | `wiki/MEMORY.md`                               |

## Steps

### 1. Restructure improvement-coach.md

**Before (frontmatter skills):**

```yaml
skills:
  - kata-trace
  - kata-spec
  - kata-review
  - kata-gh-cli
```

**After (frontmatter skills):**

```yaml
skills:
  - kata-storyboard
  - kata-metrics
  - kata-spec
  - kata-review
  - kata-gh-cli
```

**Before (description):**

```
Continuous improvement coach. Deep-analyzes a single trace from an agent
workflow run, identifies process failures and improvement opportunities,
and either fixes them directly or writes specs for larger changes.
```

**After (description):**

```
Continuous improvement coach. Facilitates team storyboard meetings and
1-on-1 coaching sessions using the Toyota Kata five-question protocol.
Writes specs for structural improvements found through coaching.
```

**Before (body intro):**

```
You are the improvement coach. Go and see the work done by agent workflow runs,
identify process failures, and drive improvements into the codebase.

Each cycle focuses on **one trace**. Depth over breadth.
```

**After (body intro):**

```
You are the improvement coach. Facilitate storyboard meetings and 1-on-1
coaching sessions using the Toyota Kata five-question protocol. Help domain
agents grasp their current condition, identify obstacles, and design
experiments.

Each coaching context focuses on measured conditions. Numbers over narratives.
```

**Before (Assess section):**

```
1. **Recent workflow traces not yet analyzed?** ...
2. **Unaddressed findings from prior trace analyses?** ...
3. **Nothing actionable?** ...
```

**After (Assess section):**

```
Survey domain state, then choose the highest-priority action:

1. **Agent due for 1-on-1 coaching?** — Facilitate a coaching session
   (`kata-storyboard`; check: select the domain agent whose last coaching session
   is oldest or who has the most unanalyzed traces; trigger the coaching-session
   workflow with the agent name)
2. **Unaddressed findings from prior coaching sessions?** — Act on findings
   (check: previous findings in `wiki/improvement-coach.md`; trivial fix —
   `fix/coach-<name>` branch from `main`, improvement — spec via `kata-spec` on
   `spec/<name>` branch from `main`)
3. **Nothing actionable?** — Report clean state

Note: team storyboard meetings are handled by the daily-meeting workflow
(03:00 UTC), not by this agent's scheduled run. This agent's run focuses on
1-on-1 coaching and acting on prior findings.

After choosing, follow the selected skill's full procedure. Every PR must branch
directly from `main`.
```

**Constraints section:** Keep existing content. Add one bullet:

```
- Coaching only — you ask the five questions, you do not analyze traces yourself.
  Domain agents run `kata-trace` during 1-on-1 coaching sessions.
```

### 2. Add Assess step 0 and kata-trace to five domain profiles

For each of the five domain profiles, make two changes:

**a) Add `kata-trace` to the frontmatter skills list.**

Insert `kata-trace` at the end of the existing skills list (before any `libs-*`
skills if present). For each profile:

| Profile           | Insert after                   |
| ----------------- | ------------------------------ |
| security-engineer | `kata-review`                  |
| technical-writer  | `kata-review`                  |
| product-manager   | `kata-gh-cli`                  |
| staff-engineer    | `kata-gh-cli` (before libs-\*) |
| release-engineer  | `kata-gh-cli`                  |

**b) Add Assess step 0 before the existing numbered list.**

Insert the following text after the "Survey domain state, then choose the
highest-priority action:" line, before the existing step 1:

```markdown
0. **Read the storyboard.** Check `wiki/storyboard-YYYY-MNN.md` for this month.
   If it exists, review the target condition and current obstacle. Weight
   priority assessment toward actions that advance the target condition. If no
   storyboard exists, proceed with your standard priority framework. Urgency
   always overrides storyboard alignment.
```

The existing steps (1, 2, 3, ...) remain numbered as-is — step 0 precedes them.

### 3. Relax facilitate minimum agents validation

Modify `libraries/libeval/src/commands/facilitate.js` line 52:

**Before:**

```js
if (agentConfigs.length < 2)
  throw new Error("--agents must specify at least two agents");
```

**After:**

```js
if (agentConfigs.length < 1)
  throw new Error("--agents must specify at least one agent");
```

This allows 1-on-1 coaching sessions (1 agent + facilitator). The facilitator is
always a separate session from agents, so 1 agent is a valid configuration.

### 4. Extend kata-action for facilitate mode

Modify `.github/actions/kata-action/action.yml`:

**a) Update mode input description (line 12):**

Before: `Execution mode — "run" (single agent) or "supervise"`

After: `Execution mode — "run", "supervise", or "facilitate"`

**b) Add two new inputs after `agent-profile` (after line 49):**

```yaml
  facilitator-profile:
    description:
      Facilitator profile name (passed as --facilitator-profile, facilitate mode
      only)
    required: false
  agents:
    description:
      Comma-separated agent configs for facilitate mode (format
      "name1:role=x,name2:role=y")
    required: false
```

**c) Add facilitate branch in the "Run fit-eval" step (after the supervise
branch, before the `else` for run mode).**

The shell script currently has:

```bash
if [ "$MODE" = "supervise" ]; then
  ...
else
  ...
fi
```

Change to:

```bash
if [ "$MODE" = "supervise" ]; then
  ...
elif [ "$MODE" = "facilitate" ]; then
  if [ -n "$FACILITATOR_PROFILE" ]; then
    args+=("--facilitator-profile=$FACILITATOR_PROFILE")
  fi

  if [ "$MAX_TURNS" != "0" ]; then
    args+=("--max-turns=$MAX_TURNS")
  fi

  bunx fit-eval facilitate \
    --facilitator-cwd="." \
    --agents="$AGENTS" \
    --model="$MODEL" \
    "${args[@]}"

  # Note: facilitate mode does not accept --allowed-tools at the CLI level.
  # Tool permissions are controlled per-agent via the agent config string
  # (e.g., "name:allowedTools=Bash,Read"). The default allowed tools from
  # AgentRunner apply when not specified per-agent.
else
  ...
fi
```

Add new env vars to the step's `env:` block:

```yaml
FACILITATOR_PROFILE: ${{ inputs.facilitator-profile }}
AGENTS: ${{ inputs.agents }}
```

**d) Update trace split step.**

The current split step (line 168-181) only handles supervise mode. Add a
parallel step for facilitate mode that extracts per-participant traces:

```yaml
- name: Split facilitated trace
  if:
    always() && inputs.trace == 'true' && inputs.mode == 'facilitate' &&
    steps.setup.outputs.trace-dir != ''
  shell: bash
  env:
    TRACE_DIR: ${{ steps.setup.outputs.trace-dir }}
  run: |
    # Extract facilitator events
    jq -c 'select(.source == "facilitator") | .event' "$TRACE_DIR/trace.ndjson" \
      > "$TRACE_DIR/facilitator-trace.ndjson"
    # Extract per-agent traces using jq --arg to avoid shell injection.
    # Agent names come from trace .source fields which originate from
    # workflow_dispatch input — sanitize by filtering to alphanumeric + hyphen.
    jq -r 'select(.source != "facilitator") | .source' "$TRACE_DIR/trace.ndjson" \
      | sort -u \
      | grep -E '^[a-z][a-z0-9-]*$' \
      | while IFS= read -r agent; do
          jq -c --arg src "$agent" 'select(.source == $src) | .event' \
            "$TRACE_DIR/trace.ndjson" > "$TRACE_DIR/${agent}-trace.ndjson"
        done
    # Also produce a combined agent trace for the agent-trace artifact
    jq -c 'select(.source != "facilitator") | .event' "$TRACE_DIR/trace.ndjson" \
      > "$TRACE_DIR/agent-trace.ndjson"
```

**e) Update artifact upload conditions.**

The existing "Upload agent trace" step (line 183-191) uses a conditional path
expression. Update the condition to also handle facilitate mode. The existing
path expression already resolves correctly for facilitate mode because it checks
`supervise` first and falls through to the raw trace for `run`. Simplify by
adding facilitate alongside supervise:

```yaml
path: |
  ${{ (inputs.mode == 'supervise' || inputs.mode == 'facilitate') && format('{0}/agent-trace.ndjson', steps.setup.outputs.trace-dir) || format('{0}/trace.ndjson', steps.setup.outputs.trace-dir) }}
```

Add a "Upload facilitator trace" step (parallel to "Upload supervisor trace"):

```yaml
- name: Upload facilitator trace
  if:
    always() && inputs.trace == 'true' && inputs.mode == 'facilitate' &&
    steps.setup.outputs.trace-dir != ''
  uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
  with:
    name: facilitator-trace
    path: ${{ steps.setup.outputs.trace-dir }}/facilitator-trace.ndjson
```

Add an "Upload per-agent traces" step so domain agents can access their own
trace during 1-on-1 coaching sessions:

```yaml
- name: Upload per-agent traces
  if:
    always() && inputs.trace == 'true' && inputs.mode == 'facilitate' &&
    steps.setup.outputs.trace-dir != ''
  uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
  with:
    name: per-agent-traces
    path: |
      ${{ steps.setup.outputs.trace-dir }}/*-trace.ndjson
      !${{ steps.setup.outputs.trace-dir }}/facilitator-trace.ndjson
      !${{ steps.setup.outputs.trace-dir }}/agent-trace.ndjson
      !${{ steps.setup.outputs.trace-dir }}/trace.ndjson
```

Also update the existing "Upload combined trace" step condition to include
facilitate mode:

```yaml
if:
  always() && inputs.trace == 'true' && (inputs.mode == 'supervise' ||
  inputs.mode == 'facilitate') && steps.setup.outputs.trace-dir != ''
```

### 5. Create daily-meeting.yml

Create `.github/workflows/daily-meeting.yml`. Note: facilitate mode workflows
use `facilitator-profile` instead of `agent-profile`. The `agent-profile` input
is only used in `run` and `supervise` modes. This is correct — facilitate mode
identifies participants via the `agents` config string, not the `agent-profile`
input.

```yaml
name: "Kata: Daily Meeting"

on:
  schedule:
    # Daily at 03:00 UTC — before all individual agent workflows
    - cron: "0 3 * * *"
  workflow_dispatch:
    inputs:
      task-amend:
        description: "Additional text appended to the task prompt for steering"
        required: false
        type: string

concurrency:
  group: daily-meeting
  cancel-in-progress: true

permissions:
  contents: write

jobs:
  kata:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Generate installation token
        id: ci-app
        uses: actions/create-github-app-token@f8d387b68d61c58ab83c6c016672934102569859 # v3
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}

      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
        with:
          fetch-depth: 0
          token: ${{ steps.ci-app.outputs.token }}
          submodules: true

      - uses: ./.github/actions/bootstrap

      - name: Team Storyboard Meeting
        uses: ./.github/actions/kata-action
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ steps.ci-app.outputs.token }}
          CLAUDE_CODE_USE_BEDROCK: "0"
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          mode: "facilitate"
          task-text: >-
            Facilitate the team storyboard meeting. Walk through the five
            coaching kata questions with all participants. Update the storyboard
            with fresh metrics and experiment progress.
          facilitator-profile: "improvement-coach"
          agents: "security-engineer:role=security-engineer,technical-writer:role=technical-writer,product-manager:role=product-manager,staff-engineer:role=staff-engineer,release-engineer:role=release-engineer"
          model: "opus"
          max-turns: "200"
          task-amend: ${{ inputs.task-amend }}
```

### 6. Create coaching-session.yml

Create `.github/workflows/coaching-session.yml`:

```yaml
name: "Kata: Coaching Session"

on:
  workflow_dispatch:
    inputs:
      agent:
        description: "Agent name to coach (e.g., security-engineer)"
        required: true
        type: string
      task-amend:
        description: "Additional text appended to the task prompt for steering"
        required: false
        type: string

concurrency:
  group: coaching-session
  cancel-in-progress: true

permissions:
  contents: write

jobs:
  kata:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Generate installation token
        id: ci-app
        uses: actions/create-github-app-token@f8d387b68d61c58ab83c6c016672934102569859 # v3
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          private-key: ${{ secrets.KATA_APP_PRIVATE_KEY }}

      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
        with:
          fetch-depth: 0
          token: ${{ steps.ci-app.outputs.token }}
          submodules: true

      - uses: ./.github/actions/bootstrap

      - name: 1-on-1 Coaching Session
        uses: ./.github/actions/kata-action
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ steps.ci-app.outputs.token }}
          CLAUDE_CODE_USE_BEDROCK: "0"
        with:
          app-id: ${{ secrets.KATA_APP_ID }}
          mode: "facilitate"
          task-text: >-
            Facilitate a 1-on-1 coaching session with the participant agent.
            Guide them through the five coaching kata questions. Have them
            analyze their own most recent trace using kata-trace. Help them
            identify obstacles and design their next experiment.
          facilitator-profile: "improvement-coach"
          agents: "${{ inputs.agent }}:role=${{ inputs.agent }}"
          model: "opus"
          max-turns: "200"
          task-amend: ${{ inputs.task-amend }}
```

### 7. Update KATA.md

**a) Update the Workflows section introduction (line 76–80).**

Before:

```
Six scheduled workflows span 04-11 UTC, one per agent. Times respect ordering
constraints ...
```

After:

```
Eight workflows: six individual agent runs spanning 04–11 UTC, one daily team
meeting at 03:00 UTC, and one on-demand coaching session. Times respect ordering
constraints (team meeting before individual runs, security before product,
product before planning, planning before release, all producers before the
improvement coach). ...
```

**b) Add rows to the Workflows table (line 83–90).**

Insert two new rows at the top of the table (before security-engineer), since
the daily meeting runs at 03:00 UTC (earliest):

```markdown
| **daily-meeting**     | Daily 03:00 UTC     | improvement-coach (facilitates 5 agents) |
| **coaching-session**  | `workflow_dispatch`  | improvement-coach (facilitates 1 agent)  |
```

**c) Add a Metrics section after the Shared Memory section (after line 185).**

```markdown
## Metrics

Agents record time-series data to `wiki/metrics/{agent}/{domain}/{YYYY}.csv`
after each run. The `kata-metrics` skill defines the CSV schema (six fields:
date, metric, value, unit, run, note), storage convention, and metric design
guidance. Each entry-point skill carries a `references/metrics.md` suggesting
domain-specific metrics.

Metrics serve the coaching cycle: the team storyboard meeting (see Workflows
table) uses metric data to answer "what is the actual condition now?" with
numbers rather than narratives. Process behavior charts (XmR) built from the
time series distinguish stable processes from those reacting to special causes.
```

**d) Update Accountability section (line 196–201).**

The existing text says "The improvement coach verifies named per-agent
invariants against the actual trace on every trace analysis cycle." This is now
inaccurate — domain agents run kata-trace on their own traces during 1-on-1
coaching sessions. Rewrite the first sentence and add the new framing:

**Before:**

```
Cross-agent accountability runs through the `kata-trace` skill's invariant
audit. The improvement coach verifies named per-agent invariants against the
actual trace on every trace analysis cycle — ...
```

**After:**

```
Cross-agent accountability runs through the `kata-trace` skill's invariant
audit. Domain agents verify their own per-agent invariants against their own
traces during 1-on-1 coaching sessions facilitated by the improvement coach —
e.g., that the product manager ran a contributor lookup before marking any
non-CI-app PR mergeable. ...
```

### 8. Update wiki/MEMORY.md

Add two new entries to document the storyboard and metrics conventions.

**a) Add Storyboard section after "Skill State Files" (after line 40):**

```markdown
## Storyboard

Monthly storyboard artifact maintained by the improvement coach during team
meetings:

- `storyboard-YYYY-MNN.md` — where NN is the zero-padded month. Created during
  the first meeting of each month. Updated daily during storyboard review
  meetings. Contains: Challenge, Target Condition, Current Condition,
  Obstacles, Experiments.
```

**b) Add Metrics section after the new Storyboard section:**

```markdown
## Metrics

Time-series data recorded by agents after each run:

- `metrics/{agent}/{domain}/{YYYY}.csv` — one CSV file per agent per domain
  per year. Long format, one row per data point. Fields: date, metric, value,
  unit, run, note. See `kata-metrics` skill for the full protocol.
```

## Verification

1. `bun run check` passes.
2. All six agent profiles have correct skill lists and Assess sections.
3. The improvement coach no longer lists `kata-trace`; all five domain profiles
   list it.
4. kata-action supports `facilitate` mode with `facilitator-profile` and
   `agents` inputs.
5. Both new workflows exist and follow the established pattern (token
   generation, checkout, bootstrap, kata-action).
6. KATA.md workflows table includes all eight workflows.
7. KATA.md has a Metrics section.
8. wiki/MEMORY.md documents storyboard and metrics conventions.
