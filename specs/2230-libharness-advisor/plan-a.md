# Plan 2230-a — Native Advisor Consults for fit-harness Sessions

Implements [design-a.md](design-a.md) for [spec.md](spec.md). All work lands in
`libraries/libharness` plus one documentation page.

**Approach.** Build bottom-up along the design's component seams so every step
is independently testable before the next consumes it: first the runner's
`onPrompt` tap, then the transcript recorder, then the advisor session and
budget, then the `Advisor` tool and the extra-tools parameter on the agent
tool-server factories, then per-mode wiring (loop modes via their factories,
run mode via an extracted injectable wiring function), and finally CLI flags,
exports, and docs. Two mechanisms the design leaves open are fixed here:
(1) loop-mode advisor abort rides the loop's existing `abortController` seam —
each mode factory creates (or, in discuss, reuses) an `AbortController`,
passes it to the `OrchestrationLoop`, and registers each advisor's `abort()`
on its `signal`, so `#stop()` cancels in-flight consults with no new loop API;
(2) no `mcp__advisor__*` allowlist push anywhere — loop modes prove in-process
SDK MCP servers work under `bypassPermissions` without allowlist entries (the
orchestration server is never allowlisted), and run mode follows that
precedent rather than the external-HTTP `--mcp-server` path.

Libraries used: libutil (runtime clock surface), libmock
(`createTestRuntime`, `createMockFs`, `createToolUseMsg`),
@anthropic-ai/claude-agent-sdk (`createSdkMcpServer`, `tool`), zod.

## Step 1 — `onPrompt` tap on `AgentRunner`

Give the runner an optional callback invoked with the effective
(amend-applied) prompt of each `run` and `resume`.

- Modified: `libraries/libharness/src/agent-runner.js`,
  `libraries/libharness/test/agent-runner.test.js`

Changes:

- Constructor: `this.onPrompt = deps.onPrompt ?? null;` with a `@param` JSDoc
  line mirroring `onLine`'s.
- `run(task)`: after computing `effectiveTask`, before calling `this.query`:
  `if (this.onPrompt) this.onPrompt(effectiveTask);`
- `resume(prompt)`: same call with `prompt`.

Verification: new `agent-runner.test.js` cases — `onPrompt` receives the
amended task on `run`, the raw prompt on `resume`, and is not required
(existing tests pass unchanged).

## Step 2 — Transcript recorder

Per-participant in-memory record of composed system prompt, delivered
prompts, and session messages, rendered into the advisor's context text.

- Created: `libraries/libharness/src/transcript-recorder.js`,
  `libraries/libharness/test/transcript-recorder.test.js`

`createTranscriptRecorder({systemPrompt, redactor}) → {recordPrompt(text),
recordMessage(line), render()}`:

- `systemPrompt` is whatever the harness composed: in practice always a
  `{type:"preset", preset:"claude_code", append}` object (every recorded
  participant is an agent; leads are spec-excluded), with a plain string
  tolerated and `undefined` accepted. Normalize at construction: keep the
  string, or the preset object's `append` prefixed with a one-line
  `(claude_code preset)` note, or nothing. Redact via
  `redactor.redactValue(text)` — the seed is raw (design: message tap is
  post-redaction; seed and prompt tap are not).
- `recordPrompt(text)`: redact, append to the prompts list.
- `recordMessage(line)`: append the NDJSON line string as-is (it arrives
  already redacted from `AgentRunner.#recordLine`).
- `render()`: three tagged sections joined by blank lines, each present only
  when non-empty — `<caller_system_prompt>`, `<caller_prompts>` (prompts in
  delivery order, separated by blank lines), `<caller_transcript>` (NDJSON
  lines verbatim, one per line). Verbatim lines keep the forwarded context
  uncurated by construction; context-size curation is spec-excluded.

Verification: `transcript-recorder.test.js` — seed normalization for all
three system-prompt shapes; seed and prompt redaction (needle via a
fixed-pattern redactor); message lines pass through unredacted by the
recorder; `render()` contains all three sections in order; a second
`render()` after more messages reflects the fuller record.

## Step 3 — Advisor session, budget, prompts

The judge-shaped one-shot consult brain, its role trailer, the consult
guidance, and the shared budget object.

- Created: `libraries/libharness/src/advisor.js`,
  `libraries/libharness/test/advisor.test.js`

Contents of `advisor.js`:

- `ADVISOR_SYSTEM_PROMPT` — role trailer: consulted specialist, not a
  worker; response contract (assessment / recommendation / unsolicited
  findings) with a stated length ceiling (state "at most three short
  paragraphs" or similar explicit ceiling); read-only inspection of files
  named in the transcript is allowed; no follow-up questions; never modify
  anything; respond in one turn of prose — the final text is delivered to
  the caller verbatim.
- `advisorGuidance(maxUses)` — the consult-guidance fragment for caller
  system prompts: an `Advisor` tool is available; when a consult pays off
  (hard decision points — architectural forks, unclear root causes,
  trade-offs you cannot rank — and early, before work builds on an
  unvalidated assumption); when it does not (routine reads, writes,
  searches); the session-wide budget is `maxUses` consults shared across
  participants; consulting is your judgment, never mandatory.
- `createAdvisorBudget(maxUses) → {maxUses, used: 0}`.
- `DEFAULT_CONSULT_TIMEOUT_MS = 300_000` (design: 5 minutes).
- `createAdvisor({model, cwd, query, recorder, redactor, runtime, onLine,
  maxTurns, timeoutMs}) → {consult(question), abort()}`:
  - `model`, `cwd`, `query`, `recorder`, `redactor`, `runtime`, `onLine`
    required (throw on missing, matching factory conventions); `maxTurns`
    default 5 (judge's default — single-digit per the spec criterion);
    `timeoutMs` default `DEFAULT_CONSULT_TIMEOUT_MS`.
  - `consult(question)`: build a fresh `createAgentRunner` per call — cwd,
    query, `output` devNull, `model`, `maxTurns`, `allowedTools: ["Read",
    "Glob", "Grep"]`, `disallowedTools: ["Bash", "Write", "Edit", "Agent",
    "Task", "TaskOutput", "TaskStop"]` (under the harness's always-on
    `bypassPermissions`, `allowedTools` alone is not structural —
    `disallowedTools` is what removes tools from the model's context, the
    same treatment the lead runners get in supervisor.js/facilitator.js/
    discusser.js), `onLine` (the injected re-emitter), `settingSources:
    ["project"]`, `systemPrompt: composeSystemPrompt({role: "agent",
    trailer: ADVISOR_SYSTEM_PROMPT, runtime})`, `redactor`. Task =
    `recorder.render()` + blank line + a `<consult_question>`-tagged block
    holding the question. Arm `runtime.clock.setTimeout(() =>
    runner.currentAbortController?.abort(), timeoutMs)`; clear it in
    `finally` via `runtime.clock.clearTimeout`. Measure `durationMs` with
    `runtime.clock.now()`. Resolve:
    - runner success → `{advice: result.text, durationMs}`
    - `aborted` → `{unavailable: true, reason: "timed out or aborted",
      durationMs}`
    - error / non-success → `{unavailable: true, reason:
      result.error?.message ?? "advisor session failed", durationMs}`
    - the promise never rejects (fail-open).
  - `abort()`: aborts the in-flight runner's `currentAbortController`, if
    any. Track the current runner in a field; clear in `finally`. A consult
    is a blocking tool call, so one caller cannot overlap its own consults;
    if two callers' consults ever did overlap through one advisor (they do
    not — advisors are per-caller), the timeout guards the untracked one.

Verification: `advisor.test.js` with an injected fake `query` — exactly one
session per consult and it carries the advisor `model`; `allowedTools` is
exactly `["Read","Glob","Grep"]`, `disallowedTools` matches the list above,
and `maxTurns` is 5; forwarded prompt contains recorder-seeded system prompt,
delivered prompts, transcript lines, and the question; a second consult
re-renders the record as it stands (statelessness); final text returned as
`advice`; a hanging query times out to `{unavailable}` via a tiny real
`timeoutMs` override (libmock's clock delegates `setTimeout` to host timers,
so virtual-time advance cannot fire it); a throwing query yields
`{unavailable}`; `abort()` during a pending consult yields `{unavailable}`;
`ADVISOR_SYSTEM_PROMPT` asserts the response contract and a length ceiling
(spec criterion "Advice is bounded").

## Step 4 — `Advisor` tool and extra-tools parameter

The mode-agnostic consult surface and the seam that lets agent tool servers
carry it.

- Modified: `libraries/libharness/src/orchestration-toolkit.js`,
  `libraries/libharness/src/discuss-tools.js`
- Created: `libraries/libharness/test/advisor-tool.test.js`

Changes to `orchestration-toolkit.js`:

- `export function advisorTool({from, consult, emit, budget, model})` —
  `model` is a deliberate extension of the design's stated interface: the
  design's own `advisor_consult` event carries a `model` field the handler
  cannot otherwise supply. Builds
  `tool("Advisor", ADVISOR_DESC, {question: z.string()}, handler)`.
  `ADVISOR_DESC` states: one focused question per call, full session context
  is forwarded automatically, advice returns in the tool result, budget is
  shared session-wide. Handler:
  - budget exhausted (`budget.used >= budget.maxUses`): return a plain text
    result "Consult limit reached (N/N used) — proceed with your best
    judgment." — no consult, no event (design's sequence diagram emits only
    on the else branch).
  - otherwise increment `budget.used` synchronously **before** the first
    `await` (two concurrent callers must not both pass a last-slot check),
    then `const r = await consult(question)`, then
    `emit({type: "advisor_consult", caller: from, question, model,
    durationMs: r.durationMs, remaining: budget.maxUses - budget.used})`.
  - `r.advice` → text result: advice + `\n\n[advisor consults remaining: N]`.
  - `r.unavailable` → plain text result "The advisor is unavailable
    (<reason>) — proceed with your best judgment." Not `isError`: fail-open,
    the caller continues normally.
- `createSupervisedAgentToolServer(ctx, {extraTools = []} = {})` and
  `createFacilitatedAgentToolServer(ctx, {from, extraTools = []})` — spread
  `extraTools` after the existing tool list. SDK MCP servers take their tool
  list at construction, so the tool must be passed at build time.

Changes to `discuss-tools.js`: same parameter on
`createDiscussAgentToolServer(ctx, {from, extraTools = []})`.

Verification: handler tests — cap enforcement at the flag value with zero
`consult` invocations past it; the counter shared across two handlers built
over one budget object; event shape `{type, caller, question, model,
durationMs, remaining}` on success and on `unavailable`; no event when
exhausted; advice footer; unavailable message is not an error result; the
three agent server factories include an injected extra tool and default to
the unchanged surface.

## Step 5 — Loop-mode wiring (supervise, facilitate, discuss)

When an advisor model is configured, each mode factory constructs per agent
participant a recorder, tap composition, advisor, and `Advisor` tool, plus
one shared budget and the abort registration. Leads get nothing.

- Modified: `libraries/libharness/src/supervisor.js`,
  `libraries/libharness/src/facilitator.js`,
  `libraries/libharness/src/discusser.js`,
  `libraries/libharness/test/supervisor-factory.test.js`,
  `libraries/libharness/test/facilitator-factory.test.js`,
  `libraries/libharness/test/discusser.test.js`

Identical shape in all three factories (`createSupervisor`,
`createFacilitator`, `createDiscusser`), new deps `advisorModel` and
`advisorMaxUses`; everything below is gated on `advisorModel` being set:

1. `const budget = createAdvisorBudget(advisorMaxUses ?? 3);` — one per
   session, before the agent loop.
2. Per agent participant, in construction order (the tool server must exist
   before the runner — SDK MCP servers take their tool list at
   construction, and the runner takes `mcpServers`):
   - compose the agent system prompt with guidance folded into the existing
     amendment seam: `amend: [existingAmend, advisorGuidance(budget.maxUses)]
     .filter(Boolean).join("\n\n")` where `existingAmend` is
     `agentSystemPromptAmend` (supervise) / `config.systemPromptAmend`
     (facilitate, discuss);
   - `const recorder = createTranscriptRecorder({systemPrompt, redactor})`
     seeded with that composed prompt;
   - `const advisor = createAdvisor({model: advisorModel, cwd: <agent cwd>,
     query, recorder, redactor, runtime, onLine: (line) =>
     <instance>.emitLine("advisor", line)})` — late-bound through the
     factories' existing `let supervisor / facilitator / discusser` closure
     pattern (`discusser.loop.emitLine` in discuss);
   - `const advTool = advisorTool({from: <agent name>, consult: (q) =>
     advisor.consult(q), emit: (e) => <instance>.emitOrchestratorEvent(e),
     budget, model: advisorModel})` (discuss:
     `discusser.loop.emitOrchestratorEvent`);
   - build the agent tool server with `{extraTools: [advTool]}`;
   - build the runner with that server in `mcpServers`, `onPrompt: (text) =>
     recorder.recordPrompt(text)`, and the existing `onLine` closure
     wrapping both sinks: `(line) => { <emitLine as today>;
     recorder.recordMessage(line); }`.
3. Abort registration on the loop's stop path:
   - supervise/facilitate: create `const abortController = new
     AbortController()` in the factory, pass it through to the
     `OrchestrationLoop` (the `Supervisor` constructor must accept and
     forward `abortController` to `super`; `Facilitator`'s constructor
     already spreads deps — pass it into `new Facilitator({...})`), and
     register `abortController.signal.addEventListener("abort", () =>
     advisor.abort())` per advisor;
   - discuss: reuse the `abortController` `createDiscusser` already builds —
     add the same listener per advisor.
4. Lead runners are untouched — no recorder, no tap, no tool (spec
   exclusion). With `advisorModel` unset, every construction above is
   skipped and composed prompts are byte-identical to today's.

Verification: factory tests per mode — with `advisorModel` set, the agent
runner's orchestration server carries the `Advisor` tool (assert through
`mcpServers.orchestration.instance`'s registered-tool map, the MCP SDK's
`_registeredTools`; existing factory tests stop at `.type === "sdk"`, so
this is the first per-tool assertion — if that private surface proves
unusable, fall back to Step 4's seam coverage plus the guidance-section
proxy) and its `systemPrompt.append` contains the guidance composed
**after** an existing amendment (assert both substrings and their order);
the lead runner carries neither; with `advisorModel` unset, prompts and tool
surfaces equal today's snapshots; two facilitated agents share one budget
(exhaust via one agent's handler, observe the other's denial); loop stop
(`#stop` via a concluded session or agent crash) aborts a pending consult
(assert the consult resolves `{unavailable}`).

## Step 6 — Run-mode wiring

`run` has no orchestration machinery, so the command constructs the advisor
wiring directly, behind an injectable seam.

- Modified: `libraries/libharness/src/commands/run.js`
- Created: `libraries/libharness/test/run-advisor.test.js`

Changes to `run.js`:

- `parseRunOptions` gains `advisorModel: values["advisor-model"] ||
  undefined` and `advisorMaxUses` (default 3, parsed like `max-turns`), and
  throws `new Error("--advisor-max-uses requires --advisor-model")` when the
  max-uses flag is present without the model flag (matching
  `parseFacilitateOptions`'s throw style).
- Extract the runner construction into an exported **async**
  `wireRunSession({opts, redactor, output, counter, query, runtime})`
  returning `{runner, advisor}` so tests inject a fake `query`. It owns
  everything between option parsing and `runner.run`: the external
  `--mcp-server` entry (`await createServiceConfig("mcp")` plus its
  `allowedTools` push), the `LIBHARNESS_*` env writes, system-prompt
  composition, and the advisor wiring below. `runRunCommand` calls it with
  the real SDK `query` and otherwise behaves as today. When
  `opts.advisorModel` is set:
  - system prompt: with `agentProfile`, thread the guidance through the
    profile composer's existing amendment parameter —
    `composeProfilePrompt(agentProfile, {profilesDir, runtime, amend:
    advisorGuidance(maxUses)})`; with no profile,
    `composeSystemPrompt({role: "agent", trailer:
    advisorGuidance(maxUses), runtime})` — a preset-append prompt whose only
    session-protocol fragment is the guidance. Advisor off + no profile:
    `undefined`, today's behavior byte-for-byte.
  - budget, recorder (seeded with whichever prompt was composed), advisor
    (`onLine` re-emits under `source: "advisor"` through the same
    `SequenceCounter` and envelope shape as the existing agent `onLine`),
    and an orchestrator emit callback writing
    `{source: "orchestrator", seq: counter.next(), event}` envelope lines
    the way the command writes agent lines.
  - `mcpServers` gains `advisor: createSdkMcpServer({name: "advisor",
    tools: [advTool]})` alongside the existing optional external
    `--mcp-server` entry. No allowlist push (see Approach).
  - runner deps gain `onPrompt` feeding the recorder.
  - No stop path exists in run mode; the consult timeout is deliberately the
    only guard.

Verification: `run-advisor.test.js` via `wireRunSession` with a fake query —
advisor server present iff `advisorModel` set; guidance rides the profile
amendment when a profile is set (use a mock-fs profile) and forms the sole
protocol fragment when not; recorder seeded with the composed prompt; consult
event and `source: "advisor"` lines land in the output envelope stream with
monotonic seq; `parseRunOptions` default 3, flag override, and the usage-error
throw (`run`'s parser tests live here — Step 7's `lead-flags.test.js` owns
the other three parsers).

## Step 7 — CLI flags on the remaining commands and bin definition

Parse and thread the two flags in supervise/facilitate/discuss, and document
all four commands' flags in the libcli definition.

- Modified: `libraries/libharness/src/commands/supervise.js`,
  `libraries/libharness/src/commands/facilitate.js`,
  `libraries/libharness/src/commands/discuss.js`,
  `libraries/libharness/bin/fit-harness.js`,
  `libraries/libharness/test/lead-flags.test.js`

Changes:

- Each `parse*Options`: `advisorModel` / `advisorMaxUses` exactly as in run
  mode (same defaults, same usage-error throw); each `run*Command` threads
  both into its factory call.
- `bin/fit-harness.js`: a shared `ADVISOR_OPTIONS` block beside
  `LEAD_OPTIONS` —
  `"advisor-model"`: "Claude model for advisor consults; omitting the flag
  disables the Advisor tool (default: off)", `"advisor-max-uses"`:
  "Session-wide consult budget shared by all participants (default: 3;
  requires --advisor-model)" — spread into the `run`, `supervise`,
  `facilitate`, and `discuss` option maps.

Verification: `lead-flags.test.js` additions — the supervise, facilitate,
and discuss parsers surface the two options, default max-uses 3, and throw
on `--advisor-max-uses` without `--advisor-model` (run's parser is covered
in Step 6's `run-advisor.test.js`); `fit-harness run --help` (bin smoke)
lists both flags.

## Step 8 — Exports, docs, catalog hygiene

Publish the new surface and document it.

- Modified: `libraries/libharness/src/index.js`,
  `websites/fit/docs/libraries/coordinate-team/index.md`

Changes:

- `index.js`: export `createTranscriptRecorder`; `createAdvisor`,
  `createAdvisorBudget`, `ADVISOR_SYSTEM_PROMPT`, `advisorGuidance`,
  `DEFAULT_CONSULT_TIMEOUT_MS` from `advisor.js`; `advisorTool` from
  `orchestration-toolkit.js`.
- Guide: a new `## Consult an advisor` section after `## Tool surface by
  role` — what the advisor is (bounded, read-only, one-shot consult on a
  stronger model), the two flags with a worked `fit-harness facilitate
  --advisor-model … --advisor-max-uses …` example, the shared budget and
  its default, the fail-open contract, and how consults appear in the trace
  (`advisor_consult` orchestrator events, `source: "advisor"` lines carrying
  the advisor's own usage/cost). External-audience rules apply: no monorepo
  paths, fully-qualified URLs only. Note that the flags also apply to
  `fit-harness run`.

Verification: `bun test` green in `libraries/libharness`; `bun run check`
green at the repo root (format, lint, jsdoc, docs build).

## Execution

Single unit, one engineering agent (`staff-engineer`), sequential Steps 1→8 —
each step's tests must pass before the next starts, since each consumes the
previous seam. No decomposition: the change is one library and the seams are
too interlocked to parallelize profitably. Documentation edit (Step 8's guide
section) may be delegated to `technical-writer` if executed as a team, but it
is small enough to keep inline.

## Risks

- **SDK MCP tool availability in run mode.** The no-allowlist-push decision
  rests on loop-mode precedent (orchestration tools work without allowlist
  entries under `bypassPermissions`); unit tests cannot exercise real SDK
  permissioning. If a live run shows the Advisor tool absent, add
  `mcp__advisor__*` to run mode's allowlist push beside the `--mcp-server`
  path — one line, no design impact.
- **Late-binding references.** Advisors and their tools are built before the
  loop/command instance exists; every emit path (`emitLine("advisor", …)`,
  `emitOrchestratorEvent`) must go through the factories' existing
  `let instance` closure pattern, never a direct reference captured at build
  time — a direct capture is `undefined` at wiring and throws on the first
  consult.
- **Unbounded recorder growth.** The in-memory record grows with session
  length and tool-result size; a long session's consult can forward a very
  large context. Spec-excluded (curation is a follow-up cost lever), but the
  implementer should not "helpfully" truncate — the whole-context criterion
  asserts uncurated forwarding.
- **Prompt-snapshot brittleness.** Factory tests assert byte-identical
  composed prompts when the advisor is off; the guidance must be threaded
  only under `advisorModel` or existing snapshot tests
  (`supervisor-factory.test.js`, `profile-prompt-compose.test.js`) fail.

— Staff Engineer 🛠️
