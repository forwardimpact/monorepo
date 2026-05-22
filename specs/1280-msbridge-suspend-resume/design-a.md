# Design 1280-a — Suspend/resume support for msbridge

Architectural design for [spec 1280](spec.md). The libbridge
`ResumeScheduler` primitive (extracted from `services/ghbridge` earlier in
this PR) is the contract; this design wires it into `services/msbridge`
as one new field plus three composition points and one method-call swap.

## Components

| Component | Role in this design |
|---|---|
| `services/msbridge/index.js` | Gains a `#resume` field constructed alongside `#dispatcher`. Calls into the scheduler at four points: `start`, `stop`, `#handleNewMessage`, `#handleReply`. |
| `libraries/libbridge` | Unchanged. Supplies `ResumeScheduler` already. |
| `services/msbridge/src/teams.js` | Unchanged. No channel rendering moves; the resume re-dispatch goes through the existing `Dispatcher` and posts replies through the existing callback path. |
| `services/msbridge/test/` | Gains an end-to-end resume test file that drives the bridge through the Bot Framework intake mock and asserts the same observable behaviour as `services/ghbridge/test/resume.test.js`. |

## Data flow

```mermaid
sequenceDiagram
    participant Te as Teams user
    participant Br as services/msbridge
    participant Rs as ResumeScheduler<br/>(libbridge)
    participant Di as Dispatcher<br/>(libbridge)
    participant Wf as kata-dispatch.yml

    Te->>Br: new message
    Br->>Rs: processInbound(ctx)
    alt trigger fires
        Rs->>Di: dispatch (resume_context)
        Di->>Wf: workflow_dispatch
    else open recess, no trigger fired
        Rs-->>Br: freshDispatchAllowed=false
    else no open recess
        Rs-->>Br: freshDispatchAllowed=true
        Br->>Di: dispatch (fresh)
        Di->>Wf: workflow_dispatch
    end
    Wf-->>Br: callback (verdict=recessed)
    Br->>Rs: enterRecess(ctx, correlationId, trigger)
    Note over Rs: trigger persisted on ctx.open_rfcs;<br/>elapsed timer armed if applicable
```

The pre-recess and post-recess control flows are symmetric across both
bridges. The only msbridge-specific bit is what the scheduler stores under
`callbackMeta` when it re-dispatches (`threadId`, not `discussionId`).

## Composition

| Site | Change |
|---|---|
| Constructor | Construct `#resume = new ResumeScheduler({ dispatcher: #dispatcher, store: #store, logger, buildCallbackMeta: (ctx) => ({ threadId: ctx.discussion_id }), buildResumeInputs: () => ({}) })` alongside `#dispatcher`. |
| `start()` | After `#bridge.start()`, call `await #resume.rearm()` — same shape as `services/ghbridge`. |
| `stop()` | Before `#bridge.stop()`, call `#resume.clear()` — same shape as `services/ghbridge`. |
| `#handleNewMessage` | Between loading the context and the rate-limit check, call `const { freshDispatchAllowed } = await #resume.processInbound(ctx)` and skip both the rate-limit check and the fresh dispatch when `freshDispatchAllowed` is false. |
| `#handleReply` verdict branches | Replace the `recessed` log-only branch with `#resume.enterRecess(ctx, meta.correlationId, payload.trigger)`. Add `#resume.cancelRecess(ctx, meta.correlationId)` to both `adjourned` and `failed` branches (the existing summary post on `failed` stays). |

The two `build*` callbacks are the only per-channel inputs. Both are pure
functions over `ctx.discussion_id` — no Bot Framework SDK reaches the
scheduler.

## Key decisions

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| `callbackMeta` key for resume dispatches | `{ threadId: ctx.discussion_id }` | `{ discussionId: ctx.discussion_id }` (the libbridge default) | The existing msbridge `createCallbackHandler` registration reads `meta.meta?.threadId` via its `loadDiscussionId` lens; matching that key keeps callback meta consistent across fresh and resume dispatches and avoids changing the lens. |
| `workflowInputs` for resume dispatches | `{}` (default) | `{ discussionId: ctx.discussion_id }` (ghbridge convention) | msbridge does not pass `discussion_id` on fresh dispatches today. Adding it on resume only would create asymmetry; adding it on both is a separate, broader change (trace-linkage parity for msteams) and belongs to a different spec. |
| `processInbound` call position in `#handleNewMessage` | Before the rate-limit check, after the context load | After the rate-limit check | A resume re-dispatch is a continuation of an existing recess, not a new dispatch by the user. Rate-limiting it against the user's own message would penalise the user for the agent's own scheduling decision. ghbridge applies the rate-limit check only on the fresh-dispatch branch (`freshDispatchAllowed`); this preserves that behaviour. |
| Cancellation on `adjourned` and `failed` | Always call `cancelRecess` | Only call when an rfc is known to exist | `cancelRecess` is idempotent and the cost of a missing key is zero. Calling unconditionally removes a branch the bridge would otherwise have to maintain. |
| Test placement | New file `services/msbridge/test/resume.test.js` mirroring `services/ghbridge/test/resume.test.js` | Add resume scenarios to the existing `msbridge.test.js` | A separate file keeps the resume e2e shape readable side-by-side with ghbridge's. Reviewers comparing the two bridges' resume behaviour open one file per side. |
| Inbound activity driver in tests | Reuse `botFrameworkIntake` plus the adapter mock from `msbridge.test.js` (drives `#handleNewMessage` via real HTTP) | Call `#handleNewMessage` directly via a private accessor | The HTTP path is the contract; testing through it catches intake-glue regressions and matches the level at which `services/ghbridge/test/resume.test.js` operates. |

## What this design does not cover

- Whether `services/msbridge` should also pass `discussion_id` as a
  workflow input on fresh dispatches for trace linkage parity with
  `services/ghbridge`. Out of scope for this spec; see spec 1280 § Scope.
- Cross-channel resumption (a recess opened on Teams resolving via a
  comment on Discussions). Deferred per spec.
- The exact line position of the `processInbound` call relative to
  `ctx.last_active_at = Date.now()` and the participant metadata refresh
  — execution ordering is a plan concern.
- The fixture shape of the Bot Framework inbound activities in the new
  resume test file — concrete fixture authoring is a plan concern.
