# Plan 0850-a — libeval Trace Artifact Secret Redaction

Implements [spec.md](spec.md) under the architecture in [design-a.md](design-a.md).

## Approach

Land the producer-side `Redactor` bottom-up so each layer is independently
testable: `redaction.js` + unit tests, then `AgentRunner` / `Supervisor` /
`Facilitator` (constructor dep + redact at every persistent-sink seam),
then the three command entrypoints (build the redactor as the first
post-parse side-effect), then update existing test fixtures to pass
`createNoopRedactor()`, then producer-side integration tests, then docs.

Libraries used: none. `redaction.js` is plain JS over Node built-ins; allowlist + regex composition only.

## Steps

### 1. `redaction.js` module + unit tests

- **Created:** `libraries/libeval/src/redaction.js`

```js
/**
 * Redactor — replaces secrets in JSON-serialisable values before they reach
 * the trace artifact. Composes two layers: an env-var value allowlist and a
 * set of credential-shape regexes. Both run on every primitive string.
 *
 * Stateless after construction: `env` is captured once so in-process
 * `process.env` writes (e.g. agent-runner.js LIBEVAL_SKILL, commands/run.js
 * LIBEVAL_AGENT_PROFILE) cannot smuggle a value past the redactor.
 */

export const DEFAULT_ENV_ALLOWLIST = Object.freeze([
  "ANTHROPIC_API_KEY",
  "GH_TOKEN",
  "GITHUB_TOKEN",
]);

// Anchored prefixes per
// https://github.blog/security/application-security/behind-githubs-new-authentication-token-formats/
// Anthropic prefix is heuristic — the env-allowlist layer is the primary
// defence for Anthropic keys.
export const DEFAULT_PATTERNS = Object.freeze([
  { kind: "anthropic", regex: /sk-ant-[A-Za-z0-9_-]{80,}/g },
  { kind: "gh-pat", regex: /\bghp_[A-Za-z0-9]{36}\b/g },
  { kind: "gh-installation", regex: /\bghs_[A-Za-z0-9]{36}\b/g },
  { kind: "gh-oauth", regex: /\bgho_[A-Za-z0-9]{36}\b/g },
  { kind: "gh-fine-grained", regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g },
]);

const ENV_PLACEHOLDER = (name) => `[REDACTED:env:${name}]`;
const PATTERN_PLACEHOLDER = (kind) => `[REDACTED:pattern:${kind}]`;

/**
 * Build a frozen { name → value } snapshot of the requested env vars.
 * Empty strings are skipped — a leaked empty env var would otherwise
 * cause every empty string in the trace to be replaced.
 */
function snapshotEnv(env, allowlist) {
  const snap = {};
  for (const name of allowlist) {
    const v = env[name];
    if (typeof v === "string" && v.length > 0) snap[name] = v;
  }
  return Object.freeze(snap);
}

/** Recursively walk and redact a JSON-serialisable value in place-free style. */
function walk(value, redactString) {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((v) => walk(v, redactString));
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value)) out[k] = walk(value[k], redactString);
    return out;
  }
  return value;
}

export class Redactor {
  constructor({ envSnapshot, patterns, enabled }) {
    this.envSnapshot = envSnapshot;
    this.patterns = patterns;
    this.enabled = enabled;
  }

  redactValue(value) {
    if (!this.enabled) return value;
    return walk(value, (s) => this.#redactString(s));
  }

  #redactString(s) {
    let out = s;
    for (const [name, secret] of Object.entries(this.envSnapshot)) {
      if (out.includes(secret)) {
        out = out.split(secret).join(ENV_PLACEHOLDER(name));
      }
    }
    for (const { kind, regex } of this.patterns) {
      out = out.replace(regex, PATTERN_PLACEHOLDER(kind));
    }
    return out;
  }
}

export function createRedactor({
  env = process.env,
  allowlist,
  patterns = DEFAULT_PATTERNS,
  enabled,
} = {}) {
  // env-driven disable when no explicit override.
  const envDisabled = env.LIBEVAL_REDACTION_DISABLED === "1";
  const resolvedEnabled = enabled ?? !envDisabled;
  const resolvedAllowlist = allowlist ?? resolveAllowlistFromEnv(env);
  const envSnapshot = resolvedEnabled
    ? snapshotEnv(env, resolvedAllowlist)
    : Object.freeze({});
  // Per design § Opt-out surface, the warning fires whenever the redactor
  // is constructed disabled. Test fixtures that need a silent disabled
  // redactor use `createNoopRedactor()` (below), which bypasses this fn
  // by constructing `Redactor` directly.
  if (!resolvedEnabled) {
    process.stderr.write(
      "libeval: trace redaction DISABLED via LIBEVAL_REDACTION_DISABLED — secrets may appear in trace artifact\n",
    );
  }
  return new Redactor({ envSnapshot, patterns, enabled: resolvedEnabled });
}

function resolveAllowlistFromEnv(env) {
  const override = env.LIBEVAL_REDACTION_ENV_VARS;
  if (typeof override !== "string" || override.length === 0) {
    return DEFAULT_ENV_ALLOWLIST;
  }
  return override
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function createNoopRedactor() {
  return new Redactor({
    envSnapshot: Object.freeze({}),
    patterns: [],
    enabled: false,
  });
}
```

- **Created:** `libraries/libeval/test/redaction.test.js` — covers spec
  criteria 1–3 in isolation:

| Case | Asserts |
| --- | --- |
| Default allowlist replaces each sentinel with `[REDACTED:env:NAME]` across a deep-walked fixture (string, array, nested object, mixed primitives) covering `tool_use.input.*`, `tool_result.content`, assistant `text`, orchestrator `summary`, system payloads | criterion 1 |
| Each pattern at canonical length yields `[REDACTED:pattern:KIND]` with no env vars set; covers all five `DEFAULT_PATTERNS` plus an Anthropic key embedded inside `tool_result.content` JSON | criterion 2 |
| Benign fixtures pass through identically: prose, Markdown, URLs, full-length git SHAs (40 hex), UUIDs, `ghp_` prefix at <36 chars, quoted shell commands | criterion 3 |
| `LIBEVAL_REDACTION_ENV_VARS=FOO,BAR` replaces (not extends) the allowlist; default names not redacted | design § Default env-var allowlist |
| `LIBEVAL_REDACTION_DISABLED=1` disables redaction and emits the stderr warning exactly once; `LIBEVAL_REDACTION_DISABLED=true` and `LIBEVAL_REDACTION_DISABLED=yes` do **not** disable (literal `"1"` is the documented contract) | design § Opt-out surface, criterion 4 |
| Programmatic `createRedactor({ enabled: false })` also fires the stderr warning (per design § Opt-out surface — the warning fires whenever the redactor is constructed disabled, regardless of cause). Test fixtures that need silent disabling call `createNoopRedactor()`, which bypasses `createRedactor` by constructing `Redactor` directly | design § Opt-out surface |
| Disabled Redactor's `redactValue` returns its top-level input by reference (assert `redactor.redactValue(obj) === obj`); the walk path is not invoked when `enabled === false` | design § Interfaces (identity-on-disabled contract) |
| Empty-string env values do not poison redaction (`FOO=""` does not turn every `""` in the input into a placeholder) | snapshotEnv guard |
| Sentinels with JSON-special chars (`"`, `\`, control chars) are excluded from sentinel fixtures via a guard helper that throws if a test seeds one — locks the design's "JSON-stable strings" rule into the test layer | design § Test surfaces |
| `createNoopRedactor()` returns a `Redactor` whose `redactValue` is the identity function, equivalent to `createRedactor({ enabled: false })` on the redact-value contract; the noop helper is the test/library export and never fires the stderr warning regardless of env state | design § Interfaces |
| Adversarial `\b`-boundary cases — confirms the regex behaviour the Risks table relies on: `-ghp_<36>` matches, `_ghp_<36>` does NOT match (no `\b` between `_` and `g`), `.ghp_<36>` matches, `ghp_<36>` followed by `,`/`;`/`\n` matches, `ghp_<37>` (one extra word char) does NOT match | Risks table |

Verify: `bun test libraries/libeval/test/redaction.test.js` green.

### 2. `AgentRunner` constructor + `#recordLine`

- **Modified:** `libraries/libeval/src/agent-runner.js`

Constructor (required dep — fail loud if a caller forgets it):

```js
// before (line 53–62)
constructor(deps) {
  if (!deps.cwd) throw new Error("cwd is required");
  if (!deps.query) throw new Error("query is required");
  if (!deps.output) throw new Error("output is required");
  Object.assign(this, applyDefaults(deps));
  // ...
}

// after
constructor(deps) {
  if (!deps.cwd) throw new Error("cwd is required");
  if (!deps.query) throw new Error("query is required");
  if (!deps.output) throw new Error("output is required");
  if (!deps.redactor) throw new Error("redactor is required");
  Object.assign(this, applyDefaults(deps));
  this.redactor = deps.redactor;
  // ...
}
```

`#recordLine` redacts the SDK message **before** `JSON.stringify`, per design
decision 6 (walk-then-serialise):

```js
// before (line 205–210)
#recordLine(message, state) {
  const line = JSON.stringify(message);
  this.output.write(line + "\n");
  this.buffer.push(line);
  if (this.onLine) this.onLine(line);
  if (this.onBatch) state.pendingBatch.push(line);
  // ... session-id / text-block tracking
}

// after
#recordLine(message, state) {
  const redacted = this.redactor.redactValue(message);
  const line = JSON.stringify(redacted);
  this.output.write(line + "\n");
  this.buffer.push(line);
  if (this.onLine) this.onLine(line);
  if (this.onBatch) state.pendingBatch.push(line);
  // Session-id / text-block tracking continues to read the ORIGINAL
  // `message` (these fields are not secret carriers — see design § Walk-
  // then-serialise rationale).
  if (message.type === "system" && message.subtype === "init") {
    this.sessionId = message.session_id;
  }
  if (message.type === "assistant") {
    if (hasTextBlock(message)) state.assistantTextCount++;
    trackSkillInvocation(message);
  }
}
```

Verify: existing `agent-runner.test.js` and `agent-runner-batching.test.js`
fail until step 6 updates them; that is the mechanical lock-step. Add one
new constructor test in this step:

```js
test("constructor throws on missing redactor", () => {
  assert.throws(
    () => new AgentRunner({ cwd: "/tmp", query: async function*(){}, output: new PassThrough() }),
    /redactor is required/,
  );
});
```

Run `bun test libraries/libeval/test/agent-runner.test.js -t "throws on missing redactor"`.

### 3. `Supervisor` constructor + `emit*` seams + factory

- **Modified:** `libraries/libeval/src/supervisor.js`

Constructor:

```js
// before (constructor signature, line 69–95)
constructor({ agentRunner, supervisorRunner, output, maxTurns, ctx, messageBus, taskAmend }) {
  if (!agentRunner) throw new Error("agentRunner is required");
  if (!supervisorRunner) throw new Error("supervisorRunner is required");
  if (!output) throw new Error("output is required");
  // ...
}

// after
constructor({ agentRunner, supervisorRunner, output, maxTurns, ctx, messageBus, taskAmend, redactor }) {
  if (!agentRunner) throw new Error("agentRunner is required");
  if (!supervisorRunner) throw new Error("supervisorRunner is required");
  if (!output) throw new Error("output is required");
  if (!redactor) throw new Error("redactor is required");
  this.redactor = redactor;
  // ...
}
```

Each `emit*` method redacts its constructed event object **before**
`JSON.stringify` and `output.write`. The pattern is the same in all three;
shown for `emitLine`:

```js
// before (line 402–410)
emitLine(line) {
  const event = JSON.parse(line);
  const tagged = { source: this.currentSource, seq: this.counter.next(), event };
  this.output.write(JSON.stringify(tagged) + "\n");
}

// after
emitLine(line) {
  const event = JSON.parse(line);
  const tagged = { source: this.currentSource, seq: this.counter.next(), event };
  this.output.write(JSON.stringify(this.redactor.redactValue(tagged)) + "\n");
}
```

Apply the same `this.redactor.redactValue(...)` wrap inside `emitOrchestratorEvent`
(line 430) and `emitSummary` (line 444). See design § Components for the
seam catalogue and the `emitSummary` / `Conclude` rationale.

Factory `createSupervisor` (line 486–579): build **both** runners
(`agentRunner` at line 530–541 and `supervisorRunner` at line 548–567) with
the same `redactor` instance the caller passed in, and forward it to the
`new Supervisor({...})` call:

```js
// agentRunner — before (line 530)
const agentRunner = createAgentRunner({ cwd: agentCwd, query, output: devNull, /* ... */ });

// agentRunner — after
const agentRunner = createAgentRunner({ cwd: agentCwd, query, output: devNull, redactor, /* ... */ });

// supervisorRunner — before (line 548)
const supervisorRunner = createAgentRunner({ cwd: supervisorCwd, query, output: devNull, /* ... */ });

// supervisorRunner — after
const supervisorRunner = createAgentRunner({ cwd: supervisorCwd, query, output: devNull, redactor, /* ... */ });
```

Add `redactor` to the `createSupervisor({...})` JSDoc-typed parameter list and
to the `new Supervisor({...})` call near the bottom (line 569). The factory
signature gains `redactor` as a **required** parameter — throw at the top
of `createSupervisor` (`if (!redactor) throw new Error("redactor is required")`) —
matching the constructor contract one level down so the failure surfaces at
the entry point rather than inside the runner.

Verify: `bun test libraries/libeval/test/supervisor-factory.test.js` —
expect failures in tests that build the factory without `redactor`; step 6
updates them. Add one factory-throws test in this step:

```js
test("createSupervisor throws on missing redactor", () => {
  assert.throws(
    () => createSupervisor({ ...baseOpts() /* no redactor */ }),
    /redactor is required/,
  );
});
```

`baseOpts()` (the existing test helper) gains a `redactor: createNoopRedactor()`
field for every other test in the same file.

### 4. `Facilitator` constructor + `emit*` seams + factory

- **Modified:** `libraries/libeval/src/facilitator.js`

Mirrors step 3. Constructor (line 53–80) — note: the existing facilitator
constructor lacks the throw-on-missing pattern that AgentRunner and
Supervisor use, so add it explicitly:

```js
// before (around line 62, where other field assignments happen)
constructor({ facilitatorRunner, agents, messageBus, output, /* ... */ }) {
  this.facilitatorRunner = facilitatorRunner;
  // ...
}

// after — add the throw at the top, matching AgentRunner/Supervisor
constructor({ facilitatorRunner, agents, messageBus, output, /* ... */, redactor }) {
  if (!redactor) throw new Error("redactor is required");
  this.redactor = redactor;
  this.facilitatorRunner = facilitatorRunner;
  // ...
}
```

Each of `emitLine` (line 327), `emitOrchestratorEvent` (line 341), and
`emitSummary` (line 354) redacts the constructed event object before
`JSON.stringify` — same pattern as supervisor step 3 above. `emitLine`
takes `(source, line)` and the source string is not a secret carrier;
keeping it inside the walked object preserves symmetry with supervisor.

Factory `createFacilitator` (line 391–480) gains `redactor` as a required
parameter (`if (!redactor) throw new Error("redactor is required")` at
the top), propagates it into both `createAgentRunner` calls (the agent
runner at line 438 and the facilitator runner at line 454), and forwards
it to the `new Facilitator({...})` call (line 469).

Verify: `bun test libraries/libeval/test/facilitator.test.js` and
`facilitator-redirect.test.js` — same lock-step failure pattern as step 3.
Add a `createFacilitator throws on missing redactor` test inside
`facilitator.test.js` (no separate `facilitator-factory.test.js` file
exists today; group the throw test next to the existing facilitator-shape
tests).

### 5. Command entrypoints + `index.js` exports

- **Modified:** `libraries/libeval/src/commands/run.js`

Three local edits — keep the existing destructured `parseRunOptions` return
shape so downstream references (`taskContent`, `cwd`, `outputPath`,
`agentProfile`, etc.) stay valid; only insert the redactor and route it
through `onLine` and `createAgentRunner`. Per design key decision 7, the
redactor is built immediately after `parseRunOptions(values)` returns —
before the existing `process.env.LIBEVAL_AGENT_PROFILE = agentProfile`
write at line 98 (which precedes `createAgentRunner` at line 108).

(a) Insert the redactor construction directly after `parseRunOptions`
(between current lines 62 and 64). `createRedactor` reads
`LIBEVAL_REDACTION_DISABLED` and `LIBEVAL_REDACTION_ENV_VARS` itself from
`process.env`, so commands pass no parameters:

```js
// new — between current lines 62 and 64
const redactor = createRedactor();
```

Add the matching `import { createRedactor } from "../redaction.js";` at the
top.

(b) Wrap the `onLine` envelope (current lines 77–82) so the
`{source, seq, event}` outer object passes through the redactor — see
design § Components ("outer envelope redact"):

```js
// before (lines 77–82)
const onLine = (line) => {
  const event = JSON.parse(line);
  output.write(
    JSON.stringify({ source: "agent", seq: counter.next(), event }) + "\n",
  );
};

// after
const onLine = (line) => {
  const event = JSON.parse(line);
  const tagged = { source: "agent", seq: counter.next(), event };
  output.write(JSON.stringify(redactor.redactValue(tagged)) + "\n");
};
```

(c) Add `redactor` to the `createAgentRunner({ ... })` call at lines
108–120 — append the field; do not change any other field.

- **Modified:** `libraries/libeval/src/commands/supervise.js` (line 60+) —
  same redactor construction, passed to `createSupervisor`. Supervise mode
  has no command-level `onLine` envelope; the supervisor's own `emit*`
  seams already cover both layers. Build the redactor immediately after
  `parseSuperviseOptions(values)` returns and **before** the existing
  `process.env.LIBEVAL_AGENT_PROFILE = opts.agentProfile` write at line
  89, so the env snapshot freezes before any in-process write (design key
  decision 7).

```js
const opts = parseSuperviseOptions(values);
const redactor = createRedactor();
// ... existing fileStream / output / mcp setup ...
const supervisor = createSupervisor({ /* existing fields */, redactor });
```

- **Modified:** `libraries/libeval/src/commands/facilitate.js` — same as
  supervise. Build the redactor immediately after
  `parseFacilitateOptions(values)` returns and **before** the existing
  `process.env.LIBEVAL_AGENT_PROFILE = opts.facilitatorProfile` write at
  line 77; pass it to `createFacilitator({ /* existing */, redactor })`.

- **Modified:** `libraries/libeval/src/index.js` — append:

```js
export {
  Redactor,
  createRedactor,
  createNoopRedactor,
  DEFAULT_ENV_ALLOWLIST,
  DEFAULT_PATTERNS,
} from "./redaction.js";
```

Verify: the three commands import their respective factories from the
already-exported package surface; no new test in this step (the producer-
side integration test in step 7 covers the wiring end-to-end).

### 6. Update existing tests to pass `createNoopRedactor()`

Every test that constructs `AgentRunner`, `Supervisor`, or `Facilitator`
directly (or via factory) gains a `redactor: createNoopRedactor()` field.
The mock runner factory `test/mock-runner.js` is the keystone — fixing it
covers most supervisor/facilitator tests transitively.

| File | Construction sites | Change |
| --- | --- | --- |
| `libraries/libeval/test/mock-runner.js` | `new AgentRunner` (line 44) | Pass `redactor: createNoopRedactor()`. Import from `../src/redaction.js`. |
| `libraries/libeval/test/agent-runner.test.js` | 13 sites need the noop pass: 12 `new AgentRunner` + 1 `createAgentRunner`. Three additional `new AgentRunner` sites (lines 27, 37, 45) are pre-existing throws-on-missing-{cwd,query,output} tests left untouched — they assert pre-redactor failures fire first. | Add a shared `noop` const at the top of the describe block and pass it on every construction-that-needs-it. The new "throws on missing redactor" test from step 2 lives next to the existing throws tests. |
| `libraries/libeval/test/agent-runner-batching.test.js` | 9 `new AgentRunner` sites | Same noop const + pass-through pattern. |
| `libraries/libeval/test/agent-runner-skill-env.test.js` | 3 `new AgentRunner` sites | Same. |
| `libraries/libeval/test/supervisor-output.test.js` | 5 `new Supervisor` sites | Same. The mock runners are built via `createMockRunner` (already fixed via mock-runner.js). |
| `libraries/libeval/test/supervisor-run.test.js` | 9 `new Supervisor` sites total (3 are throws-on-missing-{agentRunner,supervisorRunner,output} at lines 38, 49, 60 left untouched; 6 active sites need the noop pass) | Same. |
| `libraries/libeval/test/supervisor-intervention.test.js` | 3 `new Supervisor` sites | Same. |
| `libraries/libeval/test/supervisor-batching.test.js` | 2 `new Supervisor` sites | Same. |
| `libraries/libeval/test/supervisor-factory.test.js` | factory-shape baseOpts() | Add `redactor: createNoopRedactor()` to `baseOpts()`; the new throws-on-missing test from step 3 sits beside it. |
| `libraries/libeval/test/facilitator.test.js` | 6 `new Facilitator` sites | Same. |
| `libraries/libeval/test/facilitator-redirect.test.js` | 1 `new Facilitator` site | Same. |
| `libraries/libeval/test/pending-ask.test.js` | 4 `new Facilitator` + 1 `new Supervisor` | Same. |
| `libraries/libeval/test/amend.test.js` | 5 sites total — 2 `createFacilitator` (lines 33, 56), 1 `createAgentRunner` (line 72), 1 `new Facilitator` (line 104), 1 `new Supervisor` (line 138) | Same noop pass on every site. |

Verify: `cd libraries/libeval && bun test` — green across the existing
suite (no behavioral change; redactor is identity for all of these).

### 7. Producer-side integration test

- **Created:** `libraries/libeval/test/redaction-pipeline.test.js`

Covers spec criteria 1, 2, 4, 5 against the assembled producer pipeline.
Important: this test instantiates a **real** `AgentRunner` with a
script-driven async-generator `query` (the same shape used by
`agent-runner.test.js`) — *not* `createMockRunner`, whose
`runner.run`/`runner.resume` overrides bypass `#recordLine` (where the
runner-level redactor lives). For the `Supervisor` case below, the
runners passed into `createSupervisor` are also real `AgentRunner`
instances; the `query` is a stub that yields the scripted messages.
File-byte capture uses a `PassThrough` (or test-only `Writable`) wrapping
`fileStream`; assertions read from the buffered chunks.

| Case | Setup | Assertion |
| --- | --- | --- |
| Sentinel in every carrier shape never reaches `fileStream` | `process.env` set to unique sentinels for each default-allowlist name. Real `AgentRunner` driven by a stub async-generator `query` that yields scripted messages with the sentinels in `tool_use.input.command`, `tool_result.content` (string and JSON-stringified object forms), assistant `text`, and a `system` `init` payload field. Output is a `TeeWriter` whose `fileStream` is a `PassThrough` collected into a buffer. | The collected bytes contain no sentinel substring; every sentinel position is `[REDACTED:env:NAME]`. JSON-stable sentinel guard helper enforced (criterion 1, design § Test surfaces). |
| Pattern hits with no env set | Same harness with `process.env` cleared of allowlist names; messages carry an `sk-ant-`+80-char body, `ghp_`+36, `ghs_`+36, `gho_`+36, `github_pat_`+82. | Each yields `[REDACTED:pattern:KIND]` (criterion 2). |
| Default-on, opt-out warning | Construct the redactor under test directly: `createRedactor({ env: { LIBEVAL_REDACTION_DISABLED: "1" } })` (the unit test path; this avoids mutating `process.env`). Stderr capture is a spy: `const orig = process.stderr.write; process.stderr.write = (chunk) => { captured.push(String(chunk)); return true; }; try { createRedactor({ env: {...} }); } finally { process.stderr.write = orig; }`. Then build a real `AgentRunner` with that redactor and feed sentinels via the stub query. | `captured.join("")` contains the documented warning string exactly once; sentinels reach `fileStream` unredacted (criterion 4). The literal-`"1"` contract is covered separately in the step 1 unit test. |
| `toText()` byte-for-byte placeholder fidelity | Run sentinel + pattern fixture, capture NDJSON, replay through `TraceCollector` + `toText()`. | Both placeholder forms appear in the rendered output identically to their NDJSON form (criterion 5). |
| `Supervisor.emitSummary` covers Conclude-handler text | Bypass the factory and build `new Supervisor({...})` directly (the same pattern as `supervisor-output.test.js`) so the test owns `ctx` and can inject the redactor: `const ctx = createOrchestrationContext(); const redactor = createRedactor({ env: { ANTHROPIC_API_KEY: SENTINEL } }); const supervisor = new Supervisor({ agentRunner, supervisorRunner, output, ctx, redactor, /* ... */ });` Then call the Conclude handler between scripted message yields: `createConcludeHandler(ctx)({ verdict: "success", summary: "<sentinel>" })` — this writes into `ctx.summary` and sets `ctx.concluded`, mirroring how the real MCP server handles a `tool_use` of Conclude. Drive `supervisor.run("...")` once; on the next supervisor turn, `Supervisor` observes `ctx.concluded` and calls `emitSummary` (line 109 / 225 / 320 / 339, depending on which exit path fires first). | The `summary` event line in the collected `fileStream` bytes carries `[REDACTED:env:NAME]`, not the sentinel. This is the design risk the unit test of `redaction.js` cannot reach: the path is `Conclude` → `ctx.summary` → `Supervisor.emitSummary`, and never traverses `#recordLine`. |
| `Facilitator.emitSummary` covers Conclude-handler text (mirror of supervisor case) | Same pattern: `new Facilitator({..., ctx, redactor})` with a directly-invoked `createConcludeHandler(ctx)({ summary: "<sentinel>", verdict: "success" })`. Design § Facilitator redactor seams identifies the same Conclude-handler risk on the facilitator path; the redactor wrap at `Facilitator.emitSummary` is structurally identical, but the facilitator's exit topology differs (line 111 / 145 / 354) and a regression in either `Facilitator.emitSummary` redaction or the factory's redactor propagation would slip through a supervisor-only test. | The `summary` event line carries the placeholder, not the sentinel. |

Verify: `bun test libraries/libeval/test/redaction-pipeline.test.js` green.

### 8. Documentation

- **Modified:** `libraries/libeval/README.md` — append a `## Trace
  redaction` section after the existing `## Getting Started` block (the
  README currently stops at line 14):

```markdown
## Trace redaction

`fit-eval run`, `fit-eval supervise`, and `fit-eval facilitate` redact
secrets in trace artifacts before they reach disk. Two layers compose:

- **Env-var allowlist**, defaulting to `ANTHROPIC_API_KEY`, `GH_TOKEN`,
  `GITHUB_TOKEN`. The runtime values of these vars are replaced with
  `[REDACTED:env:NAME]` wherever they appear in tool inputs, tool
  outputs, assistant text, or orchestrator summaries. Override the list
  with `LIBEVAL_REDACTION_ENV_VARS=NAME1,NAME2,…` (replaces, not extends).
- **Credential-shape patterns**, covering Anthropic API keys (`sk-ant-`),
  GitHub PATs (`ghp_`), installation tokens (`ghs_`), OAuth tokens
  (`gho_`), and fine-grained PATs (`github_pat_`). Pattern hits become
  `[REDACTED:pattern:KIND]`.

Redaction is on by default. To disable, set `LIBEVAL_REDACTION_DISABLED=1`
— a stderr warning fires once per run. Never set this in CI on a public
repository: workflow artifacts there are downloadable through the
retention window.
```

- **Modified:** `.github/actions/kata-action-eval/README.md` — append the
  same `## Trace redaction` block as above (the file exists today at
  3.8KB), plus a one-line note: setting `LIBEVAL_REDACTION_DISABLED` in
  workflow YAML is reviewable in PR diff and is prohibited on public-repo
  CI. No changes to `action.yml` itself in this step.

Verify: `bun run check` green; `bun run format` clean. Verification
checklist for the README diff (mirrors the design's documentation
criteria — confirm each one before marking step 8 done):

- Default allowlist names listed (`ANTHROPIC_API_KEY`, `GH_TOKEN`,
  `GITHUB_TOKEN`).
- Both placeholder forms shown (`[REDACTED:env:NAME]`,
  `[REDACTED:pattern:KIND]`).
- Override env var named (`LIBEVAL_REDACTION_ENV_VARS`) with the
  replaces-not-extends semantic.
- Opt-out env var named (`LIBEVAL_REDACTION_DISABLED=1`) and the
  public-repo CI prohibition documented.

### 9. Final integration sweep

Run the full sequence end-to-end against a local stack to surface any plan
gaps before the panel. The smoke test uses a **custom allowlist name**
(`SMOKE_SENTINEL`) overriding the default via
`LIBEVAL_REDACTION_ENV_VARS` — overriding `ANTHROPIC_API_KEY` would break
SDK auth before any messages flow, so the real key stays untouched and
the redactor is exercised against a sentinel the agent's task is told to
echo.

```sh
cd libraries/libeval
bun run test
bun run check

# Producer-side smoke: custom-allowlist sentinel, run a tiny task, grep the trace.
mkdir -p /tmp/850-smoke
SENTINEL_VALUE="SMOKE_SENTINEL_$(uuidgen)"
LIBEVAL_REDACTION_ENV_VARS=SMOKE_SENTINEL \
SMOKE_SENTINEL="$SENTINEL_VALUE" \
  bunx fit-eval run \
    --task-text='echo "$SMOKE_SENTINEL" — exit immediately, no further work' \
    --output=/tmp/850-smoke/trace.ndjson \
    --max-turns=2

! grep -F "$SENTINEL_VALUE" /tmp/850-smoke/trace.ndjson
grep -F "[REDACTED:env:SMOKE_SENTINEL]" /tmp/850-smoke/trace.ndjson

# Opt-out warning fires (uses real key — task is trivial, exits without leaking).
LIBEVAL_REDACTION_DISABLED=1 bunx fit-eval run \
  --task-text='reply with the single word OK and exit' \
  --max-turns=1 2>&1 | grep -F 'redaction DISABLED'
```

Verify: the two `grep` invocations match the expected pattern (the `!`
line must NOT match — a hit is failure); the opt-out warning is observed
on stderr; `bun run test` and `bun run check` are green.

## Risks

| Risk | Why it's not visible from the plan | Mitigation |
| --- | --- | --- |
| `Buffer.from(parts[1], 'base64url')` and similar encoded credentials embedded in tool output that *don't* match the pattern prefixes will not be redacted. Spec calls this out as the env-allowlist layer's job, but a token that arrives via disk read with no env-var counterpart could leak. | Outside the pattern set; spec § Out of scope explicitly accepts this — the env allowlist is the primary defence for those carriers. | Documented in `libraries/libeval/README.md` and design § Default credential patterns. Add to the same follow-up spec that covers `agent-react.yml` Bash hardening. |
| Pattern regexes use `\b` word boundaries. JS `\w` is `[A-Za-z0-9_]`, so `_` IS a word character — a token like `_ghp_AbCd…36chars_` has no `\b` between `_` and `g`/`_` and the regex will not match. The risk is non-word neighbours (`-`, `.`, whitespace) interacting with `_`-suffixed alphabets in non-obvious ways at the right edge of a token (`ghp_…36chars_X` where `X` is alphanumeric continues the word and skips the `\b`). | Non-obvious from the regex source; needs an empirical check at canonical-length boundaries. | Step 1 test fixture includes adversarial neighbours: `-ghp_…` (matches — `\b` between `-` and `g`), `_ghp_…` (does NOT match — no `\b`), `.ghp_…` (matches), `ghp_…36chars` followed by `,` `;` `\n` (match), and the 36-char body extended by an extra word char (does not match — body length now 37, regex anchored to exactly 36). If a case behaves unexpectedly, replace `\b` with explicit `(?<![A-Za-z0-9_-])` / `(?![A-Za-z0-9_-])` lookarounds; the stable placeholder form is unaffected. |
| Existing v0.1.x consumers of `@forwardimpact/libeval` (external users importing `AgentRunner` directly) hit the new required-parameter throw on first run after upgrade. Spec did not call out an upgrade-compat surface; the package is pre-1.0, so this is a permitted breaking change. | Pre-1.0 SemVer convention — patch versions can break callers; the failure mode (throw at construction) is loud, not silent. | Bump the libeval `package.json` minor version (0.1.31 → 0.2.0) at release time and call out the breaking change in release notes. The `kata-release-cut` workflow handles version selection; flagging the breaking change in the PR body is sufficient at plan time. The published `createNoopRedactor()` export gives external consumers a zero-friction migration when they explicitly want redaction off. |

## Execution

Sequential, single agent: `staff-engineer` via `kata-implement`. Every step
depends on the prior — `redaction.js` must exist before any wiring, the
producer wiring must compile before tests can be updated, and the
documentation lands last so the prose can describe the shipped behaviour.

Step 8 (documentation) is the only step that could route to
`technical-writer`, but the README block is tightly coupled to the
allowlist names and placeholder forms introduced in steps 1 and 5;
splitting risks drift between the README and the redactor's actual
behaviour. TW remains the right reviewer post-merge for prose polish.

— Staff Engineer 🛠️
