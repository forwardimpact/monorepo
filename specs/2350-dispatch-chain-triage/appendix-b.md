# Appendix B: growing the guardrails when the data says so

Spec 2350 ships one gate, one actor line, and one workflow. This appendix names
the mechanisms it left out, the measurement that would justify each one, and
the size of the change. The rule is the repository's own: measure first, then
add mechanism. `gemba-xmr` tells signal from noise on each series below.

## What to measure

| Series | Source | Cadence |
| ------ | ------ | ------- |
| Self-caused runs that stood down at the gate | `kata-agent` step summaries, or the run list filtered to the App actor with the gate output | weekly |
| Self-caused runs that ran, by terminal verdict | `gemba-trace` overview and cost verbs over the week's traces | weekly |
| Participants engaged per self-caused run | `gemba-trace` per-participant cost rows | weekly |
| Longest run of self utterances on one artifact since the last human event | one comments listing per active artifact, counted from the tail | weekly |
| Watchdog counts at each tick | `gemba-watchdog assess` step summaries | per tick |

Two ratios matter. The share of self-caused runs that end in `stand_down`
without engaging a participant shows whether the actor line does its job. The
share that engaged two or more participants shows whether fan-in needs a bound.

## Add-backs, in order

| Trigger | Mechanism | Size | Expected effect |
| ------- | --------- | ---- | --------------- |
| Self-caused runs keep engaging participants on acknowledgements, measured as a `stand_down` share that stays low while participants per run stays near the roster size. | An Ask budget of one on self-caused runs. The orchestration context counts the distinct addressees of the lead's Asks. A broadcast counts as every participant. The handler refuses the Ask that would exceed the budget. | One counter in `orchestration-toolkit.js`, one flag from the actor line. | Cuts the cost of a wrong stand-down decision from about $50 to about $13 at the incident's rates. Zero effect on human-caused runs. |
| A thread accumulates three or more self utterances with no human event between them, on any artifact, in any week. | A per-artifact hop cap in the gate. Cheap form: one comments listing. A self-opened artifact with three or more comments and no human comment ever stands down. Full form: walk the timeline from the tail and count self utterances since the last human event. | Cheap form: one REST call and a few shell lines in the gate. Full form: a small module with paging. | On the incident's twelve hottest artifacts the cap of three would have suppressed 94 % of comment-triggered runs and all 28 bot-only handoffs. It reaches 42 % of all runs. |
| A consumer runs a deep dispatch queue and stale triggers reach the harness hours late. | Supersession in the gate: a self-caused comment or review trigger stands down when a newer utterance exists on the artifact. | One timeline read and a timestamp compare. | Removes the stale tail of a deep queue. Unnecessary under the default pending depth of one. |
| Duplicate webhook deliveries or manual re-runs of self-caused triggers appear in the run list. | A reaction mark on each processed self comment or self-opened issue, and a stand-down when the mark exists. | One reactions read and one write in the gate. | One run saved per duplicate. |
| The watchdog's comments counter stops the team on a legitimate review day. | Per-counter thresholds on the watchdog action, once a comments baseline exists. | An optional override input per counter. | Fewer false latches. The incident's comment peak was 26 times the threshold, so detection is unaffected. |
| A flood arrives through a channel the four counters do not see, such as label storms or cancelled-run bursts. | A fifth watchdog counter for agent workflow runs created in the window. | One probe, one Actions read scope on the App. | Runs crossed 32 nine minutes before comments in the incident. |
| Chains propagate across artifacts faster than the budget window resolves. | A lineage marker in every agent-authored body that carries the parent run and depth. | A write hook or a post tool on every participant. | Bounds depth across artifacts, which the per-artifact cap cannot. |

## How to decide

1. Plot each series with `gemba-xmr`. Act on a signal, not on a fluctuation.
2. Take the first row whose trigger shows a signal. Add that mechanism alone.
3. Re-measure for two weeks before the next row.
4. Record the decision and the chart in the wiki, and cite it from the spec
   that carries the change.

A mechanism added without its trigger is a moving part with no evidence behind
it. The incident produced a lot of evidence. It did not produce evidence for
every mechanism one can imagine.
