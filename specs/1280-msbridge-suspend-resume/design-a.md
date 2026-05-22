# Design 1280-a — Suspend/resume support for msbridge

Architectural design for [spec 1280](spec.md). The libbridge
`ResumeScheduler` primitive (extracted from `services/ghbridge` earlier in
this PR) is the contract; this design wires it into `services/msbridge`
as one new field, four call sites covering six verdict branches, and one
correctness change to the history-append ordering on the inbound path.

## Components

| Component | Role in this design |
|---|---|
| `services/msbridge/index.js` | Gains a `#resume` field constructed alongside `#dispatcher`. Calls into the scheduler at four sites: lifecycle (`start`, `stop`), inbound path (`#handleNewMessage`), and reply path (`#handleReply`, three verdict branches). |
| `libraries/libbridge` | Unchanged. Supplies `ResumeScheduler` already. |
| `services/msbridge/src/teams.js` | Unchanged. Resume re-dispatch reaches Teams through `Dispatcher.dispatch` → callback → the existing `handleReply` / `sendReply` chain, so no new channel rendering is required. |

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
| `start()` | Call `#resume.rearm()` once the bridge is accepting requests, so a deadline that fires immediately can complete its re-dispatch through the live server. |
| `stop()` | Call `#resume.clear()` while the bridge is still accepting requests, so no armed timer fires into a torn-down host. |
| `#handleNewMessage` (inbound path) | Append the user's text to `ctx.history`, then call `const { freshDispatchAllowed } = await #resume.processInbound(ctx)`. When `freshDispatchAllowed` is false, neither the rate-limit check nor the fresh dispatch runs. When it is true, `dispatcher.dispatch` is called without `historyText` — the user turn is already in `ctx.history`. |
| `#handleReply` verdict branches | Replace the `recessed` log-only branch with `#resume.enterRecess(ctx, meta.correlationId, payload.trigger)`. Add `#resume.cancelRecess(ctx, meta.correlationId)` to both `adjourned` and `failed` branches (the existing summary post on `failed` stays). |

History append is moved out of `dispatcher.dispatch`'s `historyText` argument
and into the inbound handler so that `processInbound` evaluates the
responses trigger against an `ctx.history.length` that already includes
the message that should satisfy it. Without this move the trigger would
under-count by one on every inbound message. `services/ghbridge` already
does it this way.

The two `build*` callbacks are the only per-channel inputs. Both are pure
functions over `ctx.discussion_id` — no Bot Framework SDK reaches the
scheduler.

## Key decisions

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| `callbackMeta` key for resume dispatches | `{ threadId: ctx.discussion_id }` | `{ discussionId: ctx.discussion_id }` (the libbridge default) | The existing msbridge `createCallbackHandler` registration reads `meta.meta?.threadId` via its `loadDiscussionId` lens; matching that key keeps callback meta consistent across fresh and resume dispatches and avoids changing the lens. |
| `workflowInputs` for resume dispatches | `{}` (default) | `{ discussionId: ctx.discussion_id }` (ghbridge convention) | msbridge does not pass `discussion_id` on fresh dispatches today, so passing it on resume only would create asymmetry; passing it on both is a broader trace-linkage-parity change that belongs to a different spec. The parity gap is deliberate. |
| `processInbound` runs before the rate-limit check | Resume re-dispatches happen unconditionally | Gate resume re-dispatches behind the rate limiter | A resume is a continuation of an existing recess, not a new dispatch by the user. Rate-limiting it against the user's own message would penalise the user for the agent's scheduling decision. ghbridge applies the rate-limit check only on the fresh-dispatch branch and this design follows the same shape. |
| History append moved into the inbound handler | Append in `#handleNewMessage` before `processInbound`; drop `historyText` from the fresh-dispatch call | Keep `historyText: text` on `dispatcher.dispatch` | Without the move, `processInbound` evaluates the responses trigger against an `ctx.history` that does not include the message that should satisfy it, under-counting by one. Keeping `historyText` AND adding the explicit append produces a duplicate user turn. ghbridge resolves this the same way. |
| Cancellation on `adjourned` and `failed` | Always call `cancelRecess` | Guard with `if (open_rfcs[correlationId])` | `cancelRecess` is idempotent and the cost of a missing key is zero. Calling unconditionally removes a branch the bridge would otherwise have to maintain. |
| `#resume` constructed eagerly in the constructor | Alongside `#dispatcher`, dependencies fully wired before `start()` | Lazy construction inside `start()`, or via an injected factory | Eager construction keeps the wiring in one place, matches `#dispatcher`'s pattern, and lets test overrides (`deps.acknowledgement`-style) compose at the same level. Lazy or factory shapes add a layer for a one-shot dependency the bridge always needs. |
| Verdict-branch calls live in `#handleReply` directly | `enterRecess` / `cancelRecess` are called inline from the verdict switch | Route through `#applyVerdict` or a new `#applyRecessTransition` helper | The switch already names each verdict; adding two method calls per branch is more legible than introducing a third helper that exists only to host them. Matches ghbridge's shape. |
| Test placement | New file `services/msbridge/test/resume.test.js` mirroring `services/ghbridge/test/resume.test.js` | Add resume scenarios to the existing `msbridge.test.js` | A separate file keeps the resume e2e shape readable side-by-side with ghbridge's. Reviewers comparing the two bridges' resume behaviour open one file per side. |
| Inbound activity driver in tests | Reuse `botFrameworkIntake` plus the adapter mock from `msbridge.test.js` (drives `#handleNewMessage` via real HTTP) | Call `#handleNewMessage` directly via a private accessor | The HTTP path is the contract; testing through it catches intake-glue regressions and matches the level at which `services/ghbridge/test/resume.test.js` operates. |

## What this design does not cover

- Whether `services/msbridge` should also pass `discussion_id` as a
  workflow input on fresh dispatches for trace linkage parity with
  `services/ghbridge`. Out of scope for this spec; see spec 1280 § Scope.
- Cross-channel resumption (a recess opened on Teams resolving via a
  comment on Discussions). Deferred per spec.
- Execution ordering inside `#handleNewMessage` and `start()` / `stop()`
  beyond the architectural before/after relationships named in
  Composition — exact step sequencing is a plan concern.
- The fixture shape of the Bot Framework inbound activities in the new
  resume test file — concrete fixture authoring is a plan concern.
