# Plan 620a, Part 01 — libeval Runtime

Spec: [`spec.md`](./spec.md). Design: [`design-a.md`](./design-a.md). Overview:
[`plan-a.md`](./plan-a.md).

## Scope

This part owns every code and test change inside `libraries/libeval/`. No skill,
workflow, or invariant-catalogue changes — those live in Parts 02 and 03.

## Approach

Land the contract at the runtime in a single coherent unit. The tool surface,
the pending-ask registry, the turn-complete guard, the prompt rewrites, and the
`systemPromptAmend` / `taskAmend` config family are mutually dependent — a PR
that lands only a subset leaves the library in an internally-inconsistent state
(old prompts pointing at removed tools, new tools without enforcement). One PR,
one review cycle.

Removal of `Tell` / `Share` / blocking-`Ask` is atomic with the addition of
`Ask` / `Answer` / `Announce`. The spec forbids aliases; grep confirms no
external consumer imports the old names (`createFacilitator`,
`createSupervisor`, `createAgentRunner` are called nowhere outside libeval
itself).

## Libraries used

Consumes no `@forwardimpact/lib*` packages — this part implements one. The
existing libeval dependencies (`@anthropic-ai/claude-agent-sdk`, `zod`,
`@forwardimpact/libharness` for test helpers) stay as-is.

## Blast radius

**Modified** (13 files):

- `libraries/libeval/src/orchestration-toolkit.js`
- `libraries/libeval/src/facilitator.js`
- `libraries/libeval/src/supervisor.js`
- `libraries/libeval/src/message-bus.js`
- `libraries/libeval/src/agent-runner.js` (one new optional field: `taskAmend`;
  no behavioral change)
- `libraries/libeval/src/index.js`
- `libraries/libeval/src/commands/facilitate.js`
- `libraries/libeval/src/commands/supervise.js`
- `libraries/libeval/src/commands/run.js`
- `libraries/libeval/src/render/orchestrator-filter.js` (leave
  `protocol_violation` un-suppressed; assert via test)
- `libraries/libeval/test/orchestration-toolkit.test.js`
- `libraries/libeval/test/facilitator.test.js`
- `libraries/libeval/test/supervisor-run.test.js`,
  `supervisor-intervention.test.js`, `supervisor-output.test.js`,
  `supervisor-batching.test.js`
- `libraries/libeval/test/message-bus.test.js`

**Created** (1 file): `libraries/libeval/test/pending-ask.test.js` — focused
coverage of the pending-ask registry and the turn-complete guard across both
modes.

**Deleted** (0 files). No aliases, no shims, but no existing file becomes empty.

## Step-by-step

Each step is independently verifiable. Order matters — the tool surface (step 1)
is the foundation; the pending-ask registry (step 2) is where subsequent steps
hang their assertions; steps 3 and 4 consume the registry.

### Step 1 — New tool surface in `orchestration-toolkit.js`

Rewrite the handler factories and per-role MCP server factories around the
three-primitive vocabulary.

**`createOrchestrationContext()`** — extend the returned object:

```js
return {
  concluded: false,
  summary: null,
  redirect: null,
  participants: [],
  messageBus: null,
  // Map<addresseeName, {askId, askerName, question, reminded}>
  // Always keyed by an addressee name. Broadcast asks write one entry
  // per named participant (one per pair), so every pending entry has a
  // concrete addressee and the match rule is uniform.
  pendingAsks: new Map(),
  askIdCounter: 0,
};
```

**Canonical addressee names.** The facilitator mode uses participant names from
`ctx.participants` (e.g., `"staff-engineer"`) and the literal `"facilitator"`
for the facilitator itself. The supervise mode uses the fixed pair
`"supervisor"` / `"agent"`. Every `from` argument passed into handler factories
matches the caller's canonical name — so the key the registry uses is always the
`to` value on the asker's side and the `from` value on the answerer's side.

**New handlers (replace `Ask`/`Tell`/`Share` trio):**

- `createAskHandler(ctx, { from, defaultTo })` — `from` is the asker's canonical
  name; `defaultTo` is a string or `undefined`. On a call with argument `to`,
  use `to`; otherwise use `defaultTo`; otherwise, when neither is present (only
  valid for the facilitator whose tool signature accepts an optional `to`),
  iterate `ctx.participants` and write one pending entry per non-asker
  participant. For each entry:
  - `askId = ++ctx.askIdCounter` — one id per asker→addressee pair (so a
    broadcast ask creates N distinct ids, one per pending entry).
  - `ctx.pendingAsks.set(addressee, { askId, askerName: from, question, reminded: false })`.
  - `messageBus.ask(from, addressee, question, askId)` — direct queue. Returns
    `{ content: [{ type: "text", text: "Ask delivered." }] }`. The asker's turn
    ends after the call (same as today's Tell — no blocking).

- `createAnswerHandler(ctx, { from })` — `from` is the answerer's canonical
  name. Looks up `ctx.pendingAsks.get(from)` — this is the entry the answerer
  owes, because broadcast asks wrote one entry keyed by each addressee. Clears
  that entry, then publishes via
  `messageBus.answer(from, entry.askerName, message, entry.askId)`, and returns
  `"Answer delivered."`. If no pending entry matches, the handler returns
  `{ isError: true, content: [{ type: "text", text: "No pending ask to answer." }] }`
  — surfacing misuse as a tool-call error instead of silently routing the text.

- `createAnnounceHandler(ctx, { from })` — publishes via
  `messageBus.announce(from, message)` without touching `pendingAsks`.

Retain existing: `createConcludeHandler`, `createRedirectHandler`,
`createRollCallHandler`. Delete: `createTellHandler`, `createShareHandler`, and
the old two-arg `createAskHandler(ctx, { onAsk })`.

**Per-role server factories** (note `from` / `defaultTo` bindings; these are the
wiring points for the canonical names above):

- `createFacilitatorToolServer(ctx)` — tools: `Ask({ question, to })` wired with
  `createAskHandler(ctx, { from: "facilitator", defaultTo: undefined })` and
  schema `{ question: z.string(), to: z.string().optional() }`.
  `Announce({ message })` wired with
  `createAnnounceHandler(ctx, { from: "facilitator" })`. `Conclude`, `Redirect`,
  `RollCall` unchanged.
- `createFacilitatedAgentToolServer(ctx, { from })` — tools:
  `Ask({ question, to })` wired with
  `createAskHandler(ctx, { from, defaultTo: "facilitator" })` so a participant
  omitting `to` asks the facilitator; explicit `to` asks a named peer.
  `Answer({ message })` wired with `createAnswerHandler(ctx, { from })`.
  `Announce({ message })` wired with `createAnnounceHandler(ctx, { from })`.
  `RollCall` unchanged.
- `createSupervisorToolServer(ctx)` — tools: `Ask({ question })` wired with
  `createAskHandler(ctx, { from: "supervisor", defaultTo: "agent" })` (supervise
  mode has one addressee); `Announce`, `Conclude`, `Redirect`, `RollCall`
  unchanged.
- `createSupervisedAgentToolServer(ctx)` — tools: `Ask({ question })` wired with
  `createAskHandler(ctx, { from: "agent", defaultTo: "supervisor" })`;
  `Answer({ message })` wired with
  `createAnswerHandler(ctx, { from: "agent" })`; `Announce`, `RollCall`
  unchanged. The signature loses its current `{ onAsk }` parameter — supervise
  mode's Ask now routes through the bus, not through a promise-based blocking
  callback.

**Tool descriptions** stay one-line and generic. No enforcement verbs; describe
the tool's effect, not the addressee's obligation:

- `Ask`: `"Send a question to a participant. The reply arrives via Answer."`
- `Answer`: `"Reply to an ask addressed to you."`
- `Announce`: `"Broadcast a message with no reply expected."`

Exports: `index.js` currently re-exports only context factory + server factories
(not individual handlers). Step 1 adds no new handler exports — the new handlers
are consumed internally by the server factories. Leave `index.js` alone at this
step; Step 5 covers any index.js churn (in practice, none — the server-factory
names are unchanged).

**Verify:** `bun run check` on `orchestration-toolkit.js` compiles. The seven
steps land atomically in one PR — the intermediate state between Step 1
(toolkit) and Steps 3–4 (orchestrator rewiring) does not compile
(`facilitator.js` still imports the removed `createTellHandler` until Step 3
rewrites it). Each step is an independently-verifiable logical unit within the
diff, not a standalone commit.

### Step 2 — MessageBus vocabulary migration

Rewrite `message-bus.js` around the new methods. The existing queues/waiter data
structures carry over; only the public API and the message shape change.

**New methods** on `MessageBus`:

- `ask(from, to, text, askId)` — direct message to one recipient (or broadcast
  if `to === "@broadcast"`, delivering an identical entry to every participant
  except the sender). Queued entry shape:
  `{ from, text, kind: "ask", askId, direct: boolean }`.
- `answer(from, to, text, askId)` — direct reply. Queued entry shape:
  `{ from, text, kind: "answer", askId, direct: true }`.
- `announce(from, text)` — broadcast to all except sender. Queued entry shape:
  `{ from, text, kind: "announce", direct: false }`.
- `synthetic(to, text)` — internal, orchestrator-only. Queued entry shape:
  `{ from: "@orchestrator", text, kind: "synthetic", direct: true }`. Used by
  the turn-complete guard (Step 3) to inject the single reminder.

**Removed:** `share()`, `tell()`. No aliases.

**Unchanged:** `drain()`, `waitForMessages()`, `#assertParticipant()`,
`#resolveWaiter()`, the `createMessageBus` factory.

Consumers that read from the queue (facilitator and supervisor, see Step 5)
learn to switch on `kind` when formatting messages for the LLM. The formatter
gains one line:

```js
const tag =
  m.kind === "ask"      ? "[ask]"      :
  m.kind === "answer"   ? "[answer]"   :
  m.kind === "synthetic"? "[system]"   :
  m.direct              ? "[direct]"   : "[shared]";
return `${tag} ${m.from}: ${m.text}`;
```

**Verify:** `message-bus.test.js` is rewritten in Step 6 to cover the new
methods; Steps 3–5 consume them.

### Step 3 — Pending-ask registry + turn-complete guard in `Facilitator`

Modify `libraries/libeval/src/facilitator.js` to track outstanding asks and
enforce the reply obligation at agent-turn boundaries.

**Prompt rewrites.** Replace the two exported prompt constants with descriptive,
domain-agnostic text. No skill names, no domain vocabulary, no enforcement
phrasing:

```js
export const FACILITATOR_SYSTEM_PROMPT =
  "You coordinate multiple participants. " +
  "Ask sends a question to a participant; omit the addressee to broadcast. " +
  "Announce sends a message with no reply obligation. " +
  "Redirect interrupts a participant with replacement instructions. " +
  "RollCall lists participants. " +
  "Conclude ends the session with a summary.";

export const FACILITATED_AGENT_SYSTEM_PROMPT =
  "You participate in a coordinated session. " +
  "Answer replies to an ask addressed to you. " +
  "Ask sends a question to another participant. " +
  "Announce broadcasts a message. " +
  "RollCall lists participants.";
```

Each prompt sentence describes a tool's effect. No sentence names a deadline, an
ordering, or an obligation — the runtime holds the contract. Absent-phrase
audit: neither prompt contains "before", "stop", "respond via", "then Answer",
"must Answer", or any domain vocabulary; Step 6 asserts this mechanically.

**Registry wiring.** In the `#runAgent` loop, after each `agent.runner.run(...)`
or `agent.runner.resume(...)` returns, call the shared helper
`checkPendingAsk({ ctx, messageBus, addresseeName: agent.name, mode: "facilitated", emitViolation })`
(see below) and act on its return value:

- `"advance"` — enqueue `lifecycle:turn_complete` as today.
- `"recheck"` — a synthetic reminder has been queued; resume the agent once more
  and call the helper again when that resume returns.

The helper's body:

1. Read `ctx.pendingAsks.get(addresseeName)`. If absent, return `"advance"`.
2. If `entry.reminded === false`: set `entry.reminded = true`, call
   `messageBus.synthetic(addresseeName, <reminder text>)` where the reminder
   text is the locked string
   `"You have an unanswered ask from <entry.askerName>. Reply via Answer."` —
   return `"recheck"`.
3. Otherwise (`reminded === true`): call
   `emitViolation({ type: "protocol_violation", agent: addresseeName, askId: entry.askId, mode })`,
   then inject a typed synthetic answer into the asker's queue so the asker
   resumes instead of waiting:
   `messageBus.answer("@orchestrator", entry.askerName, "[no answer: " + addresseeName + " did not reply to ask " + entry.askId + "]", entry.askId)`.
   Clear the entry (`ctx.pendingAsks.delete( addresseeName)`) and return
   `"advance"`. The synthetic answer text is a plain string that satisfies the
   message-bus shape (`text: string`); the facilitator's LLM can read it as a
   null-reply signal without the literal `null` issue.

**Broadcast asks.** Facilitator `Ask` with no `to` writes one pending entry per
non-asker participant (Step 1's handler). Each entry is independent; the helper
evaluates each addressee separately on that agent's turn boundary. A broadcast
ask therefore emits up to N `protocol_violation` events (one per non-answering
participant) over the lifetime of the session — the invariant catalogue
(Part 03) asserts count == 0 on success, which is correct regardless of
broadcast cardinality. The facilitator's `#facilitatorLoop` already handles
multiple `answer` events arriving at its queue via the existing `"messages"`
case drain; no new event case is required.

**Remove obsolete wiring.** The current facilitator has an `"ask"` event case in
`#handleEvent` (`facilitator.js:240-266`) that resolves a promise passed from
`createFacilitatedAgentToolServer`'s `onAsk` callback
(`facilitator.js:462-477`). Both go away: the `"ask"` case in `#handleEvent` is
deleted, the `onAsk` parameter to `createFacilitatedAgentToolServer` is removed
(Step 1 already dropped it from the factory), and `createFacilitator` no longer
constructs `resolve`/`promise` pairs per participant. The `eventQueue` loses the
`"ask"` event type entirely; only `"messages"` and `"lifecycle"` remain.

**Event exposure.** `protocol_violation` is emitted via the existing
`emitOrchestratorEvent` path. It is **not** added to
`render/orchestrator-filter.js` suppressed set — the event must reach both the
NDJSON artifact and the human-readable `toText()` stream so auditors and live
readers both see it.

**Shared helper location.** The registry check is identical in facilitate and
supervise mode; it lives as a free function
`checkPendingAsk({ ctx, messageBus, addresseeName, mode, emitViolation })`
exported from `orchestration-toolkit.js`. Both `Facilitator.#runAgent` (Step 3)
and `Supervisor.#runAgentTurn` / `#endOfTurnReview` (Step 4) import and call it.
Return type: `"advance" | "recheck"`.

**Verify:** `facilitator.test.js` rewrite in Step 6 and the new
`pending-ask.test.js` exercise the registry and the guard end-to-end.

### Step 4 — Pending-ask registry + turn-complete guard in `Supervisor`

`libraries/libeval/src/supervisor.js` gets the same enforcement mechanism,
adapted to supervision's 1:1 shape.

**Prompt rewrites.** Same policy as Step 3 — descriptive, generic, no
enforcement phrases:

```js
export const SUPERVISOR_SYSTEM_PROMPT =
  "You supervise one agent. " +
  "Ask the agent a question when you need a reply. " +
  "Announce to send a message with no reply obligation. " +
  "Redirect interrupts the agent with replacement instructions. " +
  "Conclude ends the session with a summary.";

export const AGENT_SYSTEM_PROMPT =
  "A supervisor watches your work. " +
  "Answer replies to an ask addressed to you. " +
  "Ask sends a question to the supervisor. " +
  "Announce sends a message with no reply expected.";
```

**Registry wiring.** Supervise mode uses the two fixed canonical names from Step
1: `"supervisor"` and `"agent"`. Two enforcement sites, both calling the shared
`checkPendingAsk` helper (Step 3) with `mode: "supervised"`:

1. **Agent side (supervisor→agent ask).** Inside `#runAgentTurn`, after each
   `agentResult` returns without a redirect/conclude, call
   `checkPendingAsk({ ctx, messageBus, addresseeName: "agent", mode: "supervised", emitViolation })`.
   `"advance"` → fall through to `#endOfTurnReview` as today. `"recheck"` → the
   helper queued a synthetic reminder; resume the agent once more by looping
   back with the drained synthetic message as the relay text.

2. **Supervisor side (agent→supervisor ask).** Inside `#endOfTurnReview`,
   immediately before resuming the supervisor, call
   `checkPendingAsk({ ctx, messageBus, addresseeName: "supervisor", mode: "supervised", emitViolation })`.
   `"advance"` → resume the supervisor as today. `"recheck"` → the helper queued
   a synthetic reminder on the supervisor's queue; resume the supervisor with
   the reminder drained into the resume prompt.

The supervisor's `emitViolation` binds to its existing `emitOrchestratorEvent`
method (so the `protocol_violation` event inherits the same source tagging as
other orchestrator events). The `pendingAsks` map is keyed by the two canonical
strings — no `ctx.participants` lookup is required on the supervisor side.

**Ask-relay plumbing.** Today's supervisor factory wires the supervised agent's
`Ask` tool through an `onAsk` callback (`supervisor.js:396-407`) that calls
`supervisorRunner.resume(...)` and returns the supervisor's text synchronously.
That entire callback path is removed. Replacement flow, end-to-end:

- Agent calls `Ask(question)` → Step 1's new `createAskHandler` wired with
  `{ from: "agent", defaultTo: "supervisor" }` writes a pending entry keyed by
  `"supervisor"` and publishes via
  `messageBus.ask("agent", "supervisor", question, askId)`. Agent's turn ends.
- `#endOfTurnReview` drains `messageBus` for the `"supervisor"` queue before
  resuming the supervisor; the agent transcript concatenation gains a
  `[ask] agent: ...` block from the drained ask (Step 2's formatter) and the
  registry-check prefix from `checkPendingAsk` (if the supervisor ignores the
  ask).
- Supervisor calls `Answer(message)` → clears the pending entry, publishes
  `messageBus.answer("supervisor", "agent", message, askId)` → the agent
  receives the answer on its next resume.

Compared to the old synchronous shape, this converts the blocking mid-tool-call
relay into a turn-boundary relay, aligning supervise mode with facilitate mode
and removing the `onAsk` promise plumbing from both factories and from
`createSupervisor`.

**Per-turn mechanics of `agent-runner.js` stay unchanged** per the spec's
Excluded section. The registry/guard hooks sit in the orchestrator wrapper, not
inside the runner's iterator consumer. The only change inside `agent-runner.js`
itself is the addition of a `taskAmend` config field (Step 5) — a plain
constructor/defaults extension with no effect on loop mechanics or ctx
checkpoints.

**Verify:** `supervisor-run.test.js`, `supervisor-output.test.js`,
`supervisor-intervention.test.js`, and the new `pending-ask.test.js` exercise
both enforcement sites. Mid-turn intervention via `#midTurnReview` and the
`onBatch` path remain unchanged — the registry only affects turn-complete
transitions.

### Step 5 — Call-site cleanup + config additions

With the toolkit (Step 1), bus (Step 2), and orchestrators (Steps 3–4) migrated,
clean the remaining call sites.

**`Facilitator` / `Supervisor` / `AgentRunner` config surface.** Add optional
fields:

- `systemPromptAmend: string?` — on `Facilitator` participant config only (each
  entry in `agentConfigs`). Appended verbatim after
  `FACILITATED_AGENT_SYSTEM_PROMPT` with a blank line. Factory-level
  concatenation in `createFacilitator`:

  ```js
  const trailer = config.systemPromptAmend
    ? `${FACILITATED_AGENT_SYSTEM_PROMPT}\n\n${config.systemPromptAmend}`
    : FACILITATED_AGENT_SYSTEM_PROMPT;
  ```

  Pass `trailer` to `systemPromptFor(config.agentProfile, trailer)`.

- `taskAmend: string?` — on `Facilitator`, `Supervisor`, and `AgentRunner`
  constructor/factory configs. Replaces the CLI-side concatenation currently
  performed in `commands/{facilitate,supervise,run}.js`. Each orchestrator
  appends it to the task string just before delivery: the run-side logic is
  `task + (this.taskAmend ? "\n\n" + this.taskAmend : "")` — appended,
  preserving today's observable concatenation order so SC 7 (b) holds. Applies
  to:
  - `Facilitator.run(task)` — before `this.facilitatorRunner.run(task)`.
  - `Supervisor.run(task)` — before `this.supervisorRunner.run(task)`.
  - `AgentRunner.run(task)` — before the `query({ prompt: task, ... })` call.

  `AgentRunner`'s `applyDefaults(deps)` function (`agent-runner.js:16-32`) gains
  one line: `taskAmend: deps.taskAmend ?? null`. No behavioral change to the
  per-turn loop; loop mechanics stay unchanged per spec § Excluded. Opaque
  string. No interpretation.

**CLI layer cleanup.** Remove the `taskAmend` concatenation from
`commands/facilitate.js`, `commands/supervise.js`, `commands/run.js`; the CLI
now forwards `--task-amend` value into the respective factory/constructor's
`taskAmend` option. Option parsing stays the same; only the point of
concatenation moves.

**Index exports.** `libraries/libeval/src/index.js` currently re-exports
`createOrchestrationContext`, `createSupervisorToolServer`,
`createSupervisedAgentToolServer`, `createFacilitatorToolServer`,
`createFacilitatedAgentToolServer` (server factories only — no handler factories
are exported today). After this step, the same set of names still exports —
`createSupervisedAgentToolServer` has lost its `onAsk` parameter (Step 1) but
the export name is unchanged. No additions, no deletions to `index.js`.

**Participants list shape.** Unchanged. `ctx.participants` still
`[{name, role}, ...]`.

**Final grep — tool names.** Run a pair of greps in `libraries/libeval/src/`
plus `libraries/libeval/test/`:

```bash
# No Zod schema or handler uses the removed tool names.
grep -RnE '"Tell"|"Share"' libraries/libeval/src libraries/libeval/test
# No Zod `tool("Tell"` or `tool("Share"` constructs.
grep -Rn 'tool("Tell\|tool("Share' libraries/libeval/src
```

Both must return zero matches. Comments mentioning "shared" or "Tell me" are
unaffected — the greps target the double-quoted tool-name literals the SDK
recognises.

**Verify:** `bun run check` across the package compiles; `bun run format` leaves
the tree clean.

### Step 6 — Test coverage

Rewrite and extend tests in one coherent pass so CI runs once against the full
surface.

**`test/orchestration-toolkit.test.js`** — rewrite the handler suite:

- `Ask` handler with explicit `to` registers one `ctx.pendingAsks` entry keyed
  by that addressee, publishes to the bus via `ask()`, returns ack.
- `Ask` handler with facilitator's `defaultTo: undefined` and no `to` argument
  registers one entry per non-asker participant (broadcast semantics); verify
  `ctx.pendingAsks.size === participants.length - 1`.
- `Ask` handler with participant's `defaultTo: "facilitator"` and no `to`
  argument registers exactly one entry keyed by `"facilitator"`.
- `Answer` handler clears the matching pending entry (keyed by the answerer's
  `from`) and publishes to the bus via `answer()`.
- `Answer` handler returns `isError: true` when no pending ask matches `from`.
- `Announce` handler publishes via `announce()` and does **not** touch
  `pendingAsks`.
- `RollCall`, `Redirect`, `Conclude` — existing tests stay; rename only where
  they pass input shaped for removed tools.
- Four server-factory tests (`create*ToolServer returns sdk-type server`)
  continue to pass after the rename — update expected tool-name lists to
  `["Ask", "Announce", "Conclude", "Redirect", "RollCall"]` for
  facilitator/supervisor and `["Ask", "Answer", "Announce", "RollCall"]` for the
  two participant-side servers.

**`test/message-bus.test.js`** — rewrite around `ask` / `answer` / `announce` /
`synthetic`. One case per method covering delivery, broadcast-except-sender
semantics, and queue drain. Existing `waitForMessages` + `createMessageBus`
tests stay.

**`test/facilitator.test.js`** — update existing scenarios:

- Rename helper builders (`tellMsg` → `askMsg`, `shareMsg` → `announceMsg`, add
  `answerMsg`).
- Rename toolDispatcher keys.
- Update message-format assertions to expect `[ask]` / `[answer]` / `[announce]`
  prefixes.
- Adjust "lazy start" / "fail-fast" / "turn 0 Conclude" test bodies to use
  `Ask`/`Answer`/`Announce` wording — behavior asserted is unchanged.

**`test/supervisor-output.test.js`** — update the four prompt-constant
assertions:

- Positive: `SUPERVISOR_SYSTEM_PROMPT` and `AGENT_SYSTEM_PROMPT` each include
  the tool names `"Ask"`, `"Answer"`, `"Announce"`.
- Negative (SC 4, enforcement-free): neither prompt includes
  `"EVALUATION_COMPLETE"`, `"EVALUATION_INTERVENTION"`, `"then Answer"`,
  `"then Share"`, `"respond via"`, `"stop making tool calls"`, `"must "`, or
  `"before your turn"`.
- Negative (SC 4, domain-agnostic): neither prompt includes `"kata-"`,
  `"storyboard"`, `"coaching"`, `"Toyota"`, or `"meeting"`.

Add a parallel suite in `test/facilitator.test.js` (new top-level `describe`
block) running the same positive + negative assertions against
`FACILITATOR_SYSTEM_PROMPT` and `FACILITATED_AGENT_SYSTEM_PROMPT` so all four
prompts are covered.

**`test/supervisor-run.test.js`, `supervisor-intervention.test.js`,
`supervisor-batching.test.js`** — mechanical renames (`Tell`→`Ask`,
`Share`→`Announce`, `Ask`→`Answer` on the reply side). Drop every reference to
the `onAsk` callback — both supervisor-side and agent-side constructors no
longer accept it.

**`test/pending-ask.test.js` (new)** — focused coverage of the registry and
guard. At minimum:

- **SC 2 — registry transitions.** `Ask` handler sets a pending entry; `Answer`
  handler clears it; `Announce` handler leaves `pendingAsks` untouched.
- **Facilitated, happy path.** `Ask` registers, agent `Answer` clears, no
  `protocol_violation` event on the wire.
- **Facilitated, one reminder.** `Ask` registers, agent ignores once, helper
  queues synthetic reminder, agent answers → no `protocol_violation`.
- **SC 3 — facilitated violation.** `Ask` registers, agent ignores twice,
  `protocol_violation` event appears **exactly once**, the facilitator receives
  the synthetic `"[no answer: … ]"` string on its queue, and the session
  advances to the next event without deadlocking.
- **Supervised mode.** Same three cases keyed on the `"supervisor"`/`"agent"`
  pair, covering both enforcement sites (§ Step 4): supervisor→agent and
  agent→supervisor asks.
- **Broadcast facilitator `Ask`.** Three participants, one ignores.
  `protocol_violation` is emitted only for the ignoring participant; the other
  two answers clear their entries; the facilitator's queue receives two `answer`
  messages plus one synthetic no-answer.
- **SC 7 (a) — `systemPromptAmend` delivery.** Construct a `Facilitator` with
  one participant whose config includes `systemPromptAmend: "<TEST_MARKER>"`.
  Inspect `facilitator.agents[0].runner.systemPrompt` — the `append` field must
  end with the marker string, and the literal `FACILITATED_AGENT_SYSTEM_PROMPT`
  must appear before it. Repeat with `systemPromptAmend` absent and assert the
  `append` field equals `FACILITATED_AGENT_SYSTEM_PROMPT` verbatim — the
  "absence leaves the prompt purely generic" clause.
- **SC 7 (b) — `taskAmend` delivery.** Construct a `Facilitator`, `Supervisor`,
  and `AgentRunner` with `taskAmend: "<TEST_APPEND>"`. Stub the underlying SDK
  `query` to capture the first `prompt` argument. Assert the captured prompt
  equals `<task> + "\n\n" + "<TEST_APPEND>"` for each orchestrator — preserving
  the concatenation shape `commands/{facilitate,supervise,run}.js` produced
  previously.
- **`orchestrator-filter`.** `protocol_violation` is **not** in the suppressed
  set (direct import of `isSuppressedOrchestratorEvent` with
  `{type: "protocol_violation"}` returns `false`).

**`test/mock-runner.js`** — no structural edits; scripted `toolDispatcher`
entries in individual test files switch their keys from `Tell`/`Share` to
`Ask`/`Answer`/`Announce`, but `mock-runner.js` itself remains agnostic to tool
names (verified by reading its source). Drop `mock-runner.js` from the
"Modified" list in § Blast radius.

**Verify:** `bun run test` passes the full libeval suite. The
`pending-ask.test.js` file drives SC 2, SC 3, and the SC 10 clause about
`protocol_violation` event shape.

### Step 7 — Final `bun run check` + self-review

Before pushing:

- `bun run check` — type-and-lint clean across the package.
- `bun run test` — all suites green, including the new `pending-ask` suite.
- Step 6's prompt-content tests are the machine-checked SC 4 gate. As a human
  double-check, print each of the four prompt constants from `facilitator.js` /
  `supervisor.js` and eyeball the text — inspecting the string values, not the
  identifier names, so the audit catches anything the tests miss.
- `grep -RnE '"Tell"|"Share"' libraries/libeval/src libraries/libeval/test`
  returns zero matches. The quoted tool-name literals are the only Tell/Share
  usage that matters; unquoted words ("Shared state" in a comment) are fine.
- `grep -Rn 'tool("Tell\|tool("Share' libraries/libeval/src` returns zero
  matches — the Zod `tool(...)` constructors for the removed primitives are
  gone.

## Risks

- **Broadcast ask semantics.** A facilitator `Ask` with no `to` creates N
  pending entries. Design-decision trade-off: if any one participant fails to
  `Answer`, the facilitator still receives one `protocol_violation` per failing
  participant. That is the intent (each participant's obligation is
  independent), but generates more `protocol_violation` events than the
  single-participant case — invariant queries in Part 03 compare counts against
  expectations per participant, not a flat count. The invariant design
  accommodates this by asserting count == 0 on success, not a specific
  cardinality on violation.
- **Synthetic reminder pollution.** Each unanswered ask costs one extra resume
  cycle and one extra line in the trace. Acceptable — the whole point is that
  agents who would otherwise silently fail now visibly recover on the first
  retry. The trace reader can grep `kind: "synthetic"` to separate these from
  content messages.
- **Ask handler `isError`.** Returning `isError: true` from an `Answer` handler
  when no pending ask exists is a design choice to make misuse loud. A future
  test that calls `Answer` without a prior `Ask` will see the error surface back
  to the LLM, which may then retry. This is preferable to silently routing the
  text as an announcement.

## Verification

- SC 1: `grep -l "Tell\|Share" libraries/libeval/src/` returns no tool names
  (only comments/identifiers).
- SC 2: `pending-ask.test.js` covers transition from set → clear.
- SC 3: `pending-ask.test.js` covers reminder-once, then `protocol_violation`
  emission, then session advance.
- SC 4: prompt content assertions in `supervisor-output.test.js` and a parallel
  suite in `facilitator.test.js` (added in Step 6) verify the vocabulary +
  absence of enforcement/domain terms.
- SC 10: `bun run check && bun run test` green.

Out of scope for this part (belong to Parts 02 and 03): SC 5 (kata-session
directory), SC 6 (repo grep), SC 7 beyond the libeval test of the
`systemPromptAmend` delivery mechanism, SC 8 (workflow task-text), SC 9
(invariant entries).

## Agent routing

`staff-engineer`. Runtime, library code, tests. Follows the full
`kata-implement` checklist, including DO-CONFIRM's push + PR gate.
