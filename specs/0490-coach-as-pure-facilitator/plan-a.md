# Plan A — Improvement Coach as Pure Facilitator

## Approach

Six files change. The unifying idea: move all orchestration procedure into the
skill layer (layer 4) and make the system prompt layer (layer 1) purely
descriptive, while deleting the standalone workflow and Assess section that
conflict with the facilitator identity.

Changes are ordered by dependency — system prompt constants first (no
dependents), then agent profile, then skill reference and SKILL.md (which
reference each other), then the workflow deletion and KATA.md update (pure
documentation). All changes are text or string-constant edits; no runtime logic
changes.

## Changes

### Step 1: Refactor system prompt constants

**File:** `libraries/libeval/src/facilitator.js` (lines 20–34)

Shift both constants from imperative ("Use Tell to…") to descriptive ("Tell
sends a direct message…"). Layer 1 describes what each tool is; layer 4 (the
skill) will own when and why to use them.

**Before (lines 20–25):**

```js
export const FACILITATOR_SYSTEM_PROMPT =
  "You coordinate multiple agents working on a shared task. Use Tell to " +
  "assign work to individual agents. Use Share to broadcast to all. Use " +
  "Redirect to interrupt and correct agents. Use RollCall to see who is " +
  "available. Use Conclude with a summary when the task is done. Agents " +
  "communicate with you via Share and may Ask you questions directly.";
```

**After:**

```js
export const FACILITATOR_SYSTEM_PROMPT =
  "You coordinate multiple agents working on a shared task. " +
  "Tell sends a direct message to one participant. " +
  "Share broadcasts a message to all participants. " +
  "Redirect interrupts a participant and replaces their current instructions. " +
  "RollCall lists available participants and their roles. " +
  "Conclude ends the session with a summary. " +
  "Participants communicate with you via Share and may Ask you questions.";
```

**Before (lines 28–34):**

```js
export const FACILITATED_AGENT_SYSTEM_PROMPT =
  "You are one of several agents working on a shared task under a " +
  "facilitator's coordination. Use Share to broadcast findings. Use Tell " +
  "to message a specific participant. Use Ask to ask the facilitator a " +
  "question (you will block until answered). Use RollCall to see who " +
  "else is working. The facilitator may Redirect you with new instructions " +
  "— treat redirections as authoritative.";
```

**After:**

```js
export const FACILITATED_AGENT_SYSTEM_PROMPT =
  "You are one of several agents working on a shared task under a " +
  "facilitator's coordination. " +
  "Share broadcasts your message to all participants. " +
  "Tell sends a direct message to one participant. " +
  "Ask sends a question to the facilitator — you block until answered. " +
  "RollCall lists available participants and their roles. " +
  "The facilitator may Redirect you with new instructions " +
  "— treat redirections as authoritative.";
```

No export signature changes. No test changes — the constants are not tested
directly (verified: no matches in `libraries/libeval/test/`).

### Step 2: Update the agent profile

**File:** `.claude/agents/improvement-coach.md`

Two changes:

**2a. Update frontmatter description and remove `kata-spec` from skills.**

The description currently says "Writes specs for structural improvements found
through coaching." Remove that clause — the coach facilitates, it doesn't write
specs. Remove `kata-spec` from the skills list since the coach no longer acts on
findings directly.

**Before (lines 2–9):**

```yaml
name: improvement-coach
description: >
  Continuous improvement coach. Facilitates team storyboard meetings and
  1-on-1 coaching sessions using the Toyota Kata five-question protocol.
  Writes specs for structural improvements found through coaching.
model: opus
skills:
  - kata-storyboard
  - kata-metrics
  - kata-spec
  - kata-review
  - kata-gh-cli
```

**After:**

```yaml
name: improvement-coach
description: >
  Continuous improvement coach. Facilitates team storyboard meetings and
  1-on-1 coaching sessions using the Toyota Kata five-question protocol.
model: opus
skills:
  - kata-storyboard
  - kata-metrics
  - kata-review
  - kata-gh-cli
```

**2b. Delete the entire `## Assess` section (lines 29–48).**

Remove from `## Assess` through the blank line before `## Constraints`. The
coach has no standalone workflow to route — both invocation paths (daily
meeting, coaching session) receive specific task prompts.

**2c. Update the persona paragraph and Constraints section.**

All line references below are pre-edit positions (before 2a and 2b are applied).

**Before (line 17):**

> You are the improvement coach. Facilitate storyboard meetings and 1-on-1
> coaching sessions using the Toyota Kata five-question protocol. Help domain
> agents grasp their current condition, identify obstacles, and design
> experiments.

**After:**

> You are the improvement coach — a pure facilitator. You run team storyboard
> meetings and 1-on-1 coaching sessions using the Toyota Kata five-question
> protocol. You help domain agents grasp their current condition, identify
> obstacles, and design experiments. You never perform domain work yourself.

In Constraints (line 51), update the first constraint:

**Before:**
`- Analysis and improvement only — no merging PRs, no application logic changes`

**After:**
`- Facilitation only — you ask questions, agents do domain work. No merging PRs, no application logic changes, no writing specs or fix PRs.`

Remove the constraint at line 61:
`- Coaching only — you ask the five questions, you do not analyze traces yourself. Domain agents run `kata-trace` during 1-on-1 coaching sessions.`
— this is now redundant with the updated first constraint.

### Step 3: Rewrite the coaching protocol reference

**File:** `.claude/skills/kata-storyboard/references/coaching-protocol.md`

Full rewrite. The current file describes the five questions in passive voice
with no facilitation mechanics. The new version adds a "Facilitation" subsection
under each question specifying the exact tool the coach uses and how agents
respond.

**New content:**

```markdown
# The Five Coaching Kata Questions

These questions structure every coaching interaction — team meetings and 1-on-1
sessions. The coach asks, the learner(s) reflect.

In facilitated mode, the coach communicates through orchestration tools. In solo
mode, the coach reads data directly. The mechanism differs; the questions and
their intent are identical.

## Question 1: What is the target condition?

- Read the target condition from the storyboard.
- Ground the conversation in where the team is headed.
- If the target condition is unclear or expired, update it (planning mode).

### Facilitation

The coach broadcasts the target condition to all participants via **Share** —
this is context-setting, not a question that requires individual responses.
Agents hear the same direction and can orient before the coach asks Q2.

## Question 2: What is the actual condition now?

- Each agent reports measured data from their domain's metrics CSVs.
- The coach updates the Current Condition section with fresh numbers.
- Use counts and durations — not narratives like "improving" or "stable."
- Reference specific CSV files: `wiki/metrics/{agent}/{domain}/{YYYY}.csv`.

### Facilitation

The coach poses Q2 to each agent individually via **Tell**. Each agent
responds by broadcasting their domain metrics via **Share** — all participants
see every response, enabling cross-domain awareness. The coach collects all
responses before moving to Q3.

## Question 3: What obstacles are preventing us from reaching the target condition?

- Agents identify obstacles from their domain based on the gap between current
  and target condition.
- Obstacles are discovered through data and experiments, not hypothesized
  upfront.
- The coach updates the Obstacles list and marks which obstacle the team is
  currently addressing.

### Facilitation

The coach poses Q3 to each agent individually via **Tell**. Each agent
broadcasts identified obstacles via **Share**. The coach collects all responses,
updates the storyboard's Obstacles section, and selects which obstacle the team
addresses next.

## Question 4: What is the next step? What do you expect?

- For the obstacle currently being addressed, agents propose their next
  experiment.
- The expected outcome is recorded _before_ the experiment runs.
- Experiments should be small and testable within one or two daily cycles.

### Facilitation

The coach addresses Q4 via **Tell** to the agent(s) owning the current
obstacle. The agent broadcasts their proposed experiment and expected outcome
via **Share**. The coach records the experiment in the storyboard before moving
on.

## Question 5: When can we see what we learned from that step?

- Establish when the experiment's results will be visible.
- Typically: next meeting, end of week, or after a specific workflow run.
- This creates the feedback loop — the next meeting opens by reviewing what was
  learned.

### Facilitation

The coach addresses Q5 via **Tell** to the experiment owner(s). The agent
broadcasts the timeline via **Share**. The coach records the timeline in the
storyboard.

## Redirect

Redirect is available but unmapped to a specific question. The coach may use
**Redirect** at any point to interrupt an agent that is off-track or
misunderstanding the question — it is corrective, not part of the standard
questioning sequence.

## 1-on-1 Coaching Adaptation

The same five questions apply but scoped to the individual agent's trace:

- Q1: What were you trying to achieve in this run?
- Q2: What actually happened? (agent runs `kata-trace` on its own trace)
- Q3: What obstacles prevented better outcomes?
- Q4: What will you do differently next run?
- Q5: When will you see the effect? (next scheduled run)

In facilitated mode, the same tool pattern applies — Tell to pose, Share to
respond — with a single participant instead of five.
```

### Step 4: Rework SKILL.md

**File:** `.claude/skills/kata-storyboard/SKILL.md`

Four sub-changes:

**4a. Update "When to Use" (line 17).**

**Before:**

> Your Assess section routed you to a coaching context: team storyboard meeting
> or 1-on-1 coaching session.

**After:**

> Entry-point skill for the improvement coach's two facilitation contexts: team
> storyboard meetings (daily-meeting workflow) and 1-on-1 coaching sessions
> (coaching-session workflow).

**4b. Update checklists (lines 22–39).**

**Before read-do checklist:**

```markdown
<read_do_checklist goal="Prepare for the coaching session">

- [ ] Read the current month's storyboard (`wiki/storyboard-YYYY-MNN.md`). If
      none exists, this is a planning meeting.
- [ ] Identify which metrics CSVs to review from `wiki/metrics/`.
- [ ] For 1-on-1: identify the agent's most recent trace for analysis.

</read_do_checklist>
```

**After:**

```markdown
<read_do_checklist goal="Prepare for the coaching session">

- [ ] Detect mode: call RollCall — success means facilitated mode, tool-not-found
      means solo mode.
- [ ] Read the current month's storyboard (`wiki/storyboard-YYYY-MNN.md`). If
      none exists, this is a planning meeting.
- [ ] Identify which metrics CSVs to review from `wiki/metrics/`.
- [ ] For 1-on-1: identify the agent's most recent trace for analysis.

</read_do_checklist>
```

**Before do-confirm checklist:**

```markdown
<do_confirm_checklist goal="Verify coaching session quality">

- [ ] All five coaching kata questions were addressed.
- [ ] Current condition updated with numbers from metrics CSVs (not narrative).
- [ ] For team meetings: storyboard file updated and committed.
- [ ] For 1-on-1: agent's findings written to its own memory.
- [ ] Experiment expected outcome recorded _before_ the experiment runs.

</do_confirm_checklist>
```

**After:**

```markdown
<do_confirm_checklist goal="Verify coaching session quality">

- [ ] All five coaching kata questions were addressed.
- [ ] In facilitated mode: every coaching question reached participants via Tell
      or Share — no direct wiki/metrics file reads for domain data.
- [ ] Current condition updated with numbers from metrics CSVs (not narrative).
- [ ] For team meetings: storyboard file updated and committed.
- [ ] For 1-on-1: agent's findings written to its own memory.
- [ ] Experiment expected outcome recorded _before_ the experiment runs.
- [ ] In facilitated mode: Conclude called with session summary.

</do_confirm_checklist>
```

**4c. Rewrite Process section (lines 69–81).**

**Before:**

```markdown
## Process

1. **Read the storyboard.** Load `wiki/storyboard-YYYY-MNN.md`. If it does not
   exist, this is a planning meeting — create it from
   [`references/storyboard-template.md`](references/storyboard-template.md).
2. **Gather metrics.** Read relevant CSVs from `wiki/metrics/` for each
   participating agent's domain.
3. **Run the five questions.** Follow
   [`references/coaching-protocol.md`](references/coaching-protocol.md) for the
   appropriate mode.
4. **Update the storyboard.** Write updated Current Condition, Obstacles, and
   Experiments sections back to the storyboard file.
5. **Commit.** Commit storyboard changes as part of the wiki push.
```

**After:**

```markdown
## Process

1. **Detect mode.** Call RollCall. If it succeeds, you are in facilitated mode —
   use orchestration tools for all participant interaction. If the call fails
   with tool-not-found, you are in solo mode — use direct file reads (existing
   behavior).
2. **Read the storyboard.** Load `wiki/storyboard-YYYY-MNN.md`. If it does not
   exist, this is a planning meeting — create it from
   [`references/storyboard-template.md`](references/storyboard-template.md).
3. **Run the five questions.** Follow
   [`references/coaching-protocol.md`](references/coaching-protocol.md). In
   facilitated mode, use the orchestration tools specified in each question's
   Facilitation subsection — Share to broadcast Q1, Tell to pose Q2–Q5 to
   individual agents, collect agent responses (agents respond via Share). In
   solo mode, read metrics and wiki files directly.
4. **Update the storyboard.** Write updated Current Condition, Obstacles, and
   Experiments sections back to the storyboard file.
5. **Evaluate coaching need (team meetings only).** Review the session's findings.
   If a participant would benefit from a 1-on-1 coaching session — persistent
   obstacles, unanalyzed traces, or stalled experiments — trigger
   `coaching-session.yml` via `gh workflow run coaching-session.yml -f agent=<name>`.
   Skip this step in 1-on-1 sessions.
6. **Commit.** Commit storyboard changes as part of the wiki push.
7. **Conclude (facilitated mode only).** Call Conclude with a session summary
   covering: meeting type, key metrics reviewed, obstacles addressed, experiments
   planned, and any coaching session triggered.
```

**4d. Remove the old "Gather metrics" step.** In facilitated mode, metric data
comes from agents responding to Q2 — the coach does not read CSVs directly. The
coaching protocol reference handles this per-question. Solo mode preserves
direct reads via step 3's fallback clause.

### Step 5: Delete the standalone workflow

**File:** `.github/workflows/improvement-coach.yml` — **delete entirely.**

The coach's two remaining invocation paths (daily-meeting, coaching-session)
both use `mode: "facilitate"` with specific task prompts. No standalone workflow
needed.

### Step 6: Update KATA.md

**File:** `KATA.md`

Four sub-changes:

**6a. Update the intro paragraph (lines 16–18).**

**Before:**

> Eight workflows — six individual agent runs, one daily team meeting, and one
> on-demand coaching session — six agent personas, and nineteen skills form a
> self-reinforcing PDSA cycle.

**After:**

> Seven workflows — five individual agent runs, one daily team meeting, and one
> on-demand coaching session — six agent personas, and nineteen skills form a
> self-reinforcing PDSA cycle.

**6b. Update the Workflows section (lines 77–84).**

**Before:**

> Eight workflows: six individual agent runs spanning 04-11 UTC, one daily team
> meeting at 03:00 UTC, and one on-demand coaching session. Times respect
> ordering constraints (team meeting before individual runs, security before
> product, product before planning, planning before release, all producers
> before the improvement coach). Off-minute schedules avoid API load spikes. All
> support `workflow_dispatch`, use concurrency groups, and have a 30-minute
> timeout. Each workflow sends the same generic task prompt; the agent's Assess
> section determines the actual action.

**After:**

> Seven workflows: five individual agent runs spanning 04–09 UTC, one daily team
> meeting at 03:00 UTC, and one on-demand coaching session. Times respect
> ordering constraints (team meeting before individual runs, security before
> product, product before planning, planning before release). Off-minute
> schedules avoid API load spikes. All support `workflow_dispatch`, use
> concurrency groups, and have a 30-minute timeout. Individual agent workflows
> send a generic task prompt; the agent's Assess section determines the actual
> action. The daily meeting and coaching session send specific task prompts to
> the improvement coach as facilitator.

**6c. Remove the standalone improvement-coach row from the workflows table (line
95).**

Delete:
`| **improvement-coach** | Wed & Sat 10:47 UTC | improvement-coach                        |`

**6d. Update the agents table description for improvement-coach (line 73).**

**Before:**

> | **improvement-coach** | Study, Act | Grasp current condition via traces,
> audit invariants, fix or spec |

**After:**

> | **improvement-coach** | Study | Facilitate storyboard meetings and 1-on-1
> coaching sessions |

The coach no longer Acts (no fix PRs or specs) — it only Studies via
facilitation.

## Blast Radius

| File                                                             | Action                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `libraries/libeval/src/facilitator.js`                           | Modified (2 string constants)                                      |
| `.claude/agents/improvement-coach.md`                            | Modified (frontmatter, persona, remove Assess, update Constraints) |
| `.claude/skills/kata-storyboard/references/coaching-protocol.md` | Replaced (full rewrite)                                            |
| `.claude/skills/kata-storyboard/SKILL.md`                        | Modified (When to Use, checklists, Process)                        |
| `.github/workflows/improvement-coach.yml`                        | **Deleted**                                                        |
| `KATA.md`                                                        | Modified (counts, table, descriptions)                             |

No other files change. The `libraries/libeval/src/index.js` re-exports are
unaffected (same constant names). No test files change (the constants have no
direct tests). The daily-meeting and coaching-session workflows are unchanged.

## Ordering

Steps 1–4 are independent — no runtime or textual dependency between them. Step
5 (delete workflow) can happen at any time. Step 6 (KATA.md) depends on step 5
being decided (to get the count right) but not on any code change.

All six steps can be executed in a single pass.

## Risks

1. **Facilitated mode never activates in solo development.** Mitigated: the
   design's context detection (RollCall probe) preserves solo mode as fallback.
   No developer workflow breaks.
2. **Coaching protocol rewrite changes agent behavior in next daily meeting.**
   This is the intended effect — the first post-merge daily meeting is the
   verification that orchestration tools are used. Trace analysis of that run
   confirms success criterion 1.
3. **Removing kata-spec from coach skills.** The coach can no longer write
   specs. Per the spec, acting on findings routes to domain agents — this is
   intentional. If a coaching session reveals a need for a spec, the coach tells
   the relevant domain agent or staff-engineer.

## Libraries Used

No shared `@forwardimpact/lib*` libraries are consumed by these changes. The
`FACILITATOR_SYSTEM_PROMPT` and `FACILITATED_AGENT_SYSTEM_PROMPT` constants live
in `libraries/libeval/src/facilitator.js` but the changes are string-value
edits, not new library consumption.

## Execution

Single-agent, single-pass execution. All six steps are documentation and
string-constant changes with no build or runtime dependencies between them.

**Agent:** `staff-engineer` for all steps (code constant in step 1, all other
steps are agent profile, skill, workflow, and documentation files that the
staff-engineer routinely handles).

No decomposition needed — total blast radius is six files with straightforward
edits.

## Verification

After all steps are complete, run `bun run check` and `bun run test` to confirm
no regressions (success criterion 8). The only runtime code change is two string
constants in `facilitator.js` — test failures would indicate an import or syntax
issue, not a behavioral regression.
