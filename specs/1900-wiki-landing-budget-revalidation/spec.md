# Spec 1900 — Wiki landing path: post-landing pre-push budget re-validation (size axis)

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | Agent summaries carry hard word budgets so boot context stays bounded. The landing path can publish a budget breach no author ever wrote: two individually under-cap contributions union past the cap during the sync, or a session-close rewrite lands unvalidated. Every published breach costs a reactive repair cycle (five events on 2026-06-12 alone, across three agent lanes), pollutes the budget-breach evidence series with mechanical noise, and trains writers to operate at the cap with reflexive post-publish trims instead of trusting the landing primitive. |
| Platform Builders | [Build Agent-Capable Systems](../../JTBD.md#platform-builders-build-agent-capable-systems) | The wiki sync library presents commit-reconcile-push as one safe primitive, and the wiki audit defines the budget contract. Today the two are not connected at publish time: the flow will happily push a tree the audit would immediately fail. A consumer cannot defend against this — the breach is created inside the primitive, after the author's last opportunity to check. |

## Problem

Obstacle [#1667](https://github.com/forwardimpact/monorepo/issues/1667)
records that the wiki landing path publishes summary word-budget breaches
because nothing re-validates budgets between landing and push. Budgets are
checked — when checked at all — against the author's pre-landing state. The
flow then reconciles with origin and pushes whatever results.

Five same-day (2026-06-12) events establish the family, spanning three lanes
and three mechanism shapes:

| Specimen | File | Breach | Mechanism shape | Residence |
|---|---|---|---|---|
| RE 1 | release-engineer summary | 2209/2048w | canonicalization landing adopted a sibling leg's parts wholesale (merge union) | 56s |
| RE 2 | release-engineer summary | 2071/2048w | session-close block landed at 2027w under cap; sync merge carried +44w from a parallel lane | 2m20s |
| SecE 1 | security-engineer summary | 2070/2048w | own review landing (own-landing class; merge attribution and residence not recorded at adjudication) | — |
| SecE 2 | security-engineer summary | 2057/2048w | session-close rewrite +59w over a 1998w base — **no merge, no markers**; published unvalidated | 1m15s |
| Coach | improvement-coach summary | 2100/2048w | mid-rebase union graft after a crashed push (content-correct, budget-wrong) | 1m28s |

Residence = time the breach stayed published at origin before its repair
commit.

Two structural facts follow:

- **Two under-cap sides can merge to over-cap.** Both inputs individually
  satisfy the budget; their union does not; nothing re-checks after the
  union. Under chronic near-cap operation (ledger
  [#1480](https://github.com/forwardimpact/monorepo/issues/1480)), a few
  dozen words of merge-carry deterministically publishes a breach.
- **No merge is needed to breach.** SecE 2 breached on a single-lane
  session-close rewrite. Author-side floor discipline demonstrably fails
  exactly when needed: the floor was met at base (1998w), but the reserve
  (~50w) was smaller than the rewrite delta (+59w). The arithmetic
  generalizes — a ≤2000w floor guarantees at most 48w of reserve against
  the 2048w cap, and that reserve must absorb every single landing event,
  authored and delivered alike. Observed single events exceed it on both
  axes: the +59w rewrite delta above, and a +96w memo delivery the same day
  ([adjudication](https://github.com/forwardimpact/monorepo/issues/1480#issuecomment-4689493008)).
  Floors are aspiration; only the landing leg, measuring after all content
  is final and before publish, can enforce.

The boundary between this gap and its in-flight siblings was settled on the
issue thread by the staff-engineer
([settlement](https://github.com/forwardimpact/monorepo/issues/1667#issuecomment-4689232559),
adopting the improvement-coach
[disposition](https://github.com/forwardimpact/monorepo/issues/1667#issuecomment-4689167456)
with one amendment). This spec carries that settlement's §5 verbatim in
intent; no competing boundary exists.

## What

The wiki sync's commit-and-push flow re-validates summary and weekly-log
budgets **post-landing, pre-push**: after all landing work for this writer is
final (session-close writes, sync merge, conflict resolution — whichever
occurred) and before anything publishes, the flow re-runs the wiki audit's
budget predicates on the outgoing tree and refuses to push a budget
regression this writer's push would introduce.

### Semantics — per-writer delta, not absolute cap

- **Baseline**: the worse budget state, per file and per budget predicate,
  among this writer's push inputs — (i) the writer's session base tree and (ii) the fetched origin
  tip being landed onto.
- **Refusal predicate**: the outgoing tree *introduces or deepens* a breach
  relative to that baseline. Equal-or-improved states always pass.
- **Foreign breaches pass through by construction**: a file already
  over-cap at origin that this writer did not worsen never blocks the push.
  The absolute-cap absorption hazard flagged on the thread
  ([gate-semantics flag](https://github.com/forwardimpact/monorepo/issues/1667#issuecomment-4689008738))
  does not occur.
- **Coverage**: per-writer delta catches all five family events with one
  comparison — merge-union (outgoing worse than both inputs), author-overrun
  (outgoing worse than base, no merge), and mid-rebase graft alike.

### Predicate inheritance

The gate evaluates budgets **by reference** to the wiki audit's predicates —
the same summary and weekly-log budget rules the audit reports on, not a
second budget definition frozen into the gate. Whatever a future spec does
to the budget measures (including spec 1860's planned predicate change for
memo headroom) is automatically what the gate enforces.

### Refusal behaviour

- The refusal is **visible and reason-carrying**: it names the file, the
  measured values (baseline and outgoing), and the violated predicate, and
  it is distinguishable from the structure-axis refusal (spec 1890's marker
  check) sharing the flow.
- Work is never lost: commits stay local; the writer adjudicates (trim own
  content, or surface the carried content to its owner). The gate refuses;
  it never edits.

### Constraints (settled on #1667; binding)

| # | Constraint |
|---|---|
| (a) | Attach at spec 1890's post-landing re-validation point — do not mint a second gate. One re-validation point, two pluggable checks (structure: 1890; size: this spec). |
| (b) | Whichever of 1890 and this spec lands second reconciles the refusal-reason taxonomy on the shared flow — reason classes and refusal semantics, including aligning 1890's marker-binding wording to "outgoing push" if needed. |
| (c) | The refusal binds only what this writer's outgoing **push** introduces — authored and merge-carried regressions alike; never a foreign pre-existing breach, never an unrelated writer's flow. |

Constraint (c)'s "push" wording — the settlement's §3 amendment of
"outgoing merge" — has independent live confirmation: the 2026-06-12
memo-trip reached the receiving file by push-borne sync with **no merge on
the receiving side**
([adjudication](https://github.com/forwardimpact/monorepo/issues/1480#issuecomment-4689493008)).
A merge-scoped refusal would not have seen it; a push-scoped one does.

### The spec-1860 seam — writer-class seam clause

Memo-delivery deliverability semantics are spec 1860's WHAT. A memo
delivered into measured-deficient headroom is an author-side edit that
deepens a breach under today's inbox-inclusive measures; refusing it here
would enforce at the push layer the exact contradiction 1860 exists to fix.
Therefore: **until spec 1860's predicate change lands, memo deliveries into
measured-deficient headroom are exempt from refusal on the summary measure —
the gate surfaces the breach but does not block.** The exemption covers the
breach the memo-delivery write itself introduces; any other regression the
same push carries adjudicates normally under the per-file, per-predicate
delta. Once 1860 lands, predicate inheritance retires the exemption
automatically. Nothing leaks
into 1860's scope in either direction, in either landing order.

**The seam window carries a known, deterministic residual.** The realized
memo-trip pair of 2026-06-12
([adjudication](https://github.com/forwardimpact/monorepo/issues/1480#issuecomment-4689493008))
live-confirms 1860's A1 boundary from both sides: a memo delivered into
sufficient headroom did not trip (positive control), and a +96w memo
delivered into 39w headroom tripped deterministically (2105/2048w published,
repaired reactively in ~4m26s). During the seam window this gate surfaces
such breaches but — correctly, per the clause above — does not block them,
and author-side floors cannot prevent them: the ≤2000w floor's guaranteed
48w reserve is smaller than both observed single-event magnitudes (+59w
authored delta, +96w memo). Closing the residual is therefore a
**calibration requirement on spec 1860**, recorded here so that the
exemption's automatic retirement actually closes it: 1860's predicate
change must guarantee delivery headroom ≥ the maximum expected single
delivery — whether by reserve sizing or by a delivery-time headroom check
is 1860's design decision, not this spec's. Until 1860 lands, seam-window
breaches repair reactively, as today, with this gate's surfacing as the
detection signal.

## Coordination with the in-flight libwiki series

| Sibling | Boundary with this spec |
|---|---|
| Spec 1890 (structure axis, PR #1673) | Owns the re-validation point and the conflict-marker check; explicitly keeps the point composable for this budget re-check without absorbing it. This spec attaches there per constraint (a). [#1667](https://github.com/forwardimpact/monorepo/issues/1667) closes on this spec's artifact, not on 1890's merge. |
| Spec 1860 (memo headroom, PR #1665) | Held by the writer-class seam clause above. SecE 2 is additionally a calibration datum for 1860's headroom-≥-delta premise — both routings stand; they were never exclusive. |
| Spec 1730 (compliant-by-construction writes, PR #1578) | Construction-side: narrows the breach class at write time but structurally cannot see post-landing union states. Complementary, no overlap (scope boundary recorded on PR #1578). |
| Spec 1780 (push-outcome honesty, PR #1601) | This gate's refusals surface through whatever outcome/refusal taxonomy exists on the flow; reconciliation obligation is constraint (b)'s, mirroring the 1890/1780 seam. |
| Ledger #1480 (chronic ceiling proximity) | Evidence series for near-cap operation; this gate removes the mechanical-breach noise from that series but does not address ceiling proximity itself. |
| Ledger #1564 (side-pick erasure family) | Content-loss family, different defect class; no overlap. |

## Out of scope

- **Auto-trim or any automatic repair** — owner policy; the gate refuses,
  never edits.
- **Foreign pre-existing breaches** — pass-through by construction
  (constraint (c)); surfacing them is the audit's job, repairing them is
  any writer's.
- Memo-delivery deliverability semantics (spec 1860's WHAT; seam clause
  above).
- The structure axis — conflict-marker detection and mid-merge guards (spec
  1890).
- Write-time budget enforcement (spec 1730's family).
- Changes to the budget values or measures themselves — the gate inherits
  predicates; it never defines them.
- Budget surfaces outside the settlement's scope (e.g. storyboard budget
  rules) — the gate enforces summary and weekly-log budgets; extending
  coverage is a future decision, not silently absorbed here.
- Author-side floor conventions (lane discipline; this gate makes them
  non-load-bearing for every class it refuses — though during the spec-1860
  seam window, memo deliveries remain floor-dependent; see the seam
  clause's residual note).

## Success criteria

Each criterion is verified by the wiki library's (libwiki) test suite, run
via the repository's test command.

| # | Claim |
|---|---|
| 1 | A sync where both inputs are under cap but the merged outgoing tree exceeds a summary word budget is refused before push, with commits preserved locally. |
| 2 | A session-close landing whose rewrite takes a summary over cap with no merge contribution is refused before push. |
| 3 | A push whose outgoing tree deepens an existing breach (origin already over cap, writer adds words to that file) is refused. |
| 4 | A push onto an origin tip containing a foreign over-cap file the writer did not worsen proceeds — pre-existing breaches never block unrelated writers. |
| 5 | A push that leaves a breached file equal to or better than baseline (e.g. an owner trim) is never refused. |
| 6 | Weekly-log budget predicates are enforced by the same gate under the same delta semantics as summary budgets. |
| 7 | The refusal reason names the file, the baseline and outgoing measured values, and the violated predicate, and carries a reason class distinguishable from any co-resident refusal class on the flow (the structure-axis marker class, once spec 1890 lands). |
| 8 | The gate and the wiki audit produce identical budget measurements for the same file content, and a change to an audit budget predicate is reflected in the gate's enforcement without changes to the gate. |
| 9 | A memo delivery into measured-deficient headroom is not refused on the summary measure, and the outcome surfaces the resulting breach (seam clause). |
| 10 | A clean under-budget sync behaves exactly as today — the gate adds no behaviour change to the happy path. |

## Evidence

- Obstacle record, mechanism analysis, and specimen table:
  [#1667](https://github.com/forwardimpact/monorepo/issues/1667).
- Boundary settlement this spec carries (§5):
  [staff-engineer settlement](https://github.com/forwardimpact/monorepo/issues/1667#issuecomment-4689232559).
- Framing reconciliation and five-event family enumeration:
  [improvement-coach disposition](https://github.com/forwardimpact/monorepo/issues/1667#issuecomment-4689167456).
- Delta-not-absolute and predicate-inheritance boundary conditions:
  [gate-semantics flag](https://github.com/forwardimpact/monorepo/issues/1667#issuecomment-4689008738).
- Merge-free author-overrun specimen with headroom-floor calibration datum
  (the specimen table's SecE 2; numbered specimen 3 on the thread):
  [SecE specimen 3](https://github.com/forwardimpact/monorepo/issues/1667#issuecomment-4689146591).
- Chronic near-cap operation series:
  [#1480](https://github.com/forwardimpact/monorepo/issues/1480).
- Realized memo-trip datum pair completing 1860's A1 boundary, floor-reserve
  calibration (48w guaranteed reserve < 59w authored delta and < 96w memo
  delivery), and push-borne-sync confirmation of constraint (c)'s wording:
  [improvement-coach adjudication](https://github.com/forwardimpact/monorepo/issues/1480#issuecomment-4689493008).

— Product Manager 🌱
