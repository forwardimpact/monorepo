# Design 1380-a — link binding integrity and auth-completion resume

Spec 1380 closes two coupled defects on the bridge linking flow: the
completion step binds a token without checking who authorized, and the
message that triggered linking is dropped. Both defects affect every bridge
channel (`github-discussions` via `ghbridge`, `msteams` via `msbridge`)
because they originate in the shared `ghauth` completion step and the
shared `libbridge` dispatch contract. The integrity fix lands in `ghauth`
(`Complete`); the resume flow is composed in each bridge over a new
`services/bridge` store, the existing `libbridge` `Dispatcher`, and the
`oauth` round-trip. Both bridges implement the same resume pattern — the
only per-channel difference is how the link is posted (GraphQL comment vs
Bot Framework reply). Out of scope: alternative token-minting methods and
the clickable-link UX (retained).

## Components and flow

```mermaid
graph LR
  U[Channel participant] -->|webhook / activity| BR[ghbridge or msbridge intake]
  BR -->|dispatch| DSP[libbridge Dispatcher]
  DSP -->|GetToken| GH[ghauth]
  BR -.->|link_required:<br/>mint link_token, stash target,<br/>augment authorize URL| PD[(PendingDispatchStore<br/>services/bridge)]
  BR -->|post link| TH[channel thread]
  U -->|click| OA[oauth /authorize]
  OA -->|Begin client_state=link_token| GH
  GH --> GHUB[GitHub User App]
  GHUB -->|callback| OC[oauth /callback]
  OC -->|Complete: verify authorizer,<br/>record github_user_id| GH
  OC -->|302 to redirect_uri, state=link_token| LC[bridge /api/link-complete]
  LC -->|lookup link_token| PD
  LC -->|re-dispatch ctx| DSP
  LC -->|confirmation page| U
```

| Component | Role in this design |
|---|---|
| `ghauth.Complete` | Verifies the authorizing GitHub account against the flow's `surface_user_id` (equality check on `github-discussions`; record-only on `msteams`); records the verified id on the binding. |
| `PendingDispatchStore` (`services/bridge`) | Canonical, TTL'd map `link_token → replay target`; sibling to the discussion/origin stores so it survives bridge restarts. Like those stores it is reached over the bridge gRPC client, behind new RPCs (put / resolve-and-consume / sweep), not a local in-process object. |
| `libbridge.prepareLinkResume` | Mints an opaque `link_token` and augments the authorize URL with `redirect_uri` and `client_state`. Pure function — no channel SDK, no store access. |
| `libbridge.createLinkCompleteHandler` | Factory returning the Hono GET handler for `/api/link-complete`. Resolves the `PendingDispatch`, loads the discussion context, finds the latest user turn by author, re-dispatches, and renders the confirmation page. Entirely channel-agnostic (parallel to `createCallbackHandler`). |
| `libbridge.createBridgeServer` | Gains an optional `onLinkComplete` handler; when provided, mounts `GET /api/link-complete` alongside the existing webhook and callback routes. |
| Bridge `#stashAndPostLink` | The only channel-specific resume code in each bridge: calls `prepareLinkResume` (libbridge), writes the `PendingDispatch` via the store, and posts the augmented link through its channel SDK (GraphQL comment / Bot Framework reply). |
| `oauth /authorize` | Gains one new pass-through: forwards `client_state` (carrying `link_token`) into `Begin` (today it forwards `redirect_uri`/`code_challenge`/`scope` but not `client_state`). |
| `libbridge.Dispatcher` | Unchanged dispatch primitive; the replay calls it exactly as intake does. |

## Identity verification (Defect 1)

`Complete` today binds `tokens.access_token` to `flow.surface_user_id` and
writes `github_user_id: null` with no authorizer check. The fix: after the code
exchange, resolve the authorizing account's GitHub id from the freshly minted
token, then bind **only** when that id equals the flow's `surface_user_id`,
recording it as the binding's `github_user_id`. A mismatch performs no upsert —
no create, no overwrite — and returns a typed `identity_mismatch` outcome the
`oauth /callback` renders as a refusal page.

The equality rule applies to surfaces whose identity namespace **is** GitHub
accounts, which `github-discussions` is (its `surface_user_id` is the GitHub
numeric id, per Spec 1340). For `msteams`, the `surface_user_id` is a
Teams/AAD object id — a different namespace — so the equality check does not
fire, but the verified GitHub id is still recorded on the binding. This is
expressed as a per-surface identity policy on the provider
(`GITHUB_ID_SURFACES`) so the same `Complete` code path serves both channels.

## Resume flow (Defect 2)

When `Dispatcher.dispatch` returns `link_required`, each bridge calls
`prepareLinkResume` (a libbridge pure function that mints an opaque
`link_token` and augments the `authorize_url` with
`redirect_uri=<callback_base>/api/link-complete` and
`client_state=<link_token>`), writes the `PendingDispatch` target via the
store, and posts the augmented link through its channel SDK — the only
channel-specific line. The other declined outcomes stash nothing:
`reauth_required` carries no `authorize_url` to augment and `transient`
shows no link. Resume for expired bindings (`reauth_required`) is out of
scope per the spec — it would first need `GetToken` to surface a re-link
URL, which it does not today.

`oauth /callback` already redirects to a downstream `redirect_uri` with the
echoed `client_state`; `/api/link-complete` receives `state=link_token`,
resolves the `PendingDispatch` target, reloads the discussion context, and
re-dispatches through `Dispatcher.dispatch`. The pending record is deleted
on re-dispatch (idempotent against a page refresh) and renders a "processing
your message" page in place of today's terminal notice. The handler is
`createLinkCompleteHandler` — a libbridge factory parallel to
`createCallbackHandler`. It uses no channel SDK (the user is on the browser)
and is wired into `createBridgeServer` via the new optional `onLinkComplete`
parameter.

**Safety property:** the replay re-runs the same `GetToken` gate, which returns
a token only if a binding now exists for `target.surface_user_id` — and after
the Defect 1 fix, that binding exists only if the legitimate user authorized.
So a forged or stale `link_token` hit cannot dispatch; it re-posts the link
harmlessly. No separate proof-of-completion is needed.

## Canonical store as the single source of truth

The replay reconstructs the prompt from the discussion store, so the inbound
turn must reach the canonical store **before** the pending pointer is written.
The intake paths are asymmetric today: ghbridge's comment path appends the
turn and persists the context regardless of dispatch outcome, while its
discussion-created path never persists the turn on a declined dispatch — it
relies on `Dispatcher` appending `historyText` only when dispatch succeeds.
msbridge already appends at intake but does not persist before dispatch on all
code paths.

This design makes turn persistence the **intake's** responsibility on all
paths across both bridges and removes the success-only append from the
`Dispatcher` contract (a clean break: the dispatch primitive no longer mutates
history). The resulting invariant — inbound turn persisted before resume
bookkeeping — is what lets the pending record carry **no message body**.

History entries gain an `author` field (the participant's `external_id`;
assistant turns carry none) so the replay selects the latest turn authored by
`target.surface_user_id` as the message to re-dispatch — correct even when
several humans have posted in the thread.

## Data structures

| Structure | Shape |
|---|---|
| `PendingDispatch` record | New `services/bridge` message `{ link_token, surface, surface_user_id, discussion_id, created_at }` — target only, TTL-swept like the flow/grant stores. `surface` is the channel value the replay feeds to `loadByChannel` (i.e. `ctx.channel`), not a second identifier. |
| `BeginRequest` (`ghauth`) | Gains a `client_state` field; `Begin` persists it on the flow instead of hard-coding `null`. This is the upstream half of the `client_state` round-trip. |
| Binding (`ghauth`) | `github_user_id` populated with the verified authorizer id (was always `null`). |
| History entry (`bridge` proto `HistoryEntry`) | `{ role, text, author? }` (was `{ role, text }`); the shared canonical schema, not just an in-memory shape. |

## Key Decisions

| Decision | Choice | Rejected alternative |
|---|---|---|
| How `Complete` learns who authorized | Resolve the account id from the minted token, compare to the flow's `surface_user_id` | Trust the OAuth callback / the request parameter — that is the current vulnerability |
| Where the replay target lives | Server-held `PendingDispatch` keyed by an opaque token | Encode `(user, thread)` in `client_state` — the completer could edit it to redirect the replay to another user/thread |
| Where the pending store lives | `services/bridge` alongside discussion/origin state | In-memory in `ghbridge` — lost on restart between link-post and completion; violates "ghbridge holds no own disk state" |
| Proof that completion was genuine | The `GetToken` gate during replay (binding exists ⇒ verified user linked) | `ghbridge` redeeming the downstream OAuth code — pulls the bridge into the OAuth-client role and hands it a user token it never uses |
| How resume is modeled | Dedicated pending store + completion endpoint | A new `ResumeScheduler` trigger kind — its triggers fire off inbound replies / elapsed time, not an external OAuth callback; overloading muddies the abstraction |
| How the message is re-sent | Replay through `Dispatcher.dispatch` | A bespoke dispatch path — would duplicate rate-limiting, callback registration, and the `GetToken` safety gate |
| Which message a multi-party thread replays | Latest history turn authored by the linking user | Latest turn regardless of author — could re-dispatch another participant's message |
| Where link augmentation lives | `libbridge.prepareLinkResume` (pure function) + `createLinkCompleteHandler` (factory) | Per-bridge duplication — identical logic in both bridges with no channel SDK dependency, violating the "push shared logic into libbridge" principle |
| Where link posting happens | Each bridge's `#stashAndPostLink` (thin: one channel-SDK call) | `libbridge` — would import channel SDKs, breaking the no-channel invariant |

## Constraints the plan must honor

- **`client_state` round-trips end to end across two contracts.** It must enter
  at `oauth /authorize` (a new query pass-through), cross the `ghauth.Begin`
  gRPC boundary (a new `BeginRequest.client_state` field, persisted on the flow
  instead of the current hard-coded `null`), and survive to `Complete`, which
  already echoes `flow.client_state`. `oauth`'s own HTTP surface needs no other
  change.
- **Two cross-bridge changes, different blast radius.** The `HistoryEntry`
  `author` field is a shared canonical-schema addition both bridges read.
  Removing the success-only `historyText` append is a change to the shared
  `libbridge.Dispatcher` contract — but only `ghbridge` is behaviourally
  affected: `msbridge` already appends its turn at intake and passes no
  `historyText`, so its dispatch path does not change. Both bridges gain
  the resume flow (stash + link-complete endpoint).
- **`reauth_required` is the `libbridge` outcome name** (`TokenResolver` maps
  the `ghauth` gRPC `re_auth_required` arm onto it); the plan should grep the
  resolver-level spelling, not the wire spelling.
- **The confirmation page is a libbridge HTTP response** — rendered by
  `createLinkCompleteHandler`, no channel SDK, preserving the no-channel
  invariant. Both bridges share the same handler via `createBridgeServer`.
- **msbridge's single intake path** simplifies the turn-persistence change:
  `#handleNewMessage` is the only entry point (no discussion-created /
  comment split), so the invariant requires one code path, not two.
