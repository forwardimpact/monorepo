# Plan 1200-a — Microsoft Teams Bridge for the Kata Agent Team

Implementation plan for [spec 1200](spec.md) following
[design 1200-a](design-a.md).

## Approach

The bridge is a standalone Node.js service under `services/msteams/` that
receives Bot Framework activities from Teams via a dev tunnel, dispatches
`workflow_dispatch` events to GitHub, and listens for callback POSTs to
deliver the facilitator's conclusion back to the originating thread. The
workflow side adds two optional inputs to agent-react.yml and a post-step
that invokes a new `fit-eval callback` CLI command — a thin NDJSON reader in
libeval that extracts the summary event and POSTs it. Conversation continuity
is an in-memory map keyed by Teams thread ID with a bounded history window.

## Steps

### Step 1 — Add `fit-eval callback` command to libeval

**Intent:** Give the workflow a CLI tool that reads a trace file, extracts
the orchestrator summary event, and POSTs it to a callback URL.

| Action | File |
|---|---|
| Create | `libraries/libeval/src/commands/callback.js` |
| Modify | `libraries/libeval/bin/fit-eval.js` |

`callback.js`:

```js
import { readFileSync } from "node:fs";

export async function runCallbackCommand(values, _args) {
  const traceFile = values["trace-file"];
  const callbackUrl = values["callback-url"];
  const correlationId = values["correlation-id"];
  const runUrl = values["run-url"] ?? "";

  if (!traceFile) throw new Error("--trace-file is required");
  if (!callbackUrl) throw new Error("--callback-url is required");

  const lines = readFileSync(traceFile, "utf8").split("\n");
  let verdict = null;
  let summary = "";

  for (const line of lines) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (
      record.source === "orchestrator" &&
      record.event?.type === "summary"
    ) {
      verdict = record.event.verdict ?? "failure";
      summary = record.event.summary ?? "";
    }
  }

  if (verdict === null) throw new Error("No orchestrator summary event found in trace");

  const payload = { correlation_id: correlationId, verdict, summary, run_url: runUrl };
  const res = await fetch(callbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Callback POST failed: ${res.status}`);
}
```

Register `callback` in `fit-eval.js`:

```js
import { runCallbackCommand } from "../src/commands/callback.js";
// add to COMMANDS map:
callback: runCallbackCommand,
```

Add CLI definition entry:

```js
{
  name: "callback",
  args: "",
  description: "Extract the facilitator summary from an NDJSON trace and POST it to a callback URL",
  options: {
    "trace-file": { type: "string", description: "Path to the NDJSON trace file" },
    "callback-url": { type: "string", description: "URL to POST the summary to" },
    "correlation-id": { type: "string", description: "Correlation ID to include in the payload" },
    "run-url": { type: "string", description: "GitHub Actions run URL (optional)" },
  },
}
```

The `callback` command is infrastructure-only (runs inside GitHub Actions,
not by external engineers). It does not need a documentation entry in the
fit-eval skill or CLI `documentation` array — those link user-facing task
guides, not CI plumbing. The command will appear in `fit-eval --help`
output but intentionally has no linked guide.

**Verify:** `echo '{"source":"orchestrator","seq":1,"event":{"type":"summary","verdict":"success","summary":"test"}}' > /tmp/trace.ndjson && bunx fit-eval callback --trace-file=/tmp/trace.ndjson --callback-url=http://localhost:3978/api/callback/test --correlation-id=abc` succeeds (against a running bridge or a simple echo server).

### Step 2 — Update fit-eval@v1 composite action

**Intent:** Add `output` as an accepted input on the published composite
action so agent-react.yml can write the trace to a file.

| Action | File |
|---|---|
| Modify | `tmp/fit-eval/action.yml` (external repo: `forwardimpact/fit-eval`) |

Follow `.github/CLAUDE.md` § Editing a published action:

```sh
gh repo clone forwardimpact/fit-eval tmp/fit-eval
```

Add `output` to `action.yml`'s inputs and thread it to the CLI's `--output`
flag. Commit, force-move the `v1` tag, push.

**Verify:** The updated action accepts `output: "trace.ndjson"` and the
trace file is written.

### Step 3 — Add callback inputs and post-step to agent-react.yml

**Intent:** Let external callers supply a callback URL and correlation ID
via workflow_dispatch, and deliver the facilitator's conclusion after the
session completes.

Depends on: Step 1 (callback command exists), Step 2 (action accepts
`output`).

| Action | File |
|---|---|
| Modify | `.github/workflows/agent-react.yml` |

Add two optional inputs to `workflow_dispatch`:

```yaml
workflow_dispatch:
  inputs:
    prompt:
      description: "Ad-hoc prompt for the facilitator"
      required: true
      type: string
    callback_url:
      description: "URL to POST the facilitator conclusion to (optional)"
      required: false
      type: string
    correlation_id:
      description: "Correlation ID returned in the callback payload (optional)"
      required: false
      type: string
```

Add `output` to the fit-eval step:

```yaml
- name: Assess and Act
  uses: forwardimpact/fit-eval@v1
  # ... (existing env and with unchanged)
  with:
    # ... (existing inputs unchanged)
    output: "trace.ndjson"
```

Add post-step after "Assess and Act". Use `env:` block for expression
interpolation — never inline `${{ inputs.* }}` in `run:` shell blocks:

```yaml
- name: Deliver callback
  if: github.event_name == 'workflow_dispatch' && always() && inputs.callback_url != ''
  env:
    CALLBACK_URL: ${{ inputs.callback_url }}
    CORRELATION_ID: ${{ inputs.correlation_id }}
    RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
  run: |
    npx fit-eval callback \
      --trace-file=trace.ndjson \
      --callback-url="$CALLBACK_URL" \
      --correlation-id="$CORRELATION_ID" \
      --run-url="$RUN_URL"
```

`github.event_name == 'workflow_dispatch'` prevents this step from firing
on non-dispatch events (issues, PRs, discussions) where `inputs` is null.
`always()` ensures the callback fires even when the facilitate session
fails, matching the design's stated guarantee.

**Verify:** Trigger a manual workflow_dispatch without `callback_url` —
existing behavior unchanged. Trigger with `callback_url` pointing to a test
endpoint — callback POST arrives with verdict and summary.

### Step 4 — Create the bridge service scaffolding

**Intent:** Set up the `services/msteams/` package with its entry point,
dependencies, and configuration.

| Action | File |
|---|---|
| Create | `services/msteams/package.json` |
| Create | `services/msteams/server.js` |
| Create | `services/msteams/index.js` |
| Create | `services/msteams/README.md` |

`package.json`:

```json
{
  "name": "@forwardimpact/svcmsteams",
  "version": "0.1.0",
  "description": "Microsoft Teams bridge — relay messages between Teams conversations and the Kata agent team.",
  "keywords": ["teams", "bridge", "bot", "relay", "agent"],
  "homepage": "https://www.forwardimpact.team",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/forwardimpact/monorepo.git",
    "directory": "services/msteams"
  },
  "license": "Apache-2.0",
  "author": "D. Olsson <hi@senzilla.io>",
  "jobs": [
    {
      "user": "Teams Using Agents",
      "goal": "Reach the Agent Team from Teams",
      "trigger": "Discussing work in Microsoft Teams and needing to context-switch to GitHub to ask the agent team anything.",
      "bigHire": "invoke the Kata agent team from a Teams conversation without leaving Teams.",
      "littleHire": "send a message and get the facilitator's conclusion back in the same thread.",
      "competesWith": "manually creating GitHub issues; copy-pasting between Teams and GitHub; leaving the agent team unreachable from daily conversation"
    }
  ],
  "type": "module",
  "main": "./index.js",
  "bin": { "fit-svcmsteams": "./server.js" },
  "files": ["index.js", "server.js"],
  "scripts": { "test": "bun test test/*.test.js" },
  "dependencies": {
    "botbuilder": "^4.24.0",
    "express": "^4.21.0"
  },
  "engines": { "bun": ">=1.2.0", "node": ">=18.0.0" },
  "private": true
}
```

`private: true` deviates from the service convention (other services use
`publishConfig`). This is deliberate — the bridge is a prototype with no npm
consumers. Revisit before promoting beyond prototype status. The `jobs` user
persona is `"Teams Using Agents"` rather than the conventional
`"Platform Builders"` used by other services — the bridge is user-facing
(Teams engineers invoke it directly), not a backend consumed by other
products.

`server.js` — entry point. Departs from the standard service bootstrap
sequence (`createServiceConfig` / `createLogger` / `createTracer`) because
the bridge is an HTTP/Bot Framework service, not a gRPC service — it has no
`libconfig` config stanza, no proto definitions, and no `librpc` server.
Logger and tracer are also omitted: the prototype uses `console.log` for
diagnostic output; wiring `createLogger` requires a `libconfig` service
config entry that does not exist for this service. Revisit if the bridge
moves beyond prototype. Env vars are read directly at the composition root:

```js
#!/usr/bin/env node
import { createBridge } from "./index.js";

const bridge = createBridge({
  microsoftAppId: process.env.MICROSOFT_APP_ID ?? "",
  microsoftAppPassword: process.env.MICROSOFT_APP_PASSWORD ?? "",
  microsoftAppTenantId: process.env.MICROSOFT_APP_TENANT_ID ?? "",
  githubToken: process.env.GH_TOKEN,
  githubRepo: process.env.GITHUB_REPO,
  callbackBaseUrl: process.env.CALLBACK_BASE_URL,
  port: parseInt(process.env.PORT ?? "3978", 10),
});

await bridge.start();
```

**Verify:** `cd services/msteams && bun install && node server.js` starts
without error (no Teams connection yet — exits cleanly if env vars are
missing).

### Step 5 — Implement the bridge service

**Intent:** Wire Bot Framework message handling, GitHub workflow dispatch,
callback webhook, and conversation continuity.

| Action | File |
|---|---|
| Modify | `services/msteams/index.js` |

`index.js` exports `createBridge(config)` returning `{ start() }`.
Internally constructs the adapter, stores, and Express app — the factory
function is the composition root; collaborators (adapter, stores) are
created inside and exposed on the returned object for test access.

```
createBridge(config) → {
  start(),
  conversations,      // Map<threadId, { ref, history }> — exposed for tests
  pendingCallbacks,   // Map<token, { correlationId, threadId }> — exposed for tests
  buildPrompt(text, history),  // pure function — exposed for tests
}
```

Internal structure:

1. **Express app** with two routes:
   - `POST /api/messages` — Bot Framework messaging endpoint.
   - `POST /api/callback/:token` — Callback webhook.

2. **Bot Framework adapter** — `CloudAdapter` with
   `ConfigurationBotFrameworkAuthentication`. `botbuilder` is CJS-only; use
   default import with destructuring:
   `import botbuilder from "botbuilder"; const { CloudAdapter, ... } = botbuilder;`.
   `ConfigurationBotFrameworkAuthentication` requires `MicrosoftAppId`,
   `MicrosoftAppPassword`, and `MicrosoftAppTenantId` (all three from
   config) for single-tenant authentication. Processes incoming activities
   via the `/api/messages` route. `continueConversationAsync` receives the
   `microsoftAppId` from config.

3. **Activity handler** — On `message` activity type:
   - Extract thread ID from `activity.conversation.id`.
   - Look up or create conversation state in `conversations`.
   - Save the `ConversationReference` from
     `TurnContext.getConversationReference(activity)`.
   - Build the prompt via `buildPrompt(text, history)`: prepend last 5
     exchanges (~4000 chars max), then the current message.
   - Generate a correlation ID and a callback token (both via
     `crypto.randomUUID()` — Node.js built-in, no `uuid` dependency).
   - Store `{ correlationId, threadId }` in `pendingCallbacks` keyed by
     the callback token.
   - Send an acknowledgement reply: `"Working on it..."`.
   - POST `workflow_dispatch` to GitHub REST API with `prompt`,
     `callback_url` (`{callbackBaseUrl}/api/callback/{callbackToken}`), and
     `correlation_id`.
   - Append `{ role: "user", text }` to conversation history.

4. **Callback handler** — On `POST /api/callback/:token`:
   - Look up `pendingCallbacks` by the `:token` path parameter.
   - Return 404 if not found (token is one-time use).
   - Parse the JSON body: `{ correlation_id, verdict, summary, run_url }`.
   - Look up conversation state via the stored `threadId`.
   - Format reply text: `"**{verdict}** — {summary}"` (with run URL link
     if present).
   - Send proactive message to the stored `ConversationReference` using
     `adapter.continueConversationAsync()`.
   - Append `{ role: "assistant", text: summary }` to conversation history.
   - Delete the `pendingCallbacks` entry.

5. **Conversation store** — `Map<threadId, { ref, history }>`. History
   bounded to 5 exchanges (10 entries). Keyed by Teams thread ID so
   follow-up messages in the same thread carry context.

6. **Pending callbacks store** — `Map<token, { correlationId, threadId }>`.
   Keyed by the callback token (the value extracted from the URL path) so
   lookups are O(1).

**Verify:** Start the bridge with valid env vars. Send a message in Teams.
Observe `"Working on it..."` reply and a workflow run triggered with the
message text. Manually POST to the callback URL — observe the response
message in the same Teams thread. Send a follow-up in the same thread —
verify the dispatched prompt includes both the original message and the
prior response summary.

### Step 6 — Add tests

**Intent:** Verify the callback command and bridge core logic without
external dependencies.

| Action | File |
|---|---|
| Create | `libraries/libeval/test/callback.test.js` |
| Create | `services/msteams/test/bridge.test.js` |

`callback.test.js`:

- Writes a temp NDJSON trace file with an orchestrator summary event.
- Starts a local HTTP server (`node:http`) to receive the callback.
  `libharness` does not provide a callback-receiver helper (checked:
  `createMockRequest`/`createMockResponse` mock Express req/res objects,
  not a listening server).
- Runs `runCallbackCommand` with the temp file and server URL.
- Asserts the received payload contains the correct verdict, summary, and
  correlation ID.
- Tests the error case: trace with no summary event throws
  `"No orchestrator summary event found in trace"`.

`bridge.test.js` — imports `createBridge` and tests the extracted helpers:

- `buildPrompt(text, history)`: returns just the text when history is empty;
  prepends history entries when present; truncates history to 5 exchanges
  (10 entries, oldest discarded first); total prompt stays within ~4000
  chars (character cap applied after entry-count cap).
- `pendingCallbacks` store: token-based insert, O(1) lookup, cleanup after
  delivery.
- `conversations` store: history append, bounded rollover.

The HTTP routing and Bot Framework adapter are not unit-tested — they
require a live Teams tenant. This is a known limitation acceptable for a
prototype.

**Verify:** `bun test libraries/libeval/test/callback.test.js` and
`bun test services/msteams/test/bridge.test.js` pass.

### Step 7 — Add setup documentation

**Intent:** Document how to set up the dev environment and run the
prototype.

| Action | File |
|---|---|
| Create | `services/msteams/SETUP.md` |

Contents:

1. **Prerequisites** — Node.js 18+, a Microsoft 365 developer tenant, Azure
   Bot registration (single-tenant), a dev tunnel tool (VS Code Dev Tunnels
   or ngrok).
2. **Bot registration** — Step-by-step for creating a single-tenant Azure
   Bot registration, configuring the messaging endpoint URL.
3. **Environment variables** — `MICROSOFT_APP_ID`, `MICROSOFT_APP_PASSWORD`,
   `GH_TOKEN` (with `actions:write`), `GITHUB_REPO` (owner/repo),
   `CALLBACK_BASE_URL` (the tunnel's public URL), `PORT` (default 3978).
4. **Running** — `cd services/msteams && bun install && node server.js`.
5. **Dev tunnel** — Start tunnel, copy the public URL to
   `CALLBACK_BASE_URL` and the bot registration's messaging endpoint.
6. **Testing** — Send a message to the bot in Teams, observe the
   round-trip.

### Step 8 — Regenerate catalogs

**Intent:** Update generated catalog tables to include the new service.

| Action | File |
|---|---|
| Modify | `services/README.md` (generated) |

Run `bun run context:fix` to regenerate the service catalog in
`services/README.md`. The bridge is intentionally excluded from
`config/config.example.json` — it is not part of the init system that
`just guide` manages (it runs standalone via `node server.js`).

**Verify:** `services/README.md` includes the `msteams` row. `bun run check`
passes.

## Risks

- **fit-eval@v1 action `output` input**: The published composite action may
  not accept an `output` input. Step 2 addresses this as a prerequisite,
  but the exact action.yml shape is unknown until inspected. The edit
  procedure is documented in `.github/CLAUDE.md`.
- **`botbuilder` CJS-only under ESM**: `botbuilder` ships CommonJS only.
  Named imports (`import { CloudAdapter } from "botbuilder"`) will fail
  under ESM. Use default import with destructuring (see Step 5 §2). Bun
  may have additional interop issues; run the bridge with Node.js.
- **libeval publish timing**: The workflow's `npx fit-eval callback` invokes
  the published npm version. If the callback command is not yet released
  when the workflow change lands, the step will fail with "unknown command."
  Sequence: merge libeval, cut a release, then merge the workflow change.

Libraries used: `botbuilder` (CloudAdapter, ConfigurationBotFrameworkAuthentication, TurnContext), `express` (HTTP server).

## Execution

Sequential, single agent (`staff-engineer`); Step 7 (docs) can be
delegated to `technical-writer` in parallel. Ordering:

1. Step 1 (callback command) — no dependencies.
2. Step 2 (fit-eval@v1 action update) — depends on Step 1 being released.
3. Step 3 (workflow change) — depends on Steps 1 and 2.
4. Step 4 (bridge scaffolding) — independent of Steps 1–3.
5. Step 5 (bridge implementation) — depends on Step 4.
6. Step 6 (tests) — accompanies Steps 1 and 5.
7. Step 7 (docs) — can run in parallel with engineering steps.
8. Step 8 (catalogs) — last, after Step 4.
