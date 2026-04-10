# Part 02 -- fit-guide Status and Init Commands

**Depends on:** Part 01 (health definition export from librpc).

## Goal

Add `status` and `init` commands to fit-guide. The `status` command probes every
required service via `Health/Check`, queries data inventory from the graph
service, validates LLM credentials, and reports a structured verdict. The `init`
command replaces the existing `--init` flag.

## Files

| Action | File |
|--------|------|
| Modify | `products/guide/bin/fit-guide.js` |
| Create | `products/guide/lib/status.js` |
| Create | `products/guide/test/status.test.js` |

## Step 1: Create `products/guide/lib/status.js`

This module exports the `runStatus` function that performs all checks and returns
a structured result. Keeping check logic in its own module makes it testable
with injected dependencies.

### Signature

```js
import grpc from "@grpc/grpc-js";
import { healthDefinition } from "@forwardimpact/librpc";

/**
 * @param {object} deps - Injected dependencies
 * @param {Function} deps.createServiceConfig - Config factory
 * @param {object} deps.fs - Node fs/promises module
 * @param {object} [deps.grpc] - @grpc/grpc-js module (default: real grpc, override for tests)
 * @param {object} [deps.healthDefinition] - Health service definition (default: real def, override for tests)
 * @returns {Promise<object>} Status result object
 */
export async function runStatus(deps) { ... }
```

The module imports `@grpc/grpc-js` and `healthDefinition` statically and uses
them as defaults. Tests override via `deps.grpc` and `deps.healthDefinition`.
This avoids the CJS default-export footgun with dynamic `import()` of
`@grpc/grpc-js` and keeps the entry point wiring simple.

### Return shape

```js
{
  services: {
    agent:  { url: "grpc://localhost:3002", status: "ok" | "unreachable" },
    llm:    { url: "grpc://localhost:3004", status: "ok" | "unreachable" },
    memory: { url: "grpc://localhost:3003", status: "ok" | "unreachable" },
    graph:  { url: "grpc://localhost:3006", status: "ok" | "unreachable" },
    vector: { url: "grpc://localhost:3005", status: "ok" | "unreachable" },
    tool:   { url: "grpc://localhost:3007", status: "ok" | "unreachable" },
    trace:  { url: "grpc://localhost:3008", status: "ok" | "unreachable" },
    web:    { url: "http://localhost:3001",  status: "ok" | "unreachable" },
  },
  data: {
    resources: <number>,
    triples: <number>,
    agents: <number>,
  },
  credentials: {
    LLM_TOKEN: "configured" | "missing",
  },
  verdict: "ready" | "not ready",
}
```

### Implementation outline

#### 1. Load service configs

Load configs for all 8 services. Wrap in try/catch per service — if
`config.json` is missing or a service has no config entry, report it as
unreachable rather than crashing.

```js
const serviceNames = ["agent", "llm", "memory", "graph", "vector", "tool", "trace", "web"];
const configs = {};
const configErrors = [];
for (const name of serviceNames) {
  try {
    configs[name] = await deps.createServiceConfig(name);
  } catch {
    configErrors.push(name);
    configs[name] = { url: "unknown", host: "unknown", port: 0, name };
  }
}
```

Services in `configErrors` are immediately marked `"unreachable"` without
attempting a health check.

#### 2. Health check: gRPC services

For each gRPC service (all except `web`), build a lightweight client using
`grpc.makeGenericClientConstructor` with the health definition:

```js
function checkGrpcHealth(grpc, healthDef, config, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const ClientCtor = grpc.makeGenericClientConstructor(healthDef, "Health");
    const host = config.host === "0.0.0.0"
      ? `${config.name}.guide.local`
      : config.host;
    const uri = `${host}:${config.port}`;
    const client = new ClientCtor(uri, grpc.credentials.createInsecure());

    const deadline = new Date(Date.now() + timeoutMs);
    client.Check({ service: "" }, { deadline }, (err, response) => {
      client.close();
      if (err) {
        resolve("unreachable");
      } else if (response?.status === 1) { // SERVING
        resolve("ok");
      } else {
        resolve("unreachable");
      }
    });
  });
}
```

**Display URL resolution:** `config.url` may contain `grpc://0.0.0.0:3006`
when the default bind address is used. For the status report, construct a
display URL using the resolved host to match user expectations:

```js
function displayUrl(config) {
  const host = config.host === "0.0.0.0" ? "localhost" : config.host;
  return `${config.protocol}://${host}:${config.port}`;
}
```

Use `displayUrl(configs[name])` instead of `configs[name].url` when building
the result object.

Key design choices:
- **No auth interceptor.** The health endpoint bypasses HMAC.
- **No retry.** Single attempt with 2-second deadline.
- **`client.close()` after each call.** Prevents leaked channels.
- **`Promise` always resolves** (never rejects) so `Promise.allSettled` is not
  strictly needed, but we use it anyway for robustness.

#### 3. Health check: web service

HTTP fetch to `{config.url}/web/health` with a 2-second timeout:

```js
function checkWebHealth(config, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    fetch(`${config.url}/web/health`, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timer);
        resolve(res.ok ? "ok" : "unreachable");
      })
      .catch(() => {
        clearTimeout(timer);
        resolve("unreachable");
      });
  });
}
```

#### 4. Run all health checks in parallel

```js
const grpcServices = ["agent", "llm", "memory", "graph", "vector", "tool", "trace"];
const checks = grpcServices.map((name) =>
  checkGrpcHealth(deps.grpc, deps.healthDefinition, configs[name])
    .then((status) => [name, status])
);
checks.push(
  checkWebHealth(configs.web).then((status) => ["web", status])
);

const results = await Promise.allSettled(checks);
const services = {};
for (const result of results) {
  const [name, status] = result.status === "fulfilled"
    ? result.value
    : [null, "unreachable"];
  if (name) services[name] = { url: displayUrl(configs[name]), status };
}
```

#### 5. Data inventory

Only attempt data queries if the graph service is reachable. If unreachable,
report 0 for all counts.

For resource count -- call `GetSubjects` via the graph client. Since we need a
proper generated client (with protobuf types) for application RPCs, we import
the GraphClient and libtype. However, this requires HMAC auth. Instead of
building a full authenticated client, we use a simpler approach:

**Decision: use the generated GraphClient for data inventory.** The status
command already runs in a context where `SERVICE_SECRET` is available (same
environment as the REPL). If `SERVICE_SECRET` is missing, `new GraphClient()`
throws immediately during construction (via `createAuth` in `librpc/base.js`
line 32) — not during the RPC call. The outer try/catch handles this, and data
counts fall back to 0.

```js
async function queryDataInventory(deps, graphConfig) {
  try {
    const { GraphClient } = await import(
      "@forwardimpact/librpc/generated/services/graph/client.js"
    );
    const { graph } = await import("@forwardimpact/libtype");

    // Throws here if SERVICE_SECRET is not set (createAuth requirement)
    const client = new GraphClient(graphConfig);

    // Resource count: GetSubjects with empty type
    const subjectsReq = graph.SubjectsQuery.fromObject({});
    const subjectsRes = await client.GetSubjects(subjectsReq);
    const resourceCount = subjectsRes.content
      ? subjectsRes.content.split("\n").filter(Boolean).length
      : 0;

    // Triple count: QueryByPattern with empty pattern.
    // patternRes is a tool.ToolCallResult. Its `identifiers` field is
    // `repeated resource.Identifier` — an array of Identifier objects
    // (each has type, name, parent, subjects). The graph service populates
    // these via resource.Identifier.fromObject() in graphIndex.queryItems().
    // We only need the count, so .length suffices.
    const patternReq = graph.PatternQuery.fromObject({});
    const patternRes = await client.QueryByPattern(patternReq);
    const tripleCount = patternRes.identifiers
      ? patternRes.identifiers.length
      : 0;

    return { resources: resourceCount, triples: tripleCount };
  } catch {
    return { resources: 0, triples: 0 };
  }
}
```

For agent count -- count `*.agent.md` files in `config/agents/`:

```js
async function countAgents(deps) {
  try {
    const entries = await deps.fs.readdir("config/agents");
    return entries.filter((f) => f.endsWith(".agent.md")).length;
  } catch {
    return 0;
  }
}
```

#### 6. LLM credential check

Use `configs.llm.llmToken()` which resolves `LLM_TOKEN` through libconfig's
full credential resolution chain (process.env first, then `.env` file fallback).
The `llmToken()` method throws when the token is not found, so the try/catch is
required.

```js
async function checkLlmToken(configs) {
  try {
    const token = await configs.llm.llmToken();
    return token ? "configured" : "missing";
  } catch {
    return "missing";
  }
}
```

#### 7. Compute verdict

```js
const allServicesOk = Object.values(services).every((s) => s.status === "ok");
const credentialsOk = credentials.LLM_TOKEN === "configured";
const verdict = allServicesOk && credentialsOk ? "ready" : "not ready";
```

Data warnings (zero counts) do not affect the verdict per the spec.

## Step 2: Modify `products/guide/bin/fit-guide.js`

### 2a. Update CLI definition

**Before:**
```js
const definition = {
  name: "fit-guide",
  version: VERSION,
  description: "Conversational agent for the Guide knowledge platform",
  options: {
    init: {
      type: "boolean",
      description: "Generate secrets, .env, and config",
    },
    data: {
      type: "string",
      description: "Path to framework data directory",
    },
    streaming: {
      type: "boolean",
      description: "Use streaming agent endpoint",
    },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
  },
  examples: [
    'echo "Tell me about the company" | npx fit-guide',
    "npx fit-guide --init",
  ],
};
```

**After:**
```js
const definition = {
  name: "fit-guide",
  version: VERSION,
  description: "Conversational agent for the Guide knowledge platform",
  commands: [
    { name: "status", description: "Check system readiness" },
    { name: "init", description: "Generate secrets, .env, and config" },
  ],
  options: {
    data: {
      type: "string",
      description: "Path to framework data directory",
    },
    streaming: {
      type: "boolean",
      description: "Use streaming agent endpoint",
    },
    json: {
      type: "boolean",
      description: "Output as JSON",
    },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
  },
  examples: [
    "npx fit-guide status",
    "npx fit-guide status --json",
    "npx fit-guide init",
    'echo "Tell me about the company" | npx fit-guide',
  ],
};
```

Changes:
- Added `commands` array with `status` and `init`.
- Removed `init` from `options` (it is now a command, not a flag).
- Added `json` to `options` (was not previously declared; needed for
  `status --json`).
- Updated examples to match spec.

### 2b. Update command dispatch

**Before:**
```js
const parsed = cli.parse(process.argv.slice(2));
if (!parsed) process.exit(0);

const { values } = parsed;

if (values.init) {
  await runInit();
  process.exit(0);
}
if (values.data) dataDir = resolve(values.data);
if (values.streaming) useStreaming = true;
```

**After:**
```js
const parsed = cli.parse(process.argv.slice(2));
if (!parsed) process.exit(0);

const { values, positionals } = parsed;
const command = positionals[0] || null;

if (command === "init") {
  await runInit();
  process.exit(0);
}

// Gate status behind config existence — same check as setupServices().
// Without config.json, createServiceConfig will fail for every service.
// Direct the user to run init first.
if (command === "status") {
  try {
    await (await import("fs/promises")).access(resolve("config", "config.json"));
  } catch {
    cli.error("config/config.json not found. Run 'npx fit-guide init' first.");
    process.exit(1);
  }

  const { runStatus } = await import("../lib/status.js");
  const { createServiceConfig } = await import("@forwardimpact/libconfig");
  const fs = await import("fs/promises");

  const result = await runStatus({
    createServiceConfig,
    fs,
  });

  if (values.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    const { SummaryRenderer } = await import("@forwardimpact/libcli");
    const summary = new SummaryRenderer({ process });
    printStatusSummary(summary, result);
  }

  process.exit(result.verdict === "ready" ? 0 : 1);
}

if (values.data) dataDir = resolve(values.data);
if (values.streaming) useStreaming = true;
```

### 2c. Add `printStatusSummary` function

This function uses `SummaryRenderer` to print the three sections plus the
verdict:

```js
function printStatusSummary(summary, result) {
  // Services section
  summary.render({
    title: "Services",
    items: Object.entries(result.services).map(([name, info]) => ({
      label: name,
      description: `${info.status === "ok" ? "ok" : "unreachable"}  ${info.url}`,
    })),
  });

  process.stdout.write("\n");

  // Data section
  summary.render({
    title: "Data",
    items: [
      { label: "resources", description: String(result.data.resources) },
      { label: "triples", description: String(result.data.triples) },
      { label: "agents", description: String(result.data.agents) },
    ],
  });

  process.stdout.write("\n");

  // Credentials section
  summary.render({
    title: "Credentials",
    items: [
      { label: "LLM_TOKEN", description: result.credentials.LLM_TOKEN },
    ],
  });

  process.stdout.write("\n");

  // Verdict
  process.stdout.write(`Status: ${result.verdict}\n`);
}
```

### 2d. Backward compatibility for `--init`

The `--init` flag is removed from the options definition, so
`parseArgs` will throw if a user passes `--init`. To ease the transition,
we do **not** add backward compatibility -- the spec explicitly says to promote
`--init` to the `init` command. The error message from `parseArgs` will
naturally guide the user.

**Risk:** Users following old documentation may hit a confusing error. This is
acceptable because the help output clearly shows `init` as a command, and the
spec explicitly requires this change.

## Step 3: Create `products/guide/test/status.test.js`

### Test cases

1. **All services ok, credentials configured -- verdict "ready".** Inject mock
   `createServiceConfig` returning configs with predictable URLs and a
   `llmToken()` that returns `"sk-test"`. Inject mock `grpc` with a
   `makeGenericClientConstructor` that returns a client whose `Check` always
   calls back with `{ status: 1 }`. Mock `fs.readdir` to return agent files.
   Assert verdict is "ready" and all services show "ok".

2. **One service unreachable -- verdict "not ready".** Same as above but the
   mock client for "agent" calls back with an error. Assert verdict is
   "not ready", assert `services.agent.status === "unreachable"`.

3. **LLM_TOKEN missing -- verdict "not ready".** All services ok, but
   `llmToken()` throws. Assert verdict is "not ready" and
   `credentials.LLM_TOKEN === "missing"`.

4. **Graph unreachable -- data counts are 0.** Graph service health check
   returns unreachable. Assert `data.resources === 0` and
   `data.triples === 0`. Verdict is "not ready" (service unreachable).

5. **Zero data counts do not affect verdict.** All services reachable,
   credentials configured, but graph returns empty data. Assert verdict is
   "ready" (data warnings are informational only).

6. **Config loading failure for one service.** Mock `createServiceConfig` to
   throw for "trace". Assert `services.trace.status === "unreachable"` and
   `services.trace.url === "unknown"`. Other services still checked normally.

7. **Display URLs resolve 0.0.0.0 to localhost.** Mock config with
   `host: "0.0.0.0"`. Assert reported URL contains `localhost`, not `0.0.0.0`.

8. **JSON output mode.** Invoke `runStatus`, serialize with `JSON.stringify`,
   assert it parses back to the expected shape.

### Test structure

```js
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { runStatus } from "../lib/status.js";

function createMockDeps(overrides = {}) {
  // Build mock createServiceConfig, grpc, fs, process
  // with sensible defaults that produce "all ok" results
}

describe("runStatus", () => {
  test("all services ok and credentials configured: ready", async () => { ... });
  test("one service unreachable: not ready", async () => { ... });
  test("LLM_TOKEN missing: not ready", async () => { ... });
  test("graph unreachable: data counts are 0", async () => { ... });
  test("zero data counts do not affect verdict", async () => { ... });
  test("result serializes to expected JSON shape", async () => { ... });
});
```

## Verification

```sh
bun run node --test products/guide/test/status.test.js
bun run check
bun run test
```

Manual verification (requires running services):
```sh
bunx fit-guide status
bunx fit-guide status --json
bunx fit-guide init
bunx fit-guide --help
```

## Blast Radius

- `products/guide/lib/status.js` -- **created** (status check logic)
- `products/guide/bin/fit-guide.js` -- **modified** (CLI definition, command
  dispatch, summary printer)
- `products/guide/test/status.test.js` -- **created** (tests)

No changes to: librpc (done in Part 01), services, config, libcli, or any other
product.

## Decisions

1. **Data inventory uses the generated GraphClient.** This requires
   `SERVICE_SECRET` to be set. If missing, `new GraphClient()` throws at
   construction time (not at RPC time) — the try/catch in `queryDataInventory`
   handles this and falls back to 0 counts.

2. **The `--json` flag is added to the options definition.** It was not
   previously declared in fit-guide's definition. Adding it lets the
   `HelpRenderer` display it and lets `parseArgs` accept it. Note: `--json`
   combined with `--help` triggers JSON help output (existing libcli behavior,
   correct and desirable).

3. **The health check client is constructed inline** using
   `grpc.makeGenericClientConstructor` rather than extending the librpc `Client`
   class. This avoids pulling in auth, retry, observer, and tracer
   infrastructure that the health probe does not need.

4. **Agent count reads the filesystem** (`config/agents/`) rather than querying
   a service. Agent definitions are static config files, not runtime data.

5. **`status.js` imports `@grpc/grpc-js` and `healthDefinition` statically.**
   This avoids the CJS-default-export footgun with dynamic `import()` of
   `@grpc/grpc-js`. Tests override via dependency injection.

6. **Display URLs resolve `0.0.0.0` to `localhost`.** The `config.url` property
   may contain `grpc://0.0.0.0:3006` (the bind address). The status report uses
   a `displayUrl()` helper that substitutes `localhost` for user-facing output.

7. **LLM credential check uses `config.llmToken()`.** This respects libconfig's
   full resolution chain (process.env then `.env` file). The method throws when
   the token is absent, so try/catch is required.

8. **Config loading is per-service with try/catch.** A missing config entry
   for one service does not prevent checking the others. Services with config
   errors are immediately marked `"unreachable"`.

9. **Onboarding gate before status dispatch.** The status command checks for
   `config/config.json` before attempting any config loads. Without it, every
   `createServiceConfig` call would fail. Directs the user to run `init` first.
