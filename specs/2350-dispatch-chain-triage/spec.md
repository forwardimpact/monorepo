# Spec 2350: Bound self-caused dispatch volume

**Classification:** product-aligned. The change lands on the published
`kata-agent` action under `products/kata/actions/`, on the `gemba-harness`
command and action the Gemba product ships, on the `gemba-watchdog` action
README, and on the `www.gemba.team` guides
([work-definition.md § Product-aligned vs internal](../../.claude/agents/x-work-definition.md#product-aligned-vs-internal)).
The `libharness` module, the `kata-setup` skill, and the monorepo workflow are
internal companions of those surfaces.

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
it fires the next run. Spec 2330 designed a repository-wide brake that counts
volume and latches an operator killswitch. Its library and action are on
`main`. Its workflow is plan part 05 and has not landed. The brake is
deliberately blunt. It needs a runner slot to measure, and it needs a human to
clear.

### The reference consumer, 2026-09-02

The reference consumer `bionova-apps-v2` ran the published Kata team for one
day. Eleven research passes over its issues, pull requests, comments, workflow
runs, job logs, and trace artifacts produced the figures below. The evidence
page
[bionova-sprawl-study-2026-09-02](../../wiki/bionova-sprawl-study-2026-09-02.md)
in the wiki names the source of every figure and holds the replay
computation. Every issue, pull request, comment, commit, and run in the
incident was authored by the team's own App identity. No human event exists
between the last bring-up commit at 08:10Z and the manual workflow disable at
14:48Z the next day.

| Fact | Figure |
| ---- | ------ |
| Seed | One scheduled shift persona filed issue #1 at 14:13Z. Dispatch run 1 reacted with a 44-minute facilitated session that created three issues and three pull requests. Those six artifacts drew 70 dispatch runs inside three hours. |
| Dispatch runs | 4,253 created between 14:13Z and 21:38Z. 2,419 cancelled by the default concurrency policy, 698 skipped by the label filter, 620 failed, 516 recorded success. About 195 sessions reached a model. 449 of the recorded successes are runs that exited zero on the credit error after 21:14Z. |
| Output | 416 issues, 142 pull requests, about 2,300 comments, 12 direct pushes to `main`, about 1,416 label events. Zero formal reviews. Approvals travelled as comments. |
| Fan-out | Each completed run wrote about 2.5 utterances across several artifacts. 415 of 416 issues were filed while a run triggered by a different artifact was in flight. |
| Reply chains | On the twelve most-discussed artifacts, 421 comments: 71 % status, 13 % decision, 9 % acknowledgement, 7 % handoff. The longest unbroken bot-to-bot run is 54 comments. |
| Per-run cost | Every model-backed session engaged all four participants, ran 278 to 776 turns, and cost $22 to $115. Estimated model spend: about $13.5k. Timeouts hold about 58 % of it. |
| Queue | Runs waited 2 to 5 hours for a runner. One session triaged an issue closed three hours earlier. Twenty runner slots were held by dispatch from about 15:10Z. |
| Brake | The killswitch was never engaged. The agents diagnosed the loop at 17:04Z and named the brake. The chain stopped at 21:14Z when the API credit balance ran out. Runs then exited zero while printing the credit error. |
| Watchdog | Not installed. `kata-setup` emits no watchdog workflow. |
| Concurrency | At 18:56Z an agent committed a 100-deep FIFO queue to `main` in place of the default pending depth of one, because the default was cancelling 455 runs per hour on hot artifacts. |
| Session cap | The consumer ran the harness default of 45 minutes under a 50-minute job cap. The shipped template passes 300 minutes. |

### What the dispatch path lacks

| Gap | Evidence |
| --- | -------- |
| The guard sits in the wrong layer. | The dispatch workflow comment and the `kata-setup` checklist say the task text carries a recursion guard. The task templates carry none. The only guard is one stand-down sentence in the three participant prompts, which the harness test suite names the recursion guard. Three sampled sessions reached that judgement only after all four participants had booted and answered, at $50 to $97 each. |
| The facilitator cannot tell the team's own App from any other bot, or from itself. | The task text renders the author's account type. One facilitator concluded: "I could not tell, because every agent here authenticates as one identity." |
| Nothing bounds fan-out across artifacts. | Per-artifact concurrency groups reset on every new artifact. A per-artifact hop cap of three touches 42 % of the mapped runs. The other 58 % are openings and first comments on fresh artifacts. |
| Nothing bounds a run's own fan-in. | Every session asked all four participants. The task template tells the lead that each addressed agent needs its own Ask. |
| Stale events run anyway. | A run reads the payload it was queued with. After a multi-hour wait, the artifact has moved on. |
| The watchdog measures from the pool the flood saturates. | A scheduled assess job queues behind the dispatch jobs it exists to stop. The consumer's scheduled shift waited 76 minutes for a runner. |
| The label task text names no actor. | The label templates render the label and the artifact. The merge template already names the merger. |

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

1. **Self identity comes from the run's own token.** The token mint yields the
   App slug. The App id is already an input. The harness receives both and
   classifies every actor as human, self, or another bot. The match tolerates
   the three login spellings GitHub uses for one App. No consumer input names
   the slug.
2. **Hops are measured on the artifact.** Before the run composes the task, it
   reads the artifact's history. It counts self-authored utterances since the
   last human-authored event of any kind. The opening of a self-authored
   artifact is the first utterance. A comment, a review, and a merge are
   utterances. A label is not, because one run applies several. A human label,
   comment, review, merge, or close resets the count.
3. **Supersession is measured on the artifact.** A self-caused comment or
   review trigger stands down when any newer utterance, human or self, already
   sits after it. The run the newer utterance queued sees the whole tail. A
   human-caused trigger never stands down for this reason. Label and merge
   triggers carry no anchor and are not tested.
4. **Volume is measured on the repository.** The run evaluates the same four
   activity counters the watchdog uses, over the same window, against a budget.
   A counter at or above the budget breaches. Above the budget, self-caused
   runs stand down and human-caused runs proceed. The budget self-releases as
   the window slides. It latches nothing and needs no human. The counters are
   identity-blind, so a busy human day pauses self-caused dispatch for one
   window. That pause is accepted.
5. **The verdict set is total.** A human-caused event proceeds. An event with
   no artifact, such as a manual or bridge dispatch, proceeds with no reads. An
   event another bot caused proceeds under caution. A self-caused event stands
   down when it is a duplicate, superseded, at or past the hop cap, or over
   budget. Otherwise it proceeds under caution. A `caution` run carries a
   fenced context block with the measured numbers and a two-line rule: engage
   one participant only when the body hands new actionable work to a different
   named agent, and otherwise conclude as a stand-down.
6. **A `caution` run engages at most one participant.** The bound counts the
   distinct addressees of the lead's Asks. A broadcast counts as every
   participant. The bound is part of the verdict, not of the prompt.
7. **The verdict is computed before the repository is checked out.** A
   suppressed run holds no runner slot for a checkout, a toolchain, or a
   memory refresh it will not use.
8. **A suppressed run is a green run with a recorded reason.** The step
   summary carries the verdict, the reason, and the measured numbers. A caller
   that named a callback receives the same verdict. The step exits zero. A
   suppressed run is the design working.
9. **Stand-down is a first-class outcome.** The facilitator and the discuss
   lead conclude with a `stand_down` verdict that trace tooling reports apart
   from success and failure.
10. **Every self-caused comment or opened issue the run processes carries a
    mark.** The run leaves one reaction on the trigger. Reactions fire no
    dispatch event. A self-caused trigger that already carries the App's
    reaction is a duplicate delivery. Label, review, and merge triggers carry
    no mark and get no duplicate test. A human restarts a chain with a
    comment or a manual dispatch, and both proceed.
11. **Doubt stops the self-caused line only.** An unreadable history or an
    unreadable counter suppresses a self-caused run. A human-caused run
    proceeds with a note in the block.
12. **Discuss mode gets the same triage.** The bridge-dispatched path
    composes its task from the same payload and receives the same verdict.
13. **The label task text names the actor.** The label templates gain the
    sender.
14. **The watchdog reaches every installation.** `kata-setup` emits the
    watchdog workflow beside the four agent workflows. Spec 2330 excluded that
    rollout until baselines existed. The reference consumer ran with no brake
    at all, which is the evidence that supersedes the exclusion.
15. **Watchdog defaults are re-grounded.** § Calibration shows what each value
    would have done on the incident. The threshold and the window stay. The
    tick tightens to five minutes, so the window holds 24 ticks instead of
    eight. The dispatch budget is three quarters of the threshold.
16. **The layers stay distinct.** The watchdog stays identity-blind and
    latches. The dispatch triage is identity-aware and yields. Neither replaces
    the other. The budget runs on the run's own runner, so it is the
    mitigation for the shared pool. Pool isolation stays excluded.

## Calibration

Every row replays the recovered event timestamps against the rule it names.
"Escaped" counts artifacts created before the rule engaged plus a 45-minute
tail for sessions already in flight, which is the cap the consumer ran. The
template's 300-minute cap would lengthen that tail.

| Rule | Engages | Escaped: issues, PRs, comments | Notes |
| ---- | ------- | ------------------------------ | ----- |
| Nothing (actual) | never | 416, 142, about 2,300 | Stopped by credit exhaustion at 21:14Z. |
| Watchdog, 32 per counter, 2 h window, 15-minute tick | 15:15Z tick | 111, 36, 444 | Comments crossed 32 at 15:03Z, issues at 15:12Z, PRs at 15:43Z, commits never. Assumes the assess job found a runner. |
| Watchdog, 32 per counter, 2 h window, 5-minute tick | 15:05Z tick | 95, 34, 380 | Ten minutes earlier. 16 issues, 2 PRs, 64 comments, and about 90 runs fewer. |
| Dispatch budget 24 per counter, evaluated at every run start | 15:01Z | 95, 34, 370 | Needs no tick and no runner beyond the run itself. |
| Dispatch budget 16 per counter | 14:56Z | 88, 31, 328 | Five minutes earlier than 24. Sits one to two events above the legitimate batches below. Not chosen. |
| Per-artifact hop cap of 3 alone | per artifact | not bounded | Suppresses 42 % of mapped runs, 94 % of comment-triggered runs on the twelve hottest artifacts, and all 28 bot-only handoffs. Does not touch openings. |
| Hop cap 3, budget 24, and supersession together | 15:01Z | 95, 34, 370 or fewer | The budget bounds the flood. The cap bounds each thread. Supersession removes the stale tail of the queue. |

Peak two-hour counts in the incident: issues 167, pull requests 49, comments
835, commits 4. The largest legitimate batches spec 2330 recorded: issues 14,
pull requests 15, commits 15, comments unknown. A threshold of 32 sits above
every legitimate batch and below every incident counter except commits. A
budget of 24 keeps 1.6 times headroom over the legitimate batches and engages
five minutes after a budget of 16. The comments counter still has no
legitimate baseline. The incident gives its upper side only, so this spec does
not move it.

The hop cap of three keeps the intended pipeline alive: a human approval resets
the chain, the release engineer merges, and dispatch records the approval. In
the incident the earliest bot-only handoff sat at hop three. The cap trades
those handoffs for a bound. A handoff no human asked for is the pattern being
bounded. A human releases it with one touch.

## Scope

### Included

| Surface | Change |
| ------- | ------ |
| A triage module in `libharness` | Actor classification, the history read, the hop count, the supersession test, the budget evaluation, the verdict, and the context block. |
| The harness command surface | Offers the triage as a command the action can call before checkout, and lets the facilitate and discuss commands consume its verdict. Short-circuit on a suppressed verdict. Mark the trigger. Append the block. Bound the addressees. |
| The terminal tools | `Conclude` and `Adjourn` gain `stand_down`. |
| The callback verb | Delivers a suppressed verdict when no trace exists. |
| The `kata-agent` action | Computes the verdict after the token mint and before checkout. Skips checkout, bootstrap, wiki refresh, and the harness on a suppressed verdict. Still delivers the callback and reports cost without failing. Gains the hop cap and the budget as inputs. Derives the self identity from the mint. |
| The `gemba-harness` action | Forwards the verdict file, the identity, the cap, and the budget. |
| The task composer | The label templates render the sender. |
| The dispatch workflow and the `kata-setup` dispatch template | The prose that claims a recursion guard names the triage. No step changes. |
| The `kata-setup` skill | Emits the watchdog workflow with the defaults. Its checklist verifies the triage and the watchdog instead of the recursion guard. |
| The watchdog workflow, action README, and guide | Tick `*/5`. Threshold 32 and window 2 hours unchanged. The guide's rationale becomes 24 ticks per window. A sentence on the pool the watchdog shares with the runs it measures. The workflow is the file spec 2330 plan part 05 introduces. When this spec lands first, it creates that file. |
| The participant system prompts | The facilitated, discuss, and supervised participant prompts drop the stand-down sentence. The lead owns stand-down. |
| Trace tooling | The overview and cost verbs report the terminal verdict, including `stand_down` and `suppressed`. |
| The coordinate-team and guard-activity guides on `www.gemba.team` | Document the verdicts, the budget, the block, the mark, and the calibration. |
| The `libharness` test suite and catalog prose | Fixture tests for actor classification with the three login spellings, hops over a history, supersession, each verdict and reason, the addressee bound, the unreadable branches, and the duplicate branch. The "recursion guard" wording leaves the prompt tests and the libraries catalog. |

### Excluded

| Item | Why |
| ---- | --- |
| Cross-artifact lineage markers | The dispatch budget bounds fan-out by rate, which is what the incident shows. A body marker that carries a parent run across artifacts stays a later change. |
| Changes to the trigger surface or the concurrency policy | The `on:`, `if:`, and `concurrency` blocks stay. The incident shows the default pending depth of one damped the flood, and the 100-deep queue an agent committed removed that damping. That lesson belongs in the template's comments and in the trust-sensitive review rule. |
| Pool isolation for the watchdog | A second runner pool is an operator choice. The budget is the in-band mitigation. |
| Per-run output budgets | A session that files three issues and three pull requests is bounded by its own skills. The 45-minute tail in § Calibration is that gap. It is a session-level change. |
| Per-counter watchdog thresholds | One number stays. The comments counter has no legitimate baseline yet. |
| A fifth watchdog counter for workflow runs | Runs crossed 32 at 14:54Z, nine minutes before comments. The gain is small and it needs an Actions read scope the App does not hold today. |
| Marks on label, review, and merge triggers | Those events carry no reaction target. |
| Cancelling a run already in flight | The triage runs at the start of a run. |
| Reading the artifact body to decide | Code classifies actors and counts events. Only the facilitator reads content. |

### Follow-up findings

The research surfaced four defects outside this spec's scope. No issue tracks
them yet. This section is their record until the owning agent files them.

| Finding | Owner surface |
| ------- | ------------- |
| A facilitator that calls `Conclude` while Asks are pending is refused and then times out. Five sampled timeouts cost $81 each. | `libharness` terminal-tool guard |
| A run whose lead fails on an authentication or credit error exits zero and records success. 449 such runs on the incident day. | `libharness` result handling |
| The killswitch gate reads an absent variable and a cleared variable the same way. | `kata-agent` killswitch step |
| The bridge may loop through replies it posted itself. | `libbridge` |

**Compatibility stance:** clean break. The stand-down sentence leaves the three
participant prompts. The "recursion guard" wording leaves the workflow, the
template, the skill, the tests, and the catalog. The watchdog tick changes in
place. Installations regenerate their workflows through `kata-setup`. No shim
keeps the old wording.

## Success criteria

| # | Claim | Verification |
| - | ----- | ------------ |
| 1 | The triage classifies every actor as human, self, or another bot across the three login spellings. | Fixtures with `slug[bot]`, `slug`, `app/slug`, a human, Dependabot, and GitHub Actions yield the expected classes in the `libharness` test suite. |
| 2 | Hops count self utterances since the last human event, and the opening counts. | Fixtures for a human-caused event, a self-opened issue with one self comment, and a self-opened issue with three self comments yield zero, two, and four. |
| 3 | A human-caused event proceeds with no block. | The composed task for that fixture equals the template output byte for byte, with counters over budget. |
| 4 | A self-caused event under both limits proceeds under caution with one addressee. | The composed task carries the fenced block, and a lead Ask to a second addressee or a broadcast returns an error in that session. |
| 5 | A self-caused event at or past the cap suppresses before any agent session starts. | With a fixture at hop three and a cap of three, the command emits the suppressed record, starts no agent session, and exits zero. |
| 6 | A superseded self-caused trigger suppresses, and a human-caused trigger never does. | A fixture with a newer utterance after a self comment yields `superseded`. The same history after a human comment yields `proceed`. |
| 7 | A self-caused event at or over budget suppresses, and a human-caused one proceeds. | With one counter at 24 and a budget of 24, the self fixture yields `budget` and the human fixture yields `proceed`. |
| 8 | A duplicate self-caused delivery suppresses. | A fixture whose self comment already carries the App's reaction yields `duplicate`. |
| 9 | A processed self-caused trigger carries the App's reaction. | On `proceed` and `caution` the triage issues one reaction write for a self comment and one for a self-opened issue, and none for a label, review, or merge fixture. |
| 10 | Doubt stops the self-caused line only. | A fixture whose history read throws yields `suppressed` for a self actor and `proceed` with a note for a human actor. |
| 11 | An event with no artifact proceeds with no reads. | A `workflow_dispatch` fixture yields `proceed`, and the fixture transport records no request. |
| 12 | The lead can conclude a stand-down. | `Conclude` and `Adjourn` accept `stand_down`, and the trace summary carries it. |
| 13 | Discuss mode receives the same verdict. | The discuss command yields the same verdict as the facilitate command on the same comment fixture, and `proceed` on the `workflow_dispatch` fixture. |
| 14 | The verdict precedes checkout, and a suppressed run stays green. | In the `kata-agent` action the triage step follows the mint and precedes checkout. A suppressed verdict skips checkout, bootstrap, wiki refresh, and the harness, delivers the callback when one is named, and exits zero. |
| 15 | The identity comes from the mint, and the cap and budget arrive as inputs. | The action forwards the mint's slug and the App id. The action and the command accept the cap and the budget. The library contains no App slug literal. |
| 16 | The label tasks name the sender. | The label fixtures render the sender login. |
| 17 | Trace tooling reports the new verdicts. | The overview and cost verbs print `stand_down` and `suppressed` where the summary carries them. |
| 18 | The watchdog reaches installations. | `kata-setup` emits a watchdog workflow with threshold 32, window 2, and tick `*/5`, and its checklist verifies it. |
| 19 | The monorepo watchdog ticks every five minutes. | The watchdog workflow file carries `*/5 * * * *`, threshold 32, and window 2, whether spec 2330 part 05 or this spec creates it. |
| 20 | The stale guard wording is gone. | Neither the dispatch workflow, the `kata-setup` template and skill, the prompt tests, nor the libraries catalog contains the phrase "recursion guard". |
| 21 | The participant prompts no longer own stand-down. | None of the three participant prompts contains a "no further action" sentence. |
| 22 | Repository checks stay green. | `bun run check`, `bun run test`, and `bunx jidoka invariants` pass. |
