# Spec 0490 — Improvement Coach as Pure Facilitator

## Problem

The daily meeting workflow (run 24439250411, 2026-04-15) ran the improvement
coach as facilitator with five domain agents configured as participants. The
coach had all five orchestration tools available (RollCall, Share, Tell,
Redirect, Conclude) and the FACILITATOR_SYSTEM_PROMPT explicitly instructed
their use. Despite this, the coach made zero orchestration tool calls across 55
turns and 634 seconds. It read every agent's wiki summary directly, gathered
metrics via `gh` commands itself, wrote the storyboard alone, and committed —
never waking a single participant. The five agent sessions recorded zero events.

The root cause is an instruction layering conflict. The
FACILITATOR_SYSTEM_PROMPT describes orchestration tool semantics (appended to
the system prompt alongside layer 1 relay mechanics), but the `kata-storyboard`
skill (layer 4) defines a self-sufficient solo procedure that never references
those tools. See
[KATA.md § Instruction layering](../../KATA.md#instruction-layering) for the
five-layer model.

A second, structural conflict reinforces the first: the improvement coach's
agent profile contains an Assess section — a solo decision tree for the
standalone `improvement-coach.yml` workflow (Wed & Sat 10:47 UTC). This Assess
section loads in every invocation context, including facilitated daily meetings
and 1-on-1 coaching sessions, where the task already specifies the action. The
coach sees "Survey domain state, then choose the highest-priority action" when
the workflow task says "Facilitate the team storyboard meeting." The storyboard
skill's own "When to Use" section (line 19) says "Your Assess section routed you
to a coaching context" — coupling it to the Assess decision tree rather than the
workflow task.

The standalone workflow exists so the coach can do two solo activities: (1)
decide which agent needs a 1-on-1 and trigger the coaching-session workflow, and
(2) act on findings from prior coaching sessions by writing fix PRs or specs.
Both are solo work that conflicts with the facilitator identity established by
spec 0460. A facilitator that also writes fix PRs is wearing two hats — and the
Assess section that routes between them pollutes the profile for the coach's
primary job.

### The storyboard skill reads as a solo research procedure

The Process section in `kata-storyboard/SKILL.md` lists five steps:

1. Read the storyboard (self-action)
2. Gather metrics (self-action)
3. Run the five questions (ambiguous — points to
   `references/coaching-protocol.md`)
4. Update the storyboard (self-action)
5. Commit (self-action)

Four of five steps are actions the facilitator performs alone. Step 3 defers to
the coaching protocol reference, which says "each agent reports measured data"
and "agents identify obstacles" — but in passive voice, never specifying the
mechanism. The facilitator can satisfy these descriptions by reading agent wiki
files, which is exactly what it did.

Neither the skill nor the coaching protocol reference mentions the orchestration
tools — RollCall, Tell, Share, Redirect, or Conclude — by name. The word "Tell"
does not appear. The word "Share" does not appear. "RollCall" and "Conclude" do
not appear. The facilitation mechanism is entirely absent from the domain
instructions.

### The system prompt is drowned out by the skill

The FACILITATOR_SYSTEM_PROMPT (appended to the system prompt in
`facilitator.js:20-25`) correctly says:

> "Use Tell to assign work to individual agents. Use Share to broadcast to all.
> Use RollCall to see who is available. Use Conclude with a summary when the
> task is done."

But this is relay-mechanics-layer instruction — it describes what the tools do,
not when or why to use them in a storyboard meeting context. The
`kata-storyboard` skill is far more detailed, contextually specific, and loaded
later in the prompt. When the agent loaded the skill (turn 0 via
`Skill("kata-storyboard")`), it followed the skill's self-sufficient procedure
and never circled back to the system prompt's tool guidance.

This follows a known pattern from trace analysis: when a more detailed skill
procedure exists, agents follow it over generic system-level guidance. The
instruction layering rule in KATA.md is clear — "skills define steps" — and the
storyboard skill's steps are all solo actions.

### Agents use lazy start — they need Tell to wake up

The `Facilitator` class in `facilitator.js:162-167` uses lazy agent startup:
agents block on `messageBus.waitForMessages()` until the facilitator sends them
a message via Tell or Share. Since the coach never called Tell or Share, the
five participant agents never started. The orchestration infrastructure worked
exactly as designed — the instructions failed to trigger it.

### Evidence from the trace

The facilitator trace (`facilitator-trace.ndjson`, 130 events, 55 turns) shows:

- **Turn 0:** Loaded `kata-storyboard` skill via `Skill()` tool
- **Turns 1-10:** Read storyboard template, coaching protocol, wiki summaries
  for all five agents — all via direct file reads (Read tool), not via Tell
- **Turns 11-15:** Read weekly logs for all agents — direct file reads
- **Turns 16-30:** Ran `gh run list`, `gh api`, counted outcomes, read
  specs/STATUS, ran `bun run test` — all solo research
- **Turns 31-38:** Wrote storyboard, weekly log, updated summary, ran checks,
  committed, pushed
- **Turn 39:** Verified do-confirm checklist, produced meeting summary

Zero RollCall. Zero Tell. Zero Share. Zero Conclude. The combined trace
confirms: 130 facilitator events, 1 orchestrator `session_start` event, zero
agent events.

## Proposal

Close the instruction gap by making the `kata-storyboard` skill explicitly
orchestration-aware. The facilitation mechanism — how the coach uses Tell,
Share, RollCall, and Conclude to run the meeting through participant agents —
must be part of the skill's domain procedure, not left to generic system-level
tool descriptions.

### Add facilitation steps to the storyboard process

The skill's Process section must require the facilitator to communicate with
participant agents via the orchestration tools (RollCall, Tell, Share, Redirect,
Conclude) rather than reading agent wiki files directly. Domain data comes from
agents reporting it in response to the coach's questions, not from the coach
extracting it via file reads.

The coach still owns the storyboard artifact (reading, writing, committing) and
the session lifecycle (opening with RollCall, closing with Conclude). The exact
interleaving of tool calls with coaching steps is a design concern — the
requirement is that every coaching question reaches participants through
orchestration tools and every participant response flows back through the
message bus.

### Update the coaching protocol reference

`references/coaching-protocol.md` currently uses passive voice: "each agent
reports," "agents identify obstacles." Rewrite with explicit facilitation
mechanics: which tool the coach uses to pose each question, how agents respond,
and how the coach collects and integrates responses before moving to the next
question.

### Preserve instruction layering

Per KATA.md's authoring guidance: "skills define steps." The facilitation
mechanism is a step-level concern — it belongs in the skill, not in the system
prompt. The FACILITATOR_SYSTEM_PROMPT remains as-is (it correctly describes tool
semantics at the relay layer). The skill gains the domain-specific procedure for
when and why to use those tools in a storyboard meeting.

### Remove the standalone workflow and Assess section

Delete `.github/workflows/improvement-coach.yml` and the `§ Assess` section from
the agent profile. The coach's two remaining invocation paths — daily meeting
and coaching session — both use `mode: "facilitate"`, and the profile should
match that single identity.

The solo activities that the standalone workflow enabled are reassigned:

- **Coaching session scheduling** moves to the daily storyboard meeting. The
  meeting already reviews all agents' conditions on the storyboard — the coach
  can trigger `coaching-session.yml` as a meeting outcome when it identifies an
  agent that needs a 1-on-1.
- **Acting on findings** (fix PRs, specs) routes to the relevant domain agent or
  staff-engineer, not the coach. The coach facilitates; others implement.

The storyboard skill's "When to Use" section must be updated to remove the
Assess coupling. KATA.md must be updated to reflect seven workflows instead of
eight and remove the standalone improvement-coach row from the workflows table.

## Scope

### Affected

- `.claude/skills/kata-storyboard/SKILL.md` — add orchestration-aware process
  steps, add context detection (facilitated vs. solo), update checklists, add
  coaching session scheduling as meeting outcome, remove Assess coupling in
  "When to Use"
- `.claude/skills/kata-storyboard/references/coaching-protocol.md` — rewrite
  with explicit facilitation mechanics per question
- `libraries/libeval/src/facilitator.js` — refactor `FACILITATOR_SYSTEM_PROMPT`
  and `FACILITATED_AGENT_SYSTEM_PROMPT` from imperative to descriptive semantics
  so layer 1 describes what tools are without overlapping layer 4's procedural
  instructions
- `.claude/agents/improvement-coach.md` — remove `§ Assess` section, update
  profile description to reflect pure facilitator identity
- `.github/workflows/improvement-coach.yml` — delete (standalone workflow)
- `KATA.md` — update workflow count (7 not 8), remove standalone
  improvement-coach row from workflows table, update prose references

### Excluded

- `libraries/libeval/src/facilitator.js` `Facilitator` class — orchestration
  infrastructure works correctly; only the system prompt constants change
- `libraries/libeval/src/orchestration-toolkit.js` — tools work correctly
- `.github/workflows/daily-meeting.yml` — workflow configuration is correct
- `.github/workflows/coaching-session.yml` — workflow configuration is correct
- Domain agent profiles — they receive correct facilitated agent system prompts

## Dependencies

- **Spec 0440** (`plan implemented`) — orchestration tools and facilitate mode
- **Spec 0460** (`plan implemented`) — kata-storyboard skill and daily-meeting
  workflow (the artifacts this spec modifies)

## Success Criteria

1. The `kata-storyboard` Process section requires the facilitator to use
   orchestration tools (RollCall, Tell, Share, Redirect, Conclude) to
   communicate with participant agents rather than reading their wiki files
   directly.
2. `references/coaching-protocol.md` specifies the facilitation mechanism for
   each of the five questions — which tool the coach uses to pose the question
   and how agents respond.
3. The read-do and do-confirm checklists include orchestration-specific items.
4. The improvement coach agent profile has no `§ Assess` section.
5. `.github/workflows/improvement-coach.yml` is deleted.
6. KATA.md reflects seven workflows and the standalone improvement-coach row is
   removed from the workflows table.
7. The storyboard process includes a step for the coach to trigger a
   coaching-session workflow when a participant agent would benefit from a
   1-on-1.
8. `bun run check` and `bun run test` pass with no regressions.
