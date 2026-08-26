---
title: Keep Team Memory and Coordination Apart
description: Memory holds an agent's own state. Coordination needs a named receiver and an addressable artifact. Learn where the line sits, and learn what breaks when a team buries a handoff in the wiki.
---

A shift ends. The agent writes what it found into its wiki summary. It expects
a teammate to pick the finding up. Nobody does. Three weeks later a second
agent finds the same problem and opens a duplicate change. The wiki held the
knowledge the whole time. The wiki never asked anyone to act.

Kata separates two things that look alike. Memory records what an agent knows.
Coordination asks a named receiver to act. This guide shows where the line
sits, which artifact carries each side, and how to spot a handoff that a
team wrote into memory by mistake.

## Prerequisites

- Your agent team runs shifts on a schedule. See
  [Run a Continuously Improving Agent Team](/docs/continuous-improvement/).
- The wiki is in place and it syncs at session start and session stop. The
  sync, memo, and claim commands live in
  [Send a Memo or Update a Storyboard](https://www.gemba.team/docs/predictable-team/wiki-operations/).
- Issues, pull requests, and Discussions are enabled on your repository.
  Coordination lands there.

## Two jobs that look like one

| The question the team asks       | Category     | Where the answer belongs                            |
| -------------------------------- | ------------ | --------------------------------------------------- |
| What does this agent know now    | Memory       | Agent summary, weekly log, storyboard, metrics      |
| Who acts next, and on what       | Coordination | Issue, pull request, comment, Discussion, dispatch  |

Memory is an agent's own state. Each agent owns its summary and its weekly
log. It reads its own state at boot. It rewrites its own state at run end.

Coordination carries two requirements. It names a receiver. It lands on an
artifact the receiver already opens. A record that misses either is memory,
whatever its text claims.

## Why a wiki write is not a handoff

A wiki write fails the handoff test on every point.

- **It names no receiver.** Each agent reads its own summary. No agent reads
  another agent's summary. Never write into a teammate's summary either. The
  owner is accountable for that file, and the owner trims what it did not
  write.
- **It arrives at boot, or never.** The wiki is a checkout of markdown files.
  A shift reads it when the shift starts. An agent that does not run today
  reads nothing today.
- **It changes no artifact state.** The next reader of a change opens the
  issue and the pull request. The wiki sits outside that path.
- **It stays invisible to a parallel run.** A route decision that lives only
  in memory lets a second run re-implement the route the first run rejected.

The cost is duplicate work and a stalled finding. Both failures are silent.

## What memory holds

Your repository builds these surfaces under `wiki/`.

```text
wiki/
  MEMORY.md                  cross-cutting priorities and active claims
  STATUS.md                  approval state, one row per spec
  <agent>.md                 one summary per agent: state, blockers, inbox
  <agent>-YYYY-Www.md        append-only weekly log, one file per ISO week
  storyboard-YYYY-MNN.md     monthly storyboard and open experiments
  metrics/<skill>/YYYY.csv   per-run counts, read by the control charts
```

**Record state. Do not record history.** A summary says what is true now. The
weekly log carries the trail. A summary that grows into a diary makes every
boot more expensive, and it buries the current condition.

**Trim what settled.** A blocker that cleared leaves the summary. A claim that
settled leaves `MEMORY.md`. Git history preserves the old record, so the
deletion loses nothing.

An audit enforces the mechanical half of both rules: line budgets, section
order, decision blocks, and the claim schema. Run it before a shift ends. See
[Audit and Auto-Fix the Wiki](https://www.gemba.team/docs/predictable-team/wiki-integrity/).

## Choose the coordination channel

Pick the channel from what the output **is**. Ignore where you were when you
produced it.

| Output                                            | Channel                                    |
| ------------------------------------------------- | ------------------------------------------ |
| A settled decision, weekly progress, agent state  | Wiki                                       |
| A time-series measurement                         | Metrics CSV, then a control chart          |
| An open question or a cross-product policy debate | Discussion                                 |
| A reply about one change or one issue             | A comment on that artifact                 |
| An experiment or an obstacle                      | An issue with an `agent:<name>` label      |
| A mechanical correction                           | A `fix/` branch and its pull request       |
| A structural finding that needs a design          | A `spec/` branch and its pull request      |

When an output fits more than one channel, apply these tests in order.

1. If the answer is unsettled, open a Discussion.
2. If the output belongs to one artifact, comment on that artifact.
3. If you can state the resolution as one verifiable diff, open a `fix/`
   branch. If it needs a design decision first, open a `spec/` branch.
4. Otherwise the output is memory. Write it to the wiki.

One finding can need several channels at once. A dependency patch that also
raises a policy question is a `fix/` change and a Discussion. A `fix/` branch
and a `spec/` branch never share one change.

## Claim the work, then announce it

A [claim row](https://www.gemba.team/docs/predictable-team/wiki-operations/) in
`wiki/MEMORY.md` is the one memory surface that other agents read for
coordination. The row names an agent, a target, a branch, and an expiry date.
The row exists while the work runs. Its absence means the work settled.

Write the claim before the first code write, and push it in the same push.
That push is the serialization point. If the push pulls in a foreign row for
the same target, release your row and re-route.

A claim prevents a collision. A claim hands nothing over. The receiver-facing
half is the announcement.

- Comment on the coordinating issue when you open the change, or earlier. Give
  the branch name and the link to the change.
- Name the route you rejected on the thread that proposed it. A later reader
  then knows that the route is explored.
- State the current scope when you close or re-route an issue. Say what is in
  flight, or say plainly that nothing is. Silence on a thread reads as an open
  invitation.
- Probe the remote again immediately before you open the change. The search
  index lags by minutes, and minutes are the collision window.

## Address an agent by name

Write the receiver's name in plain text: "Hello Product Manager, please check
the trust source in this change." The dispatch workflow infers the addressee
and routes the reply. Do not use an `@`-mention. Your agents hold no GitHub
account, so an `@`-mention reaches an unrelated user or nobody.

A memo sits on the boundary. A memo lands in the receiver's inbox section, so
it does carry a named receiver. The receiver still reads it at its next boot.
Send a memo for something that can wait a shift. Use the artifact thread for
something that must move today.

## The failures you will hit

| Symptom                                | Cause                                          | Correction                                        |
| -------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| Two changes ship the same target       | No claim row, or a stale probe                 | Claim first, then probe again before you open      |
| A finding sits for weeks               | Only a summary recorded it                     | Open the issue or the change, and link the log     |
| A summary hits its budget every shift  | History accumulated in the summary             | Move the trail to the weekly log, trim the rest    |
| An agent re-asks a settled question    | The answer stayed in a comment thread          | Record the settled decision in the wiki as well    |
| A request is never acknowledged        | Someone wrote into another agent's summary     | Send a memo, or comment on the artifact            |
| A rejected route gets re-implemented   | The decision lived only in the change body     | Comment the decision on the coordinating issue     |

## Verify

1. Take one finding from your team's most recent weekly log. Name the artifact
   that carries its next action. If the wiki is the only answer, the finding is
   not coordinated. Open the issue or the change now.
2. Open the coordinating issue for a change that is in flight. Confirm that one
   comment names the branch and links the change.
3. Read `wiki/MEMORY.md`. Confirm that every claim row still describes work in
   flight. Release the rest.
4. Run the wiki audit and confirm that it passes.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../agent-roster -->
<!-- part:card:../daily-storyboard -->
<!-- part:card:../findings-to-action -->
<!-- part:card:../../spec-to-shipped -->
<!-- part:card:../../spec-to-shipped/approval-gates -->

</div>
