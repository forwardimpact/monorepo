# Plan 1230-a — Part 05: services/ghbridge

New sibling service: receives `discussion` and `discussion_comment` webhooks
from the Kata GitHub App, dispatches `kata-dispatch.yml` via libbridge, and
posts replies via the `addDiscussionComment` GraphQL mutation. Sibling to
`services/msbridge`; both depend on `libbridge`.

Libraries used: `@forwardimpact/libbridge` (Part 01), `@forwardimpact/libconfig`, `@forwardimpact/libtelemetry`, `@forwardimpact/librpc`, `@forwardimpact/libstorage` (LocalStorage), `@forwardimpact/libmock` (devDep), `express` (existing — libbridge peer-dep), `@octokit/webhooks-methods` (NEW — signature verification), `@octokit/graphql` (NEW — `addDiscussionComment`), `@octokit/auth-app` (NEW — installation token minting).

## Step 5.1 — Scaffold the service

Created:
- `services/ghbridge/package.json` — name `@forwardimpact/svcghbridge`, version `0.1.0`, JTBD entry mirroring msbridge ("Platform Builders / Bridge GitHub Discussions to the Agent Team"), bin `fit-svcghbridge`, dependencies as listed above. New `@octokit/*` deps with justifications attached in a sibling `package-notes.md` (npm strips JSON comments):
  - `@octokit/webhooks-methods` — Kata App webhook signature verification (`X-Hub-Signature-256` → constant-time HMAC comparison).
  - `@octokit/graphql` — `addDiscussionComment` and `addReaction` mutations.
  - `@octokit/auth-app` — Installation token minting from `app_id` + `app_private_key`.
- `services/ghbridge/README.md` — single paragraph + curl example for local dev (mirrors msbridge's tunnel pattern with `cloudflared`).
- `services/ghbridge/server.js` — entry point analogous to `services/msbridge/server.js`. Config:
  ```js
  createServiceConfig("ghbridge", {
    protocol: "http",
    port: 8080,
    github_repo: "",            // "owner/repo"
    callback_base_url: "",      // for callback URL composition
    app_id: "",                 // Kata App numeric id
    app_private_key: "",        // PEM contents (multi-line env var)
    app_installation_id: "",    // installation id for the target repo
    app_webhook_secret: "",     // for X-Hub-Signature-256 verification
  })
  ```
  Constructs `octokit = createAppAuth({ appId, privateKey, installationId })` and passes the resulting `getInstallationToken()` callable into `GhBridgeService`. Also constructs `storage = new LocalStorage({ root: process.env.STATE_DIR ?? "/var/lib/ghbridge" })`.
- `services/ghbridge/index.js` — `GhBridgeService` class skeleton with no method bodies yet.

Verify: `cd services/ghbridge && bun install` succeeds; `node server.js` fails fast on missing env (same shape as msbridge).

## Step 5.2 — Webhook intake + signature verification

Modified: `services/ghbridge/index.js`.

Mount the libbridge server with `webhookPath: "/api/webhook"` and an
`onWebhook` handler that:

1. Reads `X-Hub-Signature-256` and the raw request body (`req.rawBody` is populated by libbridge's `express.json({ verify })` hook from Part 01 Step 1.2).
2. Calls `await verify(secret, req.rawBody.toString("utf8"), signature)` from `@octokit/webhooks-methods`. On mismatch, respond `401`.
3. Branches on `X-GitHub-Event`:
   - `discussion` (action `created`): build `prompt` from the new discussion body. Create or update the `DiscussionContext` keyed by `("github-discussions", discussion.node_id)`.
   - `discussion_comment` (action `created`): load existing context (by `discussion.node_id`), append the comment to `history` via `appendHistory`, build the prompt from the latest comment + history. If any entry in `open_rfcs` has a `responses` trigger, increment its observed count and call `evaluateTrigger` (Step 5.4).
   - any other event: respond `204` and return.
4. Mints an installation token via `getInstallationToken()`.
5. Calls `dispatchWorkflow({ workflowFile: "kata-dispatch.yml", repo, token, prompt, callbackUrl, correlationId, discussionId: discussion.node_id })`. `callbackUrl` is `${callback_base_url}/api/callback/${token}` where the `token` is a fresh `CallbackRegistry.register(correlationId, { discussionId: discussion.node_id })` token.
6. Persists `pending_callbacks[token] = correlationId` to the store before returning `200`.

Created:
- `services/ghbridge/test/webhook.test.js` — fixture payloads for both event types, asserts: signature reject on tampered body; signature accept on a valid body; `dispatchWorkflow` called with expected args; `CallbackRegistry` populated.

Verify: `bun test services/ghbridge/test/webhook.test.js`.

## Step 5.3 — Callback handler with structured `replies[]`

Modified: `services/ghbridge/index.js`.

`onCallback(payload, token)`:

1. `const meta = CallbackRegistry.consume(token)` — returns `{correlationId, discussionId}` or `null`. On `null`, respond `404` (matches msbridge's existing surface).
2. `const correlationId = meta.correlationId; const discussionId = meta.discussionId`. This is the **one-hop** lookup: `token → meta`. The store's `pending_callbacks` map is the persisted slice for restart recovery only.
3. Load the `DiscussionContext` record by `(channel, discussionId)`.
4. For each `reply` in `payload.replies` (when present — Part 02 Step 2.5 adds them):
   - Mint GraphQL input: `{ discussionId: ctx.discussion_id, body: reply.body, replyToId: reply.in_reply_to ?? null }`.
   - Call `octokit.graphql(ADD_DISCUSSION_COMMENT_MUTATION, { i: input })`.
   - Append to `history`: `{ role: "assistant", text: reply.body }`.
5. Branch on `payload.verdict`:
   - `"recessed"`: persist `open_rfcs[correlationId] = { trigger: payload.trigger, opened_at: Date.now(), history_index_at_open: ctx.history.length }`. Schedule the trigger watcher (Step 5.4).
   - `"adjourned"`: clear `open_rfcs[correlationId]`.
   - `"failed"`: clear `open_rfcs[correlationId]`; post a single `addDiscussionComment` to the discussion thread carrying `payload.summary` (so the human sees the failure surface), then mark the context as not-in-progress. Do **not** re-dispatch.
6. Update `ctx.last_active_at`, write back via `store.add(ctx)`, `flush()`.

Created:
- `services/ghbridge/src/graphql.js` — exports:
  ```js
  export const ADD_DISCUSSION_COMMENT_MUTATION = `
    mutation Add($i: AddDiscussionCommentInput!) {
      addDiscussionComment(input: $i) { comment { url } }
    }`;
  ```
  Single export so review can grep one location.
- `services/ghbridge/test/callback.test.js` — fixture callbacks for `adjourned`, `recessed`, `failed` verdicts; each verifies the corresponding GraphQL / state-write actions.

Verify: `bun test services/ghbridge/test/callback.test.js`; `grep "addDiscussionComment" services/ghbridge/src/graphql.js` returns one line (the source of truth); `grep -r "addDiscussionComment" .github/workflows/` returns empty (matches spec § Success criteria row 6).

## Step 5.4 — Resume-trigger watcher

Modified: `services/ghbridge/index.js`.

Two trigger sources:

- **`responses` kind** — Evaluated synchronously in the webhook handler (Step 5.2). When a `discussion_comment` lands on a thread with an open RFC, compute `observed = ctx.history.length - open_rfcs[cid].history_index_at_open` and call `evaluateTrigger(trigger, { responses: observed }, Date.now())`. If `fired === true`, immediately re-dispatch with `resume_context: JSON.stringify({ correlation_id: cid, history_since: ctx.history.slice(open_rfcs[cid].history_index_at_open) })`.

- **`elapsed` kind** — Each open RFC with an elapsed deadline gets a `due_at` (absolute ms epoch) computed at recess time and stored in `open_rfcs[cid].due_at`. The bridge keeps an in-memory `setTimeout` keyed by `cid`. On bridge restart, `GhBridgeService.start()` iterates `open_rfcs`, computes `remaining = due_at - Date.now()`, and re-schedules. JS `setTimeout`'s practical cap is ~24.8 days; for windows up to 14 days (the coordination-protocol horizon) the single timer is safe. For future >24-day windows, the rearm loop chunks: `if (remaining > 7 * DAY) { setTimeout(rearm, 7 * DAY) } else { setTimeout(fire, remaining) }`. All persistent state (the absolute `due_at`) lives in `open_rfcs`; the in-memory timer is purely a recovery target, so a mid-chunk restart resumes correctly from the persisted `due_at`.

- **`either` kind** — Both sources active; whichever fires first wins. On fire, clear the other and the RFC entry.

`resume_context` payload shape (the contract Part 02's `Discusser` consumes on resume):

```ts
{
  correlation_id: string;            // the recess that's being resumed
  history_since: Array<{role: "user"|"assistant", text: string}>;  // new entries since recess
  participants?: Array<...>;          // optional roster update
}
```

The Discusser merges `history_since` into its own context, restores `pendingAsks` from a separate field on the same JSON, and resumes the loop. Part 02 Step 2.3's tests cover the round-trip.

Created: `services/ghbridge/test/resume.test.js` — fakes a `responses=2` recess, fires two `discussion_comment` webhooks, asserts a re-dispatch with a `resume_context` containing the expected `history_since` payload.

Verify: `bun test services/ghbridge/test/resume.test.js`.

## Step 5.5 — Reaction-based progress indicator

Modified: `services/ghbridge/index.js`.

Hook `ProgressTicker` into the dispatch path. The tick callback adds /
refreshes an "EYES" reaction on the latest comment in the thread via the
**GraphQL** `addReaction` mutation (Discussion-comment reactions are not
available via REST):

```graphql
mutation($i: AddReactionInput!) {
  addReaction(input: $i) { reaction { content } }
}
```

Input: `{ subjectId: <commentNodeId>, content: EYES }`. The mutation is
idempotent — repeated calls do not duplicate the reaction. On stop, no
removal — the reaction stays as evidence that the bridge engaged.

Created: `services/ghbridge/src/graphql.js` (extend) — add `ADD_REACTION_MUTATION` alongside `ADD_DISCUSSION_COMMENT_MUTATION`.

Verify: extends `services/ghbridge/test/webhook.test.js` to assert the `addReaction` mutation is called on dispatch.

## Step 5.6 — Storage and persistence wiring

Modified: `services/ghbridge/server.js` — pass storage into the service. Default: `process.env.STATE_DIR ?? "/var/lib/ghbridge"`. The `STATE_DIR` env variable is service-local — no monorepo-wide convention. Document the variable in `services/ghbridge/README.md`.

Verify: `node server.js` writes the JSONL file (`${STATE_DIR}/discussions.jsonl`) on first webhook; subsequent restart loads existing context.

## Step 5.7 — Update root references

Modified:
- `services/CLAUDE.md` — add ghbridge row.
- `services/README.md` — add ghbridge JTBD entry (Catalog section).
- `websites/fit/docs/services/` — add a `ghbridge/` page following the msbridge shape if msbridge already has external docs; otherwise no-op (services do not publish external docs by default per `services/CLAUDE.md`).

Verify: `ls services/{ghbridge,msbridge}` shows both (matches spec § Success criteria row 4).

## Notes for the implementer

- The three new `@octokit/*` packages must pass `bun run audit`. Their
  publisher (`octokit`) is already trusted via existing usage of
  `@octokit/rest` if present; the implementer confirms via the security
  policy in `CONTRIBUTING.md`.
- The Kata App webhook URL must be set to `${PUBLIC_URL}/api/webhook` —
  Part 06 handles the App-settings documentation edit. Until that's
  applied, ghbridge runs locally via a tunnel (see README); production
  traffic still routes through the obsolete `agent-react.yml` Discussion
  handler until Part 03 lands AND the App URL flips.
- Claim `spec-1230-part-05` via `fit-wiki claim` before opening the
  branch.
- `addReaction`'s `content` field uses GitHub's enum (UPPERCASE):
  `EYES`, `THUMBS_UP`, etc. The implementer must not use the emoji
  string or the GraphQL lowercase variant.
