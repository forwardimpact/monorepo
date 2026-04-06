# Continuous Supervisor Intervention

## Problem

`fit-eval supervise` runs the supervisor and the agent in a strict turn-based
relay. `Supervisor.run()` in `libraries/libeval/src/supervisor.js:74` awaits the
agent's entire SDK session to finish (`await this.agentRunner.resume(...)`)
before draining the buffer, asking the supervisor to react, and resuming the
agent again. The supervisor only ever sees the agent's work after the turn has
already ended.

In practice this means the supervisor cannot guide, nudge, or correct an agent
that is currently going wrong — it can only react after the damage is done.
Concrete failure modes observed in `guide-setup` and other supervised scenarios:

- The agent spends an entire turn down a dead end (wrong CLI invocation, missing
  dependency, hallucinated documentation path) while the supervisor sits idle,
  unable to interject even though it would notice the dead end immediately if it
  could see the stream.
- The agent burns its per-turn `maxTurns` budget on tool calls that the
  supervisor would have stopped after the first one.
- The supervisor's "Keep going." nudges arrive one turn too late: by the time
  they reach the agent, the agent has already moved past the moment the nudge
  was for.
- Long agent turns (multi-minute LLM + tool sequences) make every supervised
  evaluation feel like a fixed pipeline rather than a supervised session, which
  is the whole point of the `product-evaluation` skill.

The relay shape is hard-coded into the loop and cannot be worked around in agent
profiles, skills, or task wording. The supervisor's `SUPERVISOR_SYSTEM_PROMPT`
even reinforces it: _"only your final message in each turn is relayed to the
agent"_.

## Why this matters

The `product-evaluation` skill (`.claude/skills/product-evaluation/SKILL.md`)
exists so that a supervisor can experience the agent's session as it happens and
exercise judgement — let the agent struggle when struggle is the signal,
intervene when the agent is wasting the run. The current relay collapses this
into a "review the transcript after the fact" loop, which is a strictly weaker
mode of supervision than the skill's process step 2 ("Supervise the Session")
calls for.

The continuous-improvement system (CONTINUOUS_IMPROVEMENT.md) also depends on
supervised evaluations producing high-signal traces. Traces full of recoverable
dead ends that the supervisor could have prevented are noise for the improvement
coach.

## Goal

Change the supervised relay so that the supervisor can intervene at any point
during the agent's turn — not only at turn boundaries — while preserving the
existing `EVALUATION_COMPLETE` semantics and the rest of the
`fit-eval supervise` contract.

## Scope

In scope:

- The relay loop and runner contracts in `libraries/libeval/src/supervisor.js`
  and `libraries/libeval/src/agent-runner.js`.
- A new supervisor-driven interrupt signal, tentatively
  `EVALUATION_INTERVENTION`, that mirrors the existing `EVALUATION_COMPLETE`
  signal: detected by scanning supervisor assistant text in real time, tolerant
  of markdown formatting.
- Updates to `SUPERVISOR_SYSTEM_PROMPT` and `AGENT_SYSTEM_PROMPT` to describe
  the new behaviour to both sides of the relay.
- Updates to `.claude/skills/product-evaluation/SKILL.md` so the supervisor
  knows when and how to intervene mid-turn.
- Trace shape (`source`/`turn`/`event` tagging emitted by `Supervisor.emitLine`)
  must continue to be readable by the improvement coach. Mid-turn interventions
  must be visible in the trace as distinct events, not silently merged into
  surrounding turns.

Out of scope:

- The non-supervised `fit-eval run` command and its agent runner usage.
- Changing the `EVALUATION_COMPLETE` detection logic itself (`isComplete` in
  `supervisor.js`).
- Replacing the Claude Agent SDK or moving off `query()` streaming.
- Changing what the supervisor or agent sees as their tool set, working
  directories, or profiles.
- Multi-agent (>2) supervision.

## Behavioural requirements

1. **Streaming visibility.** While the agent's SDK session is running, the
   supervisor must receive successive batches of the agent's streamed output
   (assistant messages and tool events) and have an opportunity to react to each
   batch before the agent's turn finishes.

2. **Mid-turn intervention.** When the supervisor decides to intervene, it emits
   `EVALUATION_INTERVENTION` in an assistant message. The system must:
   1. Interrupt the agent's in-flight SDK session.
   2. Let the supervisor produce a final message describing the intervention.
   3. Relay only that final supervisor message to the agent, exactly the way
      end-of-turn relays already work.
   4. Resume the agent's session so it continues with the intervention as new
      input rather than starting over.

3. **Non-intervention is free.** When the supervisor observes a streaming batch
   and decides not to intervene, the agent's session must continue
   uninterrupted. Observation must not, by itself, cost the agent a turn or
   alter its trace.

4. **`EVALUATION_COMPLETE` still works.** All existing completion behaviour
   continues to function: end-of-turn detection, mid-message detection via
   `completeSignalSeen`, and the early-exit path in `Supervisor.run()`. A
   supervisor that writes `EVALUATION_COMPLETE` mid-stream must still end the
   session cleanly.

5. **Bounded supervision cost.** The supervisor must not be invoked on every
   single SDK event — that would multiply LLM cost without adding signal.
   Batching granularity (by event count, by time, or by message boundary) is a
   plan-level decision, but the spec requires that the cost of supervision
   remains within the same order of magnitude as today's per-turn cost for a
   typical evaluation.

6. **Failure modes are observable.** If the interrupt fails, the agent produces
   no output, or the supervisor loops on intervention without progress, the
   trace must make this visible and the loop must terminate under the existing
   `maxTurns` budget rather than hanging.

## Success criteria

- A `fit-eval supervise` run of `guide-setup` (or any supervised scenario) shows
  at least one `EVALUATION_INTERVENTION` event interrupting an agent turn before
  the SDK session would naturally have ended, and the resulting trace shows the
  agent resuming and acting on the supervisor's intervention.
- A scenario in which the agent never goes off track produces a trace with zero
  interventions and substantively the same turn count as today — the feature is
  invisible when not needed.
- The improvement coach (`gemba-walk` + `grounded-theory-analysis`) can read the
  new trace shape without changes to its parser; new event sources/types are
  additive.
- `bun run check` passes. New behaviour has unit coverage in
  `libraries/libeval/test/` analogous to the existing `supervisor-run` and
  `supervisor-output` tests, including: a streaming-batch path that does not
  intervene, a streaming-batch path that does intervene, and a path where the
  supervisor writes `EVALUATION_INTERVENTION` and `EVALUATION_COMPLETE` in the
  same turn.
- `.claude/skills/product-evaluation/SKILL.md` documents when to intervene, the
  exact signal token, and that the supervisor still owns the
  `EVALUATION_COMPLETE` signal at the end. No procedural overlap with
  `SUPERVISOR_SYSTEM_PROMPT` (per CLAUDE.md / CONTINUOUS_IMPROVEMENT.md
  instruction-layering rules).

## Open questions

- **Batching granularity.** Per assistant message? Per N tool events? Per fixed
  wall-clock interval? The plan should pick one and justify it against cost and
  latency.
- **Supervisor concurrency.** Should the supervisor be allowed to be running its
  own LLM call while the agent is also running, or should the agent be paused
  while the supervisor evaluates each batch? The latter is simpler and preserves
  determinism in tests; the former is closer to "continuous". The plan should
  choose explicitly.
- **Interrupt mechanism.** The Claude Agent SDK exposes session interruption;
  the plan should confirm the exact API surface (`AbortController`, an SDK
  `interrupt()` call, or closing the async iterator) and how it interacts with
  `resume()` so the agent continues from the interrupted state rather than
  losing context.
