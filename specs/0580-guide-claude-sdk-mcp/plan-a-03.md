# Part 3 — CLI rewrite, OAuth, package deletion

## Scope

Rewrite `fit-guide` CLI on the Claude Agent SDK, implement OAuth PKCE
login/logout, delete all seven retired packages, and fix every cascading
dependency. This is the largest part — the steps are ordered so that
replacements land before the code they replace is deleted.

## Prerequisites

Parts 1 and 2 complete (libconfig credentials + MCP server exist).

## Steps

### Step 1 — Move `tool.proto` to shared location

**Before deleting anything**, move the shared message types out of
`services/tool/`:

1. Create `proto/` at the repo root (the codegen's `discoverProtoDirs()` already
   checks `{projectRoot}/proto/`).
2. Copy `services/tool/proto/tool.proto` → `proto/tool.proto`.
3. Remove the `service Tool { rpc CallTool ... }` block from the copied file —
   only message types (`QueryFilter`, `ToolProp`, `ToolParam`, `ToolFunction`,
   `ToolCall`, `ToolCallResult`, `ToolCallMessage`) remain.
4. Run `just codegen` — verify all 38+ files regenerate without errors. The tool
   service base/client will no longer be generated (no service definition); the
   message types will still appear in `generated/types/types.js`.

**Files changed:**

| Action  | Path                                    |
| ------- | --------------------------------------- |
| Created | `proto/tool.proto` (message types only) |

### Step 2 — Fix vector service (remove svcllm dependency)

Replace the gRPC-to-gRPC-to-HTTP chain with a direct HTTP call to TEI.

**Modified:** `services/vector/index.js`

Before:

```javascript
import { llm } from "@forwardimpact/libtype";
// ...
constructor(config, vectorIndex, llmClient, logFn) {
  this.#llmClient = llmClient;
}
async SearchContent(req) {
  const embeddingRequest = llm.EmbeddingsRequest.fromObject(req);
  const embeddings = await this.#llmClient.CreateEmbeddings(embeddingRequest);
  // ...
}
```

After:

```javascript
constructor(config, vectorIndex, embeddingFn, logFn) {
  this.#embeddingFn = embeddingFn;
}
async SearchContent(req) {
  // embeddingFn returns OpenAI-compatible shape: { data: [{ embedding: [...] }] }
  const embeddings = await this.#embeddingFn(req.input);
  if (!embeddings.data?.length) {
    throw new Error("No embeddings returned");
  }
  const vectors = embeddings.data.map((item) => item.embedding);
  const identifiers = await this.#vectorIndex.queryItems(vectors, req.filter);
  return { identifiers };
}
```

The `embeddingFn` contract: accepts `input` (string or string array), returns
`{ data: [{ embedding: number[] }] }` — matching the OpenAI/TEI response shape
that the current code already consumes via `embeddings.data.map()`.

**Modified:** `services/vector/server.js`

Before:

```javascript
const llmClient = await createClient("llm", logger, tracer);
const service = new VectorService(config, vectorIndex, llmClient);
```

After:

```javascript
const embeddingBaseUrl = process.env.EMBEDDING_BASE_URL || 'http://localhost:8080';

async function createEmbeddings(text, tokens) {
  const res = await fetch(`${embeddingBaseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: text, model: 'default' }),
  });
  if (!res.ok) throw new Error(`Embedding request failed: ${res.status}`);
  const body = await res.json();
  return body;
}

const service = new VectorService(config, vectorIndex, createEmbeddings);
```

**Note:** `services/vector/package.json` does not list `@forwardimpact/svcllm`
as a dependency — the LLM service is reached at runtime via
`createClient("llm")` from `librpc`. Removing the `createClient("llm")` call and
the `llm` type import from `libtype` is sufficient.

**Modified:** `services/vector/test/vector.test.js` — update mocks: replace
`llmClient` mock with `embeddingFn` mock returning a canned embeddings response.

### Step 3 — Fix web service (remove svcagent dependency)

**Modified:** `services/web/server.js`

Remove:

```javascript
const client = await createClient("agent", logger, tracer);
```

Pass `null` or omit the agent client. Read the full web service source to
identify all endpoints. Remove or stub the `/web/api/chat` endpoint that depends
on the agent client. Retain the health endpoint and any other non-agent
endpoints.

**Modified:** `services/web/index.js`

Remove the `client.ProcessStream()` call path. If the chat endpoint is the only
functional endpoint, replace it with a message pointing users to the three new
surfaces (CLI, Claude Code, Claude Chat).

**Note:** `services/web/package.json` does not list `@forwardimpact/svcagent` as
a dependency — the agent client is reached via `createClient("agent")` from
`librpc`. Remove that call from `server.js` and the `agent`/`common` type
imports from `index.js`.

### Step 4 — Rewrite `fit-guide` CLI

**Modified:** `products/guide/bin/fit-guide.js`

Complete rewrite. The CLI becomes a thin driver around the Claude Agent SDK.

**Command structure:**

| Command   | Description                                   |
| --------- | --------------------------------------------- |
| (default) | Interactive chat via Agent SDK `query()`      |
| `login`   | OAuth PKCE flow → persist credential          |
| `logout`  | Clear persisted credential                    |
| `resume`  | Resume last session via SDK `resume`          |
| `init`    | Generate `.env` and starter config (updated)  |
| `status`  | Check credentials, MCP health, backend health |

**CLI definition:**

```javascript
const definition = {
  name: "fit-guide",
  version,
  description: "Engineering framework knowledge agent",
  commands: [
    { name: "login", description: "Authenticate with Anthropic" },
    { name: "logout", description: "Clear stored credentials" },
    { name: "resume", description: "Resume previous conversation" },
    { name: "init", description: "Initialize Guide configuration" },
    { name: "status", description: "Check system readiness" },
  ],
  globalOptions: [
    { name: "data", short: "d", type: "string", description: "Path to framework data" },
    { name: "json", type: "boolean", description: "Output as JSON" },
    { name: "help", short: "h", type: "boolean", description: "Show help" },
    { name: "version", type: "boolean", description: "Show version" },
  ],
};
```

**Default chat handler:**

```javascript
async function handleChat(input, config) {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  // Resolve credential. The SDK reads ANTHROPIC_API_KEY from the
  // environment — verify the SDK's actual credential mechanism at
  // implementation time. If it exposes an apiKey option, prefer that
  // over setting process.env.
  process.env.ANTHROPIC_API_KEY = await config.anthropicToken();

  const mcpUrl = config.url; // SERVICE_MCP_URL
  const mcpToken = config.mcpToken();

  // Call signature pinned to the working usage in
  // libeval/src/agent-runner.js (lines 71-88). Verified options:
  // model, systemPrompt, mcpServers, permissionMode, abortController.
  // If the SDK API changes between now and implementation, adapt from
  // libeval — it is the canonical in-repo reference.
  const iterator = query({
    prompt: input,
    options: {
      model: process.env.GUIDE_MODEL || "claude-sonnet-4-6",
      systemPrompt: guideDefaultPrompt,
      mcpServers: {
        guide: {
          url: mcpUrl,
          headers: { Authorization: `Bearer ${mcpToken}` },
        },
      },
    },
  });

  for await (const message of iterator) {
    if (message.type === "system" && message.subtype === "init") {
      sessionId = message.session_id;
    }
    if (message.type === "assistant" && message.content) {
      process.stdout.write(message.content);
    }
  }
}
```

The exact streaming output handling will match the SDK's message format — adapt
from the patterns in `libeval/src/agent-runner.js`. If the SDK provides a
higher-level streaming renderer or a credential option (avoiding `process.env`
mutation), prefer that.

**First-run UX:**

Before starting any command, check for a valid `.env`:

```javascript
try {
  await config.load();
} catch {
  console.error(
    'Guide is not configured.\n\n' +
    '  Run: fit-guide init\n' +
    '  Then: fit-guide login  (or set ANTHROPIC_API_KEY in .env)\n'
  );
  process.exit(1);
}
```

If `.env` exists but contains `LLM_TOKEN` without `ANTHROPIC_API_KEY`:

```javascript
if (process.env.LLM_TOKEN && !process.env.ANTHROPIC_API_KEY) {
  console.error(
    'Guide has moved to Anthropic. LLM_TOKEN is no longer used.\n\n' +
    '  Run: fit-guide init    (regenerates .env)\n' +
    '  Then: fit-guide login  (or set ANTHROPIC_API_KEY)\n'
  );
  process.exit(1);
}
```

### Step 5 — Implement `login` command (OAuth PKCE)

**Modified:** `products/guide/bin/fit-guide.js` (login handler) or extracted to
`products/guide/src/lib/login.js`.

Three collaborating components per the design:

1. **PKCE initiator:**

   ```javascript
   import { randomBytes, createHash } from 'node:crypto';

   function createPkce() {
     const verifier = randomBytes(32).toString('base64url');
     const challenge = createHash('sha256').update(verifier).digest('base64url');
     const state = randomBytes(16).toString('hex');
     return { verifier, challenge, state };
   }
   ```

2. **Loopback callback listener:**

   ```javascript
   import { createServer } from 'node:http';

   function startCallbackServer(expectedState) {
     let resolveCode, rejectCode;
     const codePromise = new Promise((resolve, reject) => {
       resolveCode = resolve;
       rejectCode = reject;
     });

     const server = createServer((req, res) => {
       const url = new URL(req.url, `http://localhost`);
       const code = url.searchParams.get('code');
       const state = url.searchParams.get('state');
       if (state !== expectedState) {
         res.writeHead(400); res.end('Invalid state');
         return rejectCode(new Error('State mismatch'));
       }
       res.writeHead(200); res.end('Login successful. You can close this tab.');
       server.close();
       resolveCode(code);
     });

     return new Promise((resolve) => {
       server.listen(0, '127.0.0.1', () => {
         const port = server.address().port;
         resolve({ port, codePromise });
       });
     });
   }
   ```

3. **Token exchange:**
   ```javascript
   async function exchangeCode(code, verifier, redirectUri) {
     const res = await fetch(ANTHROPIC_TOKEN_URL, {
       method: 'POST',
       headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
       body: new URLSearchParams({
         grant_type: 'authorization_code',
         code,
         redirect_uri: redirectUri,
         code_verifier: verifier,
       }),
     });
     if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
     const body = await res.json();
     return {
       access_token: body.access_token,
       refresh_token: body.refresh_token,
       expires_at: Date.now() + (body.expires_in ?? 3600) * 1000,
     };
   }
   ```

**Login flow:**

```javascript
const pkce = createPkce();
const { port, codePromise } = await startCallbackServer(pkce.state);
const redirectUri = `http://127.0.0.1:${port}/callback`;

// Client ID — registered with Anthropic for the fit-guide CLI.
// Env-var override for testing/staging.
const ANTHROPIC_CLIENT_ID =
  process.env.ANTHROPIC_OAUTH_CLIENT_ID || 'fit-guide';
const ANTHROPIC_AUTHORIZE_URL =
  process.env.ANTHROPIC_OAUTH_AUTHORIZE_URL || 'https://auth.anthropic.com/oauth/authorize';

const authorizeUrl = new URL(ANTHROPIC_AUTHORIZE_URL);
authorizeUrl.searchParams.set('client_id', ANTHROPIC_CLIENT_ID);
authorizeUrl.searchParams.set('response_type', 'code');
authorizeUrl.searchParams.set('redirect_uri', redirectUri);
authorizeUrl.searchParams.set('code_challenge', pkce.challenge);
authorizeUrl.searchParams.set('code_challenge_method', 'S256');
authorizeUrl.searchParams.set('state', pkce.state);
authorizeUrl.searchParams.set('scope', 'openid offline_access');

// Open browser (or print URL for headless)
import { exec } from 'node:child_process';
exec(`open "${authorizeUrl}"`); // macOS; cross-platform via xdg-open/start

const code = await codePromise;
const tokenData = await exchangeCode(code, pkce.verifier, redirectUri);
await config.writeOAuthCredential(tokenData);
console.log('Logged in successfully.');
```

**Headless fallback:** If `open` fails (no browser), print the URL and prompt
the user to paste the callback URL.

### Step 6 — Implement `logout` command

```javascript
await config.clearOAuthCredential();
console.log('Logged out. Stored credential removed.');
```

### Step 7 — Update `status` command

**Modified:** `products/guide/src/lib/status.js`

Replace the current health-check list with three blocks:

1. **Credentials** — `config.anthropicToken()` succeeds (env var or OAuth).
2. **MCP** — HTTP GET to `{SERVICE_MCP_URL}/health` returns 200.
3. **Backends** — gRPC health check for `graph`, `vector`, `pathway`, `trace`.

Remove references to: `agent`, `memory`, `llm`, `tool` services. Remove
`LLM_TOKEN` check. Add `MCP` health check.

Verdict: "ready" only when all three blocks pass.

### Step 8 — Update `init` command

**Modified:** `products/guide/bin/fit-guide.js` (init handler)

Generate `.env` with new shape:

```env
# Anthropic credentials (set one)
# ANTHROPIC_API_KEY=sk-ant-...
# Or run: fit-guide login

# MCP authentication
MCP_TOKEN=<generated-uuid>

# Service URLs
SERVICE_MCP_URL=http://localhost:3009
SERVICE_GRAPH_URL=grpc://localhost:3006
SERVICE_VECTOR_URL=grpc://localhost:3005
SERVICE_PATHWAY_URL=grpc://localhost:3010
SERVICE_TRACE_URL=grpc://localhost:3008
SERVICE_WEB_URL=http://localhost:3001

# Embedding service (TEI)
EMBEDDING_BASE_URL=http://localhost:8080
```

Remove: `LLM_TOKEN`, `SERVICE_AGENT_URL`, `SERVICE_MEMORY_URL`,
`SERVICE_LLM_URL`, `SERVICE_TOOL_URL`, `LLM_BASE_URL`.

### Step 9 — Update starter config

**Modified:** `products/guide/starter/config.json`

Remove from `init.services`: `llm`, `memory`, `tool`, `agent`. Add to
`init.services`: `mcp` (after pathway, before web).

New service startup order:

```
trace → vector → graph → pathway → mcp → web
```

Remove the `service.tool.endpoints` map entirely (MCP handles tool routing).
Remove `service.agent` config block (model, agent settings). Add `service.mcp`
config block (minimal — port comes from env).

### Step 10 — Delete retired packages

Delete these directories in full:

| Directory              | Package                    |
| ---------------------- | -------------------------- |
| `libraries/libagent/`  | `@forwardimpact/libagent`  |
| `libraries/libmemory/` | `@forwardimpact/libmemory` |
| `libraries/libllm/`    | `@forwardimpact/libllm`    |
| `services/agent/`      | `@forwardimpact/svcagent`  |
| `services/memory/`     | `@forwardimpact/svcmemory` |
| `services/llm/`        | `@forwardimpact/svcllm`    |
| `services/tool/`       | `@forwardimpact/svctool`   |

Delete from `products/guide/`:

| Path                                 | Reason                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `starter/agents/planner.agent.md`    | Replaced by `guide-default` prompt                                                                |
| `starter/agents/researcher.agent.md` | Same                                                                                              |
| `starter/agents/editor.agent.md`     | Same                                                                                              |
| `starter/tools.yml`                  | Tool definitions now live in `services/mcp/tools.js`; `fit-guide init` no longer copies this file |

**Retained** in `products/guide/proto/`:

| Path                   | Reason                                                                    |
| ---------------------- | ------------------------------------------------------------------------- |
| `proto/common.proto`   | Imported by `graph.proto` and `pathway.proto` (both retained). Must stay. |
| `proto/resource.proto` | Imported by `tool.proto` and `common.proto` (both retained). Must stay.   |

### Step 11 — Update `products/guide/package.json`

Remove dependencies:

- `@forwardimpact/libagent`
- `@forwardimpact/libmemory`
- `@forwardimpact/libllm`
- `@forwardimpact/svcagent`
- `@forwardimpact/svcllm`
- `@forwardimpact/svcmemory`
- `@forwardimpact/svctool`
- `@forwardimpact/librepl` (the current CLI imports `Repl` from librepl at line
  27; the rewrite replaces this with the SDK's conversation loop)

Add dependencies:

- `@anthropic-ai/claude-agent-sdk`
- `@forwardimpact/svcmcp` (for type references / config only, not runtime
  import)

### Step 12 — Fix cascading dependency: libresource

**Modified:** `libraries/libresource/package.json`

Remove `@forwardimpact/libllm` from `dependencies`. No code changes needed — the
import was never used.

### Step 13 — Fix cascading dependency: libterrain

**Modified:** `libraries/libterrain/bin/fit-terrain.js`

Replace the `resolveLlmApi` function. Before:

```javascript
async function resolveLlmApi(config) {
  const { createLlmApi } = await import("@forwardimpact/libllm");
  const token = await config.llmToken();
  const baseUrl = config.llmBaseUrl();
  return createLlmApi(token, config.LLM_MODEL || "openai/gpt-4.1-mini", baseUrl, embeddingBaseUrl);
}
```

After:

```javascript
async function resolveLlmApi(config) {
  const token = await config.llmToken();
  const baseUrl = config.llmBaseUrl();
  const model = config.LLM_MODEL || "openai/gpt-4.1-mini";

  return {
    async createCompletions({ messages, max_tokens }) {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ model, messages, max_tokens }),
      });
      if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);
      return res.json();
    },
  };
}
```

This preserves the same interface (`createCompletions()`) that
`libsyntheticprose`'s `ProseEngine` expects, without depending on `libllm`.

**Modified:** `libraries/libterrain/package.json` — remove
`@forwardimpact/libllm` from `dependencies`.

### Step 14 — Fix cascading dependency: libvector

**Modified:** `libraries/libvector/bin/fit-process-vectors.js`

Replace the top-level import at line 5:

Before:

```javascript
import { createLlmApi } from "@forwardimpact/libllm";
```

After — same inline HTTP client pattern as the libterrain fix:

```javascript
function createLlmApi(token, model, baseUrl) {
  return {
    async createEmbeddings({ input }) {
      const res = await fetch(`${baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ input, model }),
      });
      if (!res.ok) throw new Error(`Embedding request failed: ${res.status}`);
      return res.json();
    },
  };
}
```

**Modified:** `libraries/libvector/bin/fit-search.js` — same replacement at
line 6.

**Modified:** `libraries/libvector/src/processor/vector.js` — update JSDoc
`@param` type annotation at line 16: change
`{import("@forwardimpact/libllm").LlmApi}` to `{object}` with inline description
of the expected `createEmbeddings` method.

### Step 15 — Remove justfile references

**Modified:** `justfile`

Remove recipes that invoke deleted CLI tools (confirmed present):

- Line 94: `bunx --workspace=@forwardimpact/libagent fit-process-agents` (and
  its recipe)
- Line 167: `bunx --workspace=@forwardimpact/libmemory fit-window` (and its
  recipe)
- Line 171: `bunx --workspace=@forwardimpact/libllm fit-completion` (and its
  recipe)

### Step 15 — Run codegen and install

```bash
bun install          # update lockfile after dependency changes
just codegen         # regenerate with tool.proto in new location, deleted protos gone
```

Verify:

- `generated/types/types.js` compiles without errors
- No `agent`, `llm`, `memory` service bases/clients in `generated/services/`
- `tool` service base/client no longer generated (service block removed)
- `tool.*` message types still present in generated types
- `graph`, `vector`, `pathway`, `trace` service bases/clients still generated

### Step 16 — Tests

**Modified:** `products/guide/test/status.test.js` — update mocks to match new
service list (remove agent, memory, llm, tool; add mcp). Update credential check
from `LLM_TOKEN` to `anthropicToken()`.

**Created:** `products/guide/test/cli.test.js` — test CLI parse for new commands
(login, logout, resume, init, status). Test first-run UX error messages.

Run:

```bash
bun test products/guide/
bun test services/vector/
bun test services/web/
bun test libraries/libconfig/
bun run check
bun run test
```

## Files changed

| Action   | Path                                                |
| -------- | --------------------------------------------------- |
| Created  | `proto/tool.proto`                                  |
| Modified | `services/vector/index.js`                          |
| Modified | `services/vector/server.js`                         |
| Modified | `services/vector/test/vector.test.js`               |
| Modified | `services/web/server.js`                            |
| Modified | `services/web/index.js`                             |
| Modified | `products/guide/bin/fit-guide.js` (full rewrite)    |
| Created  | `products/guide/src/lib/login.js`                   |
| Modified | `products/guide/src/lib/status.js`                  |
| Modified | `products/guide/package.json`                       |
| Modified | `products/guide/starter/config.json`                |
| Modified | `products/guide/test/status.test.js`                |
| Created  | `products/guide/test/cli.test.js`                   |
| Modified | `libraries/libresource/package.json`                |
| Modified | `libraries/libterrain/bin/fit-terrain.js`           |
| Modified | `libraries/libterrain/package.json`                 |
| Modified | `libraries/libvector/bin/fit-process-vectors.js`    |
| Modified | `libraries/libvector/bin/fit-search.js`             |
| Modified | `libraries/libvector/src/processor/vector.js`       |
| Modified | `justfile`                                          |
| Deleted  | `libraries/libagent/` (entire directory)            |
| Deleted  | `libraries/libmemory/` (entire directory)           |
| Deleted  | `libraries/libllm/` (entire directory)              |
| Deleted  | `services/agent/` (entire directory)                |
| Deleted  | `services/memory/` (entire directory)               |
| Deleted  | `services/llm/` (entire directory)                  |
| Deleted  | `services/tool/` (entire directory)                 |
| Deleted  | `products/guide/starter/agents/` (entire directory) |

## Verification

```bash
just codegen                   # proto generation succeeds
bun install                    # lockfile consistent
bun test products/guide/       # CLI and status tests pass
bun test services/vector/      # embedding path works
bun test services/web/         # no agent dependency
bun test libraries/libconfig/  # credential tests pass
bun run check                  # lint, format, types
bun run test                   # full test suite, zero regressions
```
