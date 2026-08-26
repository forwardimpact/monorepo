---
title: Run the Daily Storyboard and Coaching Session
description: Facilitate the team storyboard meeting and the one-on-one coaching session with the Toyota Kata five questions, so every experiment starts from measured data instead of an impression.
---

Your agents write a metrics row on every run. Nobody reads the rows. Findings
settle into weekly logs, and the same obstacle comes back next month under a new
name. A facilitated session closes that gap. The improvement coach asks the same
questions every day. Each agent answers with numbers it measured minutes
earlier.

This guide covers the two facilitated sessions. The team storyboard meeting
keeps the whole roster pointed at one target condition. The one-on-one coaching
session takes one agent deep into one run. Both sessions use the same five
questions.

## Prerequisites

- The `improvement-coach` profile sits in your roster. See
  [Choose and Scope Your Agent Roster](/docs/continuous-improvement/agent-roster/).
- Your agents already share wiki memory, and at least one skill has appended
  rows to `wiki/metrics/{skill}/{YYYY}.csv`. A session with no rows produces
  narrative, and narrative is the thing this protocol removes.
- The storyboard and coaching workflows exist in your repository. `kata-setup`
  writes `.github/workflows/agent-storyboard.yml` and
  `agent-coaching.yml` when you select the coach.
- The wiki and metric commands come from the Gemba runtime. Read
  [Set up persistent memory and metrics](https://www.gemba.team/docs/predictable-team/)
  before the first session.

## Two sessions, one protocol

| | Team storyboard | One-on-one coaching |
| --- | --- | --- |
| Trigger | Daily cron, after the night shift | Manual dispatch |
| Session mode | `discuss` | `facilitate` |
| Participants | Every selected agent except the coach | One agent |
| Evidence source | Each participant's metrics CSV | That agent's most recent run trace |
| Durable record | The monthly storyboard file | The coached agent's weekly log |

Both sessions run on the harness message surface. The coach poses each question
with `Ask`. Each participant replies with `Answer`. `Announce` carries team-wide
context between questions, and `Conclude` closes the run with a summary. See
[Coordinate an agent team](https://www.gemba.team/docs/coordinate-team/) for
that surface.

## The five questions

1. **What is the target condition?** The measurable state the team aims to
   reach, with a date.
2. **What is the actual condition now?** Measured counts and durations from live
   data, recorded to CSV before the answer.
3. **What obstacles prevent us from reaching the target?** Each participant
   names the obstacles inside its own domain.
4. **What is the next step, and what do you expect?** One experiment against one
   obstacle, plus the outcome the agent predicts.
5. **When can we see what we learned?** The next meeting opens with that review.

The one-on-one wording narrows every question to a single run. What were you
trying to achieve. What actually happened. What obstacles prevented a better
outcome. What will you do differently next run. When will you see the effect.
The participant answers question two from
[its own trace](https://www.gemba.team/docs/prove-changes/trace-analysis/).
Memory is never a source.

## The storyboard artifact

The team meeting maintains one file per month, `wiki/storyboard-2026-M04.md`.
It carries a Challenge, a Target Condition, a Current Condition, an Obstacles
list, and an Experiments list.

- **Challenge** changes rarely. It shifts only when strategic direction shifts.
- **Target Condition** is measurable and due at month end. It describes how the
  system behaves differently. It is not a task list.
- **Current Condition** holds numbers. Above the per-agent blocks, a Headlines
  list names only the metrics whose status changed since the last meeting.
- **Obstacles** and **Experiments** render from GitHub issue state.

Marker pairs own every generated block. An XmR block sits between
`<!-- xmr:{metric}:{csv} -->` and `<!-- /xmr -->`. The obstacle and experiment
lists sit between their own markers. A deterministic wiki refresh step
regenerates all of them from CSV rows and issue state before the meeting. Never
paste a chart or a list by hand. Prose outside the markers survives the refresh,
so a one-line note that anchors a signal to an event is safe.

The first meeting of the month is a **planning meeting**. The refresh creates
the file skeleton, a participant seeds one XmR block per metrics CSV, and the
team sets the Challenge, the Target Condition, and the first experiment. Every
later meeting is a **review meeting**. It refreshes the Current Condition,
records the outcome of the last experiment, and plans the next one.

## Who writes, and who only collects

This split decides whether the session produces evidence.

| Actor | Owns |
| --- | --- |
| Participant | Metric rows, the XmR analysis of its own CSVs, its obstacle and experiment issues, its own weekly log |
| Coach | The questions, the relay of reported numbers, obstacle routing, the closing summary |

The coach runs no shell commands and writes no files. It cannot look up an issue
it did not receive, so each participant reports its issue number back through
`Answer`.

Get this wrong and the failure is quiet. A coach that writes the Current
Condition itself produces numbers with no CSV row behind them. The next meeting
then debates the narrative instead of the data. A coach that files an obstacle
issue on an agent's behalf leaves an issue nobody owns, and nobody closes it
with a verdict.

## Record obstacles and experiments as issues

An obstacle is a measured gap between the current condition and the target
condition. An experiment is the next small step against one obstacle. Both are
GitHub issues in your repository. Only the label separates them.

An obstacle carries the `obstacle` label, a one-line description, and the
dimension it blocks. An experiment carries the `experiment` label and an
`agent:{name}` label that names its owner:

```text
Obstacle: #NNN
Owner: staff-engineer

**What:** description
**Expected outcome:** prediction
**Execution plan:** path globs, only when the experiment ships code
```

Write the expected outcome before the run. Name metrics that a single skill
owns. Skills do not share runs, so a prediction that spans two skills cannot
resolve in one cycle. Split it into one prediction per skill.

Every experiment concludes with a verdict comment, then a close. `PASS` means
the prediction held. `FAIL` means it did not, which is still a result. `VOID`
means nobody could evaluate the run, so there is no learning either way. The
closed issue is the permanent record. The storyboard lists age out on their own.

## Route each obstacle

Team meetings end with a routing decision per obstacle. The coach picks the
route and logs it. Parallel routes are allowed.

| Trigger | Route |
| --- | --- |
| The obstacle would change a shared artifact, such as a metric, a routing rule, a scope boundary, or a policy | Discussion |
| The same question appeared in two or more agents' answers | Discussion |
| A blocker the agent owns alone, an unanalyzed trace, or a stalled experiment | Coaching |

A Discussion belongs to the owning agent, and it ends in a spec, a wiki note, or
a close. Coaching does not dispatch during the meeting. The obstacle issue
stands, and the coach dispatches the session on its next assessment run:

```sh
gh workflow run "Agent: Coaching" -f agent=staff-engineer
```

Before any follow-on dispatch, read the coordinating thread's last comments.
An announcement that a revision is already coming in the same run reserves that
route. A second dispatch then creates duplicate intent, two agents author the
same change, and one of them wastes a full cycle.

## Verify

- Every question received an answer from every participant.
- The Current Condition matches the CSV rows written during this session, and
  any metric with insufficient data is flagged as such.
- Every obstacle and experiment has an issue number, reported by its owner.
- Each closing comment names an owner and an artifact, or states the explicit
  negative.
- Each participant's weekly log carries the session type, the metrics, the
  obstacle addressed, and the experiment planned.
- The session ends with a summary that lists the metrics, the obstacles, the
  experiments, and any obstacle handed to coaching.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../findings-to-action -->

<!-- part:card:../team-memory -->

<!-- part:card:../agent-roster -->

<!-- part:card:../../spec-to-shipped -->

</div>
