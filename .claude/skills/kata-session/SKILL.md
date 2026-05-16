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
coach facilitates; domain agents participate. The coach follows the Facilitator
Process; participants follow the Participant Protocol. Both roles share the same
five coaching kata questions.

Two mode overlays describe the mode-specific artifact surface:

- Team storyboard meetings —
  [`references/team-storyboard.md`](references/team-storyboard.md)
- 1-on-1 coaching sessions —
  [`references/one-on-one.md`](references/one-on-one.md)

## When to Use

**Facilitator**: Entry-point skill for the improvement coach's two facilitation
contexts — team storyboard meetings (`kata-storyboard.yml` workflow) and 1-on-1
coaching sessions (`kata-coaching.yml` workflow).

**Participant**: Answer each `Ask` with `Answer`. The coach's session-open
briefing is sufficient for most runs; load this skill only if you need the full
Participant Protocol below.

## Checklists

### Facilitator

<read_do_checklist goal="Prepare for the coaching session">

- [ ] Detect mode: call RollCall — success means facilitated mode,
      tool-not-found means solo mode.
- [ ] Pick the overlay that matches the mode
      ([`references/team-storyboard.md`](references/team-storyboard.md) or
      [`references/one-on-one.md`](references/one-on-one.md)) and follow its
      artifact guidance.
- [ ] Identify which metrics CSVs to review from `wiki/metrics/`.
- [ ] Run `bunx fit-xmr analyze --format json` against each metrics CSV and
      record the `status`, fired-rule `signals`, and `latest` for each metric.
- [ ] For team storyboard runs, seed any missing `<!-- xmr:... -->` marker
      pair from
      [`references/storyboard-template.md`](references/storyboard-template.md),
      then run `bunx fit-wiki refresh`.

</read_do_checklist>

<do_confirm_checklist goal="Verify coaching session quality">

- [ ] All five coaching kata questions were addressed.
- [ ] Every `Ask` received an `Answer`.
- [ ] Current condition updated with numbers from metrics CSVs (not narrative),
      including XmR `status` and signal descriptions for each metric with
      sufficient data. Metrics with `insufficient_data` are noted.
- [ ] Coaching metrics appended to CSV (see Facilitator Process step 6).
- [ ] For team meetings: storyboard updated per partition protocol;
      `bunx fit-wiki refresh` rendered every metric block (no no-op, no manual
      paste); experiments and obstacles managed as labeled GitHub issues per
      [`issue-lifecycle.md`](references/issue-lifecycle.md).
- [ ] For 1-on-1: agent's findings written to its own memory.
- [ ] Weekly log updated under `## YYYY-MM-DD` with meeting type, metrics,
      obstacle, experiment, and Step 7 routing per Q3 obstacle.
- [ ] Experiment expected outcome recorded _before_ the experiment runs.
- [ ] In facilitated mode: `Conclude` called with session summary.

</do_confirm_checklist>

### Participant

<do_confirm_checklist goal="Verify participation quality">

- [ ] Q2 data gathered from live sources, not memory or prior logs.
- [ ] Domain metrics appended to CSV before answering (step 2).
- [ ] Metrics reported via `Answer` match the CSV rows just written.
- [ ] Q3 obstacles grounded in data or trace findings, not narrative.
- [ ] Q4 experiment has a recorded expected outcome.
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
3. **What obstacles prevent us from reaching the target?** Identified from the
   gap between current and target, grounded in data or trace findings.
4. **What is the next step? What do you expect?** The expected outcome is
   recorded _before_ the experiment runs.
5. **When can we see what we learned from that step?** Establish the feedback
   loop — the next meeting opens by reviewing what was learned.

Mode-specific question wording (team vs. 1-on-1) lives in the overlays.

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
4. **Run XmR analysis.** For every CSV in `wiki/metrics/`, run
   `bunx fit-xmr analyze <csv> --format json` and use the `status`, fired-rule
   `signals`, and `latest` fields when reporting the Condition. For team
   storyboard runs, refresh chart blocks per
   [`team-storyboard.md` § Storyboard updates](references/team-storyboard.md#storyboard-updates).
   Note any `insufficient_data` metric. In facilitated mode, include `status`
   and fired-rule signals in the Q2 `Ask`.
5. **Run the five questions.** Follow the overlay's wording. In facilitated
   mode, pose each question via `Ask` and collect `Answer` replies before
   advancing. Use `Announce` for between-question transitions or any status that
   would otherwise repeat into every `Ask`. In solo mode, read metrics and wiki
   files directly.
6. **Update artifacts.** Write back whatever the overlay prescribes — for team
   mode, the storyboard file; for 1-on-1, the participant's memory.
7. **Route Q3 obstacles (team meetings only; skip for 1-on-1).** For each
   obstacle pick one route (they can run in parallel) and log the choice.
   Triggers and worked example:
   [`team-storyboard.md`](references/team-storyboard.md#q3-obstacle-routing).
   - **Discussion** — shared-artifact change (metric, rule, boundary, policy) or
     same question in ≥2 agents' Q3 answers. RFC per
     [coordination-protocol.md](../../agents/references/coordination-protocol.md):
     `gh discussion create --category <category> --title "RFC: <q>"`.
   - **Coaching** — participant-scoped blocker / unanalyzed trace / stalled
     experiment: `gh workflow run kata-coaching.yml -f agent=<name>`.
8. **Commit.** Commit artifact changes as part of the wiki push.
9. **Conclude (facilitated mode only).** Call `Conclude` with a session summary
   covering: meeting type, key metrics reviewed, obstacles addressed,
   experiments planned, and any coaching session triggered.

The coach orchestrates the session — it does not own an end-to-end process and
records no metrics of its own. Participants record their domain metrics per the
Participant Protocol; the coach reads them.

## Participant Protocol

The pattern below applies in both modes and expands the coach's session-open
briefing.

1. **Prepare for Q2.** Gather your domain's current measured state from live
   data (`gh`, `bun`, repo files) — not memory or narrative.
2. **Record metrics to CSV.** Before answering, append one row per metric to
   `wiki/metrics/{skill}/{YYYY}.csv` per the skill's
   `references/metrics.md`, creating the directory and header if needed. The CSV is authoritative; your `Answer` summarizes it.
3. **Answer with measured data.** Report numbers via `Answer`, referencing the
   CSV rows. Use counts and durations — not narratives like "improving." Use
   `Announce` only for unsolicited team-wide context.
4. **Ground obstacles in data.** For Q3, identify obstacles from the gap between
   current and target. Prefer trace findings or live run data over log
   narratives.
5. **Propose testable experiments.** For Q4, propose small experiments with
   expected outcomes verifiable in one or two daily cycles.

## Memory: what to record

Append to the current week's log (see agent profile for the file path):

- **Session type** — Team storyboard, review, or 1-on-1 (with which agent)
- **Current condition** — Key numbers from metrics CSVs reviewed
- **Obstacle addressed** — Which obstacle was the focus
- **Experiment status** — Outcome of prior experiment, next experiment planned

Participants record their own domain metrics per Participant Protocol step 2.
The coach records none — see step 7.
