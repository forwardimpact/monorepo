# Spec 1430: Tenant-scope the realtime-bridge inbox route

## Persona / Job

Two personas hire this spec:

- **Primary — Teams Using Agents — Run a Continuously Improving Agent Team**
  (JTBD.md § Teams Using Agents). The Kata bridges relay human replies from a
  channel (GitHub Discussions, Microsoft Teams) into the agent workflow and
  back; the trust model assumes each tenant's in-flight conversation is
  isolated from every other tenant's. The realtime-bridge inbox is the
  live-injection endpoint that lets a participant nudge an agent run
  mid-flight; cross-tenant exposure of that channel exposes one tenant's
  session to another.
- **Secondary — Platform Builders** (libraries/README.md § Jobs To Be Done).
  Operators who host their own bridge by composing libbridge. The route
  shape is part of libbridge's public contract; an unannounced change is the
  visible cost surface for this persona.

## Problem

The realtime-bridge inbox route shipped in spec 1390 without a tenant
segment. Three surfaces inside libbridge carry the single-parameter shape:

- **The bridge inbox route mount** — `GET /api/inbox/:correlationId` in the
  libbridge HTTP server's inbox conditional.
- **The dispatcher's inbox URL construction** — the template literal
  emitted alongside the workflow-dispatch call.
- **The inbox handler's parameter read** — the handler reads
  `correlationId` from the route, with no `tenant_id` peer parameter.

The tenant-scoped callback convention established by **spec 1270 plan-a-04**
(`libbridge` TenantResolver + tenant-bound callback registry, merged
`feat/1270-libbridge-tenancy`) routes the sister callback endpoint as
`/api/callback/:tenant_id/:token` with a registry-side mismatch check that
fails closed (returns `null` when the path tenant does not match the
binding's tenant, identical to the "missing token" shape). The inbox route
does not follow that convention.

`correlation_id` is not assigned an auth role anywhere in spec 1270 or its
plans — it is a routing handle, also emitted as a workflow input
(`inputs.correlation_id` in the dispatch workflow) and surfaced in workflow
logs. A tenant who can observe a peer tenant's `correlation_id` can
long-poll that peer's in-flight inbox until the agent run concludes. Spec
1270's tenancy promise is partial while the inbox path remains
untenant-scoped.

The gap was caught in the security review of PR #1316 (1270 part 04
implementation) as finding O2. A staff-engineer follow-up (PR #1317, merged
2026-05-31) amended `specs/1390-realtime-bridge-conversations/plan-a.md`
to record the watchlist, but `1390` is at `plan implemented` in
`wiki/STATUS.md` — no future review phase reads that plan, so the
amendment does not surface the gap to anyone. Issue #1320 and this spec
supersede that amendment as the live-tracking artifact; the historical
amendment text stays in `specs/1390-realtime-bridge-conversations/plan-a.md`
as an implemented-plan record.

## Why a new spec, not a 1270 or 1390 amendment

Spec 1390 is at `plan implemented`; an amendment to its plan has no future
review surface (PR #1317 demonstrated this failure mode). Spec 1270's
master row is at `plan approved`; rewriting any of its parts after panel
approval silently changes scope a panel already cleared. A new spec gives
this discrete hardening its own review loop. Issue #1320 lists two
alternative homes (new spec; roll into 1270 plan-a-05); this spec executes
the new-spec alternative and supersedes the roll-into-1270 suggestion
recorded there.

## Scope

In scope:

- The libbridge inbox route shape (server mount, handler parameter set).
- The dispatcher's emitted `inboxUrl`.
- The fail-closed semantics when the path tenant does not match the
  tenant bound to the `correlation_id` at dispatch time.
- **The unknown-`correlation_id` response shape.** Today the inbox
  handler returns the same response (HTTP 200, empty messages list after
  long-poll timeout) for known and unknown correlation IDs; fail-closed
  parity with the callback route (spec 1270 plan-a-04) requires the
  unknown-correlation case to become distinguishable from the
  known-correlation case at the protocol level. The new unknown-id
  response shape becomes the reference SC #3 aligns the wrong-tenant
  response to.
- The behavioural commitment that the inbox handler verifies the path
  tenant against the tenant bound to the `correlation_id` at dispatch
  time. The carrier — whether the path-side tenant is matched against the
  registry directly, against a resolver-side check, or against another
  surface — is a design-phase decision.
- Test fixtures in `libraries/libeval/test/inbox-poller.test.js` (all
  occurrences) that hard-code the legacy single-parameter inbox URL.

Out of scope:

- ghbridge / msbridge changes other than what threading the tenant value
  through the inbox-handler construction site implies. The per-bridge
  inbox-handler construction site (in `services/ghbridge/index.js` and
  `services/msbridge/index.js`) may need to receive the tenant binding;
  the carrier shape is a design-phase decision and any per-bridge update
  it implies is in-scope-by-implication.
- The `InboxPoller` consumer in libeval — it treats `inboxUrl` as an opaque
  string and appends `?since=…`; the route shape change is transparent to
  it (no code change required).
- How `correlation_id` is minted or rotated.
- Any change to the callback route established in spec 1270 plan-a-04.
- Multi-tenant deployment topology (covered under the multi-tenant-bridges
  plan part of spec 1270).

## Success criteria

A trusted reviewer can verify each row independently against the merged
implementation. "Existing convention" means "matches the shape established
by spec 1270 plan-a-04 for the sister callback route."

| # | Claim | Verification |
|---|---|---|
| 1 | The inbox route accepts requests of shape `/api/inbox/{tenant_id}/{correlationId}` with both path segments visible to the handler, returning the live inbox handler's success response (matching the shape `{messages: [...]}` per `libraries/libbridge/src/inbox-handler.js`). | Integration test: a request to the new shape with both segments returns a 2xx HTTP status and a JSON body matching the in-flight success shape (whatever the handler emits when the correlation is known and no fresh messages arrive, today `{messages: []}`). |
| 2 | The legacy shape `/api/inbox/{correlationId}` (one path parameter, the route this spec replaces) no longer reaches the inbox handler. | Integration test: a request to `/api/inbox/foo` (one path parameter, no second) does not invoke the inbox handler (e.g., is rejected by the router as a non-existent route). The exact status code is the implementation's choice; the WHAT is that the legacy mount is gone. |
| 3 | The wrong-tenant response is indistinguishable from the unknown-`correlation_id` response (criterion 8 anchors that shape). The two responses share status code and body. | Integration test: pick any unknown `correlation_id`; record its response. Then request `/api/inbox/{wrong_tenant}/{known_correlation_id}` for some known correlation bound to a different tenant; this response equals the recorded reference in status code and body. |
| 4 | The Dispatcher emits an `inboxUrl` whose URL pathname ends with `/api/inbox/{tenant_id}/{correlationId}` with the resolved tenant and correlation in those slots. | Test: dispatch with a resolved tenant produces an `inboxUrl` whose `URL.pathname` parses to a path that ends with `/api/inbox/<tenant>/<correlation>` where `<tenant>` is the resolved tenant value and `<correlation>` is the registered correlation. |
| 5 | A deployment configured for single-tenant mode emits the literal string `default` in the `{tenant_id}` slot, and the inbox route accepts that literal segment. | The single-tenant resolver established by spec 1270 plan-a-04 produces the `default` literal (see `specs/1270-kata-bridges-public-hosting/plan-a-04-libbridge-tenancy.md` § Step 2). Test: in that mode, the emitted `inboxUrl` pathname ends with `/api/inbox/default/{correlationId}` and a request to that URL succeeds (criterion 1 holds with `tenant_id = "default"`). |
| 6 | Inbox fail-closed and callback fail-closed (from spec 1270 plan-a-04, the sister route) share the same *failure protocol shape*: non-2xx HTTP status, JSON error body. The exact bytes need not match (the inbox error message may reference correlations, the callback's references tokens), but the structural contract is the same. | Test: parse both the inbox mismatch response (criterion 3) and the callback mismatch response as JSON; assert (i) both HTTP statuses are non-2xx and equal to each other and (ii) both bodies are JSON objects whose top-level key set is the same. |
| 7 | After implementation, no monorepo source or test file constructs an inbox URL with the legacy single-parameter shape; the libeval test fixture uses the three-parameter shape. | The three legacy construction shapes are each detected by a fixed-string or simple-regex sweep. Each command runs under default ripgrep (no PCRE2). Each must return zero hits after implementation. <br>(a) Hono route declaration of the inbox route: `rg -nF '"/api/inbox/:correlationId"' libraries/ services/ products/ tests/ websites/ .github/ scripts/ config/ data/` — catches the libbridge server's inbox route mount today. <br>(b) Template-literal construction of the inbox URL: `rg -nF '/api/inbox/${correlationId}' libraries/ services/ products/ tests/ websites/ .github/ scripts/ config/ data/` — catches the libbridge dispatcher's inbox URL construction today. <br>(c) Quoted URL with one inbox segment: `rg -n '"https?://[^"]+/api/inbox/[^/"]+"' libraries/ services/ products/ tests/ websites/ .github/ scripts/ config/ data/` — catches the libeval inbox-poller test fixtures today. <br>The `specs/` and `wiki/` trees are excluded because they contain descriptive prose (this spec, issue 1320 references, plan 1390 archives), not constructions. |
| 8 | The unknown-`correlation_id` response is the externally-anchored reference shape used by criteria 3 and 6: a non-2xx HTTP status that equals the callback route's wrong-token status (today HTTP 404 per the sister callback route), and a JSON error body whose top-level key set equals the callback wrong-token body's top-level key set (today `{error: <string>}`). The constraint is "match the sister-route shape" — the inbox does not have to use the literal callback message text. | Integration test: a request to `/api/inbox/{any_tenant}/{unbound_correlationId}` returns a non-2xx HTTP status equal to the callback wrong-token status, and a JSON body whose top-level key set equals the callback wrong-token body's top-level key set. Criteria 3 and 6 reference this response. |

## Risks

| # | Risk | Persona impact |
|---|---|---|
| 1 | A platform builder (libbridge consumer) has code or test scaffolding that pastes the legacy single-parameter shape; the first request after upgrade no longer reaches the inbox handler. | The error is non-obvious — a router miss looks identical to a misconfigured base URL. The libeval fixture sweep is in scope and seals the monorepo's own use of the legacy shape, but external libbridge consumers carry their own cost; the implementation PR's body and the published changelog for libbridge are the natural surfaces for the announcement, sized appropriately to a small-blast-radius security hardening. |
| 2 | Platform builders composing libbridge may need to update their per-bridge inbox-handler construction site to thread the tenant binding through to the handler. From outside libbridge, the URL contract is opaque to consumers; from inside libbridge, the binding has to reach the handler. | The cost is one additional change at the construction site (`services/ghbridge/index.js`, `services/msbridge/index.js`, and any third-party bridge); the spec calls this out so the persona can budget for it, leaving the carrier shape to the design phase. |
| 3 | The two libbridge routes that bind to a session (`/api/callback/...` and `/api/inbox/...`) drift apart over time as one is changed without the other, surprising the next platform builder reading either path. | **Mitigation:** criterion 6 pins "same fail-closed shape as plan-a-04 callback" as an explicit verification, so any future maintainer changing one path can detect the drift via this spec's criterion. |

## References

- Issue #1320 (this spec's driving issue) — staff-engineer's PM-disposition
  request and call-site enumeration
- PR #1316 (`feat/1270-libbridge-tenancy`) — merged 2026-05-31, the
  implementation of plan 1270 part 04 whose security review surfaced finding O2
- PR #1317
  (`docs(specs): carry PR #1316 security watchlist into specs 1270/05 and 1390`)
  — merged 2026-05-31, superseded by this spec; the amendment to
  `specs/1390-realtime-bridge-conversations/plan-a.md` has no future-review
  surface
- Spec 1270 plan-a-04
  (`specs/1270-kata-bridges-public-hosting/plan-a-04-libbridge-tenancy.md`) —
  the callback-route precedent this spec's inbox-route shape mirrors
- Spec 1390 (`specs/1390-realtime-bridge-conversations/`) — the spec that
  introduced the inbox route at its current single-parameter shape

— Product Manager 🌱
