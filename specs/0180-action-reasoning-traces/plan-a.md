# 180: Implementation Plan

## Approach

Three changes: a new library, an enhanced action, and a workspace registration.

## New Library: `libraries/libtrace/`

### `package.json`

```json
{
  "name": "@forwardimpact/libtrace",
  "version": "0.1.0",
  "description": "Process Claude Code stream-json output into structured traces",
  "license": "Apache-2.0",
  "type": "module",
  "main": "index.js",
  "bin": {
    "fit-trace": "./bin/fit-trace.js"
  },
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "test": "node --test test/*.test.js"
  },
  "publishConfig": { "access": "public" }
}
```

No dependencies — pure data transformation.

### `src/trace-collector.js` — `TraceCollector` class

```js
class TraceCollector {
  constructor()
  addLine(jsonString)  // parse one NDJSON line, collect event
  toJSON()             // structured trace: { version, metadata, turns, summary }
  toText()             // human-readable text for workflow logs
}
```

**`addLine(jsonString)`** — Parses JSON, stores in internal arrays:

- `system` events → extract metadata (model, session_id, tools, version)
- `assistant` events → push to turns array with content and usage
- `tool_result` events → push to turns array
- `result` events → store as summary data
- Other events (rate_limit_event, etc.) → silently skip

**`toJSON()`** — Returns structured trace object:

```json
{
  "version": "1.0.0",
  "metadata": {
    "timestamp": "<ISO string>",
    "sessionId": "uuid",
    "model": "claude-opus-4-6",
    "claudeCodeVersion": "2.1.87",
    "tools": ["Bash", "Read", "..."]
  },
  "turns": [
    {
      "index": 0,
      "role": "assistant",
      "content": [
        { "type": "text", "text": "..." },
        { "type": "tool_use", "name": "Bash", "input": { "command": "..." } }
      ],
      "usage": { "inputTokens": 100, "outputTokens": 50 }
    },
    {
      "index": 1,
      "role": "tool_result",
      "toolUseId": "toolu_...",
      "content": "output..."
    }
  ],
  "summary": {
    "result": "success",
    "totalCostUsd": 1.23,
    "durationMs": 45000,
    "numTurns": 12,
    "tokenUsage": {
      "inputTokens": 5000,
      "outputTokens": 2000,
      "cacheReadInputTokens": 3000,
      "cacheCreationInputTokens": 1000
    },
    "modelUsage": {}
  }
}
```

**`toText()`** — Returns string with:

- Each assistant text block printed directly
- Each tool_use as `> Tool: Bash { command: "..." }` (truncated input)
- Final summary:
  `--- Result: success | Turns: 12 | Cost: $1.2300 | Duration: 45s ---`

Factory function: `createTraceCollector()`.

### `bin/fit-trace.js` — CLI

```
Usage: fit-trace [--output-format text|json] < stream.ndjson
```

- Reads stdin line-by-line
- Feeds each line to `TraceCollector.addLine()`
- Outputs `toJSON()` or `toText()` based on `--output-format` (default: `json`)

### `index.js`

Exports `TraceCollector` and `createTraceCollector`.

### `test/trace-collector.test.js`

Tests with fixture NDJSON data covering:

- System init event → metadata extraction
- Assistant events with text and tool_use → turn building
- Tool result events → turn building
- Result event → summary extraction
- `toJSON()` produces valid structured trace
- `toText()` produces readable output with tool summaries and result line
- Empty input → empty trace with defaults
- Malformed JSON lines → skipped without error

### `test/fixtures/stream.ndjson`

Sample stream-json output based on observed Claude Code format.

## Modified: `.github/actions/claude/action.yml`

### New Inputs

| Input        | Default          | Description                              |
| ------------ | ---------------- | ---------------------------------------- |
| `trace`      | `"true"`         | Enable trace capture and artifact upload |
| `trace-name` | `"claude-trace"` | Artifact name                            |

### Revised Steps

1. **Install Claude Code** — unchanged
2. **Configure Git identity** — unchanged
3. **Run Claude Code** — capture stream-json to file:
   ```bash
   TRACE_DIR=$(mktemp -d)
   AGENT_FLAG=""
   if [ -n "${{ inputs.agent }}" ]; then
     AGENT_FLAG="--agent ${{ inputs.agent }}"
   fi
   echo "${{ inputs.prompt }}" | claude --print \
     --output-format stream-json --verbose \
     --model "${{ inputs.model }}" \
     --max-turns "${{ inputs.max-turns }}" \
     --allowedTools "${{ inputs.allowed-tools }}" \
     $AGENT_FLAG \
     > "$TRACE_DIR/trace.ndjson"
   ```
4. **Print text to log** — conditional on `inputs.trace`:
   ```bash
   npx fit-trace --output-format text < "$TRACE_DIR/trace.ndjson"
   ```
   When trace is disabled, fall back to the original `--print` behavior (no
   stream-json, direct text output).
5. **Upload artifact** — conditional on `inputs.trace`:
   ```yaml
   - name: Upload trace artifact
     if: inputs.trace == 'true'
     uses: actions/upload-artifact@<SHA> # v4
     with:
       name: ${{ inputs.trace-name }}
       path: ${{ steps.run.outputs.trace-dir }}
   ```

### Fallback When Trace Disabled

When `inputs.trace` is `"false"`, the action behaves exactly as before: plain
`--print` mode with text output directly to the log. No stream-json, no
fit-trace, no artifact upload.

## Modified: `package.json` (root)

Add `"libraries/libtrace"` to the `workspaces` array.

## SHA Pin for upload-artifact

Look up the SHA for `actions/upload-artifact@v4` during implementation. The repo
requires all third-party actions pinned to SHA hashes per CONTRIBUTING.md
security policy.

## Verification

1. `node --test libraries/libtrace/test/*.test.js` — unit tests pass
2. `npx fit-trace < libraries/libtrace/test/fixtures/stream.ndjson` — outputs
   valid JSON
3. `npx fit-trace --output-format text < libraries/libtrace/test/fixtures/stream.ndjson`
   — outputs readable text
4. `npm run format` — formatting passes
5. `npm run lint` — linting passes
6. `npm run test` — full test suite passes
7. Manual: trigger security-audit via `workflow_dispatch`, verify trace artifact
   appears in the run
