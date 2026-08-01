---
name: kata-session
description: >
  Toyota Kata coaching protocol for facilitated sessions. The improvement coach
  (facilitator) uses it. Domain agents who participate through the
  Ask/Answer/Announce orchestration tools also use it. The same five coaching
  kata questions cover team storyboard meetings and 1-on-1 coaching sessions.
  Mode-specific guidance lives in references/team-storyboard.md and
  references/one-on-one.md.
---

# Kata Session

Shared entry-point skill for Toyota Kata coaching sessions. The improvement
coach facilitates (Facilitator Process). Domain agents participate (Participant
Protocol). The mode-specific artifact surface lives in two overlays,
[`team-storyboard.md`](references/team-storyboard.md) and
[`one-on-one.md`](references/one-on-one.md).

## When to Use

**Facilitator**: Entry point for the improvement coach's two contexts. Those are
team storyboard meetings and 1-on-1 coaching sessions (the storyboard and
coaching workflows that kata-setup generates).

**Participant**: The coach's session-open briefing covers most runs. Load this
skill only for the full Participant Protocol below.

## Checklists

### Facilitator

<read_do_checklist goal="Prepare for the coaching session">

- [ ] Detect mode. Call RollCall. Success means facilitated mode.
      Tool-not-found means solo mode.
- [ ] Pick the overlay that matches the mode
      ([`references/team-storyboard.md`](references/team-storyboard.md) or
      [`references/one-on-one.md`](references/one-on-one.md)) and follow its
      artifact guidance.
- [ ] Pick metrics CSVs from `wiki/metrics/` for participants to report.
      Participants run `gemba-xmr analyze`. The facilitator does not.
- [ ] Team runs: `gemba-wiki refresh` creates the storyboard and renders all
      blocks before the meeting. A participant seeds any missing
      `<!-- xmr:... -->` marker from
      [`storyboard-template.md`](references/storyboard-template.md), never the
      facilitator.

</read_do_checklist>

<do_confirm_checklist goal="Verify coaching session quality">

- [ ] All five coaching kata questions were addressed.
- [ ] Every `Ask` received an `Answer`.
- [ ] Current condition reflects participants' reported numbers and XmR
      `status`/`signals`, never narrative. `insufficient_data` metrics noted.
- [ ] Each participant recorded its obstacles/experiments as labeled issues per
      [`issue-lifecycle.md`](references/issue-lifecycle.md) and reported the
      `#NNN`s. The facilitator created none.
- [ ] Comments that close a thread or route a decision to a named owner name
      what is in flight (owner + artifact) or the explicit negative. Routed
      owners reminded to announce at PR-open.
- [ ] Shared-workspace discipline held per
      [`dispatch-discipline.md`](references/dispatch-discipline.md) §
      Shared-workspace commit discipline: same-surface asks serialized,
      each work-producing ask carried edit-intent, single-owner routing.
- [ ] Weekly log updated under `## YYYY-MM-DD` with meeting type, metrics,
      obstacle, experiment, and Step 7 routing (1-on-1: the coached agent writes
      its own).
- [ ] In facilitated mode: `Conclude` called with session summary.

</do_confirm_checklist>

### Participant

<do_confirm_checklist goal="Verify participation quality">

- [ ] Q2 data gathered from live sources. None from memory or prior logs.
- [ ] Domain metrics appended to CSV before you answer (step 2), and
      `gemba-xmr analyze` run on own CSV(s) with `status`/`μ`/`signals`
      reported through `Answer`.
- [ ] Metrics reported through `Answer` match the CSV rows just written.
- [ ] Q3 obstacle meets its definition (see
      [work-definition.md](../../agents/x-work-definition.md#classification-tests))
      and is recorded as a labeled issue. `#NNN` reported back.
- [ ] Q4 experiment recorded as a labeled issue (`experiment` + `agent:{self}`)
      with its expected outcome and `#NNN` reported back.
- [ ] Q4 expected outcome names metrics that a single skill owns. Split
      multi-skill predictions into one per skill / run type.

</do_confirm_checklist>

## The Five Kata Questions

These questions structure every coaching interaction. The coach asks through
`Ask`. The participant replies through `Answer`.

1. **What is the target condition?** State where the team (or the agent) is
   headed.
2. **What is the actual condition now?** Report measured counts and durations
   from live data, recorded in CSV. Do not report a narrative.
3. **What obstacles prevent us from reaching the target?** Each participant
   names the obstacles in their domain.
4. **What is the next step? What do you expect?** Propose the next experiment
   and its expected outcome.
5. **When can we see what we learned?** The next meeting opens with a review of
   what we learned.

[work-definition.md § Classification tests](../../agents/x-work-definition.md#classification-tests)
defines what an obstacle and an experiment *are*. Mode-specific question wording
(team vs. 1-on-1) lives in the overlays.

## Facilitator Process

1. **Detect mode.** Call RollCall. If it succeeds, you are in facilitated mode.
   Use orchestration tools (`Ask`, `Answer`, `Announce`, `Conclude`) for all
   participant interaction. If the call fails with tool-not-found, you are in
   solo mode. Use direct file reads.
2. **Select the overlay.** For team storyboard runs, load
   [`references/team-storyboard.md`](references/team-storyboard.md). For 1-on-1
   coaching runs, load [`references/one-on-one.md`](references/one-on-one.md).
   The overlay owns the artifact surface, question wording, and briefing
   template.
3. **Brief participants.** Deliver the overlay's briefing template before Q1.
   Team mode: broadcast once through `Announce` at session open. 1-on-1:
   prepend it to the Q1 `Ask` body.
4. **Collect XmR analysis from participants.** Participants run
   `gemba-xmr analyze` on their own CSVs (Participant Protocol step 2) and
   report `status`, fired-rule `signals`, and `latest` in their Q2 `Answer`. The
   facilitator has no `Bash`. It relays what they report and flags any
   `insufficient_data` metric.
5. **Run the five questions.** Follow the overlay's wording. In facilitated
   mode, pose each question through `Ask` and collect `Answer` replies before
   you advance. After Q3/Q4, `Ask` each participant to record its obstacle and
   experiment as labeled issues per
   [`issue-lifecycle.md`](references/issue-lifecycle.md) and return the `#NNN`s.
   Use `Announce` between questions. When an `Ask`'s receiver commits in the
   shared checkout, carry edit-intent and serialize same-surface asks
   ([`dispatch-discipline.md`](references/dispatch-discipline.md)).
6. **Collect. Do not write.** The facilitator writes no files. Participants own
   every write (CSVs, weekly-log memory, issues). Collect reported `#NNN`s and
   numbers through `Answer` for the summary.
7. **Route Q3 obstacles (team meetings only; skip 1-on-1).** For each obstacle
   the facilitator picks one route (parallel allowed) and logs it. It runs no
   `gh` itself. Triggers and worked example:
   [`team-storyboard.md`](references/team-storyboard.md#q3-obstacle-routing).
   - **Discussion** — shared-artifact change (metric, rule, boundary, policy) or
     same question in ≥2 agents' Q3 answers. The owning agent opens an RFC per
     [coordination-protocol.md](../../agents/x-coordination-protocol.md).
   - **Coaching** — participant-scoped blocker / unanalyzed trace / stalled
     experiment. Do not dispatch it here. The obstacle issue stands. The coach
     dispatches the coaching workflow in its Assess run.
8. **Before you dispatch follow-on work** for a reviewed artifact, run the
   route-taken check in
   [`dispatch-discipline.md`](references/dispatch-discipline.md). An unexpired
   same-run continuation announcement means do not re-dispatch.
9. **Conclude (facilitated mode only).** Call `Conclude` with a session summary
   that covers meeting type, key metrics, obstacles addressed, experiments
   planned, and any obstacle handed off for coaching. (Wiki pushes
   automatically.)

## Participant Protocol

This protocol applies in both modes. It expands the coach's session-open
briefing.

1. **Prepare for Q2.** Gather your domain's current measured state from live
   data (`gh`, repository files). Do not use memory or narrative.
2. **Record metrics to CSV and analyze them.** Before you answer, append one row
   per metric to `wiki/metrics/{skill}/{YYYY}.csv` per the skill's
   `references/metrics.md`. Create the directory and header if needed. Then run
   `gemba-xmr analyze <csv> --format json`. The CSV is authoritative. Your
   `Answer` summarizes it.
3. **Answer with measured data.** Report numbers through
   `Answer(askId=N, message=…)`. Quote the `askId` from the `[ask#N]` header.
   Reference the CSV rows. Include each metric's XmR `status`, `μ`, and any
   fired-rule `signals` from your `gemba-xmr analyze` run. Use counts and
   durations. Do not use narratives like "improving." Use `Announce` only for
   team-wide context.
4. **Identify obstacles, then record them.** For Q3, each participant names the
   obstacles in its domain. It then creates an obstacle issue per
   [`issue-lifecycle.md`](references/issue-lifecycle.md) and reports its `#NNN`.
5. **Propose experiments, then record them.** For Q4, propose the next
   experiment (scoped to one or two daily cycles) and its expected outcome. Then
   create an experiment issue (`experiment` + `agent:{self}`) per
   [`issue-lifecycle.md`](references/issue-lifecycle.md) and report its `#NNN`.

Hold participant writes to
[Citation integrity](../../agents/x-citation-integrity.md).

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Session type** — Team storyboard, review, or 1-on-1 (which agent)
- **Current condition** — Key numbers from metrics CSVs reviewed
- **Obstacle addressed** — Which obstacle was the focus
- **Experiment status** — Outcome of prior experiment, next one planned

Participants record their own domain metrics per Participant Protocol step 2.
