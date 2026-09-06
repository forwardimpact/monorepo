# Spec 2350: Bound self-caused dispatch volume

**Classification:** product-aligned. The change lands on the published
`kata-agent` action under `products/kata/actions/`, on the `gemba-harness` and
`gemba-watchdog` commands the Gemba product ships, on the `kata-setup` skill,
and on the `www.gemba.team` guides. The `libharness` module that computes the
verdict is a shared library. The action, the commands, and the skill are the
surfaces a persona hires
([work-definition.md § Product-aligned vs internal](../../.claude/agents/x-work-definition.md#product-aligned-vs-internal)).

**Persona and job:** Teams Using Agents → Run a Continuously Improving Agent
Team, the Big Hire in [JTBD.md](../../JTBD.md). The job's anxiety is that
autonomy amplifies bad patterns faster than humans can intervene. Gemba's Big
Hire, Stand Up and Operate an Agent Team, carries the mechanism, because the
action and the harness that compose the task from the event are the one place
every consumer shares.

## Problem

An event-driven agent team answers its own output. The dispatch workflow fires
on issues, comments, labels, reviews, and merges. A facilitator triages each
event and engages participants. The participants post comments, open pull
requests, and file issues. Each output is one of the same trigger classes, so
it fires the next run. Spec 2330 added a repository-wide brake that counts
volume and latches an operator killswitch. It is deliberately blunt. It needs a
runner slot to measure, and it needs a human to clear.

### The reference consumer, 2026-09-02

The reference consumer `bionova-apps-v2` ran the published Kata team for one
day. Eleven research passes over its issues, pull requests, comments, workflow
runs, job logs, and trace artifacts produced the figures below. Every figure
comes from the GitHub API or a job log. Every issue, pull request, comment,
commit, and run in the incident was authored by the team's own App identity.
No human event exists between the last bring-up commit at 08:10Z and the manual
workflow disable at 14:48Z the next day.

| Fact | Figure |
| ---- | ------ |
| Seed | One scheduled shift persona filed issue #1 at 14:13Z. Dispatch run 1 reacted with a 44-minute facilitated session that created three issues and three pull requests. Those six artifacts drew 70 dispatch runs inside three hours. |
| Dispatch runs | 4,253 in 7 h 25 min. 2,419 cancelled by the default concurrency policy, 698 skipped by the label filter, 620 failed, 516 succeeded. |
| Output | 416 issues, 142 pull requests, about 2,300 comments, 12 direct pushes to `main`, 1,416 label events. Zero formal reviews. Approvals travelled as comments. |
| Fan-out | Each completed run wrote about 2.5 utterances across several artifacts. 415 of 416 issues were filed while a run triggered by a different artifact was in flight. |
| Reply chains | On the twelve most-discussed artifacts, 421 comments: 71 % status, 13 % decision, 9 % acknowledgement, 7 % handoff. The longest unbroken bot-to-bot run is 54 comments. |
| Per-run cost | Every model-backed session engaged all four participants, ran 278 to 776 turns, and cost $22 to $115. Estimated model spend for the day: about $13.5k. Timeouts hold about 58 % of it. |
| Queue | Runs waited 2 to 5 hours for a runner. One session triaged an issue closed three hours earlier. Twenty runner slots were held by dispatch from 15:00Z onward. |
| Brake | The killswitch was never engaged. The agents themselves diagnosed the loop at 17:04Z and named the brake. The chain stopped at 21:14Z when the API credit balance ran out. Runs then exited 0 while printing the credit error. |
| Watchdog | Not installed. `kata-setup` emits no watchdog workflow. |
| Concurrency | At 18:56Z an agent committed a 100-deep FIFO queue to `main` in place of the default pending depth of one, because the default was cancelling 455 runs per hour on hot artifacts. |

### What the dispatch path lacks

| Gap | Evidence |
| --- | -------- |
| The recursion guard the workflow describes does not exist. | The dispatch workflow comment and the `kata-setup` DO-CONFIRM checklist name a guard in the task text. The task composer's templates carry no such sentence. |
| The one stand-down rule runs at the most expensive layer. | The facilitated-participant prompt tells an agent to answer "no further action" when the task holds a completed response. Three sampled sessions reached that judgement only after all four participants had booted and answered, at $50 to $97 each. |
| The facilitator cannot tell the team's own App from any other bot, or from itself. | The task text renders the author's account type. One facilitator concluded: "I could not tell, because every agent here authenticates as one identity." |
| Nothing bounds fan-out across artifacts. | Per-artifact concurrency groups reset on every new artifact. A per-artifact hop cap of three touches 42 % of the mapped runs. The other 58 % are openings and first comments on fresh artifacts. |
| Nothing bounds a run's own fan-in. | Every session asked all four participants. The facilitator prompt says each addressed agent needs its own Ask. |
| Stale events run anyway. | A run reads the payload it was queued with. After a multi-hour wait, the artifact has moved on. |
| The watchdog measures from the pool the flood saturates. | A scheduled assess job queues behind the dispatch jobs it exists to stop. The reference consumer's scheduled runs waited 76 to 93 minutes for a runner. |

The stop decision today is probabilistic, late, blind to self, and blind to
volume. A cheaper facilitator model does not fix that. It is the right reader
for one question only a model can answer: whether a comment hands new work to a
different agent or only acknowledges finished work. It is the wrong place to
count events, because code counts for free and never drifts.

## Proposal

Code computes a verdict before any model starts, from three deterministic
sources: the actor's identity, the artifact's history, and the repository's
recent activity. Code handles the clear cases. The facilitator decides only the
middle case, with the numbers in front of it and a bounded fan-in.

1. **Self identity is an input.** The run knows which App its agents post
   under. The action already knows the App slug and the App id. The harness
   receives both and classifies every actor as human, self, or another bot.
   The match tolerates the three login spellings GitHub uses for one App.
2. **Chain depth is measured on the artifact.** Before the run composes the
   task, it reads the artifact's timeline once. It counts self-authored
   utterances since the last human-authored event of any kind. The opening of
   a self-authored artifact is the first utterance. A comment, a review, and a
   merge are utterances. A label is not, because one run applies several. A
   human label, comment, review, or merge resets the count.
3. **Supersession is measured on the artifact.** When a newer self-authored
   utterance already sits after the triggering event, the run stands down. The
   run that the newer utterance queued sees the whole tail.
4. **Volume is measured on the repository.** The run evaluates the same four
   activity counters the watchdog uses, over the same window, against a lower
   budget. Above the budget, self-caused runs stand down and human-caused runs
   proceed. The budget self-releases as the window slides. It latches nothing
   and needs no human.
5. **Three verdicts.** `proceed` for a human-caused event under budget.
   `suppress` for a duplicate delivery, a superseded event, a self-caused event
   at or past the hop cap, or a self-caused event over budget. `caution` for a
   self-caused or other-bot event under both limits. A `caution` run carries a
   fenced context block with the measured numbers and a two-line rule: engage
   one participant only when the body hands new actionable work to a different
   named agent, and otherwise conclude as a stand-down.
6. **A `caution` run engages at most one participant.** The Ask budget is part
   of the verdict, not of the prompt.
7. **Triage runs before checkout.** The action evaluates the verdict right
   after the killswitch and the token mint, with one pinned binary and no
   repository checkout, the way the watchdog action installs. A suppressed run
   ends in seconds and holds no runner slot for a bootstrap it will not use.
8. **A suppressed run is a green run with a recorded reason.** The step
   summary and the trace carry a `suppressed` verdict, the reason, and the
   measured numbers. The step exits zero. A suppressed run is the design
   working. A red run trains operators to ignore red.
9. **Stand-down is a first-class outcome.** The facilitator concludes with a
   `stand_down` verdict that trace tooling reports apart from success and
   failure.
10. **Every processed comment or opened issue carries a mark.** The run leaves
    one reaction on the triggering comment, or on the issue for an opened
    event. Reactions fire no dispatch event. A trigger that already carries the
    App's reaction is a duplicate delivery or a re-run.
11. **Doubt stops the self-caused line only.** An unreadable timeline or an
    unreadable counter suppresses a self-caused run and proceeds a human-caused
    run with a note. A human can always restart a chain. A chain that hides
    behind an API error cannot.
12. **Discuss mode gets the same triage.** The bridge-dispatched path composes
    its task from the same payload and receives the same verdict.
13. **The label and merge templates name the actor.** Today they render the
    artifact's author. The sender is the actor on those events.
14. **The watchdog reaches every installation.** `kata-setup` emits the
    watchdog workflow beside the four agent workflows, with the defaults below.
15. **Watchdog defaults are re-grounded.** § Calibration shows what each value
    would have done on the reference incident. The threshold and the window
    stay. The schedule tightens. The dispatch budget is half the threshold.
16. **The layers stay distinct.** The watchdog stays identity-blind and
    latches. The dispatch triage is identity-aware and yields. Neither
    replaces the other.

## Calibration

Every figure is a replay of the recovered event timestamps against the rule
named in the row. "Escaped" counts artifacts created before the rule engaged
plus a 45-minute tail for sessions already in flight, which is the harness
step's default cap.

| Rule | Engages | Escaped: issues, PRs, comments | Notes |
| ---- | ------- | ------------------------------ | ----- |
| Nothing (actual) | never | 416, 142, about 2,300 | Stopped by credit exhaustion at 21:14Z. |
| Watchdog, 32 per counter, 2 h window, 15-minute tick | 15:15Z tick | 111, 36, 444 | Comments crossed 32 at 15:03Z, issues at 15:12Z, PRs at 15:43Z, commits never. The tick is the lag. Assumes the assess job found a runner. |
| Watchdog, 32 per counter, 2 h window, 5-minute tick | 15:05Z tick | 95, 34, 380 | Ten minutes earlier. At the observed rate that is 17 issues, 70 comments, and 90 runs fewer. |
| Dispatch budget, 16 per counter, 2 h window, evaluated at every run start | 14:56Z | 88, 31, 328 | Needs no tick and no runner beyond the run itself. Everything after it is in-flight tail. |
| Per-artifact hop cap of 3 alone | per artifact | not bounded | Suppresses 42 % of mapped runs, 94 % of comment-triggered runs on the twelve hottest artifacts, and all 28 bot-only handoffs. Does not touch openings. |
| Hop cap 3, budget 16, and supersession together | 14:56Z | 88, 31, 328 or fewer | The budget bounds the flood. The cap bounds each thread once the flood is under budget. Supersession removes the stale tail of the queue. |

Peak two-hour counts in the incident: issues 167, pull requests 49, comments
835, commits 4. The largest legitimate batches spec 2330 recorded: issues 14,
pull requests 15, commits 15, comments unknown. A threshold of 32 sits above
every legitimate batch and below every incident counter except commits. The
comments counter still has no legitimate baseline. The incident gives its upper
side only, so this spec does not move it.

The hop cap of three keeps the intended pipeline alive: a human approval resets
the chain, the release engineer merges, and dispatch records the approval. In
the incident the earliest bot-only handoff sat at hop three. The cap trades
those handoffs for a bound. A handoff no human asked for is the pattern being
bounded, and a human releases it with one touch.

## Scope

### Included

| Surface | Change |
| ------- | ------ |
| A triage module in `libharness` | Actor classification, the timeline read, the chain record, the supersession check, the budget evaluation through the watchdog library's rules, the verdict, and the context block. |
| A `gemba-harness triage` verb | Reads the event payload and writes the verdict, the reason, the chain record, and the context block to a file and to the step outputs. |
| The facilitate and discuss commands | Consume the triage file when given, run the triage themselves otherwise. Short-circuit on `suppress`. Mark the trigger. Append the block. Set the Ask budget on `caution`. |
| The facilitator's terminal tool | Gains the `stand_down` verdict. |
| The `kata-agent` action | Gains a triage step after the token mint and before checkout, with the watchdog action's pinned-binary install. Gains `hop-cap` and `dispatch-budget` inputs with the calibrated defaults. Forwards the App slug and id as the self identity. Skips every later step on `suppress`. |
| The `gemba-harness` action | Gains `triage-file`, `self-login`, `self-app-id`, `hop-cap`, and `dispatch-budget` inputs. |
| The task composer | The label and merge templates render the sender. |
| The dispatch workflow and the `kata-setup` dispatch template | The prose that claims a recursion guard names the triage. No step changes. |
| The `kata-setup` skill | Emits the watchdog workflow with the defaults. The DO-CONFIRM item that names the recursion guard names the triage and the watchdog. |
| The watchdog workflow, action README, and guide | Schedule `*/5`. Threshold 32 and window 2 hours unchanged. A sentence on the pool the watchdog shares with the runs it measures. |
| The facilitated-participant system prompt | Drops the stand-down sentence. The facilitator owns stand-down. |
| Trace tooling | The overview and cost verbs report the terminal verdict, including `suppressed` and `stand_down`. |
| The coordinate-team and guard-activity guides on `www.gemba.team` | Document the verdicts, the budget, the block, the mark, and the calibration. |
| The `libharness` test suite | Fixture-driven tests for actor classification with the three login spellings, depth over a timeline, supersession, each verdict and reason, the Ask budget, the unreadable branches, and the duplicate-delivery branch. |

### Excluded

| Item | Why |
| ---- | --- |
| Cross-artifact lineage markers | The dispatch budget bounds fan-out by rate, which is what the incident shows. A body marker that carries a parent run across artifacts stays a later change. |
| Changes to the trigger surface or the concurrency policy | The `on:`, `if:`, and `concurrency` blocks stay. The incident shows the default pending depth of one damped the flood, and the 100-deep queue an agent committed removed that damping. That lesson belongs in the template's comments and in the trust-sensitive review rule, not in this spec. |
| Per-run output budgets | A session that files three issues and three pull requests is bounded by its own skills. The 45-minute tail in § Calibration is that gap. It is a session-level change. |
| Per-counter watchdog thresholds | One number stays. The comments counter has no legitimate baseline yet. |
| A fifth watchdog counter for workflow runs | Runs crossed 32 at 14:54Z, nine minutes before comments. The gain is small and it needs an Actions read scope the App does not hold today. |
| The refused `Conclude` while Asks are pending | Five sampled timeouts show a facilitator that concluded and was refused. That is a harness defect with its own evidence. |
| A run that exits zero on an authentication or credit error | The facilitator printed the error and the step reported success. That is a harness defect with its own evidence. |
| The killswitch's fail-open on an absent variable | The gate cannot tell absent from cleared. That is a `kata-agent` change with its own evidence. |
| A self-echo check in the bridges | A `libbridge` concern with its own evidence. |
| Cancelling a run already in flight | The triage runs at the start of a run. |
| Reading the artifact body to decide | Code classifies actors and counts events. Only the facilitator reads content. |

**Compatibility stance:** clean break. The stand-down sentence leaves the
participant prompt. The "recursion guard" wording leaves the workflow, the
template, and the skill. The watchdog schedule changes in place. No shim keeps
the old wording.

## Success criteria

| # | Claim | Verification |
| - | ----- | ------------ |
| 1 | The triage classifies every actor as human, self, or another bot across the three login spellings. | Fixtures with `slug[bot]`, `slug`, `app/slug`, a human, Dependabot, and GitHub Actions yield the expected classes. |
| 2 | Depth counts self utterances since the last human event, and the opening counts. | Fixtures for a human-caused event, a self-opened issue with one triage comment, and a three-comment acknowledgement loop yield depth zero, two, and four. |
| 3 | A human-caused event under budget proceeds with no block. | The composed task for that fixture equals the template output byte for byte. |
| 4 | A self-caused event under both limits proceeds with the block and an Ask budget of one. | The composed task carries the fenced block, and a second `Ask` in that session returns an error. |
| 5 | A self-caused event at or past the cap suppresses before any runner starts. | With a depth-three fixture and a cap of three, the command emits the suppressed summary, starts no runner, and exits zero. |
| 6 | A superseded event suppresses. | A fixture whose timeline holds a newer self utterance after the trigger yields `suppress` with reason `superseded`. |
| 7 | A self-caused event over budget suppresses, and a human-caused one proceeds. | With counters at 16 in the window, the self fixture yields `suppress` with reason `budget` and the human fixture yields `proceed`. |
| 8 | A duplicate delivery suppresses. | A fixture whose trigger already carries the App's reaction yields `suppress` with reason `duplicate`. |
| 9 | A processed trigger carries the App's reaction. | On `proceed` and `caution` the command issues one reaction write for a comment trigger and one for an opened issue. |
| 10 | Doubt stops the self-caused line only. | A fixture whose timeline read throws yields `suppress` for a self actor and `proceed` with a note for a human actor. |
| 11 | The facilitator can conclude a stand-down. | The terminal tool accepts `stand_down`, and the trace summary carries it. |
| 12 | Discuss mode receives the same verdict. | The discuss command short-circuits on the same fixture the facilitate command does. |
| 13 | The triage runs before checkout. | The `kata-agent` step order is killswitch, mint, triage, checkout. A `suppress` outcome skips checkout, bootstrap, wiki, harness, and callback. |
| 14 | The identity, the cap, and the budget arrive as inputs. | The action forwards its App slug and id and accepts `hop-cap` and `dispatch-budget`. The library contains no App slug and no threshold literal outside the defaults table. |
| 15 | The label and merge tasks name the sender. | The label and merge fixtures render the sender login, not the artifact author. |
| 16 | Trace tooling reports the new verdicts. | The overview and cost verbs print `suppressed` and `stand_down` where the summary carries them. |
| 17 | The watchdog reaches installations. | `kata-setup` emits a watchdog workflow with threshold 32, window 2, and schedule `*/5`, and its DO-CONFIRM checklist verifies it. |
| 18 | The monorepo watchdog ticks every five minutes. | `.github/workflows/watchdog.yml` carries `*/5 * * * *`, threshold 32, and window 2. |
| 19 | The calibration is recorded. | § Calibration carries the replay table and the peak counts. |
| 20 | The stale guard wording is gone. | Neither the dispatch workflow, the `kata-setup` template, nor the skill contains the phrase "recursion guard". |
| 21 | The participant prompt no longer owns stand-down. | The facilitated-participant prompt contains no "no further action" sentence. |
| 22 | Repository checks stay green. | `bun run check`, `bun run test`, and `bunx jidoka invariants` pass. |
