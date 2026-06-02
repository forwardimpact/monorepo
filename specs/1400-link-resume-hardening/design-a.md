# Design 1400-a — Link-resume auth-completion hardening

Spec 1400 closes three coupled defects in the link-resume contract introduced
by spec 1380. The contract spans three sites:

- The bridge that mints and posts the link
  (`libbridge.prepareLinkResume` + per-bridge `#stashAndPostLink`).
- The single auth partner that completes the IdP round-trip for **both**
  bridges, `services/ghuser.Complete` (renamed from `ghauth` in spec 1271),
  which handles `github-discussions` and `msteams` surfaces via the existing
  per-surface `GITHUB_ID_SURFACES` policy (spec 1380 design § Identity
  verification). There is no separate `msauth`.
- The bridge handler that resolves the queued dispatch,
  `libbridge.createLinkCompleteHandler`, wired into both bridges via
  `createBridgeServer`.

Every fix is a contract change between those sites, not a change inside one of
them — which is why the spec bundles them.

## Components and flow

```mermaid
sequenceDiagram
  participant U as Channel user
  participant Att as Attacker (link reader)
  participant BR as Bridge intake
  participant LB as libbridge
  participant TO as TrustedIdpOrigins<br/>(libutil)
  participant PD as PendingDispatchStore<br/>(services/bridge)
  participant GU as ghuser.Complete
  participant OA as oauth /callback
  participant IDP as GitHub IdP

  BR->>LB: prepareLinkResume(authorizeUrl, base, TO)
  LB->>TO: origin ∈ trusted?
  alt origin not trusted
    LB-->>BR: throw TrustedOriginError → no put, no post
  else origin trusted
    LB-->>BR: { linkToken, augmentedUrl }
    BR->>PD: PutPendingDispatch(linkToken, surface, surface_user_id, …)
    BR->>U: post augmented link
  end

  U->>IDP: OAuth round-trip
  IDP->>OA: GET /callback (code, state)
  OA->>GU: Complete(code, state)
  GU->>GU: verify binding integrity (spec 1380) + idp_origin ∈ TO
  GU->>GU: completion_ticket = HMAC(linkToken | surface_user_id | idp_origin | exp)
  GU-->>OA: { downstream_code, redirect_uri, client_state, completion_ticket }
  OA->>U: 302 redirect_uri?code=…&state=linkToken&ticket=…

  Att->>LB: GET /api/link-complete?state=linkToken (no/bad ticket)
  LB->>LB: parse ticket; verify signature, exp, ticket.linkToken == state, origin ∈ TO
  LB-->>Att: "Unable to verify completion" (no store read, no consume)

  U->>LB: GET /api/link-complete?state=…&ticket=…
  LB->>LB: verifyCompletionTicket — PASS
  LB->>PD: ResolvePendingDispatch(linkToken) — atomic; row deleted, no tombstone
  LB->>BR: dispatcher.dispatch(replay)
  LB-->>U: "Processing"
```

| Component | Role in this design |
|---|---|
| `libutil.completion-ticket.js` (new) | Sole owner of the canonical ticket format. Exports `mintCompletionTicket({ linkToken, surfaceUserId, idpOrigin, exp, secret })` and `verifyCompletionTicket({ ticket, expected, now, secret })`. Pure functions; `now` is caller-injected (no internal `Date.now()`) consistent with the libbridge clock invariant. Both `ghuser` (mint) and `libbridge` (verify) import directly — no libbridge wrapper. Crypto is `node:crypto` HMAC-SHA256; no new deps. |
| `libutil.trusted-origins.js` (new) | Pure module exporting `loadTrustedIdpOrigins(env)` → `Set<string>` and `assertTrusted(origin, set)`. `env` is a caller-supplied object (e.g. `process.env` at boot), not read internally. Each parsed entry is round-tripped through `new URL(s).origin` at load time so the set holds normalised origins (default ports stripped, lowercased host). Fails closed on empty/unset env: the set is empty, the membership predicate returns false for every input, callers convert into `TrustedOriginError`. |
| `libbridge.prepareLinkResume` | Signature gains `trustedOrigins: Set<string>` as a required third positional arg. Throws `TrustedOriginError` when `new URL(authorizeUrl).origin` is not in the set; `#stashAndPostLink` catches and skips both the queue put and the post. Existing tests gain a Set fixture (default `new Set(["https://github.com"])`). |
| `ghuser.Complete` | Order of operations: (1) consume flow; (2) exchange code; (3) verify GitHub identity per 1380; (4) **assert `idp_origin ∈ trustedOrigins` before any `bindings.upsert`** (services/ghuser/index.js:97-106); (5) upsert; (6) mint completion ticket; (7) return. The `idp_origin` value is ghuser's own configured IdP host (`https://github.com` today; sourced from existing ghuser config, not from request input). `CompleteResponse` gains `completion_ticket` (string, proto field number 5; additive, wire-compatible). On origin failure returns the new `untrusted_origin` outcome (sibling to 1380's `identity_mismatch`) before any upsert. |
| `oauth /callback` | Appends `&ticket=<completion_ticket>` to the redirect URL when present (services/oauth/index.js:86-91). Renders an `untrusted_origin` refusal page when ghuser returns that outcome (parallel to existing `identity_mismatch` page at index.js:77-83). This is one of two distinct refusal pages: the oauth-side `untrusted_origin` page (user finished IdP, bind refused) and the bridge-side "Unable to verify completion" page (no IdP round-trip, or ticket failed). |
| `libbridge.createLinkCompleteHandler` | Reordered: parse `state` and `ticket` query params → `verifyCompletionTicket` against expected values **before any store call** → only on PASS, `ResolvePendingDispatch` → dispatch. Failure renders "Unable to verify" page; ticket absence and signature mismatch produce indistinguishable responses. The existing "Missing state" 400 branch at `link-resume.js:33-39` is preserved unchanged. |
| `services/bridge.ResolvePendingDispatch` (services/bridge/index.js:213-234) | The on-consume tombstone (`{ id: link_token, deleted: true }` at line 226) is **removed**. The row is deleted from the index; no replacement record is written. The proto response shape is unchanged — `link_token` still appears in the in-flight response (used by the handler in-process), but no persisted record outlives the consume. Sweep continues to evict expired pending entries by `created_at`. |

## Identity carrier on completion (Defect 1)

The completion request must carry a signal the bridge can verify came from
`ghuser`. The signal is a short-lived HMAC ticket the auth partner mints after
binding integrity and origin checks both pass, sent via the existing user
redirect. No new server-to-server channel: the ticket travels through the
user's browser, piggybacked on the redirect that the spec retains explicitly
(spec § Out of scope retains the click-through completion). The HMAC secret
is the shared trust assertion — verified once at boot, then implicit in every
ticket — not a per-request server-to-server call.

The ticket claims `{ linkToken, surfaceUserId, idpOrigin, exp }`. The verifier
loads the pending entry by `linkToken` **only after** signature and exp pass,
and confirms `ticket.linkToken == state` and `ticket.surfaceUserId ==
pending.surface_user_id`. Including `linkToken` in the signed payload prevents
cross-token replay: a ticket minted for entry A cannot satisfy a probe against
entry B's linkToken even when both belong to the same `surface_user_id`.

**Accepted residual — within-window URL replay.** Tickets are bound to one
`linkToken` but not single-use within `exp`. An attacker who reads the
redirected URL from referrer leak, browser history, or shared-device access
within `exp` can complete before the legitimate user. Mitigation is short
`exp` (minutes; plan Open Q2) plus the fact that the redirected URL never
appears in the public channel — only in the user's own redirect chain. A
single-use consumed-tickets table is the natural next hardening; this spec
does not require it.

## Trusted-origin contract (Defect 2)

`loadTrustedIdpOrigins(env)` is the sole source of the set, consumed by
`prepareLinkResume`, `ghuser.Complete`, and `verifyCompletionTicket`. One env
read at boot per service. **Fail closed:** an empty or unset
`BRIDGE_TRUSTED_IDP_ORIGINS` produces an empty set; every membership check
returns false; every caller throws `TrustedOriginError`. Servers add a
startup-fatal preflight (`assertNonEmpty(trustedOrigins, …)`) on the same
config-load path that already asserts presence of other secrets — see
`libpreflight` usage in `services/ghuser/server.js` and the two bridge
`server.js` entrypoints.

Membership is exact-string equality on Node's `new URL(s).origin`, which
normalises scheme + host + port (default ports stripped:
`https://github.com:443` → `https://github.com`; host lowercased). Both the
set entries and the query URL are run through `.origin` before comparison —
no literal-string compare on configured values, no prefix matching.
`https://github.com/login/oauth/authorize` matches `https://github.com`;
`https://github.com.attacker.example/...` does not. The bridge declines to
post and the partner declines to bind on any non-member.

**`TrustedOriginError` UX is silent-skip on link-post.** No queue put, no
channel post, no user-visible error — surfacing one would itself be a probe
oracle. Server-side info-level logging is fine. (User feedback intentionally
omitted per spec § Out of scope: no auditing, no rate-limit.)

## Consumed-record hygiene (Defect 3)

The current `ResolvePendingDispatch` writes a tombstone keyed on the literal
`link_token` (`services/bridge/index.js:226`), so the on-disk persisted record
**still contains the token** after consume. The fix removes the tombstone
write entirely: the row is deleted from the index and no replacement record
is persisted. Sweep continues to evict expired live entries.

The plan also removes the now-dead tombstone readers: the stale-clean loop at
`services/bridge/index.js:215-219` and the `rec.deleted || …` clause in the
sweep predicate (`index.js:276`-area). Both become unreachable when no
`deleted: true` row is ever written; leaving them in would mask the contract
change.

This covers every record under the bridge service's persisted state
(`data/bridges/discussions.jsonl`-adjacent files for pending entries). The
spec's verification "every record the bridge has persisted about it" is scoped
to the bridge's own persisted state — **not** to gRPC in-flight response
payloads (which exist only for one request lifetime), nor to upstream log
sinks. The plan adds a one-line note that `PutPendingDispatch` /
`ResolvePendingDispatch` request and response bodies must not be logged at
info level on either client or server side; debug-only logging is fine.

Page-refresh idempotence after a successful consume is **dropped** (was a
1380 property, never a spec 1400 requirement). The first click already
reached the "Processing" page; a refresh now shows "Already processed" — the
same page any other no-entry case shows. Spec SC #2 ("exactly once" dispatch)
is satisfied because consume-and-delete is atomic in the single-instance
bridge service. Consume-then-crash before dispatch completes leaves the entry
gone on restart and the user sees "Already processed" on retry — UX identical
to today's post-successful-dispatch path after the tombstone-retention window
expires; spec does not require mid-consume crash durability.

## Bridge parity and response distinguishability

Every changed contract lives in shared code: `libutil` ticket + origin
modules, `libbridge` handler reorder, `services/bridge` resolve change,
`ghuser.Complete` ticket mint (single site for both surfaces per existing
`GITHUB_ID_SURFACES`). The only per-bridge code change is each
`#stashAndPostLink` catching `TrustedOriginError` and declining to post.

The bridge returns two distinct terminal pages per spec SC #3 — "Unable to
verify completion" on ticket failure, "Already processed" on no pending
entry. Residual oracle: an attacker holding a posted `linkToken` can probe
with no ticket and read which page comes back, learning liveness. Spec
accepts this (rate-limit and audit out of scope). The ordering invariant
narrows it: signature verification happens before any store lookup, so
unsigned probes against random linkTokens never touch the store and the
response shape is identical regardless of liveness. The oracle only fires
on a real posted token whose value the attacker already saw — the same
surface the within-window URL replay residual occupies.

## Key Decisions

| Decision | Choice | Rejected alternative |
|---|---|---|
| Identity carrier on completion | Short-lived HMAC ticket from `ghuser.Complete`, carried in the user-redirect URL | Cookie-only attribution (drops across mobile/embedded webviews); server-to-server bridge↔ghuser callback (spec out-of-scope) |
| Where the ticket primitive lives | New `libutil.completion-ticket.js` — both `ghuser` and `libbridge` import | Put mint+verify in `libbridge` and have `ghuser` depend on it (introduces a service→`libbridge` edge that doesn't exist today and would carry libbridge's transitive deps into `ghuser`); duplicate mint and verify in each site (format-drift risk) |
| Where the trusted-origin set lives | New `libutil.trusted-origins.js` consumed by `prepareLinkResume`, `ghuser.Complete`, and `verifyCompletionTicket` | Per-site inline check (three drift points); shared via `services/bridge` RPC (one RPC for a static boot-time config read) |
| Auth-partner shape | Single `ghuser.Complete` minting once per binding, per-surface logic via existing `GITHUB_ID_SURFACES` | Separate `msauth` mint site (no such service exists; spec 1271 consolidated to `ghuser`) |
| Token-redaction approach | Delete pending row on consume; write no tombstone | Hash tombstone id (`sha256(link_token)`) — token derivative still "about" the entry; separate tombstone table with non-token id (new proto for one boolean's worth of state) |
| Page-refresh idempotence after consume | Dropped — refresh shows "Already processed" | Retain hashed-token marker for refresh detection (re-introduces a token derivative for an edge case the first-click success already covers) |
| Where completion-handler ordering changes | Inside `libbridge.createLinkCompleteHandler` only — both bridges share | Per-bridge handler rewrites (duplicates the contract, loses parity invariant) |
| HMAC secret shape | Single shared secret across the bridge service + `ghuser`, read from env at boot, startup-fatal if unset | Per-bridge-partner asymmetric signing key + JWK rotation (key-rotation surface dwarfs ticket lifetime); derive ticket key from existing per-service secrets (cross-service key derivation is its own design) |

## Open questions for plan

1. **HMAC secret env-var name.** `LINK_COMPLETION_TICKET_SECRET` is the
   working name; final spelling lives in `server.js` defaults across three
   services (`ghuser`, `ghbridge`, `msbridge`).
2. **Ticket lifetime.** A few minutes is the right order of magnitude
   (typical IdP round-trip + browser redirect). Plan picks a value bounded
   by latency measurements and pins it in `libutil.completion-ticket.js`.

— Staff Engineer 🛠️
