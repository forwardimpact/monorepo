# Plan 0580-A — Guide on Claude Agent SDK and MCP

## Approach

Replace Guide's bespoke OpenAI-compatible harness with the Claude Agent SDK and
expose Guide's knowledge services via MCP — a clean break with no compatibility
shims, no deprecation window, and zero residue from the prior architecture.

The implementation targets four sequenced parts, each independently committable
and verifiable.

## Rationale

The design prescribes five components: libconfig extensions (§3), MCP server
(§1), CLI rewrite (§2), OAuth flow (§4), and package retirement (§5). The plan
sequences these by dependency: libconfig first (everything reads credentials),
MCP server second (all three surfaces connect to it), CLI rewrite + OAuth +
deletion third (the bulk of the pivot), documentation + parity last (requires
final code state).

## Cross-cutting concerns

### Clean break

Every retired package is deleted in Part 3 alongside its replacement. No
adapters, shims, or feature flags bridge old and new. The `.env` template
changes shape; old `LLM_TOKEN` values are silently ignored (no code reads them).

### Proto migration

`tool.proto` defines shared message types (`ToolCallResult`, `ToolCall`,
`QueryFilter`) imported by six other protos. Deleting `services/tool/` removes
the file from the codegen discovery path
(`node_modules/@forwardimpact/svctool/ proto/`). Before deletion, `tool.proto`
is moved to `proto/tool.proto` at the repo root — the codegen already checks
`{projectRoot}/proto/` as a proto source. The
`service Tool { rpc CallTool ... }` block is removed from the moved file (the
implementation is deleted; only the message types are shared). `agent.proto`,
`llm.proto`, and `memory.proto` are deleted with their services; no retained
code references their generated types after cascading dependency fixes.

### Cascading dependencies

Deleting `libllm` and `svcllm` breaks two consumers outside the direct deletion
scope:

- **`services/vector`** — calls `svcllm.CreateEmbeddings()` at runtime for query
  embedding. Part 3 replaces this with a direct HTTP call to TEI, configured via
  `EMBEDDING_BASE_URL`.
- **`libraries/libresource`** — declares `@forwardimpact/libllm` in
  `package.json` but never imports it. Part 3 removes the dead dependency.
- **`libraries/libterrain`** — dynamically imports `libllm` in
  `fit-terrain --generate` mode. Part 3 replaces the import with a minimal
  inline HTTP client calling the same OpenAI-compatible endpoint.
- **`libraries/libvector`** — `bin/fit-process-vectors.js` and
  `bin/fit-search.js` both import `createLlmApi` from `libllm` at the top level.
  Part 3 replaces these with the same inline HTTP client pattern used for
  `libterrain`.

Deleting `svcagent` breaks one consumer:

- **`services/web`** — creates an agent gRPC client for its `/web/api/chat`
  endpoint. Part 3 removes the chat endpoint (replaced by the MCP + SDK surface)
  and retains only the health endpoint and any non-agent endpoints.

### Testing strategy

Each part carries its own verification steps using `node:test`. Mocking follows
existing `@forwardimpact/libharness` patterns. The final quality gate is
`bun run check && bun run test` passing with zero regressions.

## Part index

| Part | File                         | Summary                              | Agent                             |
| ---- | ---------------------------- | ------------------------------------ | --------------------------------- |
| 1    | [plan-a-01.md](plan-a-01.md) | libconfig credential extensions      | staff-engineer                    |
| 2    | [plan-a-02.md](plan-a-02.md) | MCP server (`services/mcp`)          | staff-engineer                    |
| 3    | [plan-a-03.md](plan-a-03.md) | CLI rewrite, OAuth, package deletion | staff-engineer                    |
| 4    | [plan-a-04.md](plan-a-04.md) | Documentation and parity rubric      | technical-writer + staff-engineer |

## Execution

```
Part 1 → Part 2 → Part 3 → Part 4
```

Strictly sequential. Part 2 depends on Part 1 (`mcpToken()` for auth). Part 3
depends on Part 2 (CLI connects to MCP server). Part 4 depends on Part 3 (docs
describe final state; parity runs against complete stack).

Within Part 4, documentation updates (technical-writer) and parity rubric code
(staff-engineer) can run in parallel — they touch disjoint file sets.

## Libraries used

| Package                          | Specific imports                                             | Used in                   |
| -------------------------------- | ------------------------------------------------------------ | ------------------------- |
| `@forwardimpact/libconfig`       | `createServiceConfig`, `Config` class                        | Parts 1, 2, 3             |
| `@forwardimpact/libstorage`      | `createStorage`                                              | Part 1 (OAuth token file) |
| `@forwardimpact/librpc`          | `createClient`, `Server`, `createTracer`                     | Parts 2, 3                |
| `@forwardimpact/libtelemetry`    | `createLogger`                                               | Parts 2, 3                |
| `@forwardimpact/libtype`         | Proto message factories (`graph.*`, `vector.*`, `pathway.*`) | Part 2                    |
| `@forwardimpact/libcli`          | `createCli`                                                  | Part 3                    |
| `@forwardimpact/libharness`      | `createMockConfig`, `createMockGrpc`                         | Parts 1–3 (tests)         |
| `@modelcontextprotocol/sdk`      | `McpServer`, `StreamableHTTPServerTransport`                 | Part 2                    |
| `@anthropic-ai/claude-agent-sdk` | `query`                                                      | Part 3                    |

## Risks

| Risk                                                           | Likelihood | Impact | Mitigation                                                                                                                              |
| -------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Vector service embedding path breaks silently                  | Medium     | High   | Part 3 adds integration test for `SearchContent` with TEI                                                                               |
| Anthropic OAuth endpoints have undocumented PKCE requirements  | Medium     | Medium | Spike the flow early in Part 3; `ANTHROPIC_API_KEY` env-var path is unaffected                                                          |
| MCP SDK streaming transport edge cases with large tool results | Low        | Medium | Test with real graph/vector responses in Part 2                                                                                         |
| `tool.proto` move breaks codegen for external installations    | Low        | High   | External installs get `tool.proto` via `@forwardimpact/guide` npm package — verify with `npx fit-codegen --all` against a clean install |
| Web service has non-obvious endpoints beyond chat              | Low        | Low    | Read full web service source before removing agent dependency                                                                           |
