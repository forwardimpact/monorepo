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
         (staged paths + output surfaces)
```

The edit-intent field is the seam: the facilitator declares it when routing
(L2); the receiver consumes the staged-path half to scope its commit (L1). The
field carries two surface classes (D5): staged paths the receiver commits, and
output surfaces L2 orders on but L1 never stages. The staged half is
co-verified — L1 stages it and the S1 audit catches drift; the output half is
order-only, so the classes must stay structurally distinct. The single-routing
cardinality rule (D6) rides the same dispatch gate.

## Components

| Component | Role | Lever |
|---|---|---|
| Commit paths (shared-checkout committers) | The closed set of skills/tools that commit inside the shared checkout — agent feature commits, activation sweep-commits, and tool commits (`fit-wiki claim`/`release`, already scoped by PR #1571). | L1 |
| Edit-intent field | A structured field on a facilitated ask with two distinct classes (D5): the own-artifact **staged paths** the receiver will commit (L1), and the **output surfaces** — non-staged shared targets such as the #1702 reconciliation thread — that L2 orders on but L1 never stages. | L1↔L2 seam |
| Facilitator dispatch gate | The routing step that holds a same-surface ask until the prior one Answers or releases (L2), and that routes a single-owner directive to exactly one acting lane with co-recipients getting a no-staging FYI (D6/S6). | L2 |
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

### D5 — Edit-intent declares two surface classes; D4's order-key is their union

Genuinely multi-owner directives can legitimately target one shared output that
no activation stages — the #1702 reconciliation thread, a session summary doc, an
Announce. Edit-intent therefore carries two structurally distinct classes:
**staged paths** (L1 stages; D4 also orders on them) and **output surfaces** (D4
orders on them; L1 never stages). D4's serialization order-key is the **union** of
both; L1's stage-set is the staged subset only. **Rejected:** a flat surface list
with a `staged` flag. A consumer that misreads the flag would let L1 stage a
surface the activation does not own — reintroducing the exact committed-loss L1
exists to remove — so the split must be a hard type boundary the L1 consumer
cannot cross, not a convention. Output surfaces inherit D4's granularity rule (the
specific thread, never "the wiki"), or the coarser key collapses throughput. This
serializes on a non-staged surface but adds no lock: it is the same advisory
dispatch hold as D3, keyed on a wider value set, with the Answer as liveness — S5
holds. D6/S6 closes #1725's single-owner case; D5 covers only the residual case
where one output surface is legitimately shared across owners.

### D6 — Anchor single-routing cardinality (S6) at the L2 dispatch gate

The facilitator routes a single-owner directive to exactly one acting lane;
co-recipients receive a no-staging FYI that carries no edit-intent and requires
no action. This mirrors how D1 anchors the L1 staging discipline at each commit
path: S6's cardinality control attaches at L2's existing dispatch gate, the same
component D3/D4 govern. It bounds **how many** lanes act on a directive, where
D3/D4 bound **when** same-surface asks run — with one correctly-classified acting
lane there is no fan-out to serialize. S6's guarantee is exactly as strong as the
single-owner classifier at the gate (spec.md S6): a directive *misclassified as
multi-owner* falls through to L2's temporal ordering, which caps asks in time but
not in lane count, so the fan-out can still occur. The classifier predicate and
its conservative-default direction are therefore load-bearing design surface, not
an implementation detail — see open questions. **Rejected:** deduplicating the
duplicate records after fan-out — that is the coordination-comment floor's job
(#1667 / #1647 / #1732); S6 prevents the fan-out, upstream of it. Cardinality is
routing only — no lock, lease, or mutual exclusion — so S5 holds.

## Data flow

1. Facilitator forms an ask. A single-owner directive routes to exactly one
   acting lane (D6); co-recipients get a no-staging FYI. If the ask's surface —
   any staged path or output surface — matches an in-flight ask, the dispatch
   gate (D3/D4) holds it until the prior Answer/release.
2. The ask carries edit-intent (D2/D5): staged paths + output surfaces.
3. The receiver does its work and commits, staging exactly the declared staged
   paths (D1) — never a whole-tree sweep, never an output surface.
4. The commit lands through the `fit-wiki` push primitive unchanged (Spec 1850
   D3 boundary); L1 has already ensured the commit carries only own artifacts.

## Boundaries

- **Allocation identity** (1840/1850 D1/D2): untouched. No identifier minting
  changes.
- **Push primitive** (1850 D3, 1750/1780): untouched. L1 is upstream of the
  push — it scopes the commit's contents; D3 scopes how that commit lands.
- **No lock/mutex/lease** (S5): D3 is the load-bearing rejection. Any later
  design that reintroduces lock-based mutual exclusion violates the spec.
- **Coordination-comment floor** (#1667 / #1647 / #1732): untouched. D6/S6 keeps
  a single-owner directive from fanning out; D5 only orders the *asks* when a
  multi-owner fan-out is legitimate. Deduplicating or serializing the comment
  *writes* once a fan-out has happened stays the floor's job. They compose; D5/D6
  do not reach into the comment-write path.

## Open questions for the plan

- The exact enumeration mechanism for "the closed set of commit paths" (S1's
  audit scope) — which registry or convention bounds it.
- Where the edit-intent field lives in the ask schema, and how receiver
  compliance is detected — split by class (D5): staged-path drift surfaces in
  the S1 commit audit, but an output surface is never committed, so its
  compliance has no commit to audit and falls to a dispatch-gate compare of
  declared output surfaces plus the post-hoc Mode-A ≤1-record falsifier.
- The closed set of **output surfaces** a directive can collide on (sibling to
  the commit-path enumeration above, but on the L2 side). Unlike committers it is
  open-ended (any API write target) and has no forcing function: a receiver must
  name its staged paths or its own work won't land, but nothing comparable
  compels it to declare an output surface — so an undeclared one defeats D4.
- The single-owner classifier predicate D6/S6 keys on, and which way its
  conservative default leans for ambiguous directives (spec.md S6 requires the
  protocol name a classifier and declare a default; the predicate internals and
  default direction are this design's to choose, grounded in the corpus).
  Defaulting ambiguous directives to single-owner risks starving real
  multi-owner work in the FYI'd lanes; defaulting to multi-owner reopens the
  fan-out S6 exists to remove.
- Whether the dispatch gate is advisory guidance to the facilitator or a
  mechanized hold — and the liveness fallback if an Answer never arrives
  (without reintroducing a lease, per S5).
