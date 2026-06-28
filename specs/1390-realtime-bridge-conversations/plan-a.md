# Plan 1390-a — Realtime Bridge Conversations

[spec](spec.md) · [design](design-a.md)

## Approach

The bridge becomes a session broker keyed by `correlation_id`. Session
lifetime is bounded by one active run: dispatch opens the session (callback
token persists across deliveries, EYES reaction spans the whole run),
`reply` and `ack` events stream out through the existing callback endpoint
discriminated by a new `kind` field, injected messages queue into a
per-correlation inbox served by a new long-poll GET route, and a `terminal`
event closes everything. On the run side, the Discusser gains a
`ReplyEmitter` that POSTs events as they happen and a concurrent
`InboxPoller` task that long-polls the inbox and lands messages on the
lead's bus queue via `messageBus.synthetic`; a new `Acknowledge` tool
completes the agent surface. The existing post-hoc callback workflow step is
retained unchanged as the crash safety net — `kind` defaults to `"terminal"`
when absent, so the bridge handles it identically to today's payload. The
default `maxLeadTurns` is raised from 40 to 200 — five one-shot sessions
worth of headroom — so injected continuations are not cut off mid-flight;
sessions without injection are unaffected in practice because they conclude
well within 40 turns and the cap is a safety bound, not a target.

**Coordination with spec 1380.** Both specs modify the Dispatcher and the
bridge proto but touch non-overlapping concerns. Spec 1380 removes the
success-only `historyText` append from `Dispatcher`, adds
`PendingDispatchStore` and `HistoryEntry.author`, and adds a
`/api/link-complete` endpoint. This plan adds `inboxUrl` to the Dispatcher,
`active_requester` and `last_posted_seq` to the Discussion proto, inbox
broker RPCs, and a `/api/inbox/:correlationId` endpoint. If 1380 lands
first the `historyText` parameter is already gone — this plan does not
depend on or modify it. The two specs' `createBridgeServer` routes
(`/api/link-complete` vs `/api/inbox/:correlationId`) are distinct paths.

**Neither the spec nor the design requires changes given 1380.** The 1390
dispatch-vs-inject state machine operates on `active_requester` +
`pending_callbacks`, set only after `Dispatcher.dispatch` returns `kind:
"dispatched"`. The 1380 linking flow returns `kind: "link_required"` — no
run starts, no session opens, so the 1390 state machine is never entered.
The two flows compose: linking completes → resumed dispatch → session opens
→ injection becomes possible.

Libraries used: none.

## Parts

| Part | Scope | Dependencies |
| --- | --- | --- |
| [plan-a-01](plan-a-01.md) | Bridge-side streaming contract (libbridge, services/bridge, ghbridge, msbridge) | None |
| [plan-a-02](plan-a-02.md) | Run-side streaming and injection (libeval, kata-dispatch.yml) | Part 1 endpoints must exist |

## Risks

- **Inbox long-poll under bridge restart.** If the bridge restarts while a
  run is active, the in-memory `CallbackRegistry` is lost but the persisted
  `pending_callbacks` and `active_requester` remain. The poller's next
  long-poll gets no results (registry entry gone, inbox store survives in
  the bridge gRPC service). The run continues without injection; the crash
  safety net closes the session when the run ends. This is the same
  limitation as today's single-shot callbacks — a bridge restart during an
  active run already loses the callback registration.
- **Sibling action unchanged.** The `forwardimpact/fit-eval@v1` composite
  action does not need modification; `CALLBACK_URL`, `CORRELATION_ID`
  (existing workflow inputs) and `INBOX_URL` (new) are set as environment
  variables at the calling workflow step level and inherited by the
  composite action's inner steps. The `fit-eval discuss` command reads them
  from `process.env`.
- **Tenant-scope the inbox route (security carry-over from PR #1316).**
  Plan 1270 part 04 established the convention that bridge-facing routes
  bound to a session carry the tenant in the path:
  `/api/callback/:tenant_id/:token`. The inbox endpoint defined in this
  plan as `/api/inbox/:correlationId` should follow the same shape —
  `/api/inbox/:tenant_id/:correlationId` — with a registry-side tenant
  check that fails closed when the path tenant does not match the
  registered correlation's tenant. Without that, an attacker who learns a
  `correlation_id` (a non-secret routing handle in 1270's threat model)
  for a victim tenant could long-poll another tenant's in-flight session.
  Carry-over from PR #1316 security review (O2); not blocking 1316
  because no production bridge wires the inbox route yet (only
  `libeval/test/inbox-poller.test.js`).

## Execution

Both parts are sequential — Part 2 depends on Part 1's new endpoints. Route
both to `staff-engineer`. Part 1 is the larger effort (callback handler
restructuring, new proto/RPCs, intake state machine); Part 2 is additive
wiring on the run side.
