# Plan 0570 — fit-trace Structured Introspection

## Approach

Seven changes across three layers — collector, query engine, CLI — plus a new
output filter. All work is in `libraries/libeval/`. Execution order follows data
flow: schema expansion first (collector stores new turn roles), then query
methods consume the expanded schema, then the output filter strips noise, and
finally the CLI wires it together. Tests are written alongside each layer.

The changes are additive. Existing queries against v1.0.0 traces continue to
work because the new turn roles are simply absent in old traces, and all new
query methods handle that gracefully.

## Libraries used

- **`@forwardimpact/libcli`** — `createCli` (already used by `bin/fit-trace.js`;
  `globalOptions` and per-command `options` for new flags)
- **`@forwardimpact/libconfig`** — `createScriptConfig` (already used; no new
  usage)
- **`@forwardimpact/libtelemetry`** — `createLogger` (already used; no new
  usage)

No new shared library dependencies. All changes are internal to
`@forwardimpact/libeval`.

## Step 1 — Expand TraceCollector schema

**Files modified:** `libraries/libeval/src/trace-collector.js`

### 1a. Store full init event and create system turn

**`handleSystem(event)` (line 95–106) — before:**

```js
handleSystem(event) {
  if (event.subtype === "init") {
    this.metadata = {
      timestamp: event.timestamp ?? this.now(),
      sessionId: event.session_id ?? null,
      model: event.model ?? null,
      claudeCodeVersion: event.claude_code_version ?? null,
      tools: event.tools ?? [],
      permissionMode: event.permissionMode ?? null,
    };
  }
}
```

**After:**

```js
handleSystem(event, source) {
  const { type: _type, ...payload } = event;

  if (event.subtype === "init") {
    this.metadata = {
      timestamp: event.timestamp ?? this.now(),
      sessionId: event.session_id ?? null,
      model: event.model ?? null,
      claudeCodeVersion: event.claude_code_version ?? null,
      tools: event.tools ?? [],
      permissionMode: event.permissionMode ?? null,
    };
    this.initEvent = payload;
  }

  this.turns.push({
    index: this.turnIndex++,
    role: "system",
    source,
    subtype: event.subtype ?? null,
    data: payload,
  });
}
```

**What changes:**

1. Destructure `type` once at the top of the method. The resulting `payload` is
   reused for both `this.initEvent` (inside the `if`) and the turn's `data`
   field. For init events, both fields reference the same object — this is safe
   because neither the collector nor the query engine mutates stored payloads.
2. Accept `source` parameter (supervisor envelope support — consistent with
   `handleAssistant` and `handleUser`).
3. Continue extracting curated metadata into `this.metadata` for backward
   compatibility.
4. Store full init payload (minus the `type` key) as `this.initEvent` for O(1)
   access.
5. Store _every_ system event as a `system` turn carrying `subtype` and full
   `data`. This enables init, hooks, and other system events to appear in
   `head()` and `filter()` results.

**Constructor change** — add `this.initEvent = null;` after
`this.turnIndex = 0;` (line 39).

**Caller change** — the `switch` statement in `addLine()` (line 74–89):

```js
// Before (line 75-77):
case "system":
  this.handleSystem(event);
  break;

// After:
case "system":
  this.handleSystem(event, source);
  break;
```

### 1b. Store user text messages as user turns

**`handleUser(event, source)` (line 154–176) — before:**

```js
handleUser(event, source) {
  const message = event.message;
  if (!message) return;
  const contentItems = message.content;
  if (!Array.isArray(contentItems)) return;

  for (const item of contentItems) {
    if (item.type === "tool_result") {
      this.turns.push({
        index: this.turnIndex++,
        role: "tool_result",
        source,
        toolUseId: item.tool_use_id ?? null,
        content: typeof item.content === "string"
          ? item.content
          : JSON.stringify(item.content),
        isError: item.is_error ?? false,
      });
    }
  }
}
```

**After:**

```js
handleUser(event, source) {
  const message = event.message;
  if (!message) return;
  const contentItems = message.content;
  if (!Array.isArray(contentItems)) return;

  const textBlocks = contentItems
    .filter((item) => item.type === "text")
    .map((item) => ({ type: "text", text: item.text }));

  if (textBlocks.length > 0) {
    this.turns.push({
      index: this.turnIndex++,
      role: "user",
      source,
      content: textBlocks,
    });
  }

  for (const item of contentItems) {
    if (item.type === "tool_result") {
      this.turns.push({
        index: this.turnIndex++,
        role: "tool_result",
        source,
        toolUseId: item.tool_use_id ?? null,
        content: typeof item.content === "string"
          ? item.content
          : JSON.stringify(item.content),
        isError: item.is_error ?? false,
      });
    }
  }
}
```

**What changes:** User events with text items (the task prompt is the first one)
are stored as `user` turns with a `content[]` array matching the assistant
shape. Tool results continue to be extracted into their own turns as before. A
user event with both text and tool_result items produces one user turn followed
by one or more tool_result turns (design requirement).

### 1c. Update `toJSON()` output

**`toJSON()` (line 205–227) — changes:**

1. Version from `"1.0.0"` to `"1.1.0"`.
2. Add `initEvent: this.initEvent ?? null` after the `metadata` field.

```js
toJSON() {
  return {
    version: "1.1.0",
    metadata: this.metadata ?? { /* existing default */ },
    initEvent: this.initEvent ?? null,
    turns: this.turns,
    summary: this.result ?? { /* existing default */ },
  };
}
```

### 1d. Extend `toText()` for new roles

**`toText()` (line 240–294) — add branches for `system` and `user` in the
rendering loop:**

After the `tool_result` branch (line 266–274), add:

```js
} else if (turn.role === "system") {
  const label = turn.subtype ?? "system";
  out.push(
    renderTextLine({
      source: turn.source,
      text: `[${label}]`,
      withPrefix,
    }),
  );
} else if (turn.role === "user") {
  for (const block of turn.content) {
    if (block.type === "text") {
      out.push(
        renderTextLine({
          source: turn.source,
          text: `[user] ${block.text}`,
          withPrefix,
        }),
      );
    }
  }
}
```

System turns render as `[init]` / `[hook]` / etc. — compact labels since the
full data is in JSON output. User turns render with a `[user]` prefix to
visually distinguish them from assistant text in the text output. Without this
label, the task prompt would be indistinguishable from assistant reasoning.

**Risk:** The `renderTextLine` import is already present. No new render module
needed — the existing function handles both roles. The `[subtype]` label
visually distinguishes system events in text output.

## Step 2 — Expand TraceQuery

**Files modified:** `libraries/libeval/src/trace-query.js`

### 2a. New method: `init()`

Insert after `overview()` (line 30):

```js
init() {
  return this.trace.initEvent ?? null;
}
```

Returns the full init event payload for O(1) access (SC2). Returns `null` for
v1.0.0 traces that lack the field.

### 2b. New method: `turn(index)`

Insert after `init()`:

```js
turn(index) {
  return this.turns.find((t) => t.index === index) ?? null;
}
```

Direct single-turn lookup by index (SC5). Uses `find()` not array indexing
because turn indices may not be contiguous if filtering or collection ever
changes. Returns `null` for out-of-range indices.

### 2c. New method: `filter(opts)`

Insert after `turn()`:

```js
filter(opts = {}) {
  const { role, toolName, isError } = opts;
  return this.turns.filter((turn) => {
    if (role !== undefined && turn.role !== role) return false;
    if (isError !== undefined) {
      if (turn.role !== "tool_result") return false;
      if (turn.isError !== isError) return false;
    }
    if (toolName !== undefined) {
      if (turn.role === "assistant") {
        const has = turn.content.some(
          (b) => b.type === "tool_use" && b.name === toolName,
        );
        if (!has) return false;
      } else if (turn.role === "tool_result") {
        // Cannot match tool_result to tool name without resolving toolUseId.
        // Return tool_results only when combined with role filter or isError.
        return false;
      } else {
        return false;
      }
    }
    return true;
  });
}
```

Composable AND filter (SC4). Criteria: `role` (exact string match), `toolName`
(matches assistant turns containing a tool_use block with that name), `isError`
(matches tool_result turns). The `tool()` and `errors()` methods remain as
convenience shortcuts — they predate `filter` and have established usage.

**Design note on toolName + tool_result:** The design says `filter` composes as
AND. A `tool_result` turn does not carry a `toolName` field — resolving the
`toolUseId` back to a tool name would require scanning previous turns. The
existing `tool()` method already does this resolution. Rather than duplicate
that logic, `filter({ toolName })` returns only assistant turns. Callers who
need both the tool_use and its result should use the existing `tool(name)`
method.

**Limitation: `filter({toolName, isError})` returns empty.** The `toolName`
check requires `role === "assistant"` while `isError` requires
`role === "tool_result"`. Since no turn can be both, combining them always
produces an empty array. This is an intentional trade-off — the `tool()` method
is the right tool for "errors from Bash" queries. Tests should document this
explicitly (see Step 7 test 14).

**CLI `--error` flag is one-directional.** The boolean flag only supports
filtering for errors (`isError: true`). Filtering for non-errors
(`isError: false`) is available via the programmatic API but not the CLI — the
`--no-error` pattern is not supported by `node:util parseArgs` for boolean
options. Callers wanting non-error tool_results should use
`filter --role tool_result` and exclude errors in their analysis.

### 2d. Modify `overview()` — add taskPrompt

**`overview()` (line 23–30) — after:**

```js
overview() {
  const firstUser = this.turns.find((t) => t.role === "user");
  const taskPrompt = firstUser
    ? firstUser.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
    : null;
  return {
    metadata: this.metadata,
    summary: this.summary,
    turnCount: this.turns.length,
    tools: this.toolFrequency(),
    taskPrompt,
  };
}
```

Extracts text from the first user-role turn (SC1). Returns `null` for v1.0.0
traces that have no user turns.

### 2e. Modify `search()` — add `full` option, extend to user turns

**`search()` (line 78–102) — change:**

Add `full` to destructured opts:

```js
const { context = 0, limit = 50, full = false } = opts;
```

Pass `full` through to `matchTurn`:

```js
const matches = matchTurn(turn, re, full);
```

**`matchTurn(turn, re)` (line 278–307) — complete replacement:**

```js
function matchTurn(turn, re, full = false) {
  const matches = [];
  if (turn.role === "assistant") {
    for (const block of turn.content) {
      if (block.type === "text" && re.test(block.text)) {
        re.lastIndex = 0;
        matches.push(
          full ? `text: ${block.text}` : `text: ${excerptAround(block.text, re)}`,
        );
      }
      if (block.type === "tool_use") {
        if (re.test(block.name)) {
          re.lastIndex = 0;
          matches.push(`tool_name: ${block.name}`);
        }
        const inputStr = JSON.stringify(block.input);
        if (re.test(inputStr)) {
          re.lastIndex = 0;
          matches.push(
            full
              ? `tool_input(${block.name}): ${inputStr}`
              : `tool_input(${block.name}): ${excerptAround(inputStr, re)}`,
          );
        }
      }
    }
  } else if (turn.role === "tool_result") {
    const content = turn.content ?? "";
    if (re.test(content)) {
      re.lastIndex = 0;
      matches.push(
        full ? `result: ${content}` : `result: ${excerptAround(content, re)}`,
      );
    }
  } else if (turn.role === "user") {
    for (const block of turn.content ?? []) {
      if (block.type === "text" && re.test(block.text)) {
        re.lastIndex = 0;
        matches.push(
          full
            ? `user_text: ${block.text}`
            : `user_text: ${excerptAround(block.text, re)}`,
        );
      }
    }
  }
  return matches;
}
```

Changes from current: (1) third parameter `full = false`, (2) all four match
description branches (`text`, `tool_input`, `result`, `user_text`) use full
content when `full` is true instead of excerpt, (3) new `user` role branch
searches user turn text blocks with `user_text:` prefix.

## Step 3 — Create SignatureFilter

**Files created:** `libraries/libeval/src/signature-filter.js`

```js
export function stripSignatures(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripSignatures);

  const result = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = stripSignatures(val);
  }
  if (result.type === "thinking") {
    delete result.signature;
  }
  return result;
}
```

The filter recursively walks the JSON tree. For any object with
`type === "thinking"`, it strips the `signature` field after copying all
properties. Other objects with a `signature` field are untouched. The copy-then-
delete approach avoids parent-context tracking and is straightforward to test.

The collector's `handleAssistant` passes through thinking blocks (including
signatures) via its `return block` fall-through at line 128. This is intentional
— lossless storage. The SignatureFilter handles display-time suppression.

**Files modified:** `libraries/libeval/src/index.js` — add export:

```js
export { stripSignatures } from "./signature-filter.js";
```

## Step 4 — Wire CLI

**Files modified:**

- `libraries/libeval/bin/fit-trace.js` — command definitions, global flag,
  imports
- `libraries/libeval/src/commands/trace.js` — new handlers, modified writeJSON

### 4a. New command definitions

Add to the `commands` array in `bin/fit-trace.js` (after `stats` at line 137):

```js
{
  name: "init",
  args: "<file>",
  description: "Full system/init event",
},
{
  name: "turn",
  args: "<file> <index>",
  description: "Single turn by index",
},
{
  name: "filter",
  args: "<file>",
  description: "Filter turns by structural properties",
  options: {
    role: { type: "string", description: "Turn role (system, user, assistant, tool_result)" },
    tool: { type: "string", description: "Tool name" },
    error: { type: "boolean", description: "Error results only" },
  },
},
```

### 4b. New global flag

Add `signatures` to `globalOptions` (line 139–143):

```js
globalOptions: {
  help: { type: "boolean", short: "h", description: "Show this help" },
  version: { type: "boolean", description: "Show version" },
  json: { type: "boolean", description: "Output help as JSON" },
  signatures: { type: "boolean", description: "Include thinking.signature blobs in output" },
},
```

### 4c. Modify search command options

Add `full` option to the `search` command definition:

```js
{
  name: "search",
  args: "<file> <pattern>",
  description: "Search all content for regex pattern",
  options: {
    limit: { type: "string", description: "Max results (default: 50)" },
    context: { type: "string", description: "Surrounding turns per hit (default: 0)" },
    full: { type: "boolean", description: "Full content block in match descriptions" },
  },
},
```

### 4d. Pass `values` through to handlers

Currently `main()` calls `await handler(values, args, { config })` (line 195).
The `values` object already carries all parsed options including global flags.
No change needed to the dispatch mechanism — handlers receive `values` and can
read `values.signatures`.

### 4e. New command handlers

Add to `src/commands/trace.js`:

```js
export async function runInitCommand(values, args) {
  writeJSON(loadTrace(args[0]).init(), values);
}

export async function runTurnCommand(values, args) {
  writeJSON(loadTrace(args[0]).turn(parseInt(args[1], 10)), values);
}

export async function runFilterCommand(values, args) {
  const opts = {};
  if (values.role) opts.role = values.role;
  if (values.tool) opts.toolName = values.tool;
  if (values.error) opts.isError = true;
  writeJSON(loadTrace(args[0]).filter(opts), values);
}
```

### 4f. Modify search handler for `--full`

```js
export async function runSearchCommand(values, args) {
  const limit = values.limit ? parseInt(values.limit, 10) : 50;
  const context = values.context ? parseInt(values.context, 10) : 0;
  const full = values.full ?? false;
  writeJSON(loadTrace(args[0]).search(args[1], { limit, context, full }), values);
}
```

### 4g. Modify `writeJSON` to apply SignatureFilter

```js
import { stripSignatures } from "../signature-filter.js";

function writeJSON(data, values = {}) {
  const output = values.signatures ? data : stripSignatures(data);
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}
```

All existing callers that call `writeJSON(data)` continue to work — the second
parameter defaults to `{}`, and `values.signatures` is `undefined` (falsy), so
signatures are stripped by default. New callers pass `values` through.

**Migration of existing callers:** Every existing handler calls
`writeJSON(someData)` without a second arg. To enable `--signatures` globally,
update every handler to pass `values`:

```js
export async function runOverviewCommand(values, args) {
  writeJSON(loadTrace(args[0]).overview(), values);
}
```

This is a mechanical change across the 10 handlers that call `writeJSON` — each
gains `, values` as the second argument. The `runCountCommand` and
`runTimelineCommand` handlers write directly to stdout (not through `writeJSON`)
and are unaffected. The `runRunsCommand` and `runDownloadCommand` handlers
output GitHub API data (not trace content) — `stripSignatures` is a no-op on
these since they contain no `{type: "thinking"}` objects; the recursive walk
exits quickly on shallow API response structures.

### 4h. Register new commands in COMMANDS map and imports

In `bin/fit-trace.js`:

1. Add imports: `runInitCommand, runTurnCommand, runFilterCommand`
2. Add to COMMANDS map: `init: runInitCommand`, `turn: runTurnCommand`,
   `filter: runFilterCommand`

### 4i. Add examples

Add to the `examples` array:

```js
"fit-trace init structured.json",
"fit-trace turn structured.json 3",
"fit-trace filter structured.json --role system",
"fit-trace filter structured.json --tool Bash --role assistant",
"fit-trace search structured.json 'error' --full",
```

## Step 5 — Update test fixture

**Files modified:** `libraries/libeval/test/fixtures/stream.ndjson`

Insert a user text message event between the init and first assistant event
(between current lines 1 and 2). This represents the task prompt:

```json
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Check the repository for security issues and report findings."}]},"uuid":"evt-1b","session_id":"abc-123"}
```

This gives the fixture: init → user text (task prompt) → assistant → tool_use →
tool_result → assistant → result. Matches the real Claude Code trace shape.

Also add a system hook event after init to test non-init system turn storage:

```json
{"type":"system","subtype":"hook","hook_name":"pre-tool","tool":"Bash","uuid":"evt-1c","session_id":"abc-123"}
```

Also modify the first assistant event (current line 2) to include a thinking
block with a signature, enabling SC6 verification:

```json
{"type":"assistant","message":{"model":"claude-opus-4-6","id":"msg_01","type":"message","role":"assistant","content":[{"type":"thinking","thinking":"Let me analyze the repo.","signature":"dGVzdC1zaWduYXR1cmUtYmFzZTY0LWJsb2ItZm9yLXZlcmlmaWNhdGlvbg=="},{"type":"text","text":"I'll start by checking the repository structure."}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":100,"cache_creation_input_tokens":500,"cache_read_input_tokens":200,"output_tokens":15,"service_tier":"standard"}},"session_id":"abc-123","uuid":"evt-2"}
```

This adds a `thinking` content block with a base64 `signature` field alongside
the existing `text` block. The SignatureFilter should strip the signature in
default output and preserve it with `--signatures`.

**Risk:** Existing collector tests that count turns or check turn indices will
need updating because the fixture now has more events. This is expected —
existing tests verify the current shape; updated tests verify the new shape.

## Step 6 — Update TraceCollector tests

**Files modified:** `libraries/libeval/test/trace-collector.test.js`

### New tests to add

1. **System turns stored for init** — Feed an init event, verify a system turn
   with `role: "system"`, `subtype: "init"`, and `data` containing full init
   payload appears in `toJSON().turns`.

2. **System turns stored for non-init** — Feed a hook event, verify a system
   turn with `subtype: "hook"` and appropriate data.

3. **initEvent top-level field** — Feed an init event, verify
   `toJSON().initEvent` contains the full init payload (minus the `type` key).

4. **initEvent null when no init** — Create collector without init, verify
   `toJSON().initEvent` is `null`.

5. **User text turns** — Feed a user event with text content, verify a user turn
   with `role: "user"` and `content: [{type: "text", text: "..."}]` appears.

6. **User event with both text and tool_result** — Feed a user event containing
   both text and tool_result items, verify it produces one user turn followed by
   one tool_result turn, with sequential indices.

7. **Version 1.1.0** — Verify `toJSON().version` is `"1.1.0"`.

8. **toText renders system turns** — Verify `[init]` label appears in text
   output.

9. **toText renders user text** — Verify user text appears in text output.

### Existing tests to update

Tests using `collectFixture()` and inline event construction will need
mechanical updates:

- **Version assertion** — `trace-collector.test.js` line ~315:
  `assert.strictEqual(trace.version, "1.0.0")` → `"1.1.0"`.
- **Supervised trace turn count** — `trace-collector.test.js` line ~224:
  `assert.strictEqual(trace.turns.length, 2)` → `3` (the supervised init event
  now creates a system turn in addition to the assistant and tool_result turns).
- **Fixture turn counts** — any `collectFixture()` test asserting turn count
  will increase: the fixture gains 2 system turns (init + hook) and 1 user turn,
  so total turns increase by 3.
- **Turn index assertions** — tests referencing specific turn indices (e.g.,
  `trace.turns[0].role === "assistant"`) may shift because system and user turns
  precede assistant turns in the fixture.
- **Thinking block in fixture** — the updated assistant event has a `thinking`
  block, so tests asserting specific `content` arrays on the first assistant
  turn will see the new block. Tests checking `content[0].type === "text"` may
  need to account for `content[0].type === "thinking"` preceding it.

## Step 6b — SignatureFilter tests

**Files created:** `libraries/libeval/test/signature-filter.test.js`

Tests for the `stripSignatures` pure function:

1. **Strips signature from thinking blocks** — Input
   `{type: "thinking", thinking: "text", signature: "base64..."}`, verify output
   has `type` and `thinking` but no `signature`.

2. **Preserves signature on non-thinking objects** — Input
   `{type: "text", signature: "keep-me"}`, verify `signature` is preserved.

3. **Handles nested structures** — Input with thinking blocks nested inside
   `content` arrays inside turn objects, verify only the thinking block's
   signature is stripped.

4. **Handles null and primitive inputs** — Verify `stripSignatures(null)`
   returns `null`, `stripSignatures("string")` returns `"string"`,
   `stripSignatures(42)` returns `42`.

5. **Handles arrays** — Input
   `[{type: "thinking", signature: "x"}, {type: "text"}]`, verify only the
   thinking object loses its signature.

6. **Handles deeply nested thinking blocks** — Input with thinking blocks three
   levels deep in objects, verify the signature is stripped at any depth.

## Step 7 — Update TraceQuery tests

**Files modified:** `libraries/libeval/test/trace-query.test.js`

### `buildTrace()` helper update

Add optional `initEvent` field support:

```js
function buildTrace(overrides = {}) {
  return {
    version: overrides.version ?? "1.1.0",
    metadata: { /* existing */ },
    initEvent: overrides.initEvent ?? null,
    turns: overrides.turns ?? [ /* existing default turns */ ],
    summary: { /* existing */ },
  };
}
```

### New tests to add

1. **`init()` returns initEvent** — Build trace with
   `initEvent: { subtype: "init", agents: [...] }`, verify `query.init()`
   returns it.

2. **`init()` returns null for v1.0.0 traces** — Build trace without
   `initEvent`, verify `query.init()` returns `null`.

3. **`turn(index)` returns correct turn** — Verify `query.turn(3)` returns the
   turn with `index: 3`.

4. **`turn(index)` returns null for missing index** — Verify `query.turn(999)`
   returns `null`.

5. **`filter({role})` filters by role** — Build trace with system, user,
   assistant, and tool_result turns. Verify `filter({role: "user"})` returns
   only user turns.

6. **`filter({toolName})` filters by tool** — Verify
   `filter({toolName: "Bash"})` returns assistant turns containing Bash tool_use
   blocks.

7. **`filter({isError: true})` filters errors** — Verify it returns only
   tool_result turns with `isError === true`.

8. **`filter` composes as AND** — Verify
   `filter({role: "tool_result", isError: true})` returns only error
   tool_results.

9. **`overview()` includes taskPrompt** — Build trace with a user turn, verify
   `overview().taskPrompt` contains the text.

10. **`overview()` taskPrompt null without user turns** — Build trace with no
    user turns, verify `taskPrompt` is `null`.

11. **`search()` matches user turn text** — Build trace with a user turn
    containing searchable text, verify `search("searchable")` includes a match
    with `user_text:` prefix.

12. **`search({full: true})` emits full content** — Build trace with a long text
    block, verify match description contains full block text (no `...`
    truncation).

13. **`head()` returns system and user turns** — Build trace with system turn at
    index 0, user turn at index 1, verify `head(2)` returns both.

14. **`filter({toolName, isError})` returns empty** — Build trace with Bash
    tool_use and error tool_results, verify
    `filter({toolName: "Bash", isError: true})` returns `[]`. Documents the
    known limitation (see Step 2c design note).

## Step 8 — Update kata-trace skill references

**Files modified:** `.claude/skills/kata-trace/SKILL.md`

The SKILL.md file (not `references/examples.md`, which covers grounded theory
methodology) lists available `fit-trace` commands at lines 79–86. Add the new
commands to the existing command listing:

```text
bunx fit-trace init /tmp/trace-<run-id>/structured.json
bunx fit-trace turn /tmp/trace-<run-id>/structured.json 12
bunx fit-trace filter /tmp/trace-<run-id>/structured.json --role system
bunx fit-trace filter /tmp/trace-<run-id>/structured.json --tool Bash
bunx fit-trace search /tmp/trace-<run-id>/structured.json 'error' --full
```

Also note the `--signatures` global flag in the command reference section.

## Step 9 — Verification

Run the following to confirm no regressions:

```bash
cd libraries/libeval && bun run check && bun run test
```

Then verify each SC:

| SC  | Verification                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------ |
| SC1 | `fit-trace overview test.json` output includes `taskPrompt` field                                                        |
| SC2 | `fit-trace init test.json` returns full init event with `agents`, `cwd`, `memory_paths`                                  |
| SC3 | `fit-trace head test.json 5` returns system and user turns among the first 5                                             |
| SC4 | `fit-trace filter test.json --role system` returns structured JSON                                                       |
| SC5 | `fit-trace turn test.json 3` returns a single turn                                                                       |
| SC6 | `fit-trace head test.json 2` output has no `thinking.signature`; `fit-trace head test.json 2 --signatures` includes them |
| SC7 | `fit-trace search test.json 'pattern' --full` shows full content blocks                                                  |
| SC8 | `bun run check && bun run test` pass                                                                                     |

## Blast radius

### Created

| File                                              | Purpose                                              |
| ------------------------------------------------- | ---------------------------------------------------- |
| `libraries/libeval/src/signature-filter.js`       | Pure function stripping thinking.signature from JSON |
| `libraries/libeval/test/signature-filter.test.js` | Unit tests for stripSignatures                       |

### Modified

| File                                             | Change                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `libraries/libeval/src/trace-collector.js`       | handleSystem stores system turns + initEvent; handleUser stores user turns; toJSON v1.1.0; toText renders new roles            |
| `libraries/libeval/src/trace-query.js`           | New init(), turn(), filter(); modified overview(), search(), matchTurn()                                                       |
| `libraries/libeval/src/commands/trace.js`        | New handlers (init, turn, filter); writeJSON applies SignatureFilter; all handlers pass values; search gains --full            |
| `libraries/libeval/bin/fit-trace.js`             | New command definitions (init, turn, filter); --signatures global flag; --full search option; new imports and COMMANDS entries |
| `libraries/libeval/src/index.js`                 | Export stripSignatures                                                                                                         |
| `libraries/libeval/test/fixtures/stream.ndjson`  | Add user text message and system hook events                                                                                   |
| `libraries/libeval/test/trace-collector.test.js` | New tests for system/user turns, initEvent, v1.1.0; update fixture-dependent counts                                            |
| `libraries/libeval/test/trace-query.test.js`     | New tests for init, turn, filter, taskPrompt, search --full, head with new roles; update buildTrace helper                     |
| `.claude/skills/kata-trace/SKILL.md`             | Document new commands in command listing                                                                                       |

### Deleted

None.

## Ordering and dependencies

```text
Step 1 (collector)
  ↓
Step 2 (query) + Step 3 (filter) — parallel, both depend on Step 1
  ↓
Step 4 (CLI) — depends on Steps 2 + 3
  ↓
Step 5 (fixture) — updates test data, must land before tests
  ↓
Step 6 (collector tests) + Step 6b (filter tests) + Step 7 (query tests) — parallel
  ↓
Step 8 (skill references) — independent
  ↓
Step 9 (verification)
```

## Risks

1. **Existing fixture-dependent tests break** — Expected. The fixture expansion
   changes turn counts and indices. Mitigation: update expected values
   mechanically in Steps 6–7.

2. **SignatureFilter performance on large traces** — The recursive walk visits
   every node. For traces with 0500+ turns and deep content blocks this could be
   noticeable. Mitigation: the filter runs once at output time, not per-query.
   If profiling shows a problem, replace recursion with an iterative walker.
   Unlikely to matter in practice — traces are typically 50–200 turns.

3. **`handleSystem` creates turns for all system events** — Some system events
   (e.g., rate_limit_event) may not be useful as turns. Mitigation: the current
   code already skips `rate_limit_event` via the `switch` statement — it only
   enters `handleSystem` for `type: "system"` events. The `rate_limit_event` has
   `type: "rate_limit_event"`, not `type: "system"`, so it never reaches
   `handleSystem`. No filtering needed.

4. **Backward compatibility with v1.0.0 traces** — `loadTrace()` in
   `commands/trace.js` auto-detects format by checking for `parsed.turns`. The
   new `initEvent` field is simply absent in old traces. `TraceQuery.init()`
   returns `this.trace.initEvent ?? null`. `overview().taskPrompt` returns
   `null` when no user turns exist. All backward-compatible by construction.

## Execution

Single agent: **staff-engineer**. All changes are code in `libraries/libeval/` —
no docs or wiki work. Sequential execution through Steps 1–9; the parallel
opportunities within Steps 2–3 and 5–7 are micro-optimizations that don't
justify separate agents.
