# Spec 1400 — Link-resume auth-completion hardening

## Problem

Spec 1380 closed the account-link binding-integrity defect by gating the binding
on a verified GitHub account at completion time, and added an auto-resume of
the originally-intended message once the link completes. The security review
that accompanied the 1380 implementation approved the work but flagged three
follow-up hardenings to the shared link-resume completion contract. They ship
together as a single spec because the three findings share one review surface —
the contract between posting a link, completing the link, and consuming the
queued dispatch — and a single review pass on that contract is cleaner than
three.

### Defect 1 — Anyone with the posted link can pre-consume the pending dispatch (security)

A completed link causes the bridge to look up the queued dispatch and dispatch
it. The lookup consumes the queue entry before any identity is verified. The
posted link lives in a channel surface that other participants can read — a
public GitHub Discussion thread or a Teams conversation visible to the room.
Any reader who fires a completion call against that link consumes the queue
entry before the legitimate user finishes the IdP round-trip:

| Step | Effect |
|---|---|
| Attacker reads the posted link, fires a completion call without a valid IdP credential | The queue entry is consumed as the resume-target lookup runs first. |
| Legitimate user completes the IdP round-trip and lands on the bridge | The queue entry is gone. The user sees the "already processed" terminal page; the originally-intended message is not re-dispatched. |
| Legitimate user retries from a fresh webhook event | The whole flow restarts — message intake, link post, completion — even though the binding step succeeded. |

The binding-integrity guarantee from spec 1380 still holds (no IdP credential
means no binding is written), but the attacker can drain the auto-resume
affordance on every link that gets posted, turning the silent recovery added
by 1380 back into a manual resend.

### Defect 2 — The bridge accepts an unvalidated IdP URL to post (defense-in-depth)

The bridge accepts an authorize URL from the surrounding auth flow and posts
it into the channel after attaching its own completion address. Today the URL
is produced by the trusted account-auth component, so the origin is implicitly
the configured IdP host — there is no second check. Defense-in-depth here is
preemptive by design: a configuration regression or a future caller change
upstream of the bridge could put an attacker-influenced URL through this path,
and the bridge would post a link to an arbitrary origin carrying its own
completion address as the return path. The bridge is the last point at which
the IdP origin can be confirmed against what the binding step will accept,
which is the same surface the next defect lives on.

### Defect 3 — Consumed queue entries leave the link token recoverable (data hygiene)

When the bridge consumes a queue entry, the entry is marked consumed and kept
for a bounded window so a replay of the bridge's persisted state reflects the
consumption. During that window, the consumed entry still carries the link
token. No consumer of the queue uses the token after consumption — the
consumed-marker and a timestamp are sufficient for sweep — so the token's
continued presence is metadata the bridge does not need to retain.

### Why bundle the three

The three findings share one review boundary: the link-resume completion
contract. Splitting would force two or three independent panels over an
overlapping surface. Defect 1 tightens that contract's ordering invariant;
Defects 2 and 3 each add one narrow invariant on the same contract.

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | Defect 1 realizes the job's named anxiety — autonomy amplifying bad patterns faster than humans can intervene — by letting any reader of a posted link drain the pending dispatch that 1380's silent recovery depends on, turning auto-resume back into a manual resend at the moment a team is first onboarding the bridge. Defects 2 and 3 shrink the surface a future regression could expand around the same hardened flow. |

## Scope

### In scope

| Component | What changes |
|---|---|
| Link-completion ordering | A completion call resolves a queued dispatch only when the caller can be established as the user the bridge was waiting for. A completion call that cannot establish the caller leaves the queued dispatch available for the legitimate user to complete. The "already processed" terminal response remains reserved for completions that genuinely find nothing queued. |
| Trusted-origin contract | The set of IdP origins the bridge trusts is shared between link-posting and bind-completion: the bridge refuses to post a link to an untrusted IdP origin, and refuses to accept a bind authorized by one. A change to the trusted set applies to both behaviours together. |
| Consumed queue entries | A queue entry that the bridge has consumed does not carry the link token on the record it persists for the consumption. The replay and retention guarantees the bridge already provides on queue entries continue to hold. |
| Bridge parity | Both `ghbridge` and `msbridge` inherit the hardening. The spec 1380 parity contract — the identity-verification, queued-dispatch, and history-attribution surfaces are the same on each — continues to apply. |

### Out of scope

- **Response Content-Type on the completion page** — already correct; no change.
- **Auth flow shape** — the click-through completion is retained; no
  server-to-server completion signal or device flow.
- **Tombstone-retention window length** — the existing window is not retuned.
- **Rate-limiting the completion endpoint** — a separate hardening if a
  pre-consume attempt rate becomes a signal worth acting on.
- **Auditing of pre-consume attempts** — desirable, not required to close the
  defect.
- **Coupling queue entries to the requesting surface identity** as a
  freshness check — not part of this spec's invariants.

## Success Criteria

| Claim | Verification |
|---|---|
| A completion call the bridge cannot attribute to the waiting user does not consume the queue entry. | Drive a completion call the bridge cannot attribute to the waiting user against a present queue entry; drive a second, attributable, completion call against the same queue entry; observe the second dispatches the originally-intended message. |
| A legitimate completion with no prior pre-consume attempt still dispatches the originally-intended message exactly once, on `ghbridge` and on `msbridge`. | Drive a first message → posted link → attributable completion sequence on each bridge in turn; observe one workflow dispatch on each carrying the original prompt and no others. |
| The "already processed" terminal response is reached only by a completion against no queue entry, not by a completion the bridge cannot attribute. | Drive a completion against an already-consumed queue entry and an unattributable completion against a present queue entry; observe only the first reaches the terminal response and the second does not. |
| The bridge does not post a link whose IdP origin is not in the trusted-origin set. | Drive the link-post path under a configuration where the IdP origin is not in the trusted-origin set; observe nothing is posted to the channel. |
| The trusted-origin contract applies to link-posting and bind-completion together. | Place an origin in the trusted-origin set and observe a link to that origin is posted and a bind authorized by that origin completes; remove the origin from the set and observe a link to it is not posted and a bind authorized by it is rejected. |
| The bridge's persisted record of a consumed queue entry does not contain the link token. | Consume a queue entry and read every record the bridge has persisted about it; observe the link token appears in none of those records. |
| A consumed queue entry is cleared from the bridge's persisted state within the same retention window that applied before this change. | Drive a consume-then-wait sequence and observe the entry is cleared from the bridge's persisted state no later than it would have been before this change. |

— Product Manager 🌱
