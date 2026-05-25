# Plan 1280 — Suspend/resume support for msbridge

## Approach

Wire libbridge's `ResumeScheduler` into `services/msbridge` in one PR
mirroring the wiring `services/ghbridge` already carries, with the three
channel-specific deltas the design names: `callbackMeta` keyed on
`threadId` (matching the existing `loadDiscussionId` lens), empty
`workflowInputs` for the resume dispatch (msbridge does not pass
`discussion_id` on fresh dispatches today), and a resume e2e test that
drives the Bot Framework HTTP intake rather than GitHub webhooks. The
implementation flips the existing `#applyVerdict` no-op into
`enterRecess` / `cancelRecess` calls inside `#handleReply`, moves the
user-message history append out of `dispatcher.dispatch`'s `historyText`
argument and ahead of both `processInbound` and the rate-limit check in
`#handleNewMessage` so resume continuations are never gated by the
limiter (design key decision #3), adds a single `#resume` field
constructed alongside `#dispatcher` plus a narrow read-only accessor for
restart testing, calls `rearm()` at `start()` and `clear()` at `stop()`,
mirrors `ghbridge`'s `resume.test.js` against the Teams inbound path,
and updates the one external doc that names the old "resume not
supported" log. Steps are sequential — step 2's tests verify step 1's
wiring, and steps 3–4 follow regression-then-doc order.

## Libraries used

libbridge (ResumeScheduler).

## Steps

### 1. Wire `ResumeScheduler` into `MsBridgeService`

**Modified:** `services/msbridge/index.js`.

Six sites change inside one class:

| Site | Change |
|---|---|
| import block (line 15) | Add `ResumeScheduler` to the named imports from `@forwardimpact/libbridge` (alphabetical position after `RateLimiter`). |
| private field list (line 49) | Add `#resume;` between `#dispatcher;` and `#bridge;`. |
| constructor — after line 107 (Dispatcher close brace), before line 109 (`this.#onCallback = createCallbackHandler(...)`) | Construct `this.#resume = new ResumeScheduler({ dispatcher: this.#dispatcher, store: this.#store, logger, buildCallbackMeta: (ctx) => ({ threadId: ctx.discussion_id }), buildResumeInputs: () => ({}) })`. No other constructor change. |
| public accessor (after the existing `get callbacks()` block, line 144) | Add `/** @returns {import("@forwardimpact/libbridge").ResumeScheduler} */\n  get resume() { return this.#resume; }`. The accessor exists so the restart test in step 2 case 4 can probe `service.resume.size` (an existing read-only `ResumeScheduler` accessor — see `libraries/libbridge/src/resume-scheduler.js:96`); ghbridge has no equivalent because its resume tests do not exercise the restart path, but msbridge's spec criterion 4 explicitly names rearm-on-start as observable. |
| `start()` (line 157) | After `await this.#bridge.start()` add `await this.#resume.rearm()`. |
| `stop()` (line 162) | Before `await this.#bridge.stop()` add `this.#resume.clear()`. (Order matches ghbridge: clear the in-memory timers *while* the server is still accepting requests so no timer fires into a torn-down host.) |
| `#handleNewMessage` (lines 167–220) | Rewrite the body inside the existing `try { ... } finally` so the order is: load context → set `last_active_at` and metadata → append the user turn (`appendHistory(ctx.history, { role: "user", text })`) → `const { freshDispatchAllowed } = await this.#resume.processInbound(ctx)` → branch. When `freshDispatchAllowed` is false: `await this.#store.add(ctx); await this.#store.flush(); span.setOk(); return;`. When `freshDispatchAllowed` is true: run the existing rate-limit check (with its `context.sendActivity(...)` and `span.addEvent("rate_limited")` branches kept verbatim), then call `this.#dispatcher.dispatch(...)` *without* `historyText` (the user turn is already in `ctx.history`) inside the existing inner `try { ... } catch` block — the `catch` arm that logs and posts `context.sendActivity("Failed to reach the agent team. Please try again later.")` is preserved verbatim (referenced by `websites/fit/docs/services/bridge-conversations/dispatch-from-chat/index.md:124` "Common failure shapes" table, kept intact). Per design key decision #3, `processInbound` runs *before* the rate-limit check — a resume continuation is the agent's scheduling decision, not the user's, so rate-limiting it would penalise the user. ghbridge `index.js:286–310` is the canonical shape this mirrors. |
| `#handleReply` verdict branches (lines 222–234, and `#applyVerdict` lines 248–259) | Delete `#applyVerdict` entirely. Inside `#handleReply`, after `await this.#postReplies(ref, payload.replies, ctx)`, add a switch on `payload.verdict`: `case "recessed": this.#resume.enterRecess(ctx, meta.correlationId, payload.trigger); break;`, `case "adjourned": this.#resume.cancelRecess(ctx, meta.correlationId); break;`, `case "failed": this.#resume.cancelRecess(ctx, meta.correlationId); if (payload.summary) await sendReply(this.#adapter, this.#msAppId, ref, payload.summary); break;`, `default: break;`. Both cancel calls are unconditional and idempotent over an empty `ctx.open_rfcs`. The `ref` binding required by the failed-summary branch is already in scope at line 226 (`const ref = ctx.participants[0].metadata`). |

No explicit `store.add(ctx); store.flush()` is added inside `#handleReply`
— libbridge's `createCallbackHandler` already flushes after `handleReply`
returns (`libraries/libbridge/src/callback-handler.js:147–149`). The
`enterRecess` ctx mutation is therefore persisted by the existing wrapper.
The `failed` branch's `payload.summary` is sent to Teams as a reply but
is *not* appended to `ctx.history` — `#postReplies` is the only history-
append path on the callback side, and `payload.summary` does not go
through it. This is the same shape ghbridge carries (`services/ghbridge/index.js:343–348`).

The workflow-input field names libbridge writes are snake_case — `prompt`,
`callback_url`, `correlation_id`, plus any extras from `workflowInputs`
(`libraries/libbridge/src/dispatch.js:38–42`). The plan's tests in step 2
assert on the resume dispatch's `resume_context` field accordingly.

**Verify:** `bun run test services/msbridge/test/msbridge.test.js` — every
test passes *except* the one named `"recessed verdict logs and posts
only the replies (no resume yet)"`, which is expected to fail until
step 3 renames and updates it. The single failure is the verification
signal for step 1; do not chase it.

### 2. Add `services/msbridge/test/resume.test.js`

**Created:** `services/msbridge/test/resume.test.js`.

Mirror `services/ghbridge/test/resume.test.js` in shape — single
`describe("msbridge resume", ...)` block containing four `test(...)`
cases — with three Teams-specific substitutions:

| ghbridge fixture | msbridge equivalent |
|---|---|
| Webhook intake at `POST /api/webhook` with `x-hub-signature-256` HMAC | Bot Framework intake at `POST /api/messages` driven through the mock `adapter.process` (same `makeAdapter` shape `services/msbridge/test/msbridge.test.js` lines 42–76 already defines, inlined verbatim at the top of the new file). |
| `discussion` / `discussion_comment` event bodies with `node_id` | A `{ type: "message", id, text, conversation: { id }, channelId, serviceUrl, from, recipient }` activity. `makeAdapter` reads `overrides.activity` inside `process` on every call (services/msbridge/test/msbridge.test.js:48–57), so the test driver constructs `const overrides = { activity: turn1 }`, passes `makeAdapter(overrides)` to `MsBridgeService` once, and mutates `overrides.activity = turnN` between `fetch(... /api/messages)` calls. The captured adapter reads the latest activity per turn. Rebuilding the adapter mid-test does *not* work because `MsBridgeService` binds the adapter at construction. |
| `resumeInputs.discussion_id` assertion (ghbridge sets a `discussionId` workflow input) | The msbridge test asserts `resumeInputs.discussion_id === undefined`. msbridge's `buildResumeInputs` returns `{}`, so the resume dispatch body carries only the libbridge defaults (`prompt`, `callback_url`, `correlation_id`) plus `resume_context`. |

Reaction assertions are absent in both `ghbridge` and `msbridge` resume
tests — the resume path does not interact with the reaction adapter
beyond the per-dispatch ack lifecycle already covered by
`msbridge.test.js`'s acknowledgement-lifecycle test. The msbridge
resume tests inherit that omission rather than departing from it.

Four test cases:

1. **`responses` trigger fires after expected comments; re-dispatch
   carries `resume_context`** — drive one inbound message → seed an
   `open_rfcs` record via a `recessed` callback with `trigger: { kind:
   "responses", responses: 2 }` → drive two further inbound messages →
   assert exactly two workflow dispatches were observed, assert the
   second carries a `resume_context` whose `correlation_id` matches the
   original and whose `history_since` equals exactly `[{ role: "user",
   text: "I think yes" }, { role: "user", text: "agreed" }]` (no
   duplicates — the assertion gates against the double-append failure
   mode named in Risks).

2. **`elapsed` trigger records due_at for whole-second durations** —
   drive one inbound message → post a `recessed` callback with
   `trigger: { kind: "elapsed", elapsed: "PT5S" }` → assert the stored
   `open_rfcs` record carries `due_at === opened_at + 5000`. Mirrors
   `services/ghbridge/test/resume.test.js:209–242`.

3. **Comments during an open RFC accumulate history but do not spawn
   parallel dispatches** — drive one inbound message → recess with a
   3-response trigger → drive one further inbound message → assert
   exactly one workflow dispatch observed total, assert the recess
   remains open, assert the user's intermediate message landed in
   `ctx.history`. Mirrors `services/ghbridge/test/resume.test.js:244–284`.

4. **Service shutdown clears timers and a fresh service rearms from
   storage** — see test plumbing note below for the shared-storage
   pattern. Drive one inbound message → recess with `trigger: { kind:
   "elapsed", elapsed: "PT5S" }` → assert `service.resume.size === 1`
   (timer armed) → call `await service.stop()` → assert
   `service.resume.size === 0` (clear ran) → construct a fresh
   `MsBridgeService` over the *same* storage instance → call
   `service.start()` → assert the new service's `service.resume.size
   === 1` (`rearm()` rescheduled the persisted `due_at`). Discharges
   the spec's "Persisted recess deadlines survive a restart" and
   "Service shutdown cancels every armed elapsed timer" criteria in
   one test. The `service.resume` accessor is added in step 1.

Test plumbing notes:

- The fetch stub intercepts `https://api.github.com/` and returns
  `new Response("{}", { status: 204 })`, mirroring
  `services/ghbridge/test/resume.test.js:38–45`. The msbridge adapter
  mock does not cover the workflow dispatch — that fetch is global.
- `service.callbacks.peek(token)` returns `{ correlationId, meta }`
  for the registered token, exactly as ghbridge's resume test uses it
  (`services/ghbridge/test/resume.test.js:115`).
- **Shared-storage pattern for case 4:** Hoist the `storage` instance
  into a `let storage;` declared above the `describe` block, assign
  `storage = createMockStorage()` in `beforeEach`, and write a local
  factory `function buildService(adapter) { return new
  MsBridgeService(makeConfig(), { logger: createMockLogger(), tracer:
  makeTracer(), storage, adapter }); }` that closes over the shared
  `storage`. Cases 1–3 instantiate once via `buildService`; case 4
  calls `buildService` twice in the same test body. The
  `MsBridgeService` constructor's `storage` field becomes the only
  shared mutable state across the two instances.

**Verify:** `bun run test services/msbridge/test/resume.test.js` — all
four cases green. Then `bun run test services/msbridge/test/` — every
file in the directory green (the failing legacy test is renamed and
updated by step 3).

### 3. Rename and update the legacy "recessed verdict" assertion

**Modified:** `services/msbridge/test/msbridge.test.js`, lines 284–301.

Keep the test's arrange block (lines 285–298: `seedCtx` call, `fetch`
post with the recessed payload, status + `adapter.sent` assertions)
exactly as it stands. Rename the test from `"recessed verdict logs
and posts only the replies (no resume yet)"` to `"recessed verdict
persists the trigger and posts only the replies"`, and append after
line 300 (after `expect(adapter.sent).not.toContain("awaiting humans");`)
the new persistence assertion block:

```js
const stored = await service.store.loadByChannel("msteams", "t-rec");
expect(Object.keys(stored.open_rfcs)).toHaveLength(1);
expect(Object.values(stored.open_rfcs)[0].trigger).toEqual({
  kind: "responses",
  responses: 2,
});
```

No other line of `msbridge.test.js` changes. The
acknowledgement-lifecycle test (`adjourned` verdict) continues to pass
— step 1's new `cancelRecess` call is a no-op over the empty
`open_rfcs` the test seeds.

**Verify:** `bun run test services/msbridge/test/msbridge.test.js` — all
cases green including the renamed test.

### 4. Update the dispatch-from-chat doc

**Modified:**
`websites/fit/docs/services/bridge-conversations/dispatch-from-chat/index.md`.

Two edits inside the "Callback path" numbered list:

1. **Line 104** — replace `**Verdict application** — \`#applyVerdict\`
   branches:` with `**Verdict application** — \`#handleReply\` switches
   on \`payload.verdict\`:`. The `#applyVerdict` private method is
   deleted in step 1; the new switch lives inline in `#handleReply`.

2. **Lines 109–111** — replace the `recessed` bullet:

   > `recessed` — the bridge logs `resume not yet supported on msteams`
   > and does not start a resume timer. The replies are still posted
   > (step 7) so the user sees what the team has so far.

   with:

   > `recessed` — the bridge calls
   > `ResumeScheduler.enterRecess(ctx, correlationId, trigger)` to
   > persist the trigger on `ctx.open_rfcs[correlationId]`. Subsequent
   > inbound messages in the same Teams thread accrue toward a
   > `responses` trigger; an `elapsed` trigger arms a timer that
   > survives a service restart via `rearm()`. The replies are still
   > posted (step 7) so the user sees what the team has so far.

No other lines of the doc change. The `adjourned` and `failed` bullets
keep their current text — both branches are unchanged behaviourally
(only their dispatch site moved from `#applyVerdict` to `#handleReply`,
which the preamble edit already covers).

**Verify:** `bun run check` exits 0 (prose + invariants + jsdoc + lint
+ schema all green). `git diff --stat` for the doc shows changes
limited to those two regions.

## Risks

- **Resume-vs-rate-limit ordering inversion is the single critical
  invariant.** Step 1's `#handleNewMessage` rewrite must run
  `appendHistory` and `processInbound` *before* the rate-limit check
  (design key decision #3). The natural reading of the existing code —
  rate-limit-then-act — pushes an implementer toward putting resume
  inside the accepted branch. That ordering silently underweights
  `responses` triggers for any user who hits the rate limiter during an
  open recess and is therefore a regression invisible to the four
  resume tests in step 2 (none of which trip the limiter). The plan
  spells out the order in the step-1 table row, ghbridge's
  `index.js:286–310` is the reference implementation; the implementer
  reviews both before editing the inbound handler.

- **Dispatch-failure leaves an orphan user turn in history.** Moving
  the history append out of `dispatcher.dispatch`'s on-success path
  (`libraries/libbridge/src/dispatcher.js:113–115`) and into
  `#handleNewMessage` before `processInbound` means a dispatch that
  throws leaves the user's message in `ctx.history`. Subsequent
  trigger evaluation will count that orphan turn. This is the same
  behaviour ghbridge carries — no rollback is required, and adding
  one would diverge from the bridge-parity invariant the design rests
  on. The implementer does *not* add an error-path append-rollback.

- **Restart-rearm test depends on the `service.resume` accessor and
  on store-key stability across instances.** Case 4 asserts
  `service.resume.size` before and after a stop/start cycle on a
  fresh `MsBridgeService` over shared `createMockStorage()`. If the
  accessor name is later renamed, or if `createMockStorage()` is
  refactored to per-instance state, this test silently regresses.
  Both surfaces are already named in this plan (step 1 adds the
  accessor; step 2 hoists the storage). The assertion observes
  `size === 1` directly, so a false-negative shows as `size === 0`
  and fails the assertion immediately.

## Execution

Single PR on `plan/1280-msbridge-suspend-resume` (claimed). Steps 1 → 4
are strictly sequential — step 2's tests verify step 1's wiring, step 3
covers the regression-rename that step 1 invalidates, and step 4
closes the doc out. Best fit: `staff-engineer` via `kata-implement`.

— Staff Engineer 🛠️
