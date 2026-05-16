# Spec 980 — Uniformly Robust Supervisor and Facilitator Orchestration

## Problem

`libeval` ships two orchestrators that coordinate Claude Agent SDK sessions:
`Supervisor` (1:1 supervisor↔agent) and `Facilitator` (1:N facilitator↔agents).
Both wrap the same `AgentRunner`, both relay messages between LLM sessions
through a `messageBus`, both honor an Ask/Answer/Conclude tool contract. On
paper they share a contract. In code they diverge on failure handling and
duplicate the same plumbing, with no tests pinning either property.

A holistic audit of the orchestration layer
([wiki/kata-interview-session-loss-2026-05-16.md](../../wiki/kata-interview-session-loss-2026-05-16.md);
session that landed commits `d741da99`, `58da3961`, `fe5c0cc4`, `f9deed07`)
surfaced three defects, all in the same `~1500-line` orchestration surface
(`libraries/libeval/src/supervisor.js` 602 lines, `facilitator.js` 498 lines,
`orchestrator-helpers.js` 59 lines, `agent-runner.js` 326 lines).

### Defect 1 — Facilitator silently treats agent failures as success

`AgentRunner` returns `{success, text, sessionId, error, aborted}` (it never
throws on normal SDK failures — credit exhaustion, network drops, the SDK's
`error_during_execution` result subtype all surface via the `.error` field).
Supervisor checks `.error` at three callsites:

| File:line | Site | Check |
|---|---|---|
| `supervisor.js:111` | Initial `supervisorRunner.run(initialTask)` | Emits summary, returns `{success:false, turns:0}` |
| `supervisor.js:225` | Agent classify after `agentRunner.run`/`resume` | Routes to error-handler unless `aborted` |
| `supervisor.js:321` | End-of-turn `supervisorRunner.resume(reviewPrompt)` | Emits summary, returns `{success:false, turns:N}` |

Facilitator checks `.error` at **zero** callsites:

| File:line | Site | Check |
|---|---|---|
| `facilitator.js:102` | Initial `facilitatorRunner.run(initialTask)` | None |
| `facilitator.js:172` | Pending-ask `agent.runner.resume` | None |
| `facilitator.js:193` | First-message `agent.runner.run(formatMessages(messages))` | None |
| `facilitator.js:200` | Loop `agent.runner.resume` | None |
| `facilitator.js:254` | Event-loop `facilitatorRunner.resume(formatMessages(msgs))` | None |
| `facilitator.js:273` | Pending-ask `facilitatorRunner.resume(formatMessages(reminders))` | None |

When the SDK returns `{error: new Error("…")}` for any of those calls,
Facilitator proceeds as if success: it enqueues `turn_complete`, the
facilitator loop continues, the session eventually ends with whatever
verdict happens to be set on `this.ctx` — typically `success:false` from
the final `concluded` check, but only because the orchestrator stalls,
not because it noticed an error. There is no `summary.error_in` event,
no failure attribution in the trace, no signal to the caller that any
specific participant failed. The little-hire promise of libeval —
*"run an eval and get a trace that shows exactly what the agent did"*
([libeval/package.json](../../libraries/libeval/package.json):20–25) —
fails the moment a facilitated agent errors quietly.

The supervisor isn't fully covered either. `supervisor.js:296`
(`#midTurnReview` resuming the supervisor mid-agent-turn) and lines 240
(`extractTranscript` call) ignore `supervisorResult.error` even though
the end-of-turn path checks it. So even for supervisor mode the
robustness is asymmetric within a single file.

### Defect 2 — Two orchestrators, two copies of the same helpers

`extractLastText` is byte-identical between the two files
(`supervisor.js:389-403` vs `facilitator.js:309-323`, confirmed by
`diff` returning no output). The drain-then-format-or-relay pattern
appears eight times across both files (five in supervisor, three in
facilitator), each instance with subtle differences in null vs empty
return, prefix decoration, and surrounding `concluded` short-circuit.
`orchestrator-helpers.js` exports a single helper today
(`formatMessages` at 59 lines), even though both orchestrators are
candidates for at least five other shared operations: last-assistant-text
extraction, drain-or-relay, drain-or-fallback, mid-turn review
scaffolding, and the end-of-turn recheck loop.

The duplication is not benign. The cwd-on-resume bug we fixed in this
session
([fe5c0cc4](../../libraries/libeval/src/agent-runner.js)) and the
options-asymmetry refactor in
[f9deed07](../../libraries/libeval/src/agent-runner.js) both demonstrated
that `run()`/`resume()` asymmetry is a real failure mode; the same
pattern exists at the orchestrator layer one level up, except there's no
shared abstraction forcing the two paths to stay in sync. The next bug
fixed in one orchestrator will silently miss the other.

### Defect 3 — No regression coverage for either defect

| Property | Test today |
|---|---|
| Supervisor surfaces `.error` from initial run | Yes — `supervisor-output.test.js:217` |
| Supervisor surfaces `.error` from end-of-turn review | None |
| Supervisor surfaces `.error` from mid-turn review | None |
| Facilitator surfaces `.error` from initial facilitator run | None |
| Facilitator surfaces `.error` from agent `run` | None |
| Facilitator surfaces `.error` from agent `resume` | None |
| Facilitator surfaces `.error` from facilitator `resume` | None |
| `extractLastText` produces identical output across both modes | None |

Existing facilitator tests (`facilitator.test.js`) exercise *thrown*
errors from the mock runner (line 244), not `{error: ...}` returns. A
test mocking the SDK's documented `error_during_execution` shape would
not have caught any of these regressions.

### Why now

Three pieces of evidence point at this surface needing consolidation:

1. The kata-interview workflow was failing silently for weeks before the
   `cwd`-on-resume root cause was identified
   ([wiki/kata-interview-session-loss-2026-05-16.md](../../wiki/kata-interview-session-loss-2026-05-16.md)).
   Two layers of defensive recovery code (`5e59c43c`, `be28654f`) were
   added before the root cause was found, each masking the next layer's
   problem. The recent f9deed07 refactor showed that the *shared* layer
   is where invariants like "every call passes the same options" can be
   enforced structurally — the two orchestrators are now one level above
   that, awaiting the same treatment.
2. The Facilitator is on the critical path for every kata-* workflow
   that coordinates multiple agents (`kata-session`, `kata-storyboard`,
   future multi-agent panels). Silent failure modes there will surface
   as flaky multi-agent runs without an obvious root cause.
3. The libeval surface is small enough (~1500 lines across four files)
   that consolidation is tractable in a single spec rather than an
   incremental refactor across many.

## Personas and Job

**Platform Builders** against the *Prove Agent Changes* job
([JTBD.md](../../JTBD.md);
[libraries/libeval/package.json](../../libraries/libeval/package.json):20–25):

- **Little Hire** — *"run an eval and get a trace that shows exactly what
  the agent did"*. A facilitated agent that silently errors and still
  reports `turn_complete` is the exact opposite of this hire. The spec
  delivers a trace where every runner outcome — success, error, abort —
  is named and attributed.
- **Big Hire** — *"prove whether agent changes improved outcomes with
  reproducible evidence"*. Reproducibility requires the orchestrators
  fail the same way for the same reasons. Today Supervisor and
  Facilitator fail differently for the same SDK error.

## Scope

In scope, under `libraries/libeval/`:

- `src/supervisor.js` — three error-checked sites plus mid-turn review;
  remove the local `extractLastText` and drain-format duplication.
- `src/facilitator.js` — six unchecked sites; remove the local
  `extractLastText` and drain-format duplication.
- `src/orchestrator-helpers.js` — new home for shared error-handling and
  drain-format primitives, alongside the existing `formatMessages`.
- `src/agent-runner.js` — no behaviour change; only consulted to keep
  the return-shape contract stable.
- `test/supervisor-*.test.js` and `test/facilitator.test.js` — new tests
  per the table in Defect 3 above.

Explicitly out of scope:

- `AgentRunner` API surface (already consolidated by `f9deed07`).
- Tool contract changes (Ask/Answer/Conclude/RollCall semantics).
- Trace format changes outside the new error-attribution events the
  orchestrators emit.
- The `extractTranscript` method on Supervisor (used by mid-turn review
  but has no Facilitator counterpart; consolidation would change
  observable behaviour).
- `messageBus` / `pending-ask` / MCP tool server internals.
- Recovery, retry, or fallback behaviour — failures attribute and
  surface; they do not get masked. The session's clean-break direction
  (no defensive code) carries forward verbatim.

## Success criteria

| Property | Verification |
|---|---|
| Facilitator surfaces `.error` from every runner call and emits a typed orchestrator event before terminating. | New cases in `libraries/libeval/test/facilitator.test.js`, one per callsite in Defect 1's table, asserting (a) the orchestrator emits an `agent_error` / `facilitator_error` event tagged with the participant name, (b) `summary.success === false`, (c) the iterator terminates within the same turn. |
| Supervisor's mid-turn review propagates `.error` the same way as its end-of-turn review. | New case in `libraries/libeval/test/supervisor-intervention.test.js` asserting a mock supervisor error during `#midTurnReview` produces the same exit shape as the end-of-turn equivalent. |
| `extractLastText` is defined in one place and consumed by both orchestrators. | `rg "extractLastText" libraries/libeval/src/` shows one definition and two import sites; `diff` between the two old definitions removed. |
| The drain-format pattern is named and reused across all callsites that today open-code it. | `rg "messageBus.drain\(.*\)" libraries/libeval/src/{supervisor,facilitator}.js` shows fewer raw drain calls than today; each is either covered by the new helper or has a documented reason for opting out. |
| No defensive recovery is introduced. | `rg "isSessionNotFound\|No conversation found\|catch.*resume\|callAgent" libraries/libeval/src/` produces zero matches. |
| `bun test libraries/libeval/test` and `bun run check` exit 0 with no skipped suites. | Stated commands. |

## Non-goals

- No new orchestrator mode (we don't add a third orchestrator).
- No replacement of `messageBus` or the Ask/Answer contract.
- No SDK-version-specific shim — the spec depends only on documented
  `AgentRunner` return shapes already in use.
- No CLI-visible change to `fit-eval` or kata workflows that invoke
  these orchestrators; trace consumers see new event types but old
  events are preserved.
- No back-compat flag to retain the old silent-failure behaviour.
  Clean break, single path through the code, as per the directive that
  governed this session's earlier commits.
