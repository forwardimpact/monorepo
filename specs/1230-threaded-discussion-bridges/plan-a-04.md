# Plan 1230-a — Part 04: services/msbridge

Rename `services/msteams` → `services/msbridge` and refactor it onto
`libbridge`. Clean break: there are no deployed consumers of either the
internal service interface or the workflow→callback contract, so no
shims, env-var aliases, or verdict-rewrite mappings are emitted.
Microsoft's Bot Framework HTTP protocol (the external Teams API) is
unchanged — that is the wire format Teams itself speaks, not internal
back-compat.

Libraries used: `@forwardimpact/libbridge` (Part 01),
`@forwardimpact/libconfig`, `@forwardimpact/libtelemetry`,
`@forwardimpact/librpc`, `@forwardimpact/libstorage` (LocalStorage),
`@forwardimpact/libmock` (devDep), `botbuilder` (existing), `express` (existing
— already a libbridge peer-dep).

## Step 4.1 — Move the directory

Modified (via `git mv`):

- `services/msteams/` → `services/msbridge/`

Verify: `ls services/{msteams,msbridge}` — first absent, second present (matches
spec § Success criteria row 3).

## Step 4.2 — Update package metadata

Modified: `services/msbridge/package.json`.

- `name` `@forwardimpact/svcmsteams` → `@forwardimpact/svcmsbridge`.
- `version` unchanged (`0.1.0` — fresh slot for the rename; release engineer
  cuts the first published version).
- `description` "Microsoft Teams bridge …" → "Microsoft Teams bridge onto
  libbridge …".
- `bin.fit-svcmsteams` → `bin.fit-svcmsbridge`.
- Add `"@forwardimpact/libbridge": "^0.1.0"` and
  `"@forwardimpact/libstorage": "^0.1.0"` to `dependencies`.
- `jobs[0]` entry stays (the JTBD is unchanged).

Verify:
`bunx jq '.name + " " + (.dependencies | keys | tostring)' services/msbridge/package.json`
shows `svcmsbridge`, `libbridge`, `libstorage` in deps.

## Step 4.3 — Extract Teams-agnostic logic into libbridge calls

Modified: `services/msbridge/index.js`.

Replace the local definitions / usages with imports from
`@forwardimpact/libbridge`:

| Local symbol | Replacement |
|---|---|
| `HISTORY_MAX_EXCHANGES`, `PROMPT_CHAR_CAP`, local `buildPrompt` | `import { buildPrompt } from "@forwardimpact/libbridge"` (call with defaults). |
| local `appendHistory` | `import { appendHistory }`. |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, the inline `#isRateLimited` body | `new RateLimiter({ windowMs, max })` from libbridge. Adapt the call site: the new API returns `{ allowed, retryAfterMs }` (not a bare boolean) — read `result.allowed`. The dispatches list moves into the call: `rateLimiter.check(threadId, state.dispatches)`. |
| `TYPING_INTERVAL_MS`, `TYPING_VERBS`, `#startTypingTicker`, `#stopTypingTicker` | `new ProgressTicker()` from libbridge — the host supplies `tick()` that calls `adapter.continueConversationAsync(...)` with a random `TYPING_VERBS` verb. The verb list stays in `services/msbridge/index.js` (Teams-specific copy). |
| `PENDING_CALLBACK_TTL_MS`, `#pendingCallbacks` Map + sweep | `new CallbackRegistry({ ttlMs })` from libbridge. |
| `#dispatchWorkflow` private method | `dispatchWorkflow(...)` from libbridge. Pass `workflowFile: "kata-dispatch.yml"`. (If Part 03 has not yet merged, the implementer leaves it as `"agent-react.yml"` and the second-landing PR fixes it on rebase.) |
| `#conversations` Map | `new DiscussionContextStore(storage, { conversationTtlMs: 24*60*60*1000, sweepIntervalMs: 60_000 })` from libbridge. `storage` is `new LocalStorage({ root: process.env.STATE_DIR ?? "/var/lib/msbridge" })` constructed in `server.js`. |

The Bot Framework `ConversationReference` is a structured object (`bot`,
`channelId`, `conversation`, `serviceUrl`, `user`, `activityId`). It must
round-trip through `JSON.stringify` / `JSON.parse`, so:

- Store it as `participants[0].metadata` (the typed `metadata: object` field
  defined in Part 01 Step 1.5's record shape).
- The participant entry shape for msbridge:

  ```js
  { name: "teams-user", kind: "human", external_id: ref.user.id, metadata: ref }
  ```

- On resume, read `participants[0].metadata` back as the `ConversationReference`
  for `adapter.continueConversationAsync(msAppId(), ref, …)`.

Constants moving to libbridge defaults (passed by msbridge to constructors):
`CONVERSATION_TTL_MS = 24h` → `conversationTtlMs`; `SWEEP_INTERVAL_MS = 60s` →
`sweepIntervalMs` (defined on the `DiscussionContextStore` constructor in Part
01 Step 1.5).

Rename the class `MsTeamsService` → `MsBridgeService`. Keep `isValidRunUrl`,
`formatReply`, `validateCallbackPayload` defined locally in
`services/msbridge/index.js` — they are Teams-callback-specific helpers (lifted
from `services/msteams/index.js:58-104`) and have no place in channel-agnostic
libbridge. Re-export `buildPrompt` and `appendHistory` from libbridge as named
exports so existing tests' imports of those two continue to resolve:

```js
export { buildPrompt, appendHistory } from "@forwardimpact/libbridge";
export { isValidRunUrl, formatReply, validateCallbackPayload } from "./helpers.js";  // or inline in index.js
export { MsBridgeService };
```

Verify: `bun test services/msbridge/test/msbridge.test.js` (renamed in Step 4.4)
passes; `grep -c HISTORY_MAX_EXCHANGES services/msbridge/index.js` returns `0`.

## Step 4.4 — Rename test file and update assertions

Modified (via `git mv`):

- `services/msbridge/test/msteams.test.js` →
  `services/msbridge/test/msbridge.test.js`

Edit the renamed file:

- Update `import { MsTeamsService } from "../index.js"` → `MsBridgeService`.
- String assertions on `agent-react.yml` → `kata-dispatch.yml`.
- `hmacAuth.generateToken("agent-react")` at lines 458, 480, 501 →
  `"kata-dispatch"`.
- Add a test asserting `ConversationReference` round-trip through the store:
  write a record with `metadata: ref`, flush, reload, assert deep-equality of
  all fields including nested `conversation`, `bot`, `user`.

Verify: `bun test services/msbridge/test/msbridge.test.js` green.

## Step 4.5 — Update server entry point

Modified: `services/msbridge/server.js`.

- `import { MsTeamsService } from "./index.js"` → `MsBridgeService`.
- `createServiceConfig("msteams", ...)` →
  `createServiceConfig("msbridge", ...)`.
- `createLogger("msteams")` → `createLogger("msbridge")`.
- `createTracer("msteams")` → `createTracer("msbridge")`.
- Construct the storage:
  `import { LocalStorage } from "@forwardimpact/libstorage"; const storage = new LocalStorage({ root: process.env.STATE_DIR ?? "/var/lib/msbridge" });`
  and pass `storage` into
  `new MsBridgeService(config, { logger, tracer, storage })`.

Config-namespace rename: env vars change from `SERVICE_MSTEAMS_*` to
`SERVICE_MSBRIDGE_*` as a clean break. No alias shim, no deprecation
warning, no follow-on PR — `createServiceConfig("msbridge", …)` reads
the new namespace directly, and any operator pulling this build updates
their env file in the same step.

Verify: `node services/msbridge/server.js --help 2>&1` exits without crashing on
missing env; the startup banner says "msbridge";
`rg 'SERVICE_MSTEAMS_' services/msbridge/` returns empty.

## Step 4.6 — Reject malformed callback bodies; ignore unsupported optional fields

`MsBridgeService.handleCallback` validates the required keys
(`correlation_id`, `verdict`, `summary`, `run_url`) and rejects bodies
missing any of them with `400`. The new optional fields (`replies[]`,
`trigger`, `discussion_id`) are accepted and silently ignored — Teams
does not have a threaded-discussion surface to render `replies[]` into,
and `recessed`-verdict callbacks targeted at msbridge are out of scope
for this spec.

Verify: `bun test services/msbridge/test/msbridge.test.js -t 'callback'` covers
the required shape and asserts that an inbound callback with `replies[]` /
`trigger` / `discussion_id` fields is accepted (they are ignored, not rejected).

## Step 4.7 — Update root references

Modified:

- `services/CLAUDE.md` — services list table.
- `services/README.md` — JTBD catalog entry: rename "msteams" row to "msbridge".
- `websites/fit/docs/services/msteams/` → `websites/fit/docs/services/msbridge/`
  (rename directory and update internal links) **if the path exists**.
  `services/CLAUDE.md` notes services do not publish external docs by default —
  if no such directory exists, this bullet is a no-op.
- `.claude/skills/kata-setup/references/` — `services/msteams` mentions become
  `services/msbridge`.

Verify: `rg 'services/msteams|MsTeamsService|svcmsteams'` returns empty.

## Notes for the implementer

- This part can land in parallel with Parts 03 and 05 once Part 01 is on
  `main`. The only cross-part coupling is the `kata-dispatch.yml`
  filename string in Step 4.3 — if Part 03 hasn't merged, leave the
  current `"agent-react.yml"` string and rely on rebase to surface the
  conflict.
- Claim `spec-1230-part-04` via `fit-wiki claim` before opening the
  branch. The intra-agent self-collision pattern (PRs #1094 / #1095) is a
  live risk for this part since two staff-engineer instances could each
  decide msteams cleanup is overdue.
- The `STATE_DIR` env variable default is service-local — there is no
  pre-existing convention in the monorepo (the earlier draft incorrectly
  cited `services/embedding` as precedent). Document the variable in
  `services/msbridge/README.md` with the deployment shape.
