# Plan 1340-a: bridges dispatch under the requester's GitHub identity

- [Spec](spec.md)
- [Design](design-a.md)

## Approach

The plan follows the dependency chain: TokenResolver first (no
dependents), then Dispatcher (consumes TokenResolver), then
ResumeScheduler (consumes Dispatcher), then both bridges in parallel
(consume all three). Each step is a complete, testable unit. The
Dispatcher's constructor-time `getGithubToken` closure is replaced by an
injected `TokenResolver`, and `dispatch()` returns a discriminated
`DispatchAuth` outcome instead of throwing on auth failures — a clean
break with no compatibility shim.

Libraries used: `@forwardimpact/librpc` (clients.GhauthClient),
`@forwardimpact/libtype` (ghauth.GetTokenRequest).

## Step 1: Create TokenResolver and add dependency

Wrap the ghauth gRPC client in a channel-agnostic resolver that maps the
`GetToken` oneof response and gRPC transport failures into a single
discriminated result.

| Action | File |
| --- | --- |
| Create | `libraries/libbridge/src/token-resolver.js` |
| Modify | `libraries/libbridge/package.json` |

```js
import { ghauth } from "@forwardimpact/libtype";

export class TokenResolver {
  #client;

  constructor(client) {
    if (!client) throw new Error("ghauth client is required");
    this.#client = client;
  }

  async resolve(surface, surfaceUserId) {
    try {
      const req = new ghauth.GetTokenRequest({ surface, surface_user_id: surfaceUserId });
      const res = await this.#client.GetToken(req);
      switch (res.result) {
        case "token":
          return { kind: "token", token: res.token };
        case "link_required":
          return { kind: "link_required", authorizeUrl: res.link_required.authorize_url };
        case "re_auth_required":
          return { kind: "reauth_required" };
        default:
          return { kind: "transient", error: new Error("unexpected GetToken result") };
      }
    } catch (err) {
      return { kind: "transient", error: err };
    }
  }
}
```

- `resolve(surface, surfaceUserId)` returns a `DispatchAuth`:
  `{ kind: "token", token }` | `{ kind: "link_required", authorizeUrl }` |
  `{ kind: "reauth_required" }` | `{ kind: "transient", error }`.
- Any gRPC error (UNAVAILABLE, deadline, unknown codes) folds into
  `transient`.

Add `@forwardimpact/libtype` to `libraries/libbridge/package.json`
dependencies. The `GhauthClient` is constructed by the caller (bridge
server.js) and injected — libbridge does not depend on `librpc` directly.

Verify: `bun test libraries/libbridge/test/token-resolver.test.js`

## Step 2: Modify Dispatcher

Replace the construction-time `getGithubToken` closure with an injected
`TokenResolver` and add `requester` as an explicit dispatch input.
Resolve the token **before** the acknowledgement starts. Return a
`DispatchAuth`-shaped outcome.

| Action | File |
| --- | --- |
| Modify | `libraries/libbridge/src/dispatcher.js` |

### Constructor

| Before | After |
| --- | --- |
| `getGithubToken: () => Promise<string> \| string` | `tokenResolver: TokenResolver` |

- Remove `#getGithubToken` private field.
- Add `#tokenResolver` private field.
- Validation: `if (!tokenResolver) throw new Error("tokenResolver is required")`.
- Remove the `getGithubToken` validation.

### `dispatch()` signature

```js
async dispatch({ ctx, prompt, requester, callbackMeta, ackTarget, historyText, workflowInputs })
```

- Add `requester` (required string) to the destructured parameter.
- Validate: `if (typeof requester !== "string") throw new Error("requester is required")`.

### `dispatch()` body — token resolution before ack

```js
// 1. Resolve token BEFORE ack or callback registration
const auth = await this.#tokenResolver.resolve(ctx.channel, requester);
if (auth.kind !== "token") return auth;

// 2. Register callback — merge requester into callbackMeta for round-trip
const correlationId = randomUUID();
const mergedMeta = { ...(callbackMeta ?? {}), requester };
const token = this.#callbacks.register(correlationId, mergedMeta);
ctx.pending_callbacks[token] = correlationId;
const callbackUrl = `${this.#callbackBaseUrl}/api/callback/${token}`;

// 3. Start ack (unchanged)
if (ackTarget !== undefined) await this.#ack.start(token, ackTarget);

// 4. Fire workflow with resolved token
try {
  await dispatchWorkflow({
    workflowFile: this.#workflowFile,
    repo: this.#githubRepo,
    token: auth.token,
    prompt, callbackUrl, correlationId,
    ...(workflowInputs ?? {}),
  });
  if (historyText !== undefined) {
    appendHistory(ctx.history, { role: "user", text: historyText });
  }
  ctx.dispatches.push(Date.now());
  ctx.last_active_at = Date.now();
  await this.#store.add(ctx);
  await this.#store.flush();
  return { kind: "dispatched", token, correlationId };
} catch (err) {
  if (ackTarget !== undefined) await this.#ack.finish(token, ackTarget);
  this.#callbacks.consume(token);
  delete ctx.pending_callbacks[token];
  throw err;
}
```

Key changes from current code:
- Token resolved at the top, before callback registration and ack.
- On non-`token` auth: return the variant immediately — no callback
  registered, no ack started, no workflow fired (SC#7).
- `requester` is merged into `callbackMeta` so the callback round-trip
  carries it back (enterRecess needs it).
- Success return changes from `{ token, correlationId }` to
  `{ kind: "dispatched", token, correlationId }`.
- The existing catch block is unchanged — it rolls back ack + callback on
  a `dispatchWorkflow` HTTP failure. The new early return for non-token
  auth is above the try block, so no rollback is needed.

Verify: `bun test libraries/libbridge/test/dispatcher.test.js`

## Step 3: Modify ResumeScheduler

Record the triggering requester on the RFC so resume redispatches reuse
it. Add a declined-outcome handler for non-token results on resume.
Guard against pre-migration RFCs that lack a `requester` field.

| Action | File |
| --- | --- |
| Modify | `libraries/libbridge/src/resume-scheduler.js` |

### Constructor — add `onDeclined`

```js
constructor({
  dispatcher, store, logger,
  prompt = DEFAULT_PROMPT,
  buildCallbackMeta = (ctx) => ({ discussionId: ctx.discussion_id }),
  buildResumeInputs = () => ({}),
  onDeclined = null,
})
```

- New `#onDeclined` private field.
- Validation: `if (onDeclined != null && typeof onDeclined !== "function") throw new Error(...)`.

### `enterRecess` — add requester

```js
enterRecess(ctx, correlationId, trigger, requester)
```

```js
ctx.open_rfcs[correlationId] = {
  trigger,
  opened_at: openedAt,
  history_index_at_open: ctx.history.length,
  requester,
};
```

### `#redispatch` — pass requester, handle declined, return result

```js
async #redispatch(ctx, correlationId, historySince) {
  const rfc = ctx.open_rfcs[correlationId];
  if (!rfc.requester) {
    this.cancelRecess(ctx, correlationId);
    this.#logger?.info?.("resume.skip", "pre-migration rfc without requester", {
      correlation_id: correlationId,
    });
    return { kind: "transient", error: new Error("pre-migration rfc without requester") };
  }
  const resumeContext = JSON.stringify({
    correlation_id: correlationId,
    history_since: historySince,
  });
  const result = await this.#dispatcher.dispatch({
    ctx,
    prompt: this.#prompt,
    requester: rfc.requester,
    callbackMeta: this.#buildCallbackMeta(ctx),
    workflowInputs: { ...this.#buildResumeInputs(ctx), resumeContext },
  });
  if (result.kind !== "dispatched") {
    this.cancelRecess(ctx, correlationId);
    await this.#store.add(ctx);
    await this.#store.flush();
    if (this.#onDeclined) await this.#onDeclined(ctx, result);
  }
  return result;
}
```

- Reads `requester` from the RFC (recorded by enterRecess).
- **Pre-migration guard:** If `rfc.requester` is falsy (RFC persisted
  before this change), cancel the recess and return `transient`. This
  prevents a crash from `dispatch()` validating `requester` as a
  required string.
- On non-dispatched result: cancel recess, flush store, invoke
  `onDeclined(ctx, result)`.
- `last_active_at` is **not** updated on a declined resume (design
  requirement).
- Returns the dispatch result so callers can branch.

### `#fireElapsed` — branch on dispatch result

```js
async #fireElapsed(correlationId) {
  const found = await this.#findContextWithRfc(correlationId);
  if (!found) return;
  const { ctx, rfc } = found;
  const historySince = ctx.history.slice(rfc.history_index_at_open);
  const result = await this.#redispatch(ctx, correlationId, historySince);
  if (result.kind === "dispatched") {
    this.cancelRecess(ctx, correlationId);
    ctx.last_active_at = Date.now();
    await this.#store.add(ctx);
    await this.#store.flush();
  }
}
```

- `#redispatch` handles the non-dispatched path internally (cancel +
  flush + onDeclined), so `#fireElapsed` only does cancel/flush/update
  on the dispatched path. No double-cancel or double-flush on either
  path.

### `processInbound` — branch on dispatch result, return declined flag

```js
async processInbound(ctx) {
  const fired = this.#evaluate(ctx);
  let anyDeclined = false;
  for (const { correlationId, rfc } of fired) {
    const historySince = ctx.history.slice(rfc.history_index_at_open);
    const result = await this.#redispatch(ctx, correlationId, historySince);
    if (result.kind === "dispatched") {
      this.cancelRecess(ctx, correlationId);
    } else {
      anyDeclined = true;
    }
  }
  const hasOpenRfc = Object.keys(ctx.open_rfcs ?? {}).length > 0;
  return {
    fired: fired.length,
    hasOpenRfc,
    freshDispatchAllowed: fired.length === 0 && !hasOpenRfc,
    anyDeclined,
  };
}
```

- `cancelRecess` only on dispatched results — `#redispatch` handles the
  non-dispatched path.
- New `anyDeclined` flag in the return value: when a resume is declined
  because the requester has no token, a fresh dispatch from the same
  message would also be declined (same user, same missing token). The
  bridge intake can use this flag to skip the redundant fresh dispatch
  and avoid a double-decline message.

Verify: `bun test libraries/libbridge/test/resume-scheduler.test.js`

## Step 4: Export TokenResolver and update CLAUDE.md

| Action | File |
| --- | --- |
| Modify | `libraries/libbridge/src/index.js` |
| Modify | `libraries/libbridge/CLAUDE.md` |

Add to `src/index.js`:

```js
export { TokenResolver } from "./token-resolver.js";
```

Place after the `Dispatcher` export.

Update `CLAUDE.md` § Bridge contract dispatch call to include `requester`:

```js
await dispatcher.dispatch({
  ctx, prompt: buildPrompt(text, ctx.history),
  requester, ackTarget, historyText: text, callbackMeta: { threadId },
});
```

Update the "What lives where" table to add `TokenResolver`.

Verify: `node -e "import('@forwardimpact/libbridge').then(m => console.log(typeof m.TokenResolver))"`
— prints `function`.

## Step 5: Modify msbridge

Wire the ghauth client, derive the per-message requester, handle
`DispatchAuth` outcomes on the intake path, and wire the resume
declined handler.

| Action | File |
| --- | --- |
| Modify | `services/msbridge/server.js` |
| Modify | `services/msbridge/index.js` |

### `server.js`

```js
import { clients } from "@forwardimpact/librpc";
// ...
const { GhauthClient } = clients;
const ghauthConfig = await createServiceConfig("ghauth");
const ghauthClient = new GhauthClient(ghauthConfig, logger, tracer);

const service = new MsBridgeService(config, {
  logger, tracer, storage,
  ghauthClient,
});
```

- `createServiceConfig("ghauth")` reads `SERVICE_GHAUTH_URL` from `.env`
  to get the ghauth service address. This follows the same pattern as
  `services/vector/server.js` which uses
  `createServiceConfig("embedding")` for its gRPC client.

### `index.js` — constructor

- Import `TokenResolver` from `@forwardimpact/libbridge`.
- Add `ghauthClient` to deps destructuring.
- Validate: `if (!deps.ghauthClient) throw new Error("ghauthClient is required")`.
- Replace `Dispatcher` construction:

| Before | After |
| --- | --- |
| `getGithubToken: () => config.ghToken()` | `tokenResolver: new TokenResolver(deps.ghauthClient)` |

- Remove `ghToken: () => string` from the constructor's config JSDoc
  typedef. The `ghToken` config key becomes dead — `config.ghToken()` is
  no longer called.

- Wire `onDeclined` on `ResumeScheduler`:

```js
this.#resume = new ResumeScheduler({
  dispatcher: this.#dispatcher,
  store: this.#store,
  logger,
  buildCallbackMeta: (ctx) => ({ threadId: ctx.discussion_id }),
  buildResumeInputs: () => ({}),
  onDeclined: (ctx, outcome) => this.#renderDeclined(ctx, outcome),
});
```

### `index.js` — `#handleNewMessage`

Derive requester from `activity.from.id` and pass it to dispatch. Handle
non-dispatched outcomes. Keep the existing try/catch around dispatch
because `dispatchWorkflow` HTTP failures still throw:

```js
const requester = activity.from?.id;
if (!requester) return;

// ... rate limiter check unchanged ...

try {
  const result = await this.#dispatcher.dispatch({
    ctx,
    prompt: buildPrompt(text, ctx.history),
    requester,
    ackTarget: { ref, activityId: activity.id },
    callbackMeta: { threadId },
    workflowInputs: { discussionId: threadId },
  });
  if (result.kind === "dispatched") {
    span.addEvent("workflow_dispatched", { correlation_id: result.correlationId });
  } else {
    await this.#renderDeclined(ctx, result);
    span.addEvent("dispatch_declined", { kind: result.kind });
  }
  span.setOk();
} catch (err) {
  this.#logger.error("handleNewMessage", err, { thread_id: threadId });
  span.setError(err);
  await context.sendActivity(
    "Failed to reach the agent team. Please try again later.",
  );
}
```

### `index.js` — `#handleReply`

Pass `requester` from callbackMeta to `enterRecess`. The `meta` object
from `createCallbackHandler` wraps the registered callbackMeta under
`meta.meta`, so `meta.meta?.requester` retrieves the requester that
`dispatch()` merged in Step 2:

```js
case "recessed":
  this.#resume.enterRecess(ctx, meta.correlationId, payload.trigger, meta.meta?.requester);
  break;
```

### `index.js` — new `#renderDeclined` method

```js
async #renderDeclined(ctx, outcome) {
  const ref = ctx.participants?.[0]?.metadata;
  if (!ref) return;
  switch (outcome.kind) {
    case "link_required":
      await sendReply(this.#adapter, this.#msAppId, ref,
        `To dispatch, link your GitHub account: ${outcome.authorizeUrl}`);
      break;
    case "reauth_required":
      await sendReply(this.#adapter, this.#msAppId, ref,
        "Your GitHub link has expired. Please re-link your account to dispatch.");
      break;
    case "transient":
      await sendReply(this.#adapter, this.#msAppId, ref,
        "Unable to verify your GitHub identity right now. Please try again later.");
      break;
  }
}
```

- Uses `sendReply` with the stored `ref` for both intake and resume
  declined paths (the resume `onDeclined` handler has no live
  `turnContext`).

Verify: `bun test services/msbridge/test/`

## Step 6: Modify ghbridge

Wire the ghauth client, derive the per-event requester, handle
`DispatchAuth` outcomes, and wire the resume declined handler.

| Action | File |
| --- | --- |
| Modify | `services/ghbridge/server.js` |
| Modify | `services/ghbridge/index.js` |

### `server.js`

```js
import { clients } from "@forwardimpact/librpc";
// ...
const { GhauthClient } = clients;
const ghauthConfig = await createServiceConfig("ghauth");
const ghauthClient = new GhauthClient(ghauthConfig, logger, tracer);

const service = new GhBridgeService(config, {
  logger, tracer, storage,
  verifyWebhook: verify,
  getInstallationToken,
  graphqlClient,
  ghauthClient,
});
```

### `index.js` — constructor

- Import `TokenResolver` from `@forwardimpact/libbridge`.
- Add `ghauthClient` to deps destructuring.
- Validate: `if (!deps.ghauthClient) throw new Error("ghauthClient is required")`.
- Replace `Dispatcher` construction:

| Before | After |
| --- | --- |
| `getGithubToken: () => this.#getInstallationToken()` | `tokenResolver: new TokenResolver(deps.ghauthClient)` |

- Wire `onDeclined` on `ResumeScheduler`:

```js
onDeclined: (ctx, outcome) => this.#renderDeclined(ctx, outcome),
```

### `index.js` — `#handleDiscussionCreated`

Derive requester from `discussion.user.id`. Keep the existing try/catch
because `dispatchWorkflow` HTTP failures still throw:

```js
const requester = discussion?.user?.id?.toString();
if (!requester) {
  this.#logger.debug("webhook", "ignoring discussion without user id");
  return c.body(null, 204);
}

// ... rate limiter check unchanged ...

try {
  const result = await this.#dispatcher.dispatch({
    ctx,
    prompt: buildPrompt(text, ctx.history),
    requester,
    ackTarget: { subjectId: discussionId },
    historyText: text,
    callbackMeta: { discussionId },
    workflowInputs: { discussionId },
  });
  if (result.kind === "dispatched") {
    span.addEvent("workflow_dispatched", { correlation_id: result.correlationId });
  } else {
    await this.#renderDeclined(ctx, result);
    span.addEvent("dispatch_declined", { kind: result.kind });
  }
  span.setOk();
  return c.body(null, 200);
} catch (err) {
  this.#logger.error("webhook", err, { discussion_id: discussionId });
  span.setError(err);
  return c.json({ error: "Dispatch failed" }, 502);
}
```

### `index.js` — `#handleDiscussionComment`

Derive requester from `comment.user.id`:

```js
const requester = comment?.user?.id?.toString();
if (!requester) return c.body(null, 204);

// ... freshDispatchAllowed check ...

if (freshDispatchAllowed) {
  const limit = this.#rateLimiter.check(discussionId, ctx.dispatches);
  if (!limit.allowed) { /* ... unchanged ... */ }
  else {
    const result = await this.#dispatcher.dispatch({
      ctx,
      prompt: buildPrompt(text, ctx.history),
      requester,
      ackTarget: { subjectId: comment?.node_id },
      callbackMeta: { discussionId: ctx.discussion_id },
      workflowInputs: { discussionId: ctx.discussion_id },
    });
    if (result.kind !== "dispatched") {
      await this.#renderDeclined(ctx, result);
    }
  }
}
```

### `index.js` — `#handleReply`

Pass `requester` to `enterRecess`:

```js
case "recessed":
  this.#resume.enterRecess(ctx, meta.correlationId, payload.trigger, meta.meta?.requester);
  break;
```

### `index.js` — new `#renderDeclined` method

Posts via the `graphqlClient` (installation credential — the app's voice,
not the user's):

```js
async #renderDeclined(ctx, outcome) {
  let body;
  switch (outcome.kind) {
    case "link_required":
      body = `To dispatch, link your GitHub account: ${outcome.authorizeUrl}`;
      break;
    case "reauth_required":
      body = "Your GitHub link has expired. Please re-link your account to dispatch.";
      break;
    case "transient":
      body = "Unable to verify your GitHub identity right now. Please try again later.";
      break;
    default:
      return;
  }
  await postSingleDiscussionReply(this.#graphqlClient, ctx, body);
}
```

- Uses the installation credential via `this.#graphqlClient` — the
  declined message is the app's notice, not the user's action (design
  decision: replies stay on installation credential).

### Reply/reaction path unchanged

`graphqlClient` continues to use the installation token for
`postDiscussionReplies`, `postSingleDiscussionReply`, and
`buildReactionAdapter` — no change (SC#9).

Verify: `bun test services/ghbridge/test/`

## Step 7: Tests

New test files for the per-user dispatch-auth behavior, plus updates to
existing libbridge tests.

| Action | File |
| --- | --- |
| Create | `libraries/libbridge/test/token-resolver.test.js` |
| Modify | `libraries/libbridge/test/dispatcher.test.js` |
| Modify | `libraries/libbridge/test/resume-scheduler.test.js` |
| Create | `services/msbridge/test/dispatch-auth.test.js` |
| Create | `services/ghbridge/test/dispatch-auth.test.js` |
| Create | `services/msbridge/test/startup.test.js` |
| Create | `services/ghbridge/test/startup.test.js` |
| Create | `services/ghbridge/test/reply-path.test.js` |

### `libraries/libbridge/test/token-resolver.test.js`

Unit-test `TokenResolver` with a mock ghauth client:

| Case | Mock GetToken returns | Expected kind |
| --- | --- | --- |
| token arm | `{ result: "token", token: "ghs_x" }` | `token` |
| link_required arm | `{ result: "link_required", link_required: { authorize_url: "https://..." } }` | `link_required` |
| re_auth_required arm | `{ result: "re_auth_required", re_auth_required: {} }` | `reauth_required` |
| gRPC throws | `throw new Error("UNAVAILABLE")` | `transient` |

### `libraries/libbridge/test/dispatcher.test.js`

Update all existing tests: replace `getGithubToken` with a
`tokenResolver` stub (e.g. `{ resolve: async () => ({ kind: "token",
token: "ghs_test" }) }`), add `requester: "U_1"` to every `dispatch()`
call, and change result destructuring from `{ token, correlationId }` to
check `result.kind === "dispatched"` first. Add new cases:

| Case | Asserts | SC |
| --- | --- | --- |
| `requester` is required | throws `"requester is required"` | — |
| link_required → no ack, no workflow, no callback | result.kind === "link_required"; reactions.adds empty; fetchStub.calls empty; callbacks.size === 0 | #7 |
| reauth_required → same | result.kind === "reauth_required"; same | #7 |
| transient → same | result.kind === "transient"; same | #7 |
| token → dispatched with resolved token | result.kind === "dispatched"; fetch Authorization header is the resolved token | #6 |
| requester round-trips in callbackMeta | `callbacks.peek(result.token).meta.requester === "U_1"` | — |

### `libraries/libbridge/test/resume-scheduler.test.js`

Add new cases:

| Case | Asserts | SC |
| --- | --- | --- |
| enterRecess records requester on RFC | `ctx.open_rfcs[cid].requester === "U_1"` | #8 |
| resume redispatch passes recorded requester to dispatch | spy on dispatch → `args.requester === "U_1"` | #8 |
| resume declined → cancelRecess + onDeclined called | rfc removed, onDeclined invoked with `(ctx, outcome)` | — |
| pre-migration RFC without requester → cancel + skip | rfc removed, dispatch not called, logged | — |

### `services/msbridge/test/dispatch-auth.test.js`

Integration tests for the msbridge per-user dispatch flow. Mock the
ghauth client to control `GetToken` outcomes:

| Case | SC |
| --- | --- |
| Sender S triggers ghauth query with `(msteams, S)`; sender T triggers `(msteams, T)` | #1 |
| link_required → channel receives authorize URL, no workflow_dispatch | #3 |
| reauth_required → channel receives re-link prompt, no workflow_dispatch | #4 |
| transient → channel receives transient error, no workflow_dispatch | #5 |
| token → workflow_dispatch with per-user token | #6 |

### `services/ghbridge/test/dispatch-auth.test.js`

Integration tests for the ghbridge per-user dispatch flow:

| Case | SC |
| --- | --- |
| Comment by A on discussion by B → query `(github-discussions, A)` | #2 |
| Top-level discussion by B → query `(github-discussions, B)` | #2 |
| link_required → discussion reply with authorize URL, no workflow_dispatch | #3 |
| reauth_required → discussion reply with re-link prompt, no workflow_dispatch | #4 |
| transient → discussion reply with transient error, no workflow_dispatch | #5 |
| token → workflow_dispatch with per-user token | #6 |

### `services/msbridge/test/startup.test.js`

| Case | SC |
| --- | --- |
| Construction fails when `ghauthClient` is absent | #10 |

### `services/ghbridge/test/startup.test.js`

| Case | SC |
| --- | --- |
| Construction fails when `ghauthClient` is absent | #10 |

### `services/ghbridge/test/reply-path.test.js`

| Case | SC |
| --- | --- |
| Reply posting uses installation credential (graphqlClient), not per-user token | #9 |

Verify: `bun test libraries/libbridge/test/ && bun test services/msbridge/test/ && bun test services/ghbridge/test/`

## Risks

- **ghauth unavailability during bridge startup.** The `GhauthClient`
  constructor does not connect eagerly (gRPC connects on first call), so
  startup succeeds even if ghauth is down. A dispatch attempt while
  ghauth is unreachable resolves to `transient`, which is the correct
  behavior.
- **Proto type identity across packages.** `TokenResolver` (in
  libbridge) constructs `ghauth.GetTokenRequest` from `@forwardimpact/libtype`.
  The generated `GhauthClient.GetToken` validates `instanceof
  ghauth.GetTokenRequest`. Both resolve to the same `libtype` workspace
  package in the monorepo, so identity holds. A duplicate `libtype`
  version in `node_modules` would break the `instanceof` check — the
  monorepo's workspace: protocol prevents this.
- **Pre-migration persisted RFCs.** RFCs persisted before this change
  lack the `requester` field. The `#redispatch` guard (Step 3) cancels
  these RFCs on resume rather than crashing. The user sees the recess
  silently end; the next fresh message dispatches normally under the
  per-user flow.

## Execution

Single `staff-engineer` agent, sequential steps 1–7. No parallelism
needed — the change set is tightly coupled.
