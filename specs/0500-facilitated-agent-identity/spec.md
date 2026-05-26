# Spec 0500 — Facilitated Agent Identity and Domain Focus

## Problem

**Note:** The implementation landed ahead of this spec (commit `4f18e5f` on
main, branch `fix/coach-agent-identity`). This spec documents the rationale
retroactively. Line references describe pre-fix state unless noted otherwise.

Participant agents in facilitated daily meetings had no identity. The
`FACILITATED_AGENT_SYSTEM_PROMPT` in `facilitator.js` was a static string — "You
are one of several agents" — that never named the agent or its role. When five
domain agents (staff-engineer, security-engineer, technical-writer,
release-engineer, product-manager) received the same anonymous prompt and the
same facilitator broadcast about technical topics (specs, CI, quality gates),
they converged on whichever role best matched the shared context.

In three consecutive daily-meeting traces on 2026-04-15, this convergence
worsened:

| Trace (run ID) | Role confusion rate | Manifestation                                          |
| -------------- | ------------------- | ------------------------------------------------------ |
| 24459264601    | 1/5 (PM only)       | PM adopted facilitator voice, 0 domain Shares          |
| 24461540859    | 5/5                 | All agents titled "Staff Engineer — Current Condition" |
| 24464669481    | 5/5                 | All agents titled "Staff Engineer perspective"         |

The PM in the first trace was not uniquely vulnerable — it was the canary. By
the third trace every agent self-identified as "Staff Engineer" and produced
identical analyses of the specs pipeline and open issues. Security analysis,
documentation coverage, release readiness, and product prioritization were
entirely absent.

### Root cause

`FACILITATED_AGENT_SYSTEM_PROMPT` (pre-fix: facilitator.js:34-42) was assembled
once and appended identically to every agent's system prompt. The agent config
objects carry `name` and `role` fields (pre-fix: available at line 468) but
neither was interpolated into the prompt. Agents had to discover their identity
from context, entering a ToolSearch/RollCall loop (run 24464669481, turns 49-70)
that consumed ~20 turns and still resolved to the wrong answer — RollCall
returns all participant names without indicating which entry is the caller, and
at turn 68 the first agent concluded "I'm the staff-engineer" incorrectly.

### Cascading effects

Identity collapse is the keystone failure — it causes or amplifies three other
observed problems:

1. **Redundant data gathering.** When all agents believe they are the same role,
   they query the same data sources. In run 24464669481, `cat specs/STATUS` was
   run 5 times, `gh issue list` 4 times, `gh run list` 4 times, and
   `bun run check` 4 times — approximately 17 redundant tool calls producing
   identical results. In run 24459264601, key files were read 6-9 times across
   agents (97 total Read calls). Agents also re-gather data the facilitator
   already broadcast in Q1 because the prompt doesn't instruct them to use it.

2. **Solo completion of Q2-Q5 (observed correlation).** The facilitator yields
   correctly after Q1 (per commit 330e702), but after receiving five identical
   Q1 responses, it completed Q2-Q5 as a monologue in all three traces. Whether
   this is caused by identity collapse or an independent facilitation-protocol
   issue is not yet determined — diverse Q1 responses may provide sufficient
   incentive for collaborative Q2-Q5, but this remains to be verified.

3. **Redundant corrections.** When agents do catch stale data, the correction
   comes N times instead of once. In run 24461540859, four agents independently
   reported the same error (specs 0440/0450 status) because all four were
   analyzing the same domain. The self-correction mechanism works but wastes
   capacity that should surface diverse domain concerns.

### Evidence sources

- Three grounded theory trace analyses: runs 24459264601, 24461540859,
  24464669481 (SCRATCHPAD-1.md through SCRATCHPAD-3.md)
- Cross-trace synthesis (SCRATCHPAD-4.md) — six shared themes, causal model
- Source inspection of `FACILITATED_AGENT_SYSTEM_PROMPT` at facilitator.js:34-42

## Proposal

Give each facilitated agent explicit identity and domain focus in its system
prompt, and instruct agents to build on the facilitator's broadcast data rather
than re-gathering it.

### Agent identity

The system prompt appended to each agent must include the agent's name and role.
The `config.name` and `config.role` fields are already available at agent
construction time — they must be interpolated into the prompt so each agent
knows who it is without an identity-discovery loop.

### Domain focus

The prompt must instruct each agent to report on its own domain and not
duplicate other participants' areas. When a security-engineer receives this
instruction alongside its identity, it should analyze supply chain and
dependency security rather than mirroring the staff-engineer's specs pipeline
analysis.

### Data reuse

The prompt must instruct agents to treat the facilitator's broadcast messages as
a starting point. The facilitator's Q1 Share contains measured data (issue
counts, spec status, workflow success rates) that agents currently re-gather
independently. Agents should build on this data with domain-specific analysis,
not re-verify it.

## Scope

### Affected

- `FACILITATED_AGENT_SYSTEM_PROMPT` usage site in `facilitator.js` — the prompt
  assembled for each participant agent at session start
- The static `FACILITATED_AGENT_SYSTEM_PROMPT` constant itself, if prompt
  restructuring is needed to accommodate per-agent interpolation

### Excluded

- `FACILITATOR_SYSTEM_PROMPT` — the facilitator's own prompt is unchanged
- `Facilitator` class orchestration logic — infrastructure works correctly
- Orchestration toolkit (RollCall, Tell, Share, Redirect, Conclude) — tools work
  correctly
- Agent profiles and skill files — no changes needed at the skill layer
- MCP session stability — independent infrastructure concern observed in traces
  but unrelated to the identity problem
- Wiki push auth boundary — independent infrastructure concern
- Solo completion of Q2-Q5 — expected to improve as a consequence of diverse Q1
  responses; if it persists after identity fix, it becomes a separate spec

## Dependencies

- **Spec 0440** (`plan implemented`, landed by 2026-04-10) — orchestration tools
  and facilitate mode
- **Spec 0490** (`plan implemented`, landed by 2026-04-14) — coach as pure
  facilitator; established the facilitated session architecture this spec
  modifies

## Success Criteria

1. Each facilitated agent's system prompt contains its own name and role as
   stated in the agent config.
2. Each facilitated agent's system prompt instructs domain-specific reporting
   (not generic analysis).
3. Each facilitated agent's system prompt instructs reuse of
   facilitator-provided data.
4. `bun run check` passes with no regressions.

Runtime validation (role confusion rate, redundant tool call count, domain
diversity of Q1 Shares) is deferred to post-merge trace analysis. The criteria
above are artifact properties verifiable at implementation time; the trace
analyses that motivated this spec provide the behavioural baseline for
comparison.
