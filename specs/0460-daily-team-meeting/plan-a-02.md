# Plan 0460-A Part 02 — kata-storyboard Entry-Point Skill

## Scope

Create the coaching protocol entry-point skill. Three new files, no
modifications. Note: the spec lists `references/storyboard-template.md` as the
only reference file. This plan adds `references/coaching-protocol.md` to keep
SKILL.md under the ~200 line budget — the five-question protocol details are
substantial enough to warrant extraction into a reference file, following the
KATA.md § Skill structure pattern.

## Files

| Action | Path                                                               |
| ------ | ------------------------------------------------------------------ |
| Create | `.claude/skills/kata-storyboard/SKILL.md`                          |
| Create | `.claude/skills/kata-storyboard/references/storyboard-template.md` |
| Create | `.claude/skills/kata-storyboard/references/coaching-protocol.md`   |

## Steps

### 1. Create SKILL.md

Create `.claude/skills/kata-storyboard/SKILL.md` with:

**Frontmatter:**

```yaml
---
name: kata-storyboard
description: >
  Toyota Kata coaching protocol for team storyboard meetings and 1-on-1
  coaching sessions. The improvement coach facilitates; domain agents
  participate. Same five coaching kata questions in both contexts.
---
```

**Content (~150 lines):**

- `# Kata Storyboard` heading
- Brief introduction: entry-point skill used by the improvement coach in two
  contexts — team storyboard meetings (5 domain agents) and 1-on-1 coaching
  sessions (1 domain agent analyzing its own trace). Both use the same five
  coaching kata questions.
- `## When to Use` — Your Assess section routed you to a coaching context: team
  storyboard meeting or 1-on-1 coaching session.
- `## Checklists`

  `<read_do_checklist goal="Prepare for the coaching session">`:
  - Read the current month's storyboard (`wiki/storyboard-YYYY-MNN.md`). If none
    exists, this is a planning meeting.
  - Identify which metrics CSVs to review from `wiki/metrics/`.
  - For 1-on-1: identify the agent's most recent trace for analysis.

  `<do_confirm_checklist goal="Verify coaching session quality">`:
  - All five coaching kata questions were addressed.
  - Current condition updated with numbers from metrics CSVs (not narrative).
  - For team meetings: storyboard file updated and committed.
  - For 1-on-1: agent's findings written to its own memory.
  - Experiment expected outcome recorded _before_ the experiment runs.

- `## Storyboard Artifact` — Brief description: monthly file at
  `wiki/storyboard-YYYY-MNN.md` with five sections (Challenge, Target Condition,
  Current Condition, Obstacles, Experiments). Full template at
  `references/storyboard-template.md`.

- `## Meeting Modes`

  Three modes, all using the five coaching kata questions:

  **Planning meeting** — first meeting of the month or no storyboard exists.
  Create the storyboard. Lead the team through: establishing/confirming the
  Challenge, setting the Target Condition (measurable, by month end), measuring
  the Current Condition from metrics CSVs, identifying initial Obstacles, and
  planning the first Experiment.

  **Review meeting** — all other team meetings. Walk through the five questions
  (see `references/coaching-protocol.md`), update Current Condition with fresh
  metrics, record experiment outcomes (actual vs. expected), update Obstacles,
  and plan the next experiment.

  **1-on-1 coaching** — coach facilitates, one domain agent participates. The
  agent runs `kata-trace` on its own recent trace during the session. The five
  questions guide the agent's reflection: what were you trying to achieve? What
  actually happened (measured)? What obstacles did you encounter? What will you
  try next? When will you know?

- `## Process`
  1. **Read the storyboard.** Load `wiki/storyboard-YYYY-MNN.md`. If it does not
     exist, this is a planning meeting — create it from
     `references/storyboard-template.md`.
  2. **Gather metrics.** Read relevant CSVs from `wiki/metrics/` for each
     participating agent's domain.
  3. **Run the five questions.** Follow `references/coaching-protocol.md` for
     the appropriate mode.
  4. **Update the storyboard.** Write updated Current Condition, Obstacles, and
     Experiments sections back to the storyboard file.
  5. **Commit.** Commit storyboard changes as part of the wiki push.

- `## Memory: what to record`

  Append to the current week's log (see agent profile for the file path):
  - **Meeting type** — Planning, review, or 1-on-1 (with which agent)
  - **Current condition** — Key numbers from metrics CSVs reviewed
  - **Obstacle addressed** — Which obstacle was the focus
  - **Experiment status** — Outcome of prior experiment, next experiment planned
  - **Metrics** — Record coaching-specific measurements (e.g.,
    `meetings_facilitated`, `experiments_active`) to
    `wiki/metrics/improvement-coach/coaching/` per the `kata-metrics` protocol.
    The coach records coaching activity metrics, not domain metrics — domain
    agents record their own domain metrics via their own entry-point skills.

### 2. Create storyboard-template.md

Create `.claude/skills/kata-storyboard/references/storyboard-template.md` with:

**Content (~50 lines):**

```markdown
# Storyboard — YYYY Month

## Challenge

_The long-term direction that gives meaning to target conditions and
experiments. Changes rarely — only when strategic direction shifts._

> [Write the challenge here. One or two sentences describing the team's
> long-term direction.]

## Target Condition

_The measurable state the team aims to reach by the end of this month. Not a
task list — a description of how the system will behave differently, expressed
in terms verifiable with data from metrics CSVs._

> [Write the target condition here. Include specific metrics and thresholds.]

**Due:** YYYY-MM-DD (end of month)

## Current Condition

_The measured state as of the last storyboard review. Updated daily using data
from wiki/metrics/. Always numbers, not narratives._

| Agent | Domain | Key metric | Value | Trend |
| ----- | ------ | ---------- | ----- | ----- |
|       |        |            |       |       |

**Last updated:** YYYY-MM-DD

## Obstacles

_What stands between the current condition and the target condition. Discovered
through experiments, not predicted upfront._

- **Current obstacle →** [describe]
- [other known obstacles]

## Experiments

_PDSA cycles run against the current obstacle. Record expected outcome before
running, actual outcome after._

### Experiment N

- **Obstacle:** [which obstacle this addresses]
- **What:** [description of the experiment]
- **Expected outcome:** [what you predict will happen — record before running]
- **Actual outcome:** [what actually happened — record after running]
- **What did we learn?** [gap between expected and actual]
- **Next step:** [continue, pivot, or new experiment]
```

### 3. Create coaching-protocol.md

Create `.claude/skills/kata-storyboard/references/coaching-protocol.md` with:

**Content (~70 lines):**

- `# The Five Coaching Kata Questions` heading

- Introduction: these questions structure every coaching interaction — team
  meetings and 1-on-1 sessions. The coach asks, the learner(s) reflect.

- **Question 1: What is the target condition?**
  - Facilitator reads the target condition from the storyboard.
  - Grounds the conversation in where the team is headed.
  - If the target condition is unclear or expired, update it (planning mode).

- **Question 2: What is the actual condition now?**
  - Each agent (or the single agent in 1-on-1) reports measured data from their
    domain's metrics CSVs.
  - The facilitator updates the Current Condition section with fresh numbers.
  - Use counts and durations — not narratives like "improving" or "stable."
  - Reference specific CSV files: `wiki/metrics/{agent}/{domain}/{YYYY}.csv`.

- **Question 3: What obstacles are preventing us from reaching the target
  condition?**
  - Agents identify obstacles from their domain based on the gap between current
    and target condition.
  - Obstacles are discovered through data and experiments, not hypothesized
    upfront.
  - The facilitator updates the Obstacles list and marks which obstacle the team
    is currently addressing.

- **Question 4: What is the next step? What do you expect?**
  - For the obstacle currently being addressed, agents propose their next
    experiment.
  - The expected outcome is recorded _before_ the experiment runs.
  - Experiments should be small and testable within one or two daily cycles.

- **Question 5: When can we see what we learned from that step?**
  - Establish when the experiment's results will be visible.
  - Typically: next meeting, end of week, or after a specific workflow run.
  - This creates the feedback loop — the next meeting opens by reviewing what
    was learned.

- `## 1-on-1 Coaching Adaptation`
  - The same five questions apply but scoped to the individual agent's trace.
  - Q1: What were you trying to achieve in this run?
  - Q2: What actually happened? (agent runs `kata-trace` on its own trace)
  - Q3: What obstacles prevented better outcomes?
  - Q4: What will you do differently next run?
  - Q5: When will you see the effect? (next scheduled run)

## Verification

1. `bun run check` passes (prettier formatting).
2. All three files exist at the specified paths.
3. SKILL.md is under 160 lines.
4. Template is self-contained with placeholder markers.
5. Protocol reference covers all five questions for both team and 1-on-1 modes.
