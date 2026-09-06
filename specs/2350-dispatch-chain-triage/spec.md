# Spec 2350: Bound self-caused dispatch volume

**Classification:** product-aligned. The change lands on the published
`kata-agent` action under `products/kata/actions/`, on the `gemba-harness`
command the Gemba product ships, on the `gemba-watchdog` action README, and on
the `www.gemba.team` guides
([work-definition.md § Product-aligned vs internal](../../.claude/agents/x-work-definition.md#product-aligned-vs-internal)).
The `libharness` task composer, the `kata-setup` skill, and the monorepo
workflow are internal companions of those surfaces.

**Persona and job:** Teams Using Agents → Run a Continuously Improving Agent
Team, the Big Hire in [JTBD.md](../../JTBD.md). The job's anxiety is that
autonomy amplifies bad patterns faster than humans can intervene. Gemba's Big
Hire, Stand Up and Operate an Agent Team, carries the mechanism, because the
action that runs every event-driven session is the one place every consumer
shares.

## Problem

An event-driven agent team answers its own output. The dispatch workflow fires
on issues, comments, labels, reviews, and merges. A facilitator triages each
event and engages participants. The participants post comments, open pull
requests, and file issues. Each output is one of the same trigger classes, so
it fires the next run. Nothing on the dispatch path tells a run that the team
caused the event it is reacting to, and nothing bounds how many such runs the
team may cause per hour.

Spec 2330 designed a repository-wide brake: four activity counters over a
window, and an operator killswitch that latches when any counter breaches. Its
library and action are on `main`. Its workflow is plan part 05. The brake is
deliberately blunt. It measures from a scheduled job that needs a runner, and
it needs a human to clear the latch.

| Gap | Evidence |
| --- | -------- |
| A run cannot tell the team's own App from a human or from another bot. | The task text renders the author's account type. Dependabot, GitHub Actions, and the team's App all render as the same word. The App's slug is known to the action and never reaches the task. |
| No brake acts before a session starts. | The only stand-down rule is one sentence in the participant prompts. A participant boots its profile, skills, and memory before it can say "no further action". |
| The facilitator has no cheap exit. | `Conclude` accepts `success` or `failure`. A run that finds nothing to do records success and is indistinguishable from work. |
| The watchdog reaches no installation. | `kata-setup` emits four agent workflows and no watchdog. A scheduled watchdog also queues behind the runs it measures when those runs hold the pool. |
| The label task text names no actor. | The label templates render the label and the artifact. The merge template already names the merger. |
| The prose claims a guard that does not exist. | The dispatch workflow comment and the `kata-setup` checklist name a recursion guard in the task text. The templates carry none. |

### Evidence

The reference consumer ran the published team for one day and produced 4,253
dispatch runs, 416 issues, 142 pull requests, and about 2,300 comments, every
one authored by the team's own App, with no human event in the chain. The
killswitch was never engaged. The chain stopped when the API credit ran out.
One shift-filed issue seeded the whole day: the first dispatch run created six
artifacts, and those drew 70 runs within three hours. The volume was fan-out
across artifacts, not a reply loop on one thread. Every model-backed session
engaged all four participants at $22 to $115 per run.
[Appendix A](appendix-a.md) holds the research summary and the replay of
candidate brakes over the recovered timestamps.

## Proposal

Three parts. Code decides what code can count. The facilitator decides the one
thing only a model can read. Every self-caused path has a deterministic bound.
Every human-caused path stays open.

1. **Self identity comes from the run's own token.** The token mint yields the
   App slug. The run classifies the event's actor as human, self, or another
   bot. The match tolerates the three login spellings GitHub uses for one App.
   No consumer input names the slug.
2. **A self-caused run stands down when the repository is over budget.** Before
   the repository is checked out, a self-caused run measures the four watchdog
   counters over the watchdog's window against a budget below the latch
   threshold. A counter at or above the budget breaches. On a breach the run
   writes one summary line and exits zero. A human-caused run and an event with
   no artifact, such as a manual or bridge dispatch, never enter the gate. The
   budget self-releases as the window slides. It latches nothing and needs no
   human. The counters are identity-blind, so a busy human day pauses
   self-caused dispatch for one window. That pause is accepted.
3. **The task names the actor, and the lead can stand down.** The task text
   opens with the actor's class and login. For a self-caused or bot-caused
   event it carries one sentence: engage nobody unless the body hands new
   actionable work to a named agent. The facilitator's `Conclude` and the
   discuss lead's `Adjourn` accept a `stand_down` verdict that trace tooling
   reports apart from success and failure. The participant prompts no longer
   carry a stand-down sentence. The lead owns stand-down.
4. **The watchdog reaches every installation.** `kata-setup` emits the watchdog
   workflow beside the four agent workflows. The threshold and the window stay.
   The tick tightens to five minutes, so the window holds 24 ticks. Spec 2330
   excluded the rollout until baselines existed. A consumer that ran with no
   brake at all is the evidence that supersedes the exclusion.
5. **The label task text names the actor.** The label templates gain the
   sender.
6. **The prose matches the code.** The dispatch workflow, the `kata-setup`
   template and checklist, the prompt tests, and the libraries catalog name the
   gate and the watchdog where they named a recursion guard.

## Calibration

Each row replays the recovered event timestamps against the rule it names.
"Escaped" counts artifacts created before the rule engaged plus a 45-minute tail
for sessions already in flight. Appendix A carries the full table.

| Rule | Engages | Escaped: issues, PRs, comments |
| ---- | ------- | ------------------------------ |
| Nothing (actual) | never | 416, 142, about 2,300 |
| Watchdog, 32 per counter, 2 h, 15-minute tick | 15:15Z tick | 111, 36, 444 |
| Watchdog, 32 per counter, 2 h, 5-minute tick | 15:05Z tick | 95, 34, 380 |
| Gate, budget 24 per counter, 2 h, at every run start | 15:01Z | 95, 34, 370 |

Peak two-hour counts in the incident: issues 167, pull requests 49, comments
835, commits 4. The largest legitimate batches spec 2330 recorded: issues 14,
pull requests 15, commits 15, comments unknown. A threshold of 32 sits above
every legitimate batch and below every incident counter except commits. A
budget of 24 keeps 1.6 times headroom over the legitimate batches. The comments
counter has no legitimate baseline yet, so this spec does not move it.

The gate bounds a flood. It does not bound a slow exchange that stays under the
budget. Such an exchange costs at most the budget's worth of self-caused runs
per window, and each of those runs is as cheap as the lead's stand-down.
[Appendix B](appendix-b.md) names the measurement that would justify a tighter
bound and the mechanism that would provide it.

## Scope

### Included

| Surface | Change |
| ------- | ------ |
| The `kata-agent` action | Gains the gate after the token mint and before checkout. Skips checkout, bootstrap, wiki refresh, the harness, and the cost report on a stand-down. Gains the budget and the window as inputs. |
| The task composer in `libharness` | The actor line. The label templates render the sender. |
| The terminal tools | `Conclude` and `Adjourn` gain `stand_down`. The session counts it as a successful exit. |
| The participant system prompts | The facilitated, discuss, and supervised participant prompts drop the stand-down sentence. |
| Trace tooling | The overview and cost verbs report the terminal verdict, including `stand_down`. |
| The `kata-setup` skill | Emits the watchdog workflow with the defaults. Its checklist verifies the gate and the watchdog. |
| The watchdog workflow, action README, and guide | Tick `*/5`. Threshold 32 and window 2 hours unchanged. The guide's rationale becomes 24 ticks per window. One sentence on the pool the watchdog shares with the runs it measures. The workflow is the file spec 2330 plan part 05 introduces. When this spec lands first, it creates that file. |
| The dispatch workflow and the `kata-setup` dispatch template | The prose names the gate. No step changes. |
| The coordinate-team and guard-activity guides on `www.gemba.team` | Document the actor line, the stand-down verdict, the gate, and the calibration. |
| Tests | Fixtures for actor classification across the three login spellings, the actor line on each trigger class, the sender on label tasks, `stand_down` on both terminal tools, and the gate's three outcomes in the action's test workflow. |

### Excluded

| Item | Why |
| ---- | --- |
| A per-artifact hop cap | The incident was fan-out across artifacts. No slow reply loop under the budget was observed. Appendix B names the trigger and the cheap form. |
| An Ask budget on the lead | A cost bound, not a sprawl brake. Appendix B names the trigger. |
| Supersession of stale triggers | The default concurrency policy already cancels the older pending run. The template comment forbids the `queue:` key that removes that behaviour. |
| Reaction marks and duplicate detection | Re-delivery was not observed. The cost of a duplicate is one run. |
| Per-counter watchdog thresholds | One number stays. The comments counter has no legitimate baseline yet. |
| A fifth watchdog counter for workflow runs | It needs an Actions read scope the App does not hold, and comments lead it by nine minutes. |
| Pool isolation for the watchdog | A second runner pool is an operator choice. The gate is the in-band mitigation. |
| Per-run output budgets | A session that files six artifacts is bounded by its own skills. That is a session-level change. |
| Cancelling a run already in flight | The gate runs at the start of a run. |

### Follow-up findings

The research surfaced four defects outside this spec. No issue tracks them yet.
This section is their record until the owning agent files them.

| Finding | Owner surface |
| ------- | ------------- |
| A facilitator that calls `Conclude` while Asks are pending is refused and then times out. | `libharness` terminal-tool guard |
| A run whose lead fails on an authentication or credit error exits zero and records success. | `libharness` result handling |
| The killswitch gate reads an absent variable and a cleared variable the same way. | `kata-agent` killswitch step |
| The bridge may loop through replies it posted itself. | `libbridge` |

**Compatibility stance:** clean break. The stand-down sentence leaves the three
participant prompts. The "recursion guard" wording leaves every home. The
watchdog tick changes in place. Installations regenerate their workflows
through `kata-setup`. No shim keeps the old wording.

## Success criteria

| # | Claim | Verification |
| - | ----- | ------------ |
| 1 | The actor is classified as human, self, or another bot across the three login spellings. | Fixtures with `slug[bot]`, `slug`, `app/slug`, a human, Dependabot, and GitHub Actions yield the expected classes. |
| 2 | The identity comes from the mint. | The action reads the slug from the token step's output. No action input and no library literal names an App slug. |
| 3 | A self-caused run over budget stands down before checkout. | With a counter at the budget, the action's test workflow shows the gate step summary, no checkout, no bootstrap, no harness, and exit zero. |
| 4 | A human-caused run never enters the gate. | With the same counter, a human-actor fixture runs the harness step. |
| 5 | An event with no artifact never enters the gate. | A `workflow_dispatch` fixture runs the harness step and the gate issues no request. |
| 6 | A self-caused run under budget runs with the actor line. | The composed task opens with `Caused by: self` and the login, followed by the stand-down sentence. |
| 7 | A human-caused run carries the actor line and no stand-down sentence. | The composed task opens with `Caused by: human` and the login and contains no stand-down sentence. |
| 8 | The lead can stand down. | `Conclude` and `Adjourn` accept `stand_down`, the session exits successfully, and the trace summary carries the verdict. |
| 9 | The participant prompts no longer own stand-down. | None of the three participant prompts contains a "no further action" sentence. |
| 10 | Trace tooling reports the verdict. | The overview and cost verbs print `stand_down` where the summary carries it. |
| 11 | The label tasks name the sender. | The label fixtures render the sender login. |
| 12 | The budget and the window arrive as inputs with one home. | The action declares `dispatch-budget` and `dispatch-window-hours` with defaults 24 and 2, and no other file carries those literals. |
| 13 | The watchdog reaches installations. | `kata-setup` emits a watchdog workflow with threshold 32, window 2, and tick `*/5`, and its checklist verifies it. |
| 14 | The monorepo watchdog ticks every five minutes. | The watchdog workflow file carries `*/5 * * * *`, threshold 32, and window 2, whether spec 2330 part 05 or this spec creates it. |
| 15 | The stale guard wording is gone. | No file in the dispatch workflow, the `kata-setup` template and skill, the prompt tests, or the libraries catalog contains the phrase "recursion guard". |
| 16 | Repository checks stay green. | `bun run check`, `bun run test`, and `bunx jidoka invariants` pass. |
