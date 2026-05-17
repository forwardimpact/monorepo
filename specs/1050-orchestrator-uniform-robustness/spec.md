# Spec 1050 — Uniformly Robust Supervisor and Facilitator Orchestration

## Problem

`libeval` ships two orchestrators that coordinate Claude Agent SDK sessions:
`Supervisor` (1:1 supervisor↔agent) and `Facilitator` (1:N facilitator↔agents).
Both wrap the same `AgentRunner`, both relay messages through a `messageBus`,
both honor an Ask/Answer/Conclude tool contract. On paper they share a
contract. In code they diverge on failure handling and duplicate the same
plumbing, with no tests pinning either property.

A holistic audit of the orchestration layer
([wiki/kata-interview-session-loss-2026-05-16.md](../../wiki/kata-interview-session-loss-2026-05-16.md))
surfaced three defects, all in the same ~1500-line orchestration surface:

| File | Lines |
|---|---|
| `libraries/libeval/src/supervisor.js` | 602 |
| `libraries/libeval/src/facilitator.js` | 498 |
| `libraries/libeval/src/orchestrator-helpers.js` | 59 |
| `libraries/libeval/src/agent-runner.js` | 337 |

### Defect 1 — Facilitator silently treats agent failures as success

`AgentRunner` returns `{success, text, sessionId, error, aborted}` on every
call — it does not throw on normal SDK failures (credit exhaustion, network
drops, the SDK's `error_during_execution` result subtype all surface via the
`.error` field; verified at `libraries/libeval/src/agent-runner.js:208`).

Supervisor checks `.error` at three of its four runner-result callsites:

| File:line | Site | Checks `.error`? |
|---|---|---|
| `supervisor.js:111` | initial `supervisorRunner.run(initialTask)` | yes — emits summary, returns `{success:false, turns:0}` |
| `supervisor.js:225` | agent classify after `agentRunner.run`/`resume` | yes — routes failure unless `aborted` |
| `supervisor.js:281` | mid-turn `supervisorRunner.resume(...)` inside `#midTurnReview` | **no** — return value not captured |
| `supervisor.js:321` | end-of-turn `supervisorRunner.resume(reviewPrompt)` | yes — emits summary, returns `{success:false, turns:N}` |
| `supervisor.js:340` | recheck-loop `supervisorRunner.resume(formatMessages(reminders))` | **no** — result assigned but `.error` never inspected |

Facilitator checks `.error` at **zero** of its six runner-result callsites:

| File:line | Site | Checks `.error`? |
|---|---|---|
| `facilitator.js:102` | initial `facilitatorRunner.run(initialTask)` | no |
| `facilitator.js:172` | pending-ask `agent.runner.resume` | no |
| `facilitator.js:193` | first-message `agent.runner.run(formatMessages(messages))` | no |
| `facilitator.js:200` | loop `agent.runner.resume` | no |
| `facilitator.js:254` | event-loop `facilitatorRunner.resume(formatMessages(msgs))` | no |
| `facilitator.js:273` | pending-ask `facilitatorRunner.resume(formatMessages(reminders))` | no |

When the SDK returns `{error: new Error("…")}` for any of those Facilitator
calls, Facilitator proceeds as if success: it enqueues `turn_complete`, the
facilitator loop continues, the session eventually ends with whatever verdict
happens to be set on `this.ctx`. There is no event attributing the failure to
a specific participant, no signal to the trace that any specific call
failed. The little-hire promise of libeval — *"run an eval and get a trace
that shows exactly what the agent did"*
([libeval/package.json](../../libraries/libeval/package.json):19–27) — fails
the moment a facilitated agent errors quietly. The same hole exists at two
of Supervisor's four resume sites (`supervisor.js:281` and `:340`), so the
defect is partial within supervisor mode too.

### Defect 2 — Two orchestrators, two copies of the same helper

`extractLastText` is defined byte-identically in both files
(`supervisor.js:389-403` vs `facilitator.js:309-323`; `diff` of those line
ranges returns no output). Supervisor invokes its copy at
`supervisor.js:153`. Facilitator's copy is **dead code** — never called from
anywhere in the codebase
(`rg "extractLastText" libraries/libeval/` returns only the two definitions
and the one supervisor callsite).

The drain-then-format relay pattern — `const x = messageBus.drain(name); if
(x.length > 0) ... formatMessages(x)` — recurs at 11 callsites: 5 in
`supervisor.js` (lines 151–153, 263, 315, 341, 365) and 6 in `facilitator.js`
(lines 170–172, 189–193, 200, 226–233, 251–254, 270–273). Each instance
differs subtly in null vs empty return, prefix decoration, and surrounding
`concluded` short-circuit. `orchestrator-helpers.js` is a thin module — 59
lines exporting `createAsyncQueue` and `formatMessages` — but does not yet
host the relay-shaped primitives that recur across both files.

The cwd-on-resume bug fixed in this session
([fe5c0cc4](https://github.com/forwardimpact/monorepo/commit/fe5c0cc4))
and the options-asymmetry refactor in
[f9deed07](https://github.com/forwardimpact/monorepo/commit/f9deed07)
demonstrated that `run()` / `resume()` asymmetry on `AgentRunner` was a real
failure mode. The same shape — two near-identical paths that share an intent
without a shared abstraction — persists at the orchestrator layer one level
up. The next bug fixed in one orchestrator will silently miss the other.

### Defect 3 — No regression coverage for either defect

| Property | Test today |
|---|---|
| Supervisor surfaces `.error` from initial run | yes — `libraries/libeval/test/supervisor-output.test.js:217` |
| Supervisor surfaces `.error` from mid-turn review | none |
| Supervisor surfaces `.error` from end-of-turn review | none |
| Supervisor surfaces `.error` from recheck-loop resume | none |
| Facilitator surfaces `.error` from initial facilitator run | none |
| Facilitator surfaces `.error` from agent `run` | none |
| Facilitator surfaces `.error` from agent `resume` | none |
| Facilitator surfaces `.error` from facilitator `resume` | none |
| Both orchestrators produce identical "last assistant text" output for the same buffer | none |

Existing facilitator tests (`libraries/libeval/test/facilitator.test.js`)
exercise *thrown* errors from the mock runner (line 244), not `{error: ...}`
returns. A test mocking the SDK's documented `error_during_execution` shape
would not have caught any of these regressions.

### Why now

Three pieces of evidence point at this surface needing consolidation:

1. The kata-interview workflow was failing silently before the cwd-on-resume
   root cause was identified
   ([wiki/kata-interview-session-loss-2026-05-16.md](../../wiki/kata-interview-session-loss-2026-05-16.md)).
   Two layers of defensive recovery code (`5e59c43c` adding
   `#resumeSupervisor`; `be28654f` extending it to all six resume sites) were
   added before the root cause was found, each masking the next layer's
   problem. The recent `f9deed07` refactor showed that the *shared* layer is
   where invariants like "every call passes the same options" can be enforced
   structurally; the two orchestrators are now one level above that, awaiting
   the same treatment.
2. The Facilitator is on the critical path for every kata-* workflow that
   coordinates multiple agents (`kata-session`, `kata-storyboard`, future
   multi-agent panels). Silent failure modes there surface as flaky
   multi-agent runs with no obvious root cause.
3. The libeval orchestration surface is small enough (~1500 lines across
   four files) that consolidation is tractable in a single spec rather than
   an incremental refactor across many.

## Personas and Job

**Platform Builders** against the *Prove Agent Changes* job, as declared in
the libeval package's `jobs` block
([libraries/libeval/package.json](../../libraries/libeval/package.json):19–27).
(`JTBD.md` aggregates product-level jobs; library-level jobs are declared in
each library's `package.json` and surface in
[libraries/README.md](../../libraries/README.md). The libeval job is not
listed in `JTBD.md`; it lives in the libraries catalog.)

- **Little Hire** — *"run an eval and get a trace that shows exactly what the
  agent did"*. A facilitated agent that silently errors and still reports
  `turn_complete` is the exact opposite of this hire. The spec delivers a
  trace where every runner outcome — success, error, abort — is named and
  attributed to a specific participant.
- **Big Hire** — *"prove whether agent changes improved outcomes with
  reproducible evidence"*. Reproducibility requires the orchestrators fail
  the same way for the same reasons. Today Supervisor and Facilitator fail
  differently for the same SDK error.

## Scope

In scope, under `libraries/libeval/`:

- `src/supervisor.js` — two unchecked resume sites (`:281` mid-turn,
  `:340` recheck-loop); the locally-defined `extractLastText`.
- `src/facilitator.js` — six unchecked runner-result sites (table above);
  the dead local `extractLastText`; the open-coded drain-format relay
  sequence.
- `src/orchestrator-helpers.js` — destination for shared primitives the
  design selects.
- `src/agent-runner.js` — read-only reference for the return-shape contract
  (`{success, text, sessionId, error, aborted}` at line 208). No behaviour
  change in this file.
- `test/supervisor-intervention.test.js`, `test/supervisor-output.test.js`,
  `test/facilitator.test.js` — new cases for each row in Defect 3's table.

Explicitly out of scope:

- `AgentRunner` API surface (already consolidated by `f9deed07`).
- Tool contract changes (Ask/Answer/Conclude/RollCall semantics).
- The `extractTranscript` method on `Supervisor` (called by `#endOfTurnReview`
  at `supervisor.js:307`). It has no Facilitator counterpart and consolidating
  it would change observable behaviour.
- `messageBus` / `pending-ask` / MCP tool server internals.
- The `test/facilitator-redirect.test.js` suite (already exercises the
  redirect path; out of scope for this spec's defect set).
- Recovery, retry, or fallback behaviour — failures attribute and surface;
  they do not get masked. The session's clean-break direction (no defensive
  code) carries forward verbatim.

## Success criteria

| Property | Verification |
|---|---|
| Every Facilitator runner-result callsite from Defect 1's table surfaces `.error` in the trace, attributed to the participant whose call failed, and the session terminates within the same turn. | One new case per row in `libraries/libeval/test/facilitator.test.js`, each driving the mock runner to return `{error: new Error("…"), aborted: false}` and asserting (a) the orchestrator emits a typed failure event identifying the participant, (b) `summary.success === false`, (c) the iterator returns within the same turn. |
| Supervisor's two unchecked resume sites (`supervisor.js:281`, `:340`) propagate `.error` the same way Supervisor's end-of-turn path does today. | New cases in `libraries/libeval/test/supervisor-intervention.test.js` (mid-turn) and `libraries/libeval/test/supervisor-output.test.js` (recheck-loop) asserting the same exit shape produced by the existing end-of-turn-error test. |
| `extractLastText` exists in exactly one location and the dead facilitator copy is gone. | `rg "extractLastText" libraries/libeval/src/` shows one definition and the single existing supervisor callsite continues to work; facilitator definition is removed. |
| The drain-then-format relay pattern is no longer open-coded at every callsite. | `rg "messageBus.drain\(" libraries/libeval/src/{supervisor,facilitator}.js` returns ≤6 callsites total (down from 11), with each remaining direct call carrying an inline comment explaining why it opts out of the shared helper. |
| No defensive recovery is introduced beyond what `main` already enforces. | The diff added by this spec's implementation contains zero new `try`/`catch` blocks wrapping `runner.run`/`runner.resume` calls in `supervisor.js` or `facilitator.js`; `rg "isSessionNotFound\|No conversation found"` continues to return zero matches in `libraries/libeval/src/`. |
| `bun test libraries/libeval/test` and `bun run check` exit 0 with no skipped suites. | Stated commands. |

## Non-goals

- No new orchestrator mode (we do not add a third orchestrator).
- No replacement of `messageBus` or the Ask/Answer contract.
- No SDK-version-specific shim — the spec depends only on the documented
  `AgentRunner` return shape already in use.
- No CLI-visible change to `fit-eval` or kata workflows that invoke these
  orchestrators; trace consumers see new failure events but every existing
  event is preserved.
- No back-compat flag to retain the old silent-failure behaviour. Clean
  break, single path through the code, per the directive that governed this
  session's earlier commits.
