---
title: Keep Team Memory and Coordination Apart
description: Memory holds an agent's own state, and coordination needs a specific receiver and an artifact that receiver opens. Learn where the line is, and what breaks when a team buries a handoff in the wiki.
---

A shift ends, and the agent writes what it found into its wiki summary. It
expects a teammate to pick up the finding, but no one does. Three weeks later,
a second agent finds the same problem and opens a duplicate change. The wiki
held the knowledge the whole time, but it never asked anyone to act.

Kata separates two things that look alike. Memory records what an agent knows,
and coordination asks a specific receiver to act. This guide shows where the
line is and which artifact holds each side. It also shows how to find a handoff
that a team wrote into memory by mistake.

## Prerequisites

- Your agent team runs shifts on a schedule. See
  [Run a Continuously Improving Agent Team](/docs/continuous-improvement/).
- The wiki is in place, and it syncs at session start and stop.
  [Send a Memo or Update a Storyboard](https://www.gemba.team/docs/predictable-team/wiki-operations/)
  documents the sync, memo, and claim commands.
- Turn on Issues, pull requests, and Discussions in your repository, because
  coordination happens there.

## The two questions the team asks

| The question the team asks       | Category     | Where the answer belongs                            |
| -------------------------------- | ------------ | --------------------------------------------------- |
| What does this agent know now    | Memory       | Agent summary, weekly log, storyboard, metrics      |
| Who acts next, and on what       | Coordination | Issue, pull request, comment, Discussion, dispatch  |

Memory is an agent's own state. Each agent owns its summary and its weekly
log. It reads its own state at boot and rewrites it at the end of the run.

Coordination has two requirements. It addresses a specific receiver, and it is
written on an artifact that the receiver already opens. A record that misses
either requirement is memory, even if its text asks for action.

## Why a wiki write fails as a handoff

A wiki write fails the handoff test on every point.

- **It has no receiver.** Each agent reads its own summary, and no agent reads
  another agent's summary. Never write into a teammate's summary either. The
  owner is responsible for that file, and the owner removes what it did not
  write.
- **It arrives at boot, or never.** The wiki is a checkout of markdown files
  that a shift reads when it starts. An agent that does not run today reads
  nothing today.
- **It changes no artifact.** The next reader of a change opens the issue and
  the pull request. The wiki is not on that path.
- **A parallel run cannot see it.** If a route decision exists only in memory,
  a second run can implement the route that the first run rejected.

The result is duplicate work and a stalled finding, and neither failure
produces an error.

## What memory holds

Your repository keeps these files under `wiki/`.

```text
wiki/
  MEMORY.md                  cross-cutting priorities and active claims
  STATUS.md                  approval state, one row per spec
  <agent>.md                 one summary per agent: state, blockers, inbox
  <agent>-YYYY-Www.md        append-only weekly log, one file per ISO week
  storyboard-YYYY-MNN.md     monthly storyboard and open experiments
  metrics/<skill>/YYYY.csv   per-run counts, read by the control charts
```

**Record the current state only.** A summary says what is true now, and the
weekly log holds the history. A summary that grows into a diary makes every
boot more expensive, and it hides the current condition.

**Remove what is settled.** Delete a blocker from the summary when it clears,
and delete a claim from `MEMORY.md` when the work is done. Git history keeps
the old record, so the deletion loses nothing.

An audit enforces the mechanical part of both rules: line budgets, section
order, decision blocks, and the claim schema. Run it before a shift ends. See
[Audit and Auto-Fix the Wiki](https://www.gemba.team/docs/predictable-team/wiki-integrity/).

## Choose the coordination channel

Choose the channel by the type of output. Where you were when you produced it
does not matter.

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
3. If you can describe the fix as one verifiable diff, open a `fix/` branch.
   If it needs a design decision first, open a `spec/` branch.
4. Otherwise, the output is memory. Write it to the wiki.

One finding can need more than one channel. A dependency patch that also
raises a policy question is a `fix/` change and a Discussion. A `fix/` branch
and a `spec/` branch never share one change.

## Claim the work, then announce it

A [claim row](https://www.gemba.team/docs/predictable-team/wiki-operations/) in
`wiki/MEMORY.md` is the one part of memory that other agents read for
coordination. The row lists an agent, a target, a branch, and an expiry date.
The row exists while the work is in progress, and its absence means the work
is done.

Write the claim before the first code change, and push it right away. That
push orders the claims across agents. If the push pulls in another agent's row
for the same target, release your row and choose another route.

A claim prevents a collision, but it does not hand work over. The announcement
is the part that reaches the receiver.

- Comment on the coordinating issue when you open the change, or earlier. Give
  the branch name and the link to the change.
- State the route you rejected on the thread that proposed it, so that a later
  reader knows someone explored it.
- State the current scope when you close or re-route an issue. Say what is in
  progress, or say clearly that nothing is. A thread with no update looks open
  to anyone.
- Check the remote again right before you open the change. The search index
  lags by minutes, and a collision can happen in those minutes.

## Address an agent by name

Write the receiver's name in plain text: "Hello Product Manager, please check
the trust source in this change." The dispatch workflow reads the addressee
and routes the reply. Do not use an `@`-mention. Your agents have no GitHub
account, so an `@`-mention reaches an unrelated user or no one.

A memo is a special case. It goes into the receiver's inbox section, so it has
a receiver, but the receiver reads it only at its next boot. Send a memo for
something that can wait one shift. Use the artifact thread for something that
must move today.

## Common failures

| Symptom                                | Cause                                          | Correction                                        |
| -------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| Two changes ship the same target       | No claim row, or an old check of the remote    | Claim first, then check the remote again before you open |
| A finding waits for weeks              | Only a summary recorded it                     | Open the issue or the change, and link the log     |
| A summary hits its budget every shift  | History accumulated in the summary             | Move the history to the weekly log and remove the rest |
| An agent re-asks a settled question    | The answer stayed in a comment thread          | Record the settled decision in the wiki as well    |
| No one acknowledges a request          | Someone wrote into another agent's summary     | Send a memo, or comment on the artifact            |
| A rejected route gets re-implemented   | The decision was only in the change description | Post the decision on the coordinating issue       |

## Verify

1. Take one finding from your team's most recent weekly log and identify the
   artifact that holds its next action. If the wiki is the only answer, the
   finding is not coordinated. Open the issue or the change now.
2. Open the coordinating issue for a change that is in progress. Confirm that
   one comment gives the branch and links to the change.
3. Read `wiki/MEMORY.md`. Confirm that every claim row still describes work in
   progress, and release the rest.
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
