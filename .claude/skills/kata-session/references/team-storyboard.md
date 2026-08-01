# Team Storyboard Overlay

This overlay applies to storyboard-workflow runs. The improvement coach
facilitates a monthly team storyboard meeting with multiple participants.

## Artifact

The monthly file is `wiki/storyboard-YYYY-MNN.md` (e.g.,
`storyboard-2026-M04.md`). It has five sections: Challenge, Target Condition,
Current Condition, Obstacles, Experiments.
[`storyboard-template.md`](storyboard-template.md) holds the full template with
per-section word budgets. Write the state. Omit the history.

## Planning vs. Review

**Planning meeting** — first meeting of the month or no storyboard exists.
`gemba-wiki refresh` creates the monthly file (section skeleton +
`obstacles`/`experiments` markers) before the meeting. It omits the per-metric
XmR blocks. For every
`wiki/metrics/{skill}/{YYYY}.csv`, a participant seeds one `#### {metric_name}`
block under `### {skill}` with its `<!-- xmr:{metric}:{csv} -->` /
`<!-- /xmr -->` pair. It also seeds a `#### product_share` block under
`### product-manager` from `wiki/metrics/product-mix/{YYYY}.csv`. The next
refresh renders them. Then lead the team through the Challenge, Target Condition
(measurable, by month end), Current Condition from metrics CSVs, initial
Obstacles, and the first Experiment.

**Review meeting** — all other team meetings. Walk through the five questions.
Update Current Condition with fresh metrics. Record experiment outcomes (actual
vs. expected). Update Obstacles. Plan the next experiment.

## Question Wording (Team)

1. **What is the target condition?** Read the target from the storyboard. If the
   Challenge or Target Condition is unset or expired (planning mode), `Ask` the
   product-manager to write it into the storyboard.
2. **What is the actual condition now?** Each participant follows the
   Participant Protocol: measure with live data, record to CSV, run
   `gemba-xmr analyze` on its own CSV, then report each metric's `status`,
   `μ`, and any fired-rule `signals` through `Answer`. The facilitator relays
   these and runs no analysis itself. Participants flag any metric whose status
   changed since the last meeting.
3. **What obstacles prevent us from reaching the target?** Participants
   identify obstacles from their domain.
   [work-definition.md § Classification tests](../../../agents/x-work-definition.md#classification-tests)
   defines what an obstacle *is* and gives the obstacle-vs-experiment test.
4. **What is the next step? What do you expect?** For the obstacle they address
   now, participants propose their next experiment and its expected outcome,
   scoped to one or two daily cycles.
5. **When can we see what we learned?** Typically: next meeting, end of week, or
   after a specific workflow run.

## Metrics

Each participant records to `wiki/metrics/{skill}/{YYYY}.csv` per its own
skill's `references/metrics.md`. KATA.md § Metrics has the
recording-eligibility rule.

## Storyboard Updates

The deterministic `gemba-wiki refresh` step regenerates the `<!-- xmr:... -->`,
`<!-- obstacles:... -->`, and `<!-- experiments:... -->` blocks (in the
`kata-agent` action, before the wiki push). The facilitator never does. It has
no `Bash`. Headings and `_Note:_` prose sit outside the markers. The step
preserves them. The rendered contents (`**Latest:**` / `**Status:**`, the
X+mR chart, `**Signals:**`) match the template. **Do not restate `μ`, `UPL`,
`LPL`, or zone values in prose** outside the chart.

Markers are the contract. Never paste charts or issue lists by hand.

Above the agent-domain sections, write a tight `### Headlines` list that names
only metrics whose status changed since the last meeting.

## Active / Concluded Partition

Obstacles and Experiments split into `### Active` and
`### Concluded (last 7 days)`. `gemba-wiki refresh` **renders them
automatically** from GitHub issue state. Open issues populate Active. Issues
closed within 7 days populate Concluded. `libwiki` date math ages the window.
No one hand-edits these lists. The participant keeps issue state correct.
Create the issue when you identify the obstacle/experiment. Close it with a
verdict comment when it concludes (see
[`issue-lifecycle.md`](issue-lifecycle.md)). The closed issue is the permanent
record.

## Q3 Obstacle Routing

Per SKILL.md Step 7, the facilitator picks a route per obstacle (parallel
allowed) and logs it. Trigger criteria live in
[work-definition.md § Classification tests](../../../agents/x-work-definition.md#classification-tests).
The owning agent takes Discussion. The coach's Assess run takes Coaching:

| Trigger                                                                          | Route      |
| -------------------------------------------------------------------------------- | ---------- |
| Obstacle would change a shared artifact (metric, routing rule, boundary, policy) | Discussion |
| Same question surfaced in ≥2 agents' Q3 answers                                  | Discussion |
| Persistent obstacle the agent owns; unanalyzed trace; stalled experiment         | Coaching   |

**Worked example.** Four agents' Q3 obstacles touched the same shared artifact
(one routing rule). The facilitator logged one Discussion. It logged no
coaching dispatches.

## Participant Briefing Template

```markdown
You are joining a team storyboard meeting. I will Ask you five questions;
reply to each with Answer. Before answering Q2, record your domain metrics to
`wiki/metrics/{skill}/{YYYY}.csv`; your Answer references the
CSV row. A comment closing a thread or routing a decision to a named owner
names what is in flight (owner + artifact) or the explicit negative; if a
decision is routed to you, announce your PR on the coordinating issue at open.
```
