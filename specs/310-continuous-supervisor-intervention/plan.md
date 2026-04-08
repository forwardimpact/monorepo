# Plan — Continuous Supervisor Intervention

## Approach

The current relay is a strict ping-pong between `Supervisor.run()` and
`AgentRunner.run()`/`resume()`: the supervisor only sees the agent's work after
`await this.agentRunner.resume(...)` returns. To let the supervisor intervene
mid-turn we need two things:

1. **An observation hook inside the agent's streaming loop.** The `for await`
   over `query(...)` in `AgentRunner.run()` and `AgentRunner.resume()` must call
   the supervisor at natural boundaries while the agent's SDK session is still
   alive.
2. **A way to cut the agent's SDK session short from the outside.** The
   observation hook needs a signal it can raise to stop the stream cleanly so
   the supervisor's intervention message can be relayed as the agent's next
   prompt via `resume(sessionId)`.

The plan keeps `Supervisor.run()` as the top-level relay driver and
`AgentRunner` as the SDK adapter, but threads a new collaborator between them —
an `onBatch(...)` callback — that makes mid-turn supervision possible without
breaking encapsulation or the existing non-supervised `fit-eval run` path.

### Key design decisions (answers to the spec's open questions)

- **Batching granularity → per agent assistant message.** Flush the batch to the
  supervisor each time the agent emits a message of type `assistant` containing
  a text block (tool-only assistant messages are accumulated into the pending
  batch and flushed with the next text block). This is the granularity at which
  the agent surfaces _intent_ in natural language, which is what the supervisor
  needs to judge "is this a dead end?". Per-event batching would multiply
  supervisor cost by 5–20x; per-turn batching is what we have today.
  Per-assistant-message keeps supervisor cost within 2–5x of today's per-turn
  cost in typical evaluations, which is inside the spec's "same order of
  magnitude" bound. A final implicit flush happens at the SDK `result` message
  so the turn-ending review still runs.

- **Supervisor concurrency → serialized (agent paused during supervisor
  evaluation).** While the supervisor runs its LLM call for a batch, the agent's
  `for await` loop is simply not pulling from the SDK generator; the SDK session
  is idle but alive. This is deterministic (critical for tests), requires no
  locks, and matches the mental model documented in
  `product-evaluation/SKILL.md` — the supervisor _watches_ the agent, it does
  not race it. True concurrency can be explored in a follow-up spec if per-batch
  latency becomes a measurable problem.

- **Interrupt mechanism → `AbortController` passed in `query()` options.** The
  SDK exposes `abortController?: AbortController` on the options object
  (confirmed in `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:891`).
  Aborting the controller stops the `for await` loop with an `AbortError` /
  `DOMException` that we catch as a controlled exit. The session is preserved
  server-side (by `session_id` captured in the init message) and
  `AgentRunner.resume(sessionId, newPrompt)` picks up from where it left off —
  the agent keeps its context and continues with the intervention as new input,
  exactly as the spec requires. The `Query.interrupt()` method is only available
  for streaming _input_ mode, which we do not use, so `AbortController` is the
  correct choice.

## Concrete changes

### 1. `libraries/libeval/src/supervisor.js` — add `isIntervention`

Alongside `isComplete`, add a parallel detector for the new intervention signal.
Same regex shape, same markdown tolerance, different keyword.

```js
/**
 * Check if the supervisor's response signals a mid-turn intervention.
 * Same tolerance rules as isComplete (markdown formatting, word boundaries).
 */
export function isIntervention(text) {
  return /(?:^|[\s*_~`])EVALUATION_INTERVENTION(?:[\s*_~`.,!?]|$)/m.test(text);
}
```

Export it from `libraries/libeval/index.js` (the package barrel — `src/index.js`
does not exist) alongside `isComplete`.

### 2. `libraries/libeval/src/agent-runner.js` — accept `onBatch` and `abortController`

Extract the body of the existing `for await` loop into a private helper
`#consumeQuery(iterator)` so `run()` and `resume()` share identical batch/abort
handling. Scope is tight: the existing options gap in `resume()` (it
deliberately omits `systemPrompt`, `allowedTools`, etc. because the SDK
preserves them server-side across resumes) is **not** expanded. We only add
`abortController` to both option blocks.

The shared consumer loop:

- Tracks a `pendingBatch` array of raw NDJSON lines emitted since the last
  flush.
- On every iteration, writes the line to `this.output`, pushes to `this.buffer`,
  fires `this.onLine(line)`, and appends to `pendingBatch` (exactly the existing
  side effects — just in one place).
- When the message is `assistant` with at least one text block, or when the
  message is `result`, awaits `this.onBatch(pendingBatch, { abort })` where
  `abort()` calls `this.currentAbortController.abort()`. Clears `pendingBatch`
  after the callback. `onBatch` is a no-op when not set.
- Wraps the iteration in a try/catch that treats an aborted signal as a
  controlled exit. To avoid fragility around `AbortError` vs `DOMException`
  shapes from the SDK, the catch block checks
  `this.currentAbortController?.signal.aborted` — if true, swallow the error and
  set `aborted = true`; otherwise rethrow as before.
- On controlled abort, the method returns
  `{ success: false, text, sessionId, error: null, aborted: true }` so the
  caller can distinguish "supervisor asked us to stop" from "real error".

`run()` and `resume()` both:

- Create a fresh `AbortController`, assign it to `this.currentAbortController`
  before starting the query so the outer supervisor (or the `onBatch` callback)
  can abort it.
- Pass that controller to the SDK via `options.abortController`.
- Call the shared `#consumeQuery` helper.
- Clear `this.currentAbortController` in a `finally` block.

Constructor changes:

- Add `onBatch` to the deps list (optional; defaults to `null`; assignable at
  runtime so the Supervisor can swap it per turn).
- Add `currentAbortController` as an instance field initialised to `null`.

Keep `drainOutput()` and `buffer` unchanged — the existing supervisor tag/emit
path is untouched because every line still writes to `buffer` and still calls
`onLine`. `onBatch` is purely additive.

### 3. `libraries/libeval/src/supervisor.js` — mid-turn loop in `Supervisor.run()`

Replace the body of the existing agent-turn branch inside the `for` loop with an
inner loop that drives the agent through interventions. Pseudocode:

```
for each turn 1..maxTurns:
  relay = extractLastText(supervisorRunner, supervisorResult.text)
  interventions = 0

  // onBatch is assigned once per turn; it closes over `turn` so the inner
  // loop's multiple agentRunner.resume(...) calls all see the same callback.
  agentRunner.onBatch = async (batchLines, { abort }) => {
    // INVARIANT: this callback is awaited synchronously inside the agent's
    // `for await` loop. No queueMicrotask/setImmediate between yielding the
    // previous line and firing onBatch, so no agent line can arrive while
    // currentSource is flipped to "supervisor".
    const batchTranscript = renderBatch(batchLines)

    // Emit the orchestrator marker BEFORE the supervisor LLM call so the
    // trace ordering is:
    //   agent line → orchestrator:mid_turn_review
    //   → supervisor lines (tagged turn:N)
    //   → orchestrator:intervention_requested|continue
    emitOrchestratorEvent({ type: "mid_turn_review", turn })

    currentSource = "supervisor"  // currentTurn stays = turn
    completeSignalSeen = false
    interventionSignalSeen = false
    const supervisorBatchResult = await supervisorRunner.resume(
      `The agent is mid-turn. Latest batch:\n\n${batchTranscript}\n\n` +
      `Respond with a brief acknowledgement to let it continue, or write ` +
      `EVALUATION_INTERVENTION followed by a corrective message to stop ` +
      `and relay a new instruction. Write EVALUATION_COMPLETE only when ` +
      `the task is fully done.`
    )
    currentSource = "agent"

    if (interventionSignalSeen) {
      lastSupervisorResult = supervisorBatchResult
      emitOrchestratorEvent({ type: "intervention_requested", turn })
      abort()
      return
    }
    if (completeSignalSeen) {
      lastSupervisorResult = supervisorBatchResult
      emitOrchestratorEvent({ type: "complete_requested", turn })
      abort()
      return
    }
    // Non-intervention: do nothing; the agent loop will pull the next line.
  }

  while true:
    currentSource = "agent"; currentTurn = turn
    const isFirstAgentCall = (turn === 1 && interventions === 0)
    agentResult = isFirstAgentCall
      ? await agentRunner.run(relay)
      : await agentRunner.resume(relay)

    if (agentResult.error && !agentResult.aborted) {
      emitSummary({ success: false, turns: turn }); return failure
    }

    if (completeSignalSeen) {
      emitSummary({ success: true, turns: turn }); return success
    }

    if (agentResult.aborted && interventionSignalSeen) {
      interventions++
      if (interventions >= MAX_INTERVENTIONS_PER_TURN) {
        emitOrchestratorEvent({ type: "intervention_limit", turn })
        break  // fall through to end-of-turn review
      }
      relay = extractLastText(supervisorRunner, lastSupervisorResult.text)
      emitOrchestratorEvent({ type: "intervention_relayed", turn })
      continue  // resume the agent with the intervention as the next prompt
    }

    // Agent finished its SDK session naturally
    break
  }

  agentRunner.onBatch = null  // detach before the end-of-turn review

  // End-of-turn review (existing behaviour, unchanged)
  agentTranscript = extractTranscript(agentRunner)
  currentSource = "supervisor"; currentTurn = turn
  completeSignalSeen = false
  supervisorResult = await supervisorRunner.resume(
    `The agent reported:\n\n${agentTranscript}\n\n` +
    `Review the agent's work and decide how to proceed.`
  )
  ... existing error + completion checks ...
```

Concrete details:

- **`interventionSignalSeen` flag.** Add it next to `completeSignalSeen`, reset
  at every supervisor invocation, set inside `emitLine` when a supervisor
  assistant text block matches `isIntervention(...)`. This mirrors the existing
  pattern exactly.

- **`lastSupervisorResult` on the Supervisor instance.** The outer while-loop
  needs to read the supervisor's text to build the next relay, but the
  supervisor call now happens inside `onBatch` (a closure). Store the result on
  `this.lastSupervisorResult` from within the callback so the outer loop can
  read it after the abort.

- **Source-flip invariant.** `onBatch` must be called synchronously from inside
  the agent's `for await` loop — i.e. directly after yielding an
  assistant-with-text or result message, with no scheduling gap. The
  `AgentRunner` is the only place that flips `currentSource`; there is exactly
  one `await` point (the `await this.onBatch(...)` inside the consumer loop),
  and while that await is pending, no further lines are pulled from the SDK
  generator, so no agent line can be tagged as `source:"supervisor"`. This is
  load-bearing and documented as a comment in the `#consumeQuery` helper.

- **`MAX_INTERVENTIONS_PER_TURN = 5`.** Rationale: the intervention budget
  should be small enough that a looping supervisor burns its quota fast
  (observability — requirement 6) but large enough that a legitimate "intervene,
  observe, intervene again" pattern has headroom. 5 gives room for 2–3 genuine
  corrections plus noise; the outer `maxTurns` budget (20 by default) still
  bounds overall runtime. Not a hot knob; internal constant, not a CLI flag.

- **Orchestrator events.** Add an `emitOrchestratorEvent(event)` helper that
  writes `{source:"orchestrator", turn:currentTurn, event}` NDJSON lines. Event
  types emitted by this spec:
  - `mid_turn_review` — written before each mid-turn supervisor call.
  - `intervention_requested` — supervisor wrote `EVALUATION_INTERVENTION`.
  - `intervention_relayed` — the intervention text has been passed to the agent
    as the new prompt.
  - `intervention_limit` — the per-turn intervention budget was hit.
  - `complete_requested` — supervisor wrote `EVALUATION_COMPLETE` mid-turn.
    These are additive — the improvement coach's parser already reads `source`
    and ignores unknown `event.type` values.

- **`renderBatch(batchLines)`.** A small helper that runs the batch lines
  through a fresh `TraceCollector` (same path `extractTranscript` already uses)
  and returns the text, or `"[empty]"` when the batch is empty.

- **Turn tagging during mid-turn review.** `currentTurn` stays equal to the
  agent's turn number and `currentSource` flips to `supervisor` for the duration
  of the mid-turn call. Mid-turn supervisor lines appear tagged
  `{source:"supervisor", turn:N}` and are distinguishable from end-of-turn
  reviews by the surrounding `mid_turn_review` / `intervention_*` orchestrator
  events — which is why those events are emitted _before_ the supervisor call,
  not after. The spec requires mid-turn interventions to be _visible_, not to
  introduce a new turn-numbering scheme.

- **Supervisor buffer accumulation is intentional.** The mid-turn
  `extractLastText(supervisorRunner, ...)` call reads `supervisorRunner.buffer`,
  which accumulates across every supervisor invocation (mid-turn and
  end-of-turn) because `drainOutput()` is only called by `extractTranscript()`
  for the _agent_ runner. This is deliberate: scanning backwards for the last
  assistant text block returns the most recent message regardless of how many
  mid-turn reviews have already happened. No new drain is needed and no
  duplicate lines will be re-emitted — `emitLine` has already written each line
  exactly once to the output stream as it arrived.

### 4. `libraries/libeval/src/supervisor.js` — prompt updates

Update the two system prompt constants:

```js
export const SUPERVISOR_SYSTEM_PROMPT =
  "You supervise another AI agent, seeing its work in batches. " +
  "Reply briefly to let it continue, or write EVALUATION_INTERVENTION " +
  "followed by new instructions to stop it mid-turn. " +
  "Write EVALUATION_COMPLETE when the task is done. " +
  "Only your final message is relayed.";

export const AGENT_SYSTEM_PROMPT =
  "A supervisor watches your work and may interrupt with new instructions " +
  "mid-task. Treat any new prompt as authoritative and adjust course. " +
  "When uncertain, stop and ask a clarifying question.";
```

The assertions in `supervisor-output.test.js` lines 303-306 (`includes("relay")`
and `includes("EVALUATION_COMPLETE")`) continue to pass because both substrings
remain.

### 5. `libraries/libeval/src/commands/supervise.js` — nothing

No changes needed. The CLI path goes through `createSupervisor(...)` and the new
behaviour is entirely internal to `Supervisor.run()` and `AgentRunner`.

### 6. `libraries/libeval/test/supervisor-run.test.js` — new tests

Extend the mock runner in the existing test file so `run`/`resume` honour an
`onBatch` callback, firing it once per scripted message. Add three new tests in
the `Supervisor - run and turns` describe block:

- **`observation without intervention does not interrupt the agent`** —
  supervisor responds "Keep going." to each batch; agent's SDK session completes
  its scripted turn normally; end-of-turn review then emits
  `EVALUATION_COMPLETE`; result is `{success:true, turns:1}`; the total turn
  count matches what the equivalent scenario produced before this spec.

- **`EVALUATION_INTERVENTION from mid-turn batch interrupts and relays`** —
  supervisor responds `EVALUATION_INTERVENTION stop and do X` to the first
  batch; assert that `agentRunner.resume` is called a second time with the
  intervention text as its prompt (capture via mock), and that the second resume
  call completes the turn; assert the final tagged trace contains an
  orchestrator event with `type: "intervention_requested"` and another with
  `type: "intervention_relayed"`.

- **`EVALUATION_INTERVENTION and EVALUATION_COMPLETE in the same turn`** —
  supervisor intervenes on batch 1, then on the next batch writes
  `EVALUATION_COMPLETE`; assert final result is `{success:true}` and the agent's
  second resume was aborted in favour of the completion path.

### 7. `libraries/libeval/test/supervisor-run.test.js` — `isIntervention` coverage

Add a `describe("isIntervention", ...)` block that mirrors the existing
`isComplete` block: standalone signal, markdown wrappers, inline occurrence,
empty/unrelated text, no match on `EVALUATION_COMPLETE` alone.

### 8. `libraries/libeval/test/supervisor-output.test.js` — trace shape test

Add one test: run a scenario where the supervisor intervenes once, then parse
the NDJSON output and assert:

- At least one line has `source === "orchestrator"` and
  `event.type === "intervention_requested"`.
- At least one agent line and at least one supervisor line share the same `turn`
  value (mid-turn supervisor activity).
- The final summary line is still emitted and still has
  `source === "orchestrator"`, `type === "summary"`.

This protects the improvement coach's parser contract: new event sources / types
are additive, never rename existing ones.

### 9. `.claude/skills/product-evaluation/SKILL.md` — document intervention

Update "Step 2: Supervise the Session" with a single paragraph on _when_ to
intervene — the mechanics (batches, `EVALUATION_INTERVENTION`,
`EVALUATION_COMPLETE`) already live in `SUPERVISOR_SYSTEM_PROMPT` and must not
be restated here (per CLAUDE.md / CONTINUOUS_IMPROVEMENT.md's
instruction-layering rule):

```
Intervene when the agent heads down a dead end, burns turn budget on the
wrong thing, or has misread the documentation — but intervene sparingly.
The agent's independent struggle is part of the signal; step in only when
the struggle has become noise.
```

## Ordering

Dependencies force this order:

1. **`isIntervention` + export** — small, self-contained, tested in isolation.
2. **`AgentRunner.onBatch` + `AbortController` plumbing** — no behaviour change
   yet (supervisor doesn't pass `onBatch`, so old tests still pass).
3. **`Supervisor.run()` mid-turn loop + orchestrator events +
   `interventionSignalSeen` flag** — wire the supervisor to use the new
   AgentRunner hooks.
4. **Prompt updates** (`SUPERVISOR_SYSTEM_PROMPT`, `AGENT_SYSTEM_PROMPT`) —
   independent of the runtime changes; done last among source changes so earlier
   steps can be verified in isolation.
5. **Tests** — added alongside their corresponding source changes (step 1:
   `isIntervention` tests; step 2: onBatch mock; step 3: the three intervention
   tests + output trace test).
6. **`product-evaluation/SKILL.md`** — documentation, done once behaviour is
   stable.
7. **`bun run check` + `bun run test`** across the libeval package.

## Blast radius

**Modified:**

- `libraries/libeval/src/supervisor.js`
- `libraries/libeval/src/agent-runner.js`
- `libraries/libeval/index.js` (export `isIntervention` — barrel lives at the
  package root, not under `src/`)
- `libraries/libeval/test/supervisor-run.test.js`
- `libraries/libeval/test/supervisor-output.test.js`
- `.claude/skills/product-evaluation/SKILL.md`

**Created:** none.

**Deleted:** none.

**Unchanged (deliberately):**

- `libraries/libeval/src/commands/supervise.js` — CLI surface is untouched.
- `libraries/libeval/src/commands/run.js` — non-supervised path is out of scope.
- `libraries/libeval/src/trace-collector.js` — batch rendering reuses it via the
  existing `extractTranscript` pattern.
- `libraries/libeval/src/tee-writer.js` — output formatting is downstream of
  `Supervisor.output.write()` and sees the new orchestrator events without
  modification.
- Claude Agent SDK version or usage of `query()` streaming.

## Pre-implementation smoke test

Before wiring `onBatch` through `Supervisor.run()`, the implementer must confirm
one SDK-level assumption with a ~20-line disposable script:

- **Does the SDK session survive an `AbortController.abort()` mid-stream and
  continue with full context on `resume(sessionId)`?** Script: start a `query()`
  with a long-running task, abort the controller after the first assistant
  message, then call a second
  `query({ prompt: "follow up", options: { resume: sessionId } })` and confirm
  the second session sees the first turn's history. If the aborted session is
  not resumable (e.g. the SDK discards the server-side checkpoint on abort), the
  plan needs to fall back to a different interrupt mechanism — most likely
  pushing a sentinel tool-denial and letting the turn end naturally. Running
  this smoke first avoids rewriting the mid-turn loop under pressure.

This is the only SDK behaviour the plan cannot verify from the `.d.ts` surface
alone.

## Verification

- `bun run check` passes (lint + format).
- `bun run test --filter=@forwardimpact/libeval` passes, including the new
  intervention tests and all pre-existing `supervisor-run` and
  `supervisor-output` tests.
- Manual smoke:
  `bunx fit-eval supervise --task-text="..." --output=trace.ndjson` on a
  scenario that is known to dead-end (candidate: `guide-setup`), then
  `grep intervention_requested trace.ndjson` — at least one hit.
- Manual smoke (feature-invisible-when-not-needed): a clean scenario produces
  zero `intervention_requested` events and substantively the same turn count as
  on `master`.
- Improvement coach parser sanity: run `.claude/skills/gemba-walk` over the new
  trace; it should load and display without parser errors.
- Degenerate all-tools turn: the implicit flush at the SDK `result` message
  guarantees the supervisor sees at least one batch per turn even when the agent
  produces only tool calls and no assistant text. Verified by the "observation
  without intervention" test, which uses a result-only mock.
