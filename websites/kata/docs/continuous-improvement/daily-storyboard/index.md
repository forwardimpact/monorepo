---
title: Run the Daily Storyboard and Coaching Session
description: Run the team storyboard meeting and the one-on-one coaching session with the five Toyota Kata questions, so that every experiment starts from measured data instead of an impression.
---

Your agents write a metrics row on every run, but no one reads the rows.
Findings settle into weekly logs, and the same obstacle comes back next month
under a new name. A facilitated session closes that gap. The improvement coach
asks the same questions every day, and each agent answers with numbers it
measured minutes earlier.

This guide covers the two facilitated sessions. The team storyboard meeting
keeps the whole roster focused on one target condition, and the one-on-one
coaching session takes one agent through one run in depth. Both sessions use
the same five questions.

## Prerequisites

- The `improvement-coach` profile is in your roster. See
  [Choose and Scope Your Agent Roster](/docs/continuous-improvement/agent-roster/).
- Your agents already share wiki memory, and at least one skill has appended
  rows to `wiki/metrics/{skill}/{YYYY}.csv`. A session with no rows produces
  only descriptions, and this protocol exists to replace descriptions with
  data.
- The storyboard and coaching workflows exist in your repository. `kata-setup`
  writes them when `improvement-coach` is on the roster, which its default
  roster includes.
- The wiki and metric commands come from the Gemba runtime. Read
  [Set up persistent memory and metrics](https://www.gemba.team/docs/predictable-team/)
  before the first session.

## The two sessions share one protocol

| | Team storyboard | One-on-one coaching |
| --- | --- | --- |
| Trigger | Daily cron, after the night shift | Manual dispatch |
| Session mode | `discuss` | `facilitate` |
| Participants | Every roster agent except the coach | One agent |
| Evidence source | Each participant's metrics CSV | That agent's most recent run trace |
| Durable record | The monthly storyboard file | The coached agent's weekly log |

Both sessions run on the harness message tools. The coach asks each question
with `Ask`, and each participant replies with `Answer`. `Announce` sends
team-wide context between questions, and `Conclude` closes the run with a
summary. See
[Coordinate an agent team](https://www.gemba.team/docs/coordinate-team/) for
those tools.

## The five questions

1. **What is the target condition?** The measurable state the team aims to
   reach, with a date.
2. **What is the actual condition now?** Measured counts and durations from live
   data, recorded to CSV before the answer.
3. **What obstacles prevent us from reaching the target?** Each participant
   lists the obstacles inside its own domain.
4. **What is the next step, and what do you expect?** One experiment against one
   obstacle, plus the outcome the agent predicts.
5. **When can we see what we learned?** The next meeting opens with that review.

The one-on-one wording narrows every question to a single run: what you tried
to achieve, what happened, which obstacles prevented a better outcome, what you
will do differently in the next run, and when you will see the effect.

The participant answers question two from
[its own trace](https://www.gemba.team/docs/prove-changes/trace-analysis/),
never from memory.

## The storyboard artifact

The team meeting maintains one file per month, such as
`wiki/storyboard-2026-M04.md`. It contains a Challenge, a Target Condition, a
Current Condition, an Obstacles list, and an Experiments list.

- **Challenge** changes rarely, only when the strategic direction changes.
- **Target Condition** is measurable and due at the end of the month. It
  describes how the system will behave differently, and it is not a task list.
- **Current Condition** holds numbers. Above the per-agent blocks, a Headlines
  list shows only the metrics whose status changed since the last meeting.
- **Obstacles** and **Experiments** are rendered from GitHub issue state.

Marker pairs surround every generated block. An XmR block is between
`<!-- xmr:{metric}:{csv} [event_type={slice}] [prior={YYYY-MM-DD}] -->` and
`<!-- /xmr -->`, and the obstacle and experiment lists are between their own
markers. A deterministic wiki refresh step regenerates all of them from CSV
rows and issue state before the meeting. A block over a file with several
streams names its slice in the `event_type` token, or the refresh renders a
notice in the block. Never paste a chart or a list yourself. Prose outside
the markers survives the refresh, so a one-line note that links a signal to an
event is safe.

The first meeting of the month is a **planning meeting**. In it, the refresh
creates the file skeleton, a participant seeds one XmR block per metrics CSV,
and the team sets the Challenge, the Target Condition, and the first experiment.
Every later meeting is a **review meeting**. It refreshes the Current Condition,
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

A coach that writes the Current Condition itself produces numbers with no CSV
row behind them, and the next meeting then debates the description instead of
the data. A coach that files an obstacle issue for an agent leaves an issue
that no one owns, and no one closes it with a verdict. Neither mistake
produces an error.

## Record obstacles and experiments as issues

An obstacle is a measured gap between the current condition and the target
condition. An experiment is the next small step against one obstacle. Both are
GitHub issues in your repository, and only the label separates them.

An obstacle has the `obstacle` label, a one-line description, and the
dimension it blocks. An experiment has the `experiment` label and an
`agent:{name}` label that identifies its owner:

```text
Obstacle: #NNN
Owner: staff-engineer

**What:** description
**Expected outcome:** prediction
**Execution plan:** path globs, only when the experiment ships code
```

Write the expected outcome before the run, and use metrics that a single skill
owns. Skills do not share runs, so a prediction that spans two skills cannot be
resolved in one cycle. Split it into one prediction per skill.

Every experiment ends with a verdict comment and then a close. `PASS` means the
prediction held. `FAIL` means it did not, and that is also a useful result.
`VOID` means no one could evaluate the run, so there is no learning either way.
The closed issue is the permanent record, and the storyboard lists age out on
their own.

## Route each obstacle

Team meetings end with a routing decision per obstacle. The coach picks the
route and logs it. An obstacle can take more than one route.

| Trigger | Route |
| --- | --- |
| The obstacle would change a shared artifact, such as a metric, a routing rule, a scope boundary, or a policy | Discussion |
| The same question appeared in two or more agents' answers | Discussion |
| A blocker the agent owns alone, an unanalyzed trace, or a stalled experiment | Coaching |

A Discussion belongs to the owning agent, and it ends in a spec, a wiki note, or
a close. Coaching is not dispatched during the meeting. The obstacle issue
stays open, and the coach dispatches the session on its next assessment run:

```sh
gh workflow run "Agent: Coaching" -f agent=staff-engineer
```

Before any follow-up dispatch, read the last comments on the coordinating
thread. If an announcement says that a revision is already coming in the same
run, another agent already owns that route, so do not dispatch. A second
dispatch creates duplicate work: two agents write the same change, and one of
them wastes a full cycle.

## Verify

- Every question received an answer from every participant.
- The Current Condition matches the CSV rows written during this session, and
  the session flags any metric with insufficient data.
- Every obstacle and experiment has an issue number, reported by its owner.
- Each closing comment gives an owner and an artifact, or states clearly that
  there is none.
- Each participant's weekly log records the session type, the metrics, the
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
