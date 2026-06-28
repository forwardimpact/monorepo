# Spec 0460 — Kata Coaching System

## Problem

Spec 0450 gave each kata agent autonomy to assess its domain and choose its own
next action. Spec 0440 gave agents structured tools for multi-agent facilitated
sessions. But agents still work in isolation. Each wakes on its schedule, reads
the wiki, does its best work, writes back, and goes to sleep. Coordination is
passive and asynchronous — an agent discovers what its teammates did by reading
summaries left behind hours earlier.

This creates three visible problems in the wiki:

- **No shared direction.** Each agent independently assesses its domain every
  run, but nobody decides _what the team should focus on_. The security-engineer
  may spend Tuesday auditing CI/CD while the staff-engineer is implementing a
  spec that will restructure CI/CD — because neither knew the other's intent.
  Individual assessment (spec 0450) solved _per-agent_ planning; it did not
  solve _cross-agent_ planning.

- **Slow feedback loops.** The "Observations for Teammates" pattern in wiki
  summaries works, but observations routinely sit for days before the target
  agent acknowledges them. The technical-writer flagged a protobufjs observation
  for the security-engineer that went 12 days without response. When the only
  communication channel is "write a note, hope they read it tomorrow,"
  cross-agent feedback degrades into a suggestion box.

- **No measured conditions.** Agents describe their domain state in prose —
  "coverage is improving," "backlog is manageable," "CI is healthy." But Toyota
  Kata requires _measured_ conditions: numbers that reveal whether experiments
  are working. Without time-series data, the improvement kata questions ("what
  is the actual condition now?") produce narrative answers instead of evidence.
  The team cannot distinguish signal from noise, cannot detect trends, and
  cannot build process behavior charts that reveal whether a process is stable
  or reacting to special causes.

- **Inverted learner/coach relationship.** In Toyota Kata, the _learner_ does
  the work and the _coach_ asks the questions. Currently the improvement coach
  analyzes other agents' traces and holds findings in its own wiki summary. The
  analyzed agent never sees its own trace — it learns nothing from the analysis.
  This inverts Toyota Kata: the coach does the learning instead of the learner.
  The improvement coach should be asking the five coaching kata questions while
  the agent itself reflects on its own work.

The Toyota Kata model prescribes a specific discipline: understand the direction
(challenge), grasp the current condition (measured), establish a target
condition (measurable), identify obstacles, and run experiments (PDSA cycles).
The daily Kata Storyboard meeting reviews progress through five structured
questions — not status updates. The coaching kata is always a dialogue between a
_coach_ who asks and a _learner_ who reflects. Spec 0450 gave agents the ability
to grasp _their own_ current condition. This spec gives the _team_ the
structures needed to practice Toyota Kata fully: a shared storyboard, measured
data, a disciplined daily review, and 1-on-1 coaching sessions where agents
analyze their own work.

## Proposal

Four additions form a cohesive coaching system: a data recording protocol
(`kata-metrics`), a coaching protocol used for both team meetings and 1-on-1
sessions (`kata-storyboard`), a reframing of trace analysis as learner-driven
coaching, and holistic updates to every entry-point kata skill.

```text
Current:  Coach analyzes agent traces → findings stay in coach's memory
          Agents wake → read wiki → assess own domain → act (in isolation)

Proposed: Agents record metrics → Team storyboard reviews progress
          Coach facilitates 1-on-1 → agent analyzes its own trace → agent learns
```

### kata-metrics — Time-series data recording

A new utility skill defining the protocol for recording measured data across all
kata workflows. Like `kata-gh-cli`, it is a reference skill that other skills
consume — no agent's Assess phase routes to it as a primary action.

**What agents need to record:** time-series data points — a numeric measurement
of some domain condition, taken at a known time, traceable to the workflow run
that produced it, and annotated when anomalies occur. Each data point must
identify which metric it belongs to (a stable name that forms the time-series
key), the measurement value, the unit of measurement, and the date.

**Why this format:** agents need sequential numeric data to answer the coaching
kata question "what is the actual condition now?" with evidence rather than
narrative. Sequential measurements support process behavior charts (XmR charts)
— the standard tool for distinguishing stable processes from those reacting to
special causes. Counts and durations are preferred over ratios because they
produce meaningful individual-value and moving-range plots.

**Storage requirements:** metrics must be organized per agent and per domain so
that each agent can find its own data and the storyboard meeting can query
across agents. Files must be structured for easy appending (one row per data
point) and should partition by time to keep file sizes manageable. The wiki
submodule is the storage location, consistent with existing shared memory.

Example directory structure:

- `wiki/metrics/security-engineer/audit/2026.csv`
- `wiki/metrics/release-engineer/pr-readiness/2026.csv`
- `wiki/metrics/product-manager/triage/2026.csv`

**Recording protocol:** every entry-point kata skill appends metrics at the end
of each run, after completing its primary work but before updating the wiki
summary. Agents choose which metrics to record based on what they observe during
the run — the skill's `references/metrics.md` suggests metrics but does not
mandate them.

**What the skill file contains:**

- Data format specification (schema, field types, appending rules)
- Storage convention (directory structure, file naming, partitioning)
- Metric design guidance: prefer counts and durations over ratios; prefer direct
  measurements over derived values; keep metric names stable across runs
- Process behavior chart guidance: how to read XmR charts, how natural process
  limits are computed from the data itself, how to distinguish signal from noise

**What the skill file does not contain:** specific metrics for any domain. Those
live in each entry-point skill's `references/metrics.md`.

### kata-storyboard — Coaching protocol

A new entry-point skill defining the Toyota Kata Storyboard protocol. Used in
two contexts: team storyboard meetings (improvement coach facilitates, five
domain agents participate) and 1-on-1 coaching sessions (improvement coach
facilitates, one domain agent participates and analyzes its own trace). The
protocol is the same five questions in both contexts — only the scope differs.

**The storyboard artifact.** The team maintains a monthly storyboard at
`wiki/storyboard-YYYY-MNN.md` (e.g., `storyboard-2026-M04.md`) where NN is the
zero-padded month. Monthly cadence matches the natural rhythm of target
conditions — long enough to run meaningful experiments, short enough to force
regular reassessment.

The storyboard contains five sections, mirroring the Toyota Kata Storyboard:

1. **Challenge** — the long-term direction that gives meaning to target
   conditions and experiments. Changes rarely — only when strategic direction
   shifts.
2. **Target Condition** — the measurable state the team aims to reach by the end
   of the month. Not a task list — a description of how the system will behave
   differently, expressed in terms verifiable with data from metrics CSVs.
3. **Current Condition** — the measured state as of the last storyboard review,
   updated daily during the meeting using data from `wiki/metrics/`. Always
   expressed with numbers, not narratives.
4. **Obstacles** — what stands between the current condition and the target
   condition. Discovered through experiments, not predicted upfront. Tracks
   which obstacle the team is currently addressing.
5. **Experiments** — PDSA cycles run against the current obstacle. Each
   experiment records an expected outcome _before_ running and an actual outcome
   _after_, enabling the team to learn from the gap between prediction and
   reality.

The exact template lives in the skill's `references/storyboard-template.md`.

**The five coaching kata questions.** The daily meeting is structured around
these questions, not status updates:

1. **What is the target condition?** — Facilitator reads the target condition
   from the storyboard. Grounds the conversation in where the team is headed.
2. **What is the actual condition now?** — Each agent reports measured data from
   their domain's metrics CSVs. The facilitator updates the Current Condition
   section with fresh numbers.
3. **What obstacles are preventing us from reaching the target condition?** —
   Agents identify obstacles from their domain. The facilitator updates the
   Obstacles list and asks which obstacle the team is currently addressing.
4. **What is the next step? What do you expect?** — For the obstacle currently
   being addressed, agents propose their next experiment. The expected outcome
   is recorded _before_ the experiment runs.
5. **When can we see what we learned from that step?** — Establishes when the
   experiment's results will be visible (next meeting, end of week, after a
   specific workflow run).

**Team meeting participants.** The daily team meeting uses facilitate mode with
the improvement coach as facilitator and five domain agents as participants:
security-engineer, technical-writer, product-manager, staff-engineer, and
release-engineer. This is a 6-agent session (1 coach/facilitator + 5
participants) and must complete within the 30-minute workflow timeout. The
improvement coach does not participate as a domain expert — it coaches.

**1-on-1 coaching participants.** A coaching session uses facilitate mode with
the improvement coach as facilitator and one domain agent as participant. The
agent selected as input to the coaching-session workflow. The agent runs
`kata-trace` on its own recent trace during the session, guided by the coach's
five questions. The agent writes findings to its own memory — no memory routing
needed.

**Meeting modes.** The storyboard skill defines two modes for team meetings:

- **First meeting of the month (or no storyboard exists)** — Planning meeting.
  The coach leads the team through establishing the challenge (if new), setting
  the target condition, measuring the current condition, identifying initial
  obstacles, and planning the first experiment. Creates
  `wiki/storyboard-YYYY-MNN.md`.
- **All other meetings** — Review meeting. The coach walks through the five
  questions, updates the current condition with fresh metrics, records
  experiment outcomes, and starts the next experiment cycle.

**What the skill file contains:**

- The five-question meeting protocol (planning mode and review mode)
- Storyboard artifact format and template
- Instructions for reading metrics CSVs during the meeting
- Guidance on writing good target conditions (measurable, time-bound)
- Guidance on identifying obstacles (discovered through data, not hypothesized)
- Guidance on designing experiments (expected outcome stated before running)
- Checklists: read-do for meeting preparation, do-confirm for meeting conclusion

### Holistic kata skill updates

Every entry-point kata skill (14 total) gains two things:

1. **`references/metrics.md`** — A new reference file suggesting domain-specific
   metrics the agent should consider tracking. These are suggestions, not
   mandates. Agents discover the most useful metrics through practice — the
   reference file seeds initial ideas. Examples of what each file might suggest:

   | Skill                   | Example metric suggestions                                   |
   | ----------------------- | ------------------------------------------------------------ |
   | kata-security-audit     | open_vulnerabilities, days_since_topic_audit, findings_count |
   | kata-security-update    | dependabot_pr_backlog, time_to_resolve, merge_success_rate   |
   | kata-release-readiness  | prs_waiting, consecutive_stuck_count, rebase_failures        |
   | kata-release-review     | unreleased_changes, days_since_release, publish_failures     |
   | kata-product-triage     | open_issues, issues_triaged_per_run, spec_conversion_count   |
   | kata-product-classify   | open_prs, prs_merged_per_run, blocked_pr_count               |
   | kata-product-evaluation | friction_points_found, tasks_completed_ratio                 |
   | kata-documentation      | pages_reviewed, accuracy_errors, days_since_topic_review     |
   | kata-wiki-curate        | stale_observations, summary_corrections, log_hygiene_issues  |
   | kata-trace              | traces_analyzed, findings_per_trace, invariant_pass_rate     |
   | kata-spec               | specs_in_backlog, days_in_draft                              |
   | kata-design             | designs_in_backlog, days_in_draft                            |
   | kata-plan               | plans_in_backlog, days_in_draft                              |
   | kata-implement          | steps_completed, blockers_encountered, plan_deviation_count  |

2. **Metric recording in "Memory: what to record"** — Each entry-point skill's
   memory section gains a metric recording step referencing the `kata-metrics`
   protocol. Skills that already have a "Memory: what to record" section (most
   entry-point skills) gain an additional bullet. Skills that lack this section
   (notably `kata-spec`, and any others discovered during implementation) gain a
   new "Memory: what to record" section. The specific metrics recorded per run
   are the agent's choice, informed by the skill's `references/metrics.md`.

### Trace analysis as learner-driven coaching

The `kata-trace` skill is reframed: domain agents run it on their own traces
during 1-on-1 coaching sessions, not the improvement coach. The skill itself
needs minimal content changes — the grounded theory methodology, invariant
audit, and report structure are unchanged. What changes is _who runs it_ and
_where findings go_.

Currently the improvement coach's skill list includes `kata-trace` and its
Assess section routes to trace analysis as a primary action. After this change:

- **Five domain agents** each gain `kata-trace` in their skill list. During a
  1-on-1 coaching session, the agent analyzes its own recent trace guided by the
  coach's five questions. Findings go to the agent's own wiki memory.
- **The improvement coach** loses `kata-trace` from its skill list. Its role
  becomes purely coaching: facilitating team storyboard meetings and 1-on-1
  coaching sessions using `kata-storyboard`. The coach's Assess section routes
  to choosing which coaching context to run (team meeting or 1-on-1 with a
  selected agent).

This aligns with Toyota Kata: the coach asks, the learner reflects.

### Agent profile changes

All five domain agent profiles (security-engineer, technical-writer,
product-manager, staff-engineer, release-engineer) gain:

- **Assess step 0** — reads the current month's storyboard and weights priority
  assessment toward actions that advance the team's target condition.
- **`kata-trace`** in their skill list — used during 1-on-1 coaching sessions.

Assess step 0 is advisory, not directive. The storyboard informs the agent's
assessment but does not override it. If an agent discovers an urgent condition
during its Assess phase (e.g., a critical CVE), it acts on that regardless of
what the storyboard says — urgency always wins. The agent notes the deviation in
its decision log with rationale.

The **improvement-coach** profile is restructured:

- **Skills** become `kata-storyboard`, `kata-metrics`, `kata-spec`,
  `kata-review`, `kata-gh-cli`. Loses `kata-trace` (now run by learners, not the
  coach).
- **`kata-metrics`** — the coach reads metrics across all agents when reviewing
  the storyboard, assessing whether experiments are producing measurable
  improvement.
- **Assess section** — routes to coaching contexts: team storyboard meeting or
  1-on-1 coaching session with a selected agent.
- **No separate facilitator profile** — the improvement coach IS the
  facilitator, consistent with the Toyota Kata coaching role. The meeting
  protocol lives in `kata-storyboard` (not inline in the profile), keeping the
  profile focused on persona and constraints.

### Workflow scheduling

Two new workflows, both using facilitate mode with the improvement coach:

| Workflow             | Schedule            | Mode       | Participants    |
| -------------------- | ------------------- | ---------- | --------------- |
| **daily-meeting**    | Daily 03:00 UTC     | facilitate | 5 domain agents |
| **coaching-session** | `workflow_dispatch` | facilitate | 1 agent (input) |

The daily meeting runs before all individual agent workflows (04-11 UTC,
unchanged). The coaching session is triggered on demand — the improvement
coach's regular `run`-mode workflow selects which agent to coach and triggers
the coaching-session workflow with the agent name as input.

The existing improvement-coach workflow (Wed & Sat 10:47 UTC, `run` mode)
remains. During its Assess phase, the coach either triggers a coaching session
or reviews the team storyboard — it no longer runs trace analysis itself.

### What this is really about

Toyota Kata is not a meeting format — it is a practice pattern with two distinct
roles. The _coach_ asks the five questions. The _learner_ reflects, measures,
and experiments. The coach never does the learner's work — that would rob the
learner of the learning.

Previous versions of this spec had the improvement coach analyzing other agents'
traces and holding findings in its own memory. That inverts the roles: the coach
was doing the learning. This version corrects the inversion. The improvement
coach facilitates — it asks the five questions during team meetings and 1-on-1
coaching sessions. The domain agents do the actual reflection and analysis,
including analyzing their own traces during coached sessions.

The metrics infrastructure makes this possible. Without recorded data, the five
questions produce the same prose answers agents already write in wiki summaries.
With CSV time series per domain, agents can answer "what is the actual condition
now?" with numbers. The storyboard makes the pattern tangible: challenge,
current condition, target condition, obstacles, experiments.

This is not about adding ceremony. It is about giving the team the structures
Toyota Kata prescribes: a shared challenge, measured conditions, deliberate
experiments, a daily review cycle, and a coaching relationship where the learner
learns.

### What does not change

- **Individual agent autonomy.** Agents still assess their own domain and choose
  their own action. The storyboard informs, it does not command.
- **Fix-or-spec discipline.** Unchanged.
- **Trust boundary.** The product manager remains the sole external merge point.
- **Wiki summaries and weekly logs.** Unchanged. Metrics are a new file type
  added alongside them, not a replacement.
- **Decision logging.** Agents still log Surveyed/Alternatives/Chosen/Rationale.
  The storyboard becomes one of the things surveyed.
- **kata-trace content.** The grounded theory methodology, invariant audit, and
  report structure are unchanged. Only _who runs it_ and _where findings go_
  change.

## Scope

### Affected

**New skill files:**

- `.claude/skills/kata-storyboard/SKILL.md` — coaching protocol (team + 1-on-1)
- `.claude/skills/kata-storyboard/references/storyboard-template.md` — artifact
  template
- `.claude/skills/kata-metrics/SKILL.md` — metrics recording protocol
- `.claude/skills/kata-metrics/references/csv-schema.md` — CSV format
  specification
- `.claude/skills/kata-metrics/references/control-charts.md` — process behavior
  chart guidance

**New reference files in existing skills (14 entry-point skills):**

- `.claude/skills/kata-security-audit/references/metrics.md`
- `.claude/skills/kata-security-update/references/metrics.md`
- `.claude/skills/kata-release-readiness/references/metrics.md`
- `.claude/skills/kata-release-review/references/metrics.md`
- `.claude/skills/kata-product-triage/references/metrics.md`
- `.claude/skills/kata-product-classify/references/metrics.md`
- `.claude/skills/kata-product-evaluation/references/metrics.md`
- `.claude/skills/kata-documentation/references/metrics.md`
- `.claude/skills/kata-wiki-curate/references/metrics.md`
- `.claude/skills/kata-trace/references/metrics.md`
- `.claude/skills/kata-spec/references/metrics.md`
- `.claude/skills/kata-design/references/metrics.md`
- `.claude/skills/kata-plan/references/metrics.md`
- `.claude/skills/kata-implement/references/metrics.md`

**Modified skill files (14 entry-point SKILL.md files):**

- Each gains a metric recording bullet in "Memory: what to record"

**Modified agent profiles:**

- `.claude/agents/security-engineer.md` — Assess step 0, add `kata-trace`
- `.claude/agents/technical-writer.md` — Assess step 0, add `kata-trace`
- `.claude/agents/product-manager.md` — Assess step 0, add `kata-trace`
- `.claude/agents/staff-engineer.md` — Assess step 0, add `kata-trace`
- `.claude/agents/release-engineer.md` — Assess step 0, add `kata-trace`
- `.claude/agents/improvement-coach.md` — restructured: replace `kata-trace`
  with `kata-storyboard` + `kata-metrics`, rewrite Assess to route to coaching
  contexts

**New workflows:**

- `.github/workflows/daily-meeting.yml` — team storyboard using facilitate mode
- `.github/workflows/coaching-session.yml` — 1-on-1 coaching using facilitate
  mode, agent name as `workflow_dispatch` input

**Documentation:**

- `wiki/MEMORY.md` — document storyboard and metrics conventions
- `KATA.md` — add storyboard and coaching-session to Workflows table, add
  Metrics section, describe coaching protocol

**Wiki directory structure (created at runtime):**

- `wiki/metrics/{agent}/{domain}/` — created by agents as they record metrics
- `wiki/storyboard-YYYY-MNN.md` — created by coach during planning meetings

### Excluded

- `kata-action` composite action — out of scope; design will determine whether
  it needs changes
- `fit-eval` CLI — facilitate mode already implemented (spec 0440)
- Individual agent scheduling — domain agent times unchanged
- Utility/leaf skills (`kata-review`, `kata-ship`, `kata-gh-cli`) — no metrics
  sections; they are not entry-point skills
- `kata-trace` content — grounded theory methodology unchanged; only who runs it
  changes

## Dependencies

- **Spec 0440 (facilitate mode)** — the meeting requires the `facilitate`
  execution mode and its orchestration tools (`plan implemented` in STATUS).
- **Spec 0450 (agent-centered workflows)** — the Assess framework that the
  storyboard integrates into (`plan implemented` in STATUS).

## Success Criteria

1. **`kata-metrics` skill** exists with CSV schema, storage convention,
   recording protocol, metric design guidance, and process behavior chart
   guidance.
2. **`kata-storyboard` skill** exists with the five-question coaching protocol
   (team meeting and 1-on-1 modes), storyboard artifact template, and
   checklists.
3. **Monthly storyboard creation** — the `kata-storyboard` skill includes
   instructions to create `wiki/storyboard-YYYY-MNN.md` with sections:
   Challenge, Target Condition, Current Condition, Obstacles, Experiments.
4. **Storyboard review** — the skill includes instructions to walk through the
   five coaching kata questions, update the current condition with measured data
   from metrics CSVs, record experiment outcomes, and plan next experiments.
5. **1-on-1 coaching** — the `kata-storyboard` skill includes instructions for
   coaching a single agent through trace analysis using the five questions.
6. **Metrics reference files** — all 14 entry-point kata skills carry a
   `references/metrics.md` suggesting domain-appropriate metrics.
7. **Metric recording** — all 14 entry-point kata skills include a metric
   recording step in their "Memory: what to record" section.
8. **Domain agent profiles** — all five domain profiles include an Assess step 0
   (storyboard reading) and `kata-trace` in their skill list.
9. **Improvement coach profile** — restructured with `kata-storyboard` and
   `kata-metrics` as primary skills, Assess routing to coaching contexts (team
   meeting or 1-on-1), no longer carries `kata-trace`.
10. **Daily meeting workflow** exists at `.github/workflows/daily-meeting.yml`,
    scheduled at 03:00 UTC daily, using facilitate mode with five domain agents
    as participants and the improvement coach as facilitator.
11. **Coaching session workflow** exists at
    `.github/workflows/coaching-session.yml`, triggered by `workflow_dispatch`
    with agent name as input, using facilitate mode with the improvement coach
    as facilitator and the selected agent as participant.
12. **MEMORY.md** documents both the `storyboard-YYYY-MNN.md` and
    `wiki/metrics/` conventions.
13. **KATA.md** includes the storyboard meeting, coaching sessions, metrics
    infrastructure, and five-question protocol.
14. **`bun run check` and `bun run test` pass** with no regressions.
