# Plan 1272 — Hosted control-plane hardening

Implements [design-a.md](design-a.md) for spec [1272](spec.md). The design
groups the six hosted-path gaps into four independently-shippable moves
(A/B/C/D). This plan decomposes along that boundary: one part per move, each
independently executable. No part restates the spec or design — read both
before executing any part.

## Approach

One part per design move, in the part index below. Each part is gated entirely
on `*_TENANCY_MODE === "multi"` (or, for Move D, on the hosted template set), so
the self-hosted / single-tenant path is untouched (criterion 9) — every new
collaborator is conditioned on `multi` mode and single-tenant test fixtures stay
unmodified. Each move follows § Clean breaks: it replaces the deferred behaviour
named in the service README rather than wrapping it, and removes the
"deferred"/"default-deny" documentation language as it ships.

## Part index

| Part | Move | Scope | Criteria |
| --- | --- | --- | --- |
| [plan-a-01.md](plan-a-01.md) | A | `services/ghserver` peer-auth interceptor + externalized App-key custody with in-place rotation | 1–4 |
| [plan-a-02.md](plan-a-02.md) | B | `services/msbridge` `/onboard` Bot Framework JWT verifier; remove default-deny | 5 |
| [plan-a-03.md](plan-a-03.md) | C | `services/ghbridge` uninstall→revoke handler, `services/bridge` `ListAllOpenRecesses` + `MarkTenantRevoked`, multi-tenant `rearm` | 6–7 |
| [plan-a-04.md](plan-a-04.md) | D | `.claude/skills/kata-setup` hosted-template sibling-version pins | 8 |

## Inter-part dependencies

None hard. The four parts share no code and may land in any order, matching
design Key Decision 8. Two soft notes:

- Part 01 (Move A) provisions external custody and the per-caller peer-token
  trust root; Part 03's new bridge RPCs ship behind the same bind-address
  isolation that covers ghserver today, so Part 03 does **not** wait on Part 01.
- Part 04 (Move D) blocks **externally** on the sibling repos
  (`forwardimpact/kata-action-agent`, `kata-action-eval`) shipping
  `installation-token` input acceptance; the monorepo-side work is the version
  pin alone and is unblocked once the siblings tag.

## Execution recommendation

- Parts 01, 02, 03 → an engineering agent (code + service tests). They are
  independent and may run in parallel across separate worktrees.
- Part 04 → `technical-writer` or an engineering agent; it is a
  template/version-pin edit plus a README note, not service code. Land only
  after the siblings tag the token-accepting versions.
- Smallest-first ordering (02 → 03 → 01 → 04) unblocks adopter capability
  earliest; substrate-first (01 → 03 → 02 → 04) hardens the mint surface before
  extending it. Either is valid per design § Suggested move ordering.

## Risks

- **Part 01 external custody is environment-shaped.** The key resolver depends
  on a secret-manager client whose exact API is operator-environment-specific;
  the plan keeps the resolver behind an injectable collaborator so the test
  fakes it and the production binding is a thin adapter chosen in `server.js`.
- **Part 03 cross-record consistency.** `MarkTenantRevoked` applies per-record
  atomic writes, not a cross-record transaction; correctness relies on the
  callback handler's existing `ResolveByTenantId` state check refusing any
  post-sweep callback. A reviewer cannot see this from the RPC alone — it is a
  design invariant (design § State invariants).
- **Part 04 is not verifiable in this repo's CI.** Only the version-pin clause
  of criterion 8 is monorepo-checkable; token acceptance is verified in the
  sibling repos. Do not block Part 04's local verification on a cross-repo run.

Libraries used: librpc (peer interceptor, clients), libconfig (config keys),
libbridge (ResumeScheduler, store adapter, handlers), libstorage (atomic
record writes), libtype (proto messages), botbuilder (onboard verifier).

— Staff Engineer 🛠️
