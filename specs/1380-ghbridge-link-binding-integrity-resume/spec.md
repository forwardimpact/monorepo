# Spec 1380 — GitHub account-link binding integrity and auth-completion resume

## Problem

The per-user GitHub authentication flow that bridges use to dispatch workflows
under the requester's own identity (spec 1320, spec 1340) has two coupled
defects: the account-linking step can bind a token to the wrong person, and the
message that triggers linking is silently dropped. Both surface on the
`github-discussions` channel served by `ghbridge` over the shared `ghauth` /
`oauth` services.

### Defect 1 — The link binds a token to an unverified identity (security, HIGH)

When a user with no binding triggers a dispatch, the bridge posts an
authorization link into the discussion thread. The link carries the intended
user's surface identity as a request parameter. When the linking flow
completes, the minted GitHub user token is bound to **that requested identity**,
never to the GitHub account that actually authorized. The completion step
records no GitHub account id for the binding and performs no check that the
authorizer is the intended user.

Because the link lives in the discussion thread — which may be fully public —
anyone who can see it (or who simply edits the surface-identity parameter)
can complete the flow on the intended user's behalf:

| Timing | Effect |
|---|---|
| A different person clicks **before** the intended user | Their token is bound under the intended user's identity. The intended user is never re-prompted, because a binding now exists, and silently dispatches workflows under someone else's GitHub account. |
| A different person clicks **after** the intended user | The correct binding is overwritten (last-writer-wins), redirecting the victim's future dispatches onto the other account. |

No secret leaks in the URL. The defect is that the link is an
**unauthenticated capability to write a token binding for an arbitrary
identity**. This breaks the attribution guarantee — "dispatch runs as the
requesting human" — that the per-user dispatch design exists to provide, and it
realizes the Teams-Using-Agents anxiety force directly: a single shared link
lets one participant act under another's GitHub identity.

### Defect 2 — The first message is dropped at the link prompt (UX, blocking)

The dispatch path resolves the per-user token first and returns a
"link required" outcome before doing any other work, so the triggering message
is discarded. The bridge posts the link and the user completes it, but the flow
ends on a terminal "you can close this window" page. The binding now exists, yet
the message that prompted linking was never dispatched — the user must send it
again to get any result. On a brand-new discussion the triggering message is
not persisted at all on the declined path, so nothing records what the user
asked for.

### Why they are coupled

The auto-completion resume this spec introduces (Defect 2) is only safe once
Defect 1 is fixed. Today no auto-resume exists, so the hijack stops at the
binding. Once resume ships, completing a victim's pending link with the
identity check still absent would both plant the completer's token under the
victim's identity **and** auto-fire the victim's queued message under it —
turning the binding hijack into an unsolicited dispatch. The integrity fix is
therefore a
precondition for the resume feature, and the two ship together.

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | A dispatch identity that another participant can silently assume amplifies bad patterns faster than humans can intervene (the job's named anxiety), and a first interaction that dead-ends at a link prompt is friction at the very moment a team is onboarding the bridge. |

## Scope

### In scope

| Component | What changes |
|---|---|
| Account-link completion | The token is bound only when the GitHub account that authorized matches the intended surface identity; a mismatch writes and overwrites nothing. The binding records which GitHub account it represents. |
| Auth-completion resume | A message dropped because the requester had no binding is re-dispatched automatically once that same user completes linking — no resend. The user sees a confirmation that the message is being processed, not a dead-end page. |
| Single source of truth for message content | The dropped message is recorded in the canonical discussion store before any resume bookkeeping, on every intake path including a new discussion's first message, so resume reconstructs the prompt from the canonical store. Resume bookkeeping stores no copy of the message body. |
| Turn attribution in discussion history | Stored discussion-history turns identify their authoring user, so resume re-dispatches the turn belonging to the user who linked rather than whatever turn happens to be most recent in a multi-participant thread. |
| Tamper-resistance of the resume target | The linking round-trip cannot let whoever completes it choose which user or which thread is re-dispatched; the replay target is fixed by server-held state, not by data the completer can edit. |

### Out of scope

- Alternative token-minting methods (device flow, personal access tokens, or
  dispatching under the App installation token instead of a user token) — a
  separate decision.
- Identity verification for the Microsoft Teams surface — its identity model
  differs; this spec covers `github-discussions` only. Shared bridge
  primitives must not preclude a later Teams equivalent.
- Changing the linking UX away from a clickable link (the click-through flow
  is retained deliberately).
- Resilience when the user abandons the browser after authorizing but before
  the confirmation lands — completion still records the binding, and the
  existing resend remains the fallback; a server-to-server completion signal
  is a possible later hardening, not part of this spec.
- The bounded-history retention limit — if a thread accumulates more turns than
  history retains before the user links, reconstruction may miss the triggering
  turn; tuning that limit is a separate concern.

## Success Criteria

| Claim | Verification |
|---|---|
| A completion whose authorizing GitHub account differs from the requested surface identity neither writes a new binding nor overwrites an existing one. | Drive a completion where the authorizer's account id differs from the requested surface identity; observe no binding is created or modified. |
| Every binding records the GitHub account id of the user who authorized it. | Complete a flow and inspect the resulting binding; observe it carries the authorizer's GitHub account id. |
| A message arriving from a user with no binding is recorded in the canonical discussion store before any resume bookkeeping, on the first-message-of-a-new-discussion path. | Send a first message on a new discussion from an unlinked user; observe the message is present in the canonical discussion store after the link is posted, before linking completes. |
| The same record-before-bookkeeping ordering holds on the existing-thread comment path, so the property is uniform across intake paths. | Post a comment from an unlinked user on an existing discussion; observe the message is in the canonical discussion store before any resume bookkeeping. |
| Completing the link causes the originally-intended message to be dispatched without the user sending it again. | Drive first message → posted link → verified completion with no second inbound message; observe exactly one workflow dispatch occurs and it carries the original prompt. |
| Resume bookkeeping holds no copy of the message body. | Inspect the persisted resume record; observe it carries identifiers and timestamps only, no message text. |
| Whoever completes the link cannot redirect the re-dispatch to a different user or thread than the one recorded when the link was issued. | Attempt to alter the completer-visible round-trip data to name a different user/thread; observe the re-dispatch targets the server-recorded (user, thread) and ignores the altered data. |
| In a thread where several humans have posted, resume re-dispatches the turn authored by the user who linked. | Interleave turns from two users before linking, then complete linking as one of them; observe the re-dispatched prompt is that user's turn. |
