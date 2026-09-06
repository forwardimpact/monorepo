# Spec 2350: Deterministic chain triage for event-driven dispatch

**Classification:** product-aligned. The change lands on the published
`kata-agent` action under `products/kata/actions/`, on the `gemba-harness`
command the Gemba product ships, and on the `www.gemba.team` guide for
coordinating a team. The `libharness` module that computes the verdict is a
shared library, and the action and the CLI are the surfaces a persona hires
([work-definition.md § Product-aligned vs internal](../../.claude/agents/x-work-definition.md#product-aligned-vs-internal)).

**Persona and job:** Teams Using Agents → Run a Continuously Improving Agent
Team, the Big Hire in [JTBD.md](../../JTBD.md). The job's anxiety is that
autonomy amplifies bad patterns faster than humans can intervene. Gemba's Big
Hire, Stand Up and Operate an Agent Team, carries the mechanism, because the
harness that composes the task from the event is the one place every consumer
shares.

## Problem

An event-driven agent team can answer its own output. `kata-dispatch` fires on
issues, comments, labels, reviews, and merges. A facilitator triages each event
and engages a participant. The participant posts a comment, opens a pull
request, or files an issue. That output is one of the same trigger classes, so
it fires the next run. Spec 2330 recorded the sprawl this produces and added a
repository-wide brake. That brake counts total volume and latches an operator
killswitch. It is deliberately blunt. It stops the next run, not the current
chain, and a human must clear it.

Three facts about the dispatch path make the chain cheaper to cut at its
source.

| Fact | Evidence |
| ---- | -------- |
| The recursion guard the workflow describes no longer exists. | The dispatch workflow comment says the task text carries a recursion guard. The `kata-setup` DO-CONFIRM checklist says the action composes one. The task composer's templates carry no such sentence. Spec 2330 § Problem also names the guard as the only brake on volume. |
| The one surviving stand-down rule runs at the most expensive layer. | The facilitated-participant system prompt tells an agent to answer "no further action" when the task already holds a completed response. A participant boots its profile, its skills, and its memory before it can say so. The wiki records the earlier facilitator-level exit at about three turns and a few cents. The same exit today costs a participant session. |
| The facilitator cannot tell the team's own bot from any other bot. | The task text renders the author's account type. Dependabot, GitHub Actions, and the team's own App all render as the same word. The team's agents post under one App identity, and the payload carries that identity, yet the task text never names it. |

The result is a stop decision that is probabilistic, late, and blind to self.
A cheaper facilitator model does not fix that. It is the right reader for the
one question only a model can answer: whether a comment hands new work to a
different agent or only acknowledges finished work. It is the wrong place to
count events, because code counts for free and never drifts.

### What a chain looks like on one artifact

| Hop | Actor | Event | Legitimate? |
| --- | ----- | ----- | ----------- |
| 0 | Human | Applies an `agent:*` label, or comments with a request | Yes. A human caused it. |
| 1 | Own App | Participant posts "ready for the merge gate, Release Engineer" | Yes. A handoff to a different named agent with new state. |
| 2 | Own App | Release engineer comments "merge gate holds, waiting on approval" | Doubtful. No new state. Nobody is addressed. |
| 3 | Own App | First agent replies "acknowledged, standing by" | No. Pure acknowledgement. Each hop costs a full run. |

The wiki holds both shapes. Handoffs from staff-engineer to release-engineer
were routed correctly in W18 and W19. Acknowledgement loops are the pattern
spec 2330 counted in September. The distinguishing datum is how many
consecutive events the team's own App authored on the artifact since the last
human touched it. That number is deterministic. Nothing computes it today.

## Proposal

The harness computes a chain verdict from the event and the artifact's history
before any model starts. Code handles the two clear cases. The facilitator
decides only the middle case, with the numbers in front of it.

1. **Self identity is an input.** The run knows which account its own agents
   post under. The action already knows the App slug and the App id. The
   harness receives one of them and classifies every actor on the artifact as
   human, self, or another bot.
2. **Chain depth is measured, not inferred.** Before the harness composes the
   task, it reads the artifact's timeline once. It counts the dispatch-class
   events the team's own App authored since the last human-authored event of
   any kind on that artifact. It also records how long ago that human acted,
   whether any state changed since the previous self-authored event, and how
   many self-authored events fell inside a window.
3. **Three verdicts.** A human-caused event proceeds with no extra prompt. A
   self-caused event past a configured hop cap suppresses the run before the
   facilitator starts. A self-caused event under the cap proceeds with a
   fenced context block in the task text. The block carries the measured
   numbers and a two-line rule: engage a participant only when the body hands
   new actionable work to a different named agent, and otherwise conclude as a
   stand-down.
4. **A suppressed run is a green run with a recorded reason.** The trace
   carries a terminal summary with a distinct suppressed verdict and the
   measured numbers. The run summary shows the same. The step exits zero. A
   suppressed run is normal behaviour, and a red run would train operators to
   ignore red.
5. **Stand-down is a first-class outcome.** The facilitator can conclude a run
   with a stand-down verdict that trace tooling counts apart from success and
   failure. Today a stand-down hides inside a success verdict.
6. **Every processed comment carries a mark the team's own App leaves.** The
   run leaves one reaction on the triggering comment when it picks it up.
   Reactions fire no dispatch event. A triggering comment that already carries
   the App's reaction is a duplicate delivery or a re-run, and the run
   suppresses. Humans get a visible "seen" cue. The count of such marks on an
   artifact inside the window is a per-artifact run count with no extra
   storage.
7. **The hop cap is configurable and calibrated.** The cap arrives as an
   input. Its default comes from a measurement of this repository's traces:
   the known-good handoffs the wiki cites and the September burst. Spec 2330
   grounded its threshold the same way. The default keeps the legitimate
   pipeline under the cap: a human approval resets the chain, the release
   engineer merges, and dispatch records the approval.
8. **Discuss mode gets the same triage.** The bridge-dispatched path composes
   its task from the same payload path. It receives the same verdict and the
   same context block.
9. **Fail open, and say so.** A timeline the harness cannot read yields a
   proceed verdict with a note in the context block. Spec 2330's brake fails
   closed on doubt, so a chain that hides behind an unreadable timeline still
   meets the repository-wide latch. Two brakes that both fail closed would
   stop the team on every transient API error.
10. **The layers stay distinct.** The watchdog stays identity-blind and counts
    repository-wide volume. The dispatch triage is identity-aware and counts
    per-artifact hops. Neither replaces the other. The spec that shipped the
    watchdog excluded actor filters on purpose, and that reasoning holds at
    that layer.

## Scope

### Included

| Surface | Change |
| ------- | ------ |
| The task composer in `libharness` | Gains the chain-triage step: actor classification, the timeline read, the verdict, and the context block. The templates keep their shape. |
| The facilitate and discuss commands | Short-circuit on a suppress verdict before any runner starts. Emit the suppressed summary. Mark the triggering comment on proceed and caution. |
| The facilitator's terminal tool | Gains the stand-down verdict. |
| The `gemba-harness` action and CLI | Gain the self-identity input and the hop-cap option. |
| The `kata-agent` action | Forwards its App slug as the self identity. Gains a hop-cap input with the calibrated default. |
| The dispatch workflow and the `kata-setup` dispatch template | The prose that claims a recursion guard names the triage instead. No step changes. |
| The `kata-setup` skill | The DO-CONFIRM item that names the recursion guard names the triage. |
| The facilitated-participant system prompt | Drops the stand-down sentence. The facilitator owns stand-down. |
| Trace tooling | Counts suppressed and stand-down verdicts apart from success and failure. |
| The coordinate-team guide on `www.gemba.team` | Documents the verdicts, the context block, the reaction mark, and the cap. |
| The `libharness` test suite | Fixture-driven tests for actor classification, depth over a timeline, each verdict, the unreadable-timeline branch, and the duplicate-delivery branch. |
| The calibration record | A table in this spec's design or plan that shows the measured depth of the known-good handoffs and of the September burst, and the cap that separates them. |

### Excluded

| Item | Why |
| ---- | --- |
| Cross-artifact lineage | A chain that creates new artifacts resets the per-artifact depth. A body marker that carries the parent run and depth across artifacts is the next change. It needs a write hook or a post tool on every participant, and the per-artifact numbers this spec produces calibrate it. |
| Changes to the watchdog | It stays identity-blind and repository-wide. |
| Changes to the trigger surface or the concurrency policy | The `on:`, `if:`, and `concurrency` blocks stay as they are. |
| A self-echo check in the bridges | The bridge-dispatched discussion path may loop through its own posted replies. That is a `libbridge` concern with its own evidence. |
| Marks on label, review, and merge events | Only comments accept reactions. Those events carry no duplicate-delivery history that needs a mark. |
| Cancelling a run already in flight | The triage runs at the start of a run. It changes nothing about a session already past that point. |
| Reading the artifact body to decide | The harness classifies actors and counts events. Only the facilitator reads content. |
| A model-graded stop | The suppress verdict is code. No model can override it inside the run. |

**Compatibility stance:** clean break. The stand-down sentence leaves the
participant prompt. The "recursion guard" wording leaves the workflow, the
template, and the skill. No shim keeps the old wording.

## Success criteria

| # | Claim | Verification |
| - | ----- | ------------ |
| 1 | The harness classifies every actor on the artifact as human, self, or another bot. | A fixture timeline with a human, the App, Dependabot, and GitHub Actions yields the four expected classes in the test suite. |
| 2 | The harness measures chain depth as the count of self-authored dispatch-class events since the last human-authored event. | Fixture timelines for a human-caused event, a one-hop handoff, and a three-hop acknowledgement loop yield depth zero, one, and three. |
| 3 | A human-caused event proceeds with no context block. | The composed task for a depth-zero fixture equals the template output byte for byte. |
| 4 | A self-caused event under the cap proceeds with the context block. | The composed task for a depth-one fixture carries the fenced block with the measured fields and the two-line rule. |
| 5 | A self-caused event at or past the cap suppresses before any runner starts. | With a depth-three fixture and a cap of three, the facilitate command emits a terminal summary with the suppressed verdict, starts no runner, and exits zero. |
| 6 | The facilitator can conclude a stand-down. | The terminal tool accepts the stand-down verdict, and the trace summary carries it. |
| 7 | A duplicate delivery suppresses. | A fixture whose triggering comment already carries the App's reaction yields a suppress verdict with a duplicate reason. |
| 8 | A processed comment carries the App's reaction. | On a proceed or caution verdict the command issues exactly one reaction write for the triggering comment. |
| 9 | An unreadable timeline fails open. | A fixture whose timeline read throws yields a proceed verdict, and the context block names the unreadable timeline. |
| 10 | Discuss mode receives the same verdict. | The discuss command short-circuits on the same fixture the facilitate command does. |
| 11 | The self identity and the cap arrive as inputs. | The `kata-agent` action forwards its App slug, and both the action and the CLI accept a hop-cap value. The library contains no hard-coded App slug. |
| 12 | Trace tooling counts the new verdicts. | The cost and overview verbs report suppressed and stand-down runs apart from success and failure. |
| 13 | The cap is calibrated. | The design or plan carries a table with the measured depth of the known-good handoffs and of the September burst, and the default sits between them. |
| 14 | The stale guard wording is gone. | Neither the dispatch workflow, the `kata-setup` template, nor the skill's DO-CONFIRM item contains the phrase "recursion guard". |
| 15 | The participant prompt no longer owns stand-down. | The facilitated-participant system prompt contains no "no further action" sentence. |
| 16 | Repository checks stay green. | `bun run check`, `bun run test`, and `bunx jidoka invariants` pass. |
