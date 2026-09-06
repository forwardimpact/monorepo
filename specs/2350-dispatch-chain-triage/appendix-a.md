# Appendix A: research summary and brake replay

Evidence behind spec 2350. Eleven research passes read the GitHub API of the
reference consumer `forwardimpact/bionova-apps-v2`: issues, pull requests,
comments, workflow runs, jobs, job logs, and six trace artifacts, plus a
shallow clone of the repository. The passes ran on 2026-09-06 over the
incident day 2026-09-02. All times are UTC. The wiki page
`bionova-sprawl-study-2026-09-02` holds the same figures with per-row sources.

## Timeline

| Time | Event |
| ---- | ----- |
| 07:52 | Repository created. |
| 08:00 to 08:10 | Human bring-up. Four manual storyboard runs fail. One is the killswitch refusal test. The variable is cleared before 08:01. |
| 14:04 | Scheduled shift run. Four of six persona jobs fail in under 35 s at pack verification. |
| 14:13 | The release-engineer shift job files issue #1. Dispatch run 1 starts a 44-minute facilitated session. |
| 14:27 to 14:37 | Run 1 creates issues #2, #3, #5 and pull requests #4, #6, #7. Those six draw 70 dispatch runs in three hours. |
| 15:00 to 16:00 | Peak hour: 840 dispatch runs created, 99 issues, 27 pull requests. |
| 17:04 | The agents file issue #239: "Dispatch saturates runners and API quota; the loop feeds itself." They name the killswitch as the containment and assign the issue to the human. |
| 17:06 | An agent commits a 50-minute job timeout to `main`. Sixteen runs had held all twenty runner slots for over 100 minutes with 625 runs queued. |
| 18:56 | An agent commits `queue: max` to `main`, raising pending depth from 1 to 100, because the default was cancelling 455 runs per hour. |
| 21:14 | First `Credit balance is too low` in a facilitator log. |
| 21:38 | Last dispatch run created. |
| 21:40 onward | Facilitators exit in 6 to 9 s with the credit error. The step reports success. 449 of 516 recorded successes completed after this point. |
| Next day 05:16 to 10:54 | API key invalidated. |
| Next day 14:48 | Human disables all four agent workflows. |

The killswitch was never engaged during the incident. No human event exists
between 08:10 and the workflow disable.

## Run census

| Measure | Value |
| ------- | ----- |
| Dispatch runs | 4,253, all created on one day, all triggered by `kata-agent-team[bot]` |
| Events | issue_comment 2,300; issues 1,832 (416 opened, 1,416 labeled); pull_request_target 112; pull_request_review 7; workflow_dispatch 2 |
| Conclusions | cancelled 2,419; skipped 698; failure 620; success 516 |
| Sessions that reached a model | about 195 |
| Runs per hour | 59, 840, 796, 575, 532, 657, 644, 150 from hour 14 to hour 21 |
| Open runs at peak | 1,537 at 21:14. Completion rate about 30 per hour. |
| Queue wait, sampled | 0 min at 14:13; 105 to 227 min for runs created 15:27 to 16:33; 321 min at most |
| Runs per artifact | median 6, p90 16, max 60 |

## Output

| Artifact | Count | Notes |
| -------- | ----- | ----- |
| Issues | 416 | 111 with zero comments. Signatures: Security Engineer 97, Staff Engineer 95, Technical Writer 94, Release Engineer 82, Product Manager 3, none 45. |
| Pull requests | 142 | 10 merged, all by the bot. Zero formal reviews. 546 conversation comments. Eleven same-purpose duplicate groups, two created within 60 s of each other. |
| Issue comments | 1,753 | Mean 4.21 per issue. |
| Direct pushes to `main` | 12 | Including both concurrency changes. |
| Label events | about 1,416 | No label ever matched `agent:*` or `*:approved`. |

## Comment chains

On the twelve most-discussed artifacts, 421 comments were all bot-authored.

| Class | Share |
| ----- | ----- |
| Status, correction, re-measurement | 71 % |
| Decision | 13 % |
| Acknowledgement | 9 % |
| Handoff to a named agent | 7 %, 28 comments, earliest at hop 3 |

The longest unbroken bot-to-bot run is 54 comments. The median gap between
consecutive bot comments is 2.5 minutes, and 69 gaps are under 30 seconds, so
many comments came from concurrent sessions rather than from a reaction to the
previous comment.

## Cross-artifact propagation

| Measure | Value |
| ------- | ----- |
| Issues citing an earlier artifact | 386 of 416 |
| Citation roots | 23. Twenty-two were filed while a dispatch run on another artifact was in flight. |
| Utterances per completed run | 2,857 utterances over 1,136 completed runs, about 2.5 |
| Runs a per-artifact hop cap of 3 would suppress | 1,786 of 4,217 mapped runs, 42 % |
| Runs at hop 0 or 1 on a fresh artifact | 58 % |

## Cost

| Class, from 17 sampled runs | Runs | Mean cost |
| --------------------------- | ---- | --------- |
| Work: participants posted artifacts, facilitator concluded | 5 | $53 |
| Stand-down: "NO ACTION, already closed", three hours stale | 1 | $115 |
| Timeout after a refused `Conclude` with Asks pending | 4 | $81 |
| Credit exhausted at init, recorded success | 4 | $0 |
| Bootstrap race | 2 | $0 |

Every model-backed session asked all four participants and ran 278 to 776
turns. Day estimate: about $13.5k of model spend, timeouts about 58 % of it.

## Configuration and instructions

| Item | Value |
| ---- | ----- |
| Dispatch concurrency at incident start | per-artifact group, pending depth 1 |
| Dispatch concurrency from 18:56 | per-artifact group, FIFO depth 100 |
| Agent step cap | harness default 45 minutes, 200 turns; the template passes 300 minutes |
| Watchdog | none; `kata-setup` emits none |
| Killswitch runbook | targets the wrong repository; the gate reads absent and cleared the same |
| Bot login spellings | REST `kata-agent-team[bot]`, GraphQL `kata-agent-team`, `gh` CLI `app/kata-agent-team` |
| Instructions | at least eight sentences make a reply mandatory; eight issue-creating routes are reachable from a shift; the only stand-down sentence sits in the participant prompts; no sentence names a hop count or an author class |

## Brake replay

Window 2 hours. "Escaped" counts artifacts created before the rule engaged plus
a 45-minute in-flight tail.

| Rule | Engages | Escaped issues / PRs / comments |
| ---- | ------- | ------------------------------- |
| Actual | never | 416 / 142 / about 2,300 |
| Watchdog 32, tick every 15 min | 15:15 tick | 111 / 36 / 444 |
| Watchdog 32, tick every 5 min | 15:05 tick | 95 / 34 / 380 |
| Gate, budget 32, at run start | 15:03 | 95 / 34 / 378 |
| Gate, budget 24, at run start | 15:01 | 95 / 34 / 370 |
| Gate, budget 16, at run start | 14:56 | 88 / 31 / 328 |
| Per-artifact hop cap 3 alone | per artifact | not bounded; 42 % of runs suppressed |

Counter crossings: comments 32 at 15:03:28, issues 32 at 15:12:39, pull
requests 32 at 15:43:02, commits never. Peak two-hour counts: issues 167, pull
requests 49, comments 835, commits 4. Both watchdog rows assume the assess job
found a runner. Dispatch held all twenty slots from about 15:10, and the
scheduled shift at 20:48 waited 76 minutes for its first runner.

## What the evidence says for the design

- The volume was fan-out across artifacts. A rate brake on self-caused runs
  bounds it. A per-thread depth brake alone does not.
- Identity is the missing input. Every run was self-caused and nothing on the
  path knew it.
- A brake that needs a free runner or a human did not fire. One that runs
  inside the dispatch run itself, before checkout, needs neither.
- The cheapest exit must belong to the lead. Every stand-down in the logs came
  after all four participants had booted.
