# Plan 0540-a — Readable Agent Workflow Logs

## Approach

Build the four pure render modules (`palette`, `tool-hints`, `line-renderer`,
`orchestrator-filter`) under `libraries/libeval/src/render/`, wire `TeeWriter`
and `TraceCollector.toText()` through them, then anchor offline↔live equivalence
with a committed fixture. Execute in a single part — the files are tightly
coupled (one rendering path shared between two consumers), the blast radius is
narrow, and test coverage flows most naturally when written in step with the
module it exercises.

## Libraries used

No new shared libraries. The implementation is self-contained inside
`@forwardimpact/libeval`. All new modules are pure functions with no
dependencies outside `node:` built-ins. No imports from `@forwardimpact/lib*`
change.

## Blast radius

**Created** (7 files):

- `libraries/libeval/src/render/palette.js`
- `libraries/libeval/src/render/tool-hints.js`
- `libraries/libeval/src/render/line-renderer.js`
- `libraries/libeval/src/render/orchestrator-filter.js`
- `libraries/libeval/test/palette.test.js`
- `libraries/libeval/test/tool-hints.test.js`
- `libraries/libeval/test/fixtures/multi-agent.ndjson`

**Modified** (4 files):

- `libraries/libeval/src/tee-writer.js` — delegate formatting to render modules
- `libraries/libeval/src/trace-collector.js` — `toText()` delegates the same way
- `libraries/libeval/test/tee-writer.test.js` — extend for new behaviour
- `libraries/libeval/test/trace-collector.test.js` — tighten `toText` tests

**Deleted**: none. No files are removed; the internal helper `summarizeInput` in
`tee-writer.js` and `trace-collector.js` is replaced in place by the new render
module imports.

## Ordering and dependencies

Each step is independently verifiable — after each one, `bun run test` inside
`libraries/libeval/` must stay green. The order exists because later steps
import earlier modules.

### Step 1 — `palette.js` + `palette.test.js`

Pure module, no dependencies.

```js
// libraries/libeval/src/render/palette.js
const PALETTE = [
  "\u001b[34m", // blue
  "\u001b[32m", // green
  "\u001b[33m", // yellow
  "\u001b[35m", // magenta
  "\u001b[36m", // cyan
  "\u001b[94m", // bright blue
  "\u001b[92m", // bright green
  "\u001b[95m", // bright magenta
];
export const ERROR_COLOR = "\u001b[31m"; // red — reserved
export const RESET = "\u001b[0m";

export function colorForSource(name) {
  if (!name) return RESET;
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}
```

Tests (`palette.test.js`):

- Same name → same color across ≥ 100 invocations.
- 6 profile names (`facilitator`, `staff-engineer`, `security-engineer`,
  `product-manager`, `technical-writer`, `improvement-coach`) → 6 distinct
  colors (collision check; if a collision is ever hit the palette needs a larger
  or different ordering).
- `ERROR_COLOR === "\u001b[31m"`.
- For every supported profile, `colorForSource(name) !== ERROR_COLOR`.

**Risk**: hash collisions inside the 6-name cast. Mitigation: the test
enumerates those 6 names explicitly — if a future profile addition collides, the
test fails and the palette ordering is nudged.

### Step 2 — `tool-hints.js` + `tool-hints.test.js`

Pure module, no dependencies.

Two exports:

```js
export function hintForCall(name, input) { /* per-tool dispatch, then sanitize */ }
export function previewForResult(content, isError) { /* one line, red-prefix when error */ }
```

`hintForCall` ends every branch with a `sanitize(s)` helper that:

1. splits on newline, takes the first line,
2. removes every `{`, `}`, `"` character,
3. collapses runs of whitespace,
4. truncates to 80 chars.

`previewForResult(content, isError)` normalises the content (may be string or
object — when object, `JSON.stringify`), takes the first non-blank line,
truncates to 80 chars with `...` when truncated, and returns `"(ok)"` for empty
success / `"error: <line>"` for errors. Error previews are tagged with a
trailing `isError: true` — the caller (line-renderer) uses that tag to select
`ERROR_COLOR`. Concretely the signature returns `{ text, isError }` so the
renderer has both pieces in one call.

Tests (`tool-hints.test.js`) — one case per tool in the design table, plus:

- Input containing `"` in the value (`Bash echo "hi"`) produces no `"` in hint
  output.
- Multi-line `command` input produces a one-line hint.
- 500-char input truncates to ≤ 80 chars.
- Unknown tool name → hint is `""`.
- `previewForResult("", false)` → `{ text: "(ok)", isError: false }`.
- `previewForResult("fatal: ...", true)` →
  `{ text: "error: fatal: ...", isError: true }`.
- Multi-line content → only first non-blank line in preview.

### Step 3 — `orchestrator-filter.js`

Pure module, no dependencies.

```js
const SUPPRESSED = new Set([
  "session_start",
  "agent_start",
  "ask_received",
  "ask_answered",
  "redirect",
  "summary",
]);
export function isSuppressedOrchestratorEvent(event) {
  return Boolean(event && SUPPRESSED.has(event.type));
}
```

Tests live inside `tee-writer.test.js` (Step 6) — the predicate is tested end to
end through `TeeWriter`.

### Step 4 — `line-renderer.js`

Depends on `palette.js`. Pure.

```js
import { colorForSource, ERROR_COLOR, RESET } from "./palette.js";

export function renderTextLine({ source, text, withPrefix }) { … }
export function renderToolCallLine({ source, toolName, hint, withPrefix }) { … }
export function renderToolResultLine({ source, preview, withPrefix }) { … }
```

Each function returns a single `\n`-terminated string:

```text
[<source>] <ESC><color>…<RESET>\n
```

`withPrefix` is `true` for `supervised`/`facilitate` modes, `false` for `raw`.
`renderToolResultLine` selects `ERROR_COLOR` when `preview.isError`, else
`colorForSource(source)`. Tool-call lines render `> <ToolName> <hint>`; result
lines render `<- <preview.text>`.

No separate test file — exercised via `tee-writer.test.js` (live path) and
`trace-collector.test.js` (replay path).

### Step 5 — Wire `TeeWriter` through the render modules

Edit `libraries/libeval/src/tee-writer.js`:

- Import `{ renderTextLine, renderToolCallLine, renderToolResultLine }` from
  `./render/line-renderer.js`, `{ hintForCall, previewForResult }` from
  `./render/tool-hints.js`, `{ isSuppressedOrchestratorEvent }` from
  `./render/orchestrator-filter.js`.
- Remove the local `summarizeInput` helper.
- In `processLine`, replace the orchestrator-summary branch with:

  ```js
  if (parsed.source === "orchestrator" && isSuppressedOrchestratorEvent(parsed.event)) {
    return; // still in fileStream above; never to textStream
  }
  ```

  (removing the current `--- Evaluation … ---` emit).
- `flushTurns` walks `collector.turns` and, for each turn:
  - `assistant` text block → `renderTextLine`;
  - `assistant` tool_use → `renderToolCallLine(name, hintForCall(name, input))`;
  - `tool_result` turn →
    `renderToolResultLine(source, previewForResult(content, isError))`.
    (`TraceCollector` already records these via `handleUser`; the renderer now
    surfaces them.)
- `_final` drops the raw-mode `\n---` slice (the summary block is now owned
  exclusively by `TraceCollector.toText()` at end-of-stream, and in raw mode a
  natural `result` event already produces it). Keep `_final` emitting the
  `TraceCollector.toText()` result-line block in raw mode only, wrapped in the
  same prefix/color treatment as other lines.

**Non-obvious decision**: the renderer needs `source` per tool_result so it can
apply the calling agent's color (and red on error). `TraceCollector` currently
stores `tool_result` turns without source, because the unwrap at `addLine` drops
the envelope. Fix: when `TeeWriter.processLine` unwraps the envelope, attach
`source` onto the turn as it appears in the collector. The simplest path is to
expose `TraceCollector#setCurrentSource(source)` that `TeeWriter` calls before
`collector.addLine(line)`, and have `handleAssistant` / `handleUser` stamp that
on each new turn. This is a small, contained addition to `trace-collector.js`.

### Step 6 — Update `tee-writer.test.js`

- Existing `truncates long tool input` and `writes NDJSON … in raw mode` tests:
  update assertions — no `> Tool: Bash {"command":"ls"}`, expect `> Bash ls`
  surrounded by the source's palette color + reset.
- Remove `assert.ok(textData.includes("Evaluation completed after 1 turns"))`
  from existing tests — it is now suppressed. Replace with the positive
  assertion that the text stream contains no `--- Evaluation` substring.
- New: supervised mode with a failing `tool_result` (is_error true) → line
  contains `ERROR_COLOR`, prefixed with `<- error:`.
- New: all six suppressed orchestrator event types emit to `fileStream` but not
  `textStream`.
- New: source-prefix present in supervised output even when color bytes are
  present.

### Step 7 — Update `trace-collector.test.js`

- `toText includes tool call summaries` — change expected output from
  `> Tool: Bash ... ls -la` to `> Bash ls -la`.
- New: `toText` includes a preview line after each tool call; preview for the
  fixture `ls -la` call is the first non-blank line of `total 42\n...`.
- New: `toText` output stripped of ANSI equals `TeeWriter` text output stripped
  of ANSI for the same fixture — anchors criterion #6.

### Step 8 — Committed trace fixture

Create `libraries/libeval/test/fixtures/multi-agent.ndjson` containing a short
scripted session (facilitator + 2 agents; one successful `Bash` call, one
failing `Read` call, one orchestrator `session_start` and `summary`). Size kept
under 20 lines so the fixture remains reviewable.

Add a fixture-equivalence test inside `tee-writer.test.js` that:

1. pipes the fixture through `TeeWriter` → collects textStream output;
2. pipes the fixture through a `TraceCollector.toText()` call;
3. strips ANSI from both with `/\u001b\[[0-9;]*m/g`;
4. asserts byte-equal (success criterion #6).

### Step 9 — Verify full check/test

```sh
cd libraries/libeval && bun run test
cd ../.. && bun run check && bun run test
```

## Ordering summary

Steps 1–4 are independent module builds (can run in any order within this plan,
but written bottom-up — palette → tool-hints → orchestrator-filter →
line-renderer — so each new module is testable against what is already on disk).
Step 5 depends on all four modules being in place. Step 6–8 depend on step 5.
Step 9 is the final gate.

## Risks

1. **Hash collision inside the 6-name cast.** Mitigated by the enumerated
   distinctness test in Step 1; a collision is a deterministic failure, not a
   latent bug. If it happens, re-order or substitute a palette entry.
2. **`TeeWriter` source attribution for tool_result lines.** The collector
   currently unwraps the envelope before remembering the source. Addressed
   explicitly in Step 5 via `setCurrentSource`.
3. **`fit-eval output --format=text` equivalence.** Anchored by the fixture test
   in Step 8; if the two rendering paths drift, the test fails byte- for-byte.
4. **Existing test breakage.** `tee-writer.test.js` and
   `trace-collector.test.js` assert the old output shape (`> Tool: Bash {...}`,
   `Evaluation completed`). Steps 6–7 update them; no test is deleted outright.
5. **ANSI noise in CI log tails.** Workflow-run viewers render the SGR escapes.
   Nothing to mitigate — the whole point of this spec. A local developer running
   `fit-eval output --format=text | less` may see raw escapes; `less -R` or
   `ansi2txt` is the standard fix.

## Execution recommendation

Single agent (`staff-engineer`). One part, sequential. No documentation changes
— this is a pure internals refactor that keeps the published `fit-eval` CLI
surface identical. No separate technical-writer work needed.

— Staff Engineer 🛠️
