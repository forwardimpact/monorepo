---
name: kata-session
description: >
  Toyota Kata coaching protocol for facilitated sessions. Used by the
  improvement coach (facilitator) and by domain agents who participate via the
  Ask/Answer/Announce orchestration tools. Same five coaching kata questions
  across team storyboard meetings and 1-on-1 coaching sessions; mode-specific
  guidance lives in references/team-storyboard.md and references/one-on-one.md.
---

# Kata Session

Shared entry-point skill for Toyota Kata coaching sessions. The improvement
coach facilitates (Facilitator Process); domain agents participate (Participant
Protocol). The mode-specific artifact surface lives in two overlays:
[`team-storyboard.md`](references/team-storyboard.md) and
[`one-on-one.md`](references/one-on-one.md).

## When to Use

**Facilitator**: Entry-point skill for the improvement coach's two facilitation
contexts — team storyboard meetings (`kata-storyboard.yml` workflow) and 1-on-1
coaching sessions (`kata-coaching.yml` workflow).

**Participant**: The coach's session-open briefing covers most runs; load this
skill only for the full Participant Protocol below.

## Checklists

### Facilitator

<read_do_checklist goal="Prepare for the coaching session">

- [ ] Detect mode: call RollCall — success means facilitated mode,
      tool-not-found means solo mode.
- [ ] Pick the overlay that matches the mode
      ([`references/team-storyboard.md`](references/team-storyboard.md) or
      [`references/one-on-one.md`](references/one-on-one.md)) and follow its
      artifact guidance.
- [ ] Pick metrics CSVs from `wiki/metrics/` for participants to report.
      Participants — not the facilitator — run `npx fit-xmr analyze`.
- [ ] Team runs: confirm each metric has its `<!-- xmr:... -->` marker (a
      participant seeds missing ones from
      [`storyboard-template.md`](references/storyboard-template.md)); blocks
      render from the deterministic `fit-wiki refresh` step, never the facilitator.

</read_do_checklist>

<do_confirm_checklist goal="Verify coaching session quality">

- [ ] All five coaching kata questions were addressed.
- [ ] Every `Ask` received an `Answer`.
- [ ] Current condition reflects participants' reported numbers and XmR
      `status`/`signals` (not narrative); `insufficient_data` metrics noted.
- [ ] Each participant recorded its obstacles/experiments as labeled issues per
      [`issue-lifecycle.md`](references/issue-lifecycle.md) and reported the
      `#NNN`s; the facilitator created none.
- [ ] Comments closing a thread or routing a decision to a named owner name
      what is in flight (owner + artifact) or the explicit negative; routed
      owners reminded to announce at PR-open.
- [ ] Weekly log updated under `## YYYY-MM-DD` with meeting type, metrics,
      obstacle, experiment, and Step 7 routing (1-on-1: the coached agent writes
      its own).
- [ ] In facilitated mode: `Conclude` called with session summary.

</do_confirm_checklist>

### Participant

<do_confirm_checklist goal="Verify participation quality">

- [ ] Q2 data gathered from live sources, not memory or prior logs.
- [ ] Domain metrics appended to CSV before answering (step 2), and
      `npx fit-xmr analyze` run on own CSV(s) with `status`/`μ`/`signals`
      reported via `Answer`.
- [ ] Metrics reported via `Answer` match the CSV rows just written.
- [ ] Q3 obstacle meets its definition (see
      [work-definition.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/work-definition.md#classification-tests))
      and is recorded as a labeled issue; `#NNN` reported back.
- [ ] Q4 experiment recorded as a labeled issue (`experiment` + `agent:{self}`)
      with its expected outcome and `#NNN` reported back.
- [ ] Q4 expected outcome names metrics owned by a single skill — split
      multi-skill predictions into one per skill / run type.

</do_confirm_checklist>

## The Five Kata Questions

These questions structure every coaching interaction — team meetings and 1-on-1
sessions. The coach asks via `Ask`; the participant replies via `Answer`.

1. **What is the target condition?** Ground the conversation in where the team
   (or the agent) is headed.
2. **What is the actual condition now?** Measured, not narrative — counts and
   durations from live data, recorded in CSV.
3. **What obstacles prevent us from reaching the target?** Each participant
   names the obstacles in their domain.
4. **What is the next step? What do you expect?** Propose the next experiment
   and its expected outcome.
5. **When can we see what we learned from that step?** Establish the feedback
   loop — the next meeting opens by reviewing what was learned.

What an obstacle and an experiment *are* is defined in
[work-definition.md § Classification tests](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/work-definition.md#classification-tests);
mode-specific question wording (team vs. 1-on-1) lives in the overlays.

## Facilitator Process

1. **Detect mode.** Call RollCall. If it succeeds, you are in facilitated mode —
   use orchestration tools (`Ask`, `Answer`, `Announce`, `Conclude`) for all
   participant interaction. If the call fails with tool-not-found, you are in
   solo mode — use direct file reads.
2. **Select the overlay.** For team storyboard runs, load
   [`references/team-storyboard.md`](references/team-storyboard.md). For 1-on-1
   coaching runs, load [`references/one-on-one.md`](references/one-on-one.md).
   The overlay owns the mode-specific artifact surface, the question wording,
   and the participant briefing template.
3. **Brief participants.** Deliver the overlay's briefing template before Q1.
   Team mode: broadcast once via `Announce` at session open. 1-on-1 mode:
   prepend it to the Q1 `Ask` body.
4. **Collect XmR analysis from participants.** Participants run
   `npx fit-xmr analyze` on their own CSVs (Participant Protocol step 2) and
   report `status`, fired-rule `signals`, and `latest` in their Q2 `Answer`. The
   facilitator has no `Bash` — it relays what they report, noting any
   `insufficient_data` metric.
5. **Run the five questions.** Follow the overlay's wording. In facilitated
   mode, pose each question via `Ask` and collect `Answer` replies before
   advancing. After Q3/Q4, `Ask` each participant to record its
   obstacle and experiment as labeled issues per
   [`issue-lifecycle.md`](references/issue-lifecycle.md) and return the `#NNN`s.
   Use `Announce` for between-question transitions.
6. **Collect, don't write.** The facilitator writes no files — participants own
   every write (CSVs, weekly-log memory, issues). Collect reported `#NNN`s and
   numbers via `Answer` for the summary.
7. **Route Q3 obstacles (team meetings only; skip for 1-on-1).** For each
   obstacle the facilitator picks one route (parallel allowed) and logs it; it
   runs no `gh` itself. Triggers and worked example:
   [`team-storyboard.md`](references/team-storyboard.md#q3-obstacle-routing).
   - **Discussion** — shared-artifact change (metric, rule, boundary, policy) or
     same question in ≥2 agents' Q3 answers. The owning agent opens an RFC per
     [coordination-protocol.md](https://github.com/forwardimpact/monorepo/blob/main/.claude/agents/references/coordination-protocol.md).
   - **Coaching** — participant-scoped blocker / unanalyzed trace / stalled
     experiment: not dispatched here. The obstacle issue stands; the coach
     dispatches `kata-coaching.yml` in its Assess run.
8. **Before dispatching follow-on work** for a reviewed artifact, run the
   route-taken check in
   [`dispatch-discipline.md`](references/dispatch-discipline.md) — an
   unexpired same-run continuation announcement means do not re-dispatch.
9. **Conclude (facilitated mode only).** Call `Conclude` with a session summary
   covering meeting type, key metrics, obstacles addressed, experiments planned,
   and any obstacle handed off for coaching. (Wiki pushes automatically; do not
   commit.)

## Participant Protocol

The pattern below applies in both modes and expands the coach's session-open
briefing.

1. **Prepare for Q2.** Gather your domain's current measured state from live
   data (`gh`, `bun`, repo files) — not memory or narrative.
2. **Record metrics to CSV and analyze them.** Before answering, append one row
   per metric to `wiki/metrics/{skill}/{YYYY}.csv` per the skill's
   `references/metrics.md`, creating the directory and header if needed. Then run
   `npx fit-xmr analyze <csv> --format json` on your own CSV(s). The CSV is
   authoritative; your `Answer` summarizes it.
3. **Answer with measured data.** Report numbers via
   `Answer(askId=N, message=…)`, quoting the `askId` from the `[ask#N]` header
   on the question. Reference the CSV rows; include each metric's XmR `status`,
   `μ`, and any fired-rule `signals` from your `fit-xmr analyze` run. Use counts
   and durations — not narratives like "improving." Use `Announce` only for
   unsolicited team-wide context.
4. **Identify obstacles, then record them.** For Q3, each participant names the
   obstacles in its domain, then creates an obstacle issue per
   [`issue-lifecycle.md`](references/issue-lifecycle.md) and reports its `#NNN`.
5. **Propose experiments, then record them.** For Q4, propose the next
   experiment (scoped to one or two daily cycles) and its expected outcome, then
   create an experiment issue (`experiment` + `agent:{self}`) per
   [`issue-lifecycle.md`](references/issue-lifecycle.md) and report its `#NNN`.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Session type** — Team storyboard, review, or 1-on-1 (with which agent)
- **Current condition** — Key numbers from metrics CSVs reviewed
- **Obstacle addressed** — Which obstacle was the focus
- **Experiment status** — Outcome of prior experiment, next experiment planned

Participants record their own domain metrics per Participant Protocol step 2.
