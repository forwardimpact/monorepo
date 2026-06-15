# Design 2010-a — path-scoped staging and facilitator serialization

Architectural sketch for Spec 2010. WHICH components change and WHERE the two
levers attach. HOW and sequencing belong in the plan.

## Shape

Two attachment points, one per lever, plus the data that connects them:

```
  facilitator dispatch                receiver activation
  ─────────────────────               ────────────────────
  [L2] same-surface gate              [L1] path-scoped staging
   │  serialize asks that touch        │  stage own-artifact paths only
   │  the same mutable surface         │  (no whole-tree sweep)
   │                                   │
   └──── ask + edit-intent ───────────►┘
         (surface, own-artifact paths)
```

The edit-intent field is the seam: the facilitator declares it when routing
(L2); the receiver consumes it to scope its commit (L1). One artifact carries
both levers' contract, so they cannot drift apart.

## Components

| Component | Role | Lever |
|---|---|---|
| Commit paths (shared-checkout committers) | The closed set of skills/tools that commit inside the shared checkout — agent feature commits, activation sweep-commits, and tool commits (`fit-wiki claim`/`release`, already scoped by PR #1571). | L1 |
| Edit-intent field | A structured field on a facilitated ask: the mutable surface and the own-artifact path list the receiver will stage. | L1↔L2 seam |
| Facilitator dispatch gate | The routing step that holds a same-surface ask until the prior one Answers or releases. | L2 |
| `fit-wiki` push primitive | Unchanged here; its landing discipline is Spec 1850 D3. L1 only governs what a commit stages, upstream of the push. | (boundary) |

## Key decisions

### D1 — Enforce path-scoped staging at each commit path, not by a global hook

Each shared-checkout commit path stages an explicit own-artifact path list.
**Rejected:** a single global pre-commit hook that rejects broad staging. A hook
cannot tell an activation's own artifacts from a teammate's working-tree residue
— that authorship is exactly what is unknown at commit time — so it would either
block legitimate multi-file commits or pass the foreign content it was meant to
stop. The path list must come from the actor that knows its own intent.

### D2 — Source own-artifact paths from declared edit-intent, not from diff inspection

The receiver stages the paths named in the ask's edit-intent field.
**Rejected:** inferring own artifacts from `git diff`/blame authorship.
Uncommitted working-tree changes carry no author, and the contaminating content
is precisely the uncommitted residue a concurrent activation left — so inference
reads the collision as if it were the actor's own work. Declared intent is the
only pre-commit source of truth for "mine."

### D3 — Serialize at the facilitator dispatch, not by an agent-side lock

The facilitator holds a same-surface ask until the prior one returns.
**Rejected:** an agent-side or claim-based mutex over the surface. #1539
established the claim handshake is advisory, and a real lock's dominant failure —
held by a dead activation with no lease — is a failure mode the family does not
have today (S5, Non-Goals). The facilitator already owns dispatch ordering and
has liveness signal (the Answer); serialization there needs no lock and no
lease. **Also rejected:** a gate-time collision check — that is RFC #873's
gate-side surface, composable with but distinct from L2's protocol-side ordering.

### D4 — Key serialization on the touched surface, not the whole workspace

"Same surface" is the specific mutable target (a wiki file path, a PR branch),
not the checkout as a whole. **Rejected:** serializing every ask in a session.
That collapses throughput by ordering asks that never conflict (two agents
editing unrelated files), reintroducing the cost the autonomy investment was
meant to remove. Keying on the surface serializes only the asks that would
actually collide.

## Data flow

1. Facilitator forms an ask; if its surface matches an in-flight same-surface
   ask, the dispatch gate (D3/D4) holds it until the prior Answer/release.
2. The ask carries edit-intent (D2): surface + own-artifact path list.
3. The receiver does its work and commits, staging exactly the declared paths
   (D1) — never a whole-tree sweep.
4. The commit lands through the `fit-wiki` push primitive unchanged (Spec 1850
   D3 boundary); L1 has already ensured the commit carries only own artifacts.

## Boundaries

- **Allocation identity** (1840/1850 D1/D2): untouched. No identifier minting
  changes.
- **Push primitive** (1850 D3, 1750/1780): untouched. L1 is upstream of the
  push — it scopes the commit's contents; D3 scopes how that commit lands.
- **No lock/mutex/lease** (S5): D3 is the load-bearing rejection. Any later
  design that reintroduces lock-based mutual exclusion violates the spec.

## Open questions for the plan

- The exact enumeration mechanism for "the closed set of commit paths" (S1's
  audit scope) — which registry or convention bounds it.
- Where the edit-intent field lives in the ask schema and how a receiver that
  ignores it is detected.
- Whether the dispatch gate is advisory guidance to the facilitator or a
  mechanized hold — and the liveness fallback if an Answer never arrives
  (without reintroducing a lease, per S5).
