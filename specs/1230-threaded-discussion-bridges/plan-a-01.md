# Plan 1230-a — Part 01: libbridge package and DiscussionContext store

Foundation for every later part. Adds `libraries/libbridge` and the
`DiscussionContext` libindex schema both bridges share.

Libraries used: `@forwardimpact/libindex` (BufferedIndex), `@forwardimpact/libstorage` (StorageInterface — caller-injected at runtime), `@forwardimpact/libconfig` (createServiceConfig consumed by host services), `@forwardimpact/libtelemetry` (Logger / Tracer types only — no runtime dep), `@forwardimpact/libmock` (devDep — `createMockStorage`, `createMockLogger`), `express` (peer-dep — host services own the version).

## Step 1.1 — Scaffold the package

Create the package layout with stub exports so later steps can import.

Created:
- `libraries/libbridge/package.json` — name `@forwardimpact/libbridge`, version `0.1.0`, scripts mirroring sibling libraries, JTBD entry under `jobs` ("Platform Builders / Bridge Threaded Channels to the Agent Team"). `dependencies` includes `@forwardimpact/libindex` and `@forwardimpact/libstorage`. `peerDependencies` includes `express`. `devDependencies` includes `@forwardimpact/libmock`.
- `libraries/libbridge/README.md` — single-paragraph overview pointing to `websites/fit/docs/libraries/libbridge/`.
- `libraries/libbridge/src/index.js` — re-exports all public symbols (see steps below).
- `libraries/libbridge/CLAUDE.md` — channel-agnostic invariants (no `botbuilder` imports, no `@octokit/*` imports, no GraphQL strings).

Verify: `bun install` at repo root resolves the new workspace package; `cd libraries/libbridge && bun test` runs (0 tests is acceptable — Bun's test runner exits 0 when no test files match).

## Step 1.2 — Callback registry and HTTP intake skeleton

Channel-agnostic HTTP server that accepts a per-bridge webhook on a configurable path and an inbound `/api/callback/:token` route.

Created:
- `libraries/libbridge/src/server.js` — exports `createBridgeServer({ config, logger, tracer, onWebhook, onCallback, webhookPath })`. Wraps `express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })` so signature-verifying adapters can read the raw body; mounts `OPTIONS|POST <webhookPath>` and `POST /api/callback/:token`; returns `{ start, stop, app }`.
- `libraries/libbridge/src/callback-registry.js` — exports `class CallbackRegistry { constructor({ ttlMs = 7_200_000 }); register(correlationId, meta): token; consume(token): meta|null; sweep(now) }`. Default TTL matches the existing `services/msteams/index.js` constant (2h). Constructor accepts `ttlMs` so host services can override.
- `libraries/libbridge/test/server.test.js`, `test/callback-registry.test.js` — both use `createMockLogger` from `@forwardimpact/libmock`.

Verify: `bun test libraries/libbridge/test/server.test.js libraries/libbridge/test/callback-registry.test.js`.

## Step 1.3 — Rate limiting, history bound, prompt builder

Extract the channel-agnostic Teams helpers verbatim and rename for symmetry.

Created:
- `libraries/libbridge/src/prompt.js` — exports `buildPrompt(text, history, { maxExchanges = 5, charCap = 4000 } = {})`. Body lifted from `services/msteams/index.js:40-52`.
- `libraries/libbridge/src/history.js` — exports `appendHistory(history, entry, { maxEntries = 10 } = {})`. Body lifted from `services/msteams/index.js:108-118`.
- `libraries/libbridge/src/rate-limit.js` — exports `class RateLimiter { constructor({ windowMs = 60_000, max = 5 } = {}); check(threadId, dispatches): { allowed: boolean, retryAfterMs?: number } }`. The original `services/msteams/index.js:#isRateLimited` returned a boolean — the new API returns a structured result. Part 04 Step 4.3 adapts the msteams call site to read `result.allowed`.
- `libraries/libbridge/test/{prompt,history,rate-limit}.test.js`.

Verify: `bun test libraries/libbridge/test/{prompt,history,rate-limit}.test.js`.

## Step 1.4 — Workflow dispatch helper

One implementation of `workflow_dispatch` against the GitHub Actions REST API used by both bridges.

Created:
- `libraries/libbridge/src/dispatch.js` — exports:
  ```js
  export async function dispatchWorkflow({
    workflowFile,        // "kata-dispatch.yml"
    ref = "main",
    repo,                // "owner/repo"
    token,               // installation token
    prompt,
    callbackUrl,
    correlationId,
    discussionId,        // flows through to libeval for trace linkage
    resumeContext,       // omitted on first dispatch; JSON string on resume
  }) { ... }
  ```
  POSTs to `https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/dispatches`. Throws on non-2xx with status + body. Only includes `discussion_id` and `resume_context` in the `inputs` body when defined (so existing callers that omit them stay byte-identical).
- `libraries/libbridge/test/dispatch.test.js` — mocks `fetch`.

Verify: `bun test libraries/libbridge/test/dispatch.test.js`.

## Step 1.5 — DiscussionContext store over libindex

Persisted thread state keyed by `(channel, discussion_id)`.

Created:
- `libraries/libbridge/src/discussion-context.js` — exports `class DiscussionContextStore extends BufferedIndex`. The class:
  ```js
  export class DiscussionContextStore extends BufferedIndex {
    constructor(storage, {
      indexKey = "discussions.jsonl",
      flushIntervalMs = 5_000,
      maxBufferSize = 1_000,
      conversationTtlMs = 24 * 60 * 60 * 1000,
      sweepIntervalMs = 60_000,
    } = {}) {
      super(storage, indexKey, {
        flush_interval: flushIntervalMs,
        max_buffer_size: maxBufferSize,
      });
      this.#conversationTtlMs = conversationTtlMs;
      this.#sweepTimer = setInterval(() => this.#sweep(), sweepIntervalMs);
      this.#sweepTimer.unref();
    }

    static keyOf(channel, discussionId) { return `${channel}:${discussionId}`; }

    async loadByChannel(channel, discussionId) { /* ... */ }

    // ... #sweep evicts records where now - last_active_at > conversationTtlMs
  }
  ```
  Constructor matches the `BufferedIndex(storage, indexKey, config)` signature on `libraries/libindex/src/buffered.js:22`. The store is constructed by host services that pass in their own `StorageInterface` (e.g. `LocalStorage` from `@forwardimpact/libstorage`).

  Record shape:
  | Field | Type | Notes |
  |---|---|---|
  | `id` | `string` | `${channel}:${discussion_id}` — required by IndexBase. Use `DiscussionContextStore.keyOf(channel, discussionId)`. |
  | `channel` | `"github-discussions" \| "msteams"` | Future-channel friendly. |
  | `discussion_id` | `string` | Stable identifier. |
  | `history` | `Array<{role: "user"\|"assistant", text: string}>` | Bounded by `appendHistory`. |
  | `participants` | `Array<{name: string, kind: "agent"\|"human", external_id?: string, metadata?: object}>` | Roster. `metadata` carries channel-specific structured data (e.g. the Bot Framework `ConversationReference` for msbridge — see Part 04 Step 4.3). Serialised via `JSON.stringify` round-trip. |
  | `open_rfcs` | `Record<correlationId, {trigger: ResumeTrigger, opened_at: number, history_index_at_open: number}>` | Active recess triggers. `history_index_at_open` is the position in `history[]` when the recess started, so `responses` triggers can be evaluated by `(history.length - history_index_at_open)`. |
  | `lead` | `string` | Current Chair profile name (default `"release-engineer"`). |
  | `pending_callbacks` | `Record<token, correlationId>` | Token registry. Mirror of `CallbackRegistry` for the *persisted* slice (CallbackRegistry's in-memory state is recoverable from this on restart). |
  | `last_active_at` | `number` | ms epoch — drives the configurable conversation TTL. |
- `libraries/libbridge/test/discussion-context.test.js` — uses `createMockStorage` from `@forwardimpact/libmock`. Asserts: `keyOf` round-trip, persistence across `flush()`, `loadByChannel` lookup, `participants[?].metadata` survives `JSON.stringify` round-trip on records with nested objects (covers msbridge's `ConversationReference`).
- `libraries/libbridge/src/index.js` — add `export { DiscussionContextStore } from "./discussion-context.js";`.

Verify: `bun test libraries/libbridge/test/discussion-context.test.js`.

## Step 1.6 — Progress ticker

Channel-agnostic ticker that calls a host-provided `tick()` callback at a fixed interval. Per-channel rendering (Teams typing activity vs. GitHub reaction) stays in the adapter.

Created:
- `libraries/libbridge/src/progress-ticker.js` — exports `class ProgressTicker { constructor({ intervalMs = 12_000 } = {}); start(token, tick: () => Promise<void>): void; stop(token): void }`. Swallows errors from `tick()` and silently stops on failure (matches the existing msteams behaviour at `services/msteams/index.js:512-522`).
- `libraries/libbridge/test/progress-ticker.test.js`.

Verify: `bun test libraries/libbridge/test/progress-ticker.test.js`.

## Step 1.7 — Resume-trigger contract

Shared type for the recess payload bridges read back into a re-dispatch.

Created:
- `libraries/libbridge/src/triggers.js` — exports JSDoc typedefs for `ResumeTrigger`:
  ```
  { kind: "responses" | "elapsed" | "either",
    responses?: number,
    elapsed?: string  // ISO-8601 duration, e.g. "P14D"
  }
  ```
  Plus `evaluateTrigger(trigger, observed, now)`:
  ```js
  /**
   * @param {ResumeTrigger} trigger
   * @param {{responses?: number, opened_at?: number}} observed
   * @param {number} now - ms epoch (caller-provided for testability)
   * @returns {{fired: boolean, due_at?: number}}
   */
  export function evaluateTrigger(trigger, observed, now) { ... }
  ```
  `now` is a parameter (not `Date.now()` baked in) so tests can drive deterministic clocks. The function returns `due_at` for elapsed triggers so bridges know when to schedule the next timer; the `elapsed` ISO-8601 parsing handles `P14D` / `PT12H` / `P1DT6H` shapes via a small inline parser.

  For `either` kind: returns `fired: true` if either branch fires.
- `libraries/libbridge/test/triggers.test.js` — covers all three kinds + ISO-8601 parser edge cases.

Verify: `bun test libraries/libbridge/test/triggers.test.js`.

## Step 1.8 — Wire root workspace + check passes

Modified:
- root `package.json` — confirm `libraries/libbridge` is matched by the existing `libraries/*` workspace glob (it is — no change unless `bun install` complains).
- `bun.lock` — regenerated by `bun install`.

Verify: at repo root, `bun install` clean; `just check` green.

## Notes for the implementer

- All constants moving from `services/msteams/index.js` keep their values
  byte-for-byte. Part 04 deletes the originals once the import path is in
  place.
- `DiscussionContextStore`'s file location is decided by the consuming
  service. Parts 04 and 05 each pass a `StorageInterface` (typically
  `LocalStorage` for dev, `S3Storage` or `SupabaseStorage` for production)
  plus an optional `indexKey`.
- Do not import `botbuilder` or `@octokit/*` in this package — the
  CLAUDE.md invariant is enforced by `kata-review`.
