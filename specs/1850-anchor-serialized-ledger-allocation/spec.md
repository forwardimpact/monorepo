# Spec 1850 — collision-record allocation off the contested page: anchor-serialized identity, commit-scoped landings

Graduates Obstacle
[#1564](https://github.com/forwardimpact/monorepo/issues/1564)
(shared-workspace parallel collisions) from interim floors to a structural
fix. The team's collision ledger allocates identifiers — occurrence
ordinals, fold indexes, meta-instance numbers — by editing a
merge-contested wiki page, so every allocation races every landing, and a
lost race destroys the allocation itself. The invariant in one sentence:
**identity is allocated where writes serialize; the contested page only
displays what the serialized record already holds.**

This spec is the concrete artifact for the two scheduled evaluation points — the
6/24 Exp [#1565](https://github.com/forwardimpact/monorepo/issues/1565) read and
the 7/02 verdict point of the RFC #873 lineage (per the obstacle's standing
disposition). It does not pre-empt either: approval gates remain where they are,
and the experiment's measures keep running unchanged. What changes is that those
reads now evaluate a proposed structure instead of an unbounded repair economy.

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The collision ledger is the team's instrument for studying its own failure modes — the Study leg of the PDSA loop. Because the instrument lives on the same merge-contested surface it measures, studying collisions *causes* collisions, and repair work (verbatim re-lands, forensic floors, renumber maps) now consumes a dominant share of coach, release-engineer, and product-manager capacity. The loop is spending its improvement budget repairing its own measurements. |
| Platform Builders | [Build Agent-Capable Systems](../../JTBD.md#platform-builders-build-agent-capable-systems) | The wiki landing path — the `fit-wiki push` surface of the shared write operation in `libwiki`, invoked by the session-end Stop hook and CI post-run steps — is the seam every agent session publishes through, the same primitive specs 1750/1780 harden. Today it can republish stale working-tree content over teammates' landed writes with no conflict and no error; a landing discipline at the primitive protects every consumer surface at one seam, in every installation that runs agent teams on a shared wiki. |

## Problem

Vocabulary, for readers outside the #1564 lineage: **occurrence
ordinals (#N)**, **near-miss numbers (NM-N)**, **fold indexes (n=N)**,
and **meta-instances (M-N)** are the label classes the ledger mints
against shared counters; a **side-pick** is a merge resolving contested
content wholesale to one side; a **stale-tree landing** is any
publication built on a working tree captured before content that has
since landed — whether carried by a side-picking merge or by a direct
commit — with the session-close hook the common carrier.

Evidence pin: figures below are value-read at the M38/M39 mint
([#1564 issuecomment-4687409412](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4687409412),
2026-06-12 04:16Z). The comment-anchor record leads the page: the page's
counter line lags deferred transcriptions — itself the defect under
spec, and the direct cause of the M38 double-allocation below. **70
allocated occurrence ordinals (69 real after one reclassification) plus
18 separately-numbered near-misses in four-plus weeks; fold series at
next-free n=74; meta-instance series at next-free M40, including
thirteen collisions in the counter apparatus itself.** The ledger of
record is `wiki/parallel-collision-ledger.md` per Exp 51
([#1585](https://github.com/forwardimpact/monorepo/issues/1585)). Three
compounding defects:

| Defect | Behavior today |
|---|---|
| Allocation races landing | Ordinals, fold indexes, and meta numbers are allocated by editing the counter line of the ledger page. Mutually-blind sessions minting in the same window double-allocate (M34: anchors 27s apart; M31: ~5m apart; M38: a counter-behind page state caused occurrence #68 to be allocated twice ~3.7h apart), and every double-allocation forces a renumber map plus per-row brackets on a page that is itself being erased and restored. |
| Page erasure destroys state | Stale-tree landings have erased ledger segments five qualifying times (Exp 51 segment-loss clause fired n=5). The eraser class has two sub-shapes: side-picking merges (the contested-hunk half of which in-flight spec 1780 makes fail loudly), and — verified at fold n=71 ([#1564 issuecomment-4687152288](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4687152288)) — **direct stale-tree fast-forward landings**: a session-close hook commits the session's boot-time tree onto the fresh tip with no merge at all, so foreign files regress silently under clean topology, leaving nothing for any loud-conflict contract to catch. Because the page is the record, each erasure is a loss event demanding forensic reconstruction from comment anchors, not a refresh. |
| The reservation floor cannot protect its own apparatus | The interim floor (push a claim row naming the identifiers before minting) was adopted 6/12 and had three conformant uses by ~04:00Z. Its first use (the M36 mint, [#1564 issuecomment-4687130357](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4687130357)) failed both ways: the claim row was erased ~3m58s after publication by the next claim push's sync-merge (occurrence #69, [#1564 issuecomment-4687240556](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4687240556) — a follow-up verification by a separate session leg; its "#68" labels read as #69 per M38), and the protected write-set spent ~36 minutes unpublished in a working tree (two verification passes read it absent) before the hook landed it — after which its measure-CSV component was erased by another stale-tree landing and needed verbatim restoration (M39). A third floor artifact was then erased by the floor's own claim-push merge (occurrence #70): in the M39 record's words, the floor's serialization artifact "is now a three-time victim of the mechanism it serializes." A reservation written to a contested surface inherits that surface's loss modes — it can witness a race, never prevent one. |

The two failure layers fire jointly — within one 40-minute window on
6/12, the allocation apparatus lost a claim row and a double-allocation
while the landing path erased a published write-set — which is why this
spec graduates them together rather than as separable artifacts.

The one mechanism with a perfect record points at the fix: **every
renumber to date has been lossless precisely where events were keyed by
SHA or anchor id** (the M34 and M35 renumber maps instruct "resolve by
event SHA"; M31's, "resolve all anchors by event, not label"). Identity
survives because the durable key lives in append-only history; only the
display labels ever needed repair.

### Relationship to in-flight siblings (1750, 1780, 1840)

Specs 1750 (PR [#1588](https://github.com/forwardimpact/monorepo/pull/1588),
ancestry guard — *what history* may be published) and 1780
(PR [#1601](https://github.com/forwardimpact/monorepo/pull/1601),
push-outcome honesty and loud conflicts) harden the same write primitive;
both are draft specs on open PRs. They are **necessary but not
sufficient** here, and the residual is precise:

- **Neither covers allocation.** With both merged, identity would still
  be minted by editing a merge-contested page; a lost race would still
  destroy the allocation. § Decisions D1–D2 are the missing layer.
- **Neither covers the non-conflicting stale-tree landing.** 1780
  removes the merge-with-ours fallback, so contested-hunk side-picks
  fail loudly — but the fold-n=71 eraser was not a merge at all: a
  clean fast-forward publishing stale foreign files, a shape with no
  conflict for 1780 to surface (1780's conservation criterion guards
  Active Claims rows alone). § Decisions D3 is the missing layer.

**D3 proposes revising one settled decision in 1780, plus one tightening
in territory 1780 declined.** 1780's D6 keeps the whole-tree sweep
contract — for every caller of the operation (hook, CI post-run,
manual) — with sweep scoping the rejected alternative and loud-conflict
burden the stated revisit condition. The evidence motivating revision
arrived after that decision and is of a kind it did not weigh: silent
foreign-file regression under clean topology (fold n=71), which no
loud-conflict contract reaches. D3 therefore binds the same
caller-agnostic surface D6 covers, and approving this spec supersedes
1780 D6's "whole-tree sweep contract unchanged" criterion. Separately,
1780 leaves the pre-rebase fetch's graceful degradation out of its
scope while affirmatively retaining the behavior ("a failed fetch still
leaves the stale ref in place and the operation proceeds"); D3 requires
positive staleness evidence on the landing path — refusal instead of
proceed-on-stale-ref. On the push surface this retires 1780's criterion
row "Push failure with a failed fetch ⇒ transport, not rejected": the
push attempt that row exercises is refused before it occurs. Every
other 1750/1780 decision stands; whichever spec lands last carries the
reconciling edits. (Should 1750's D1 positive-evidence posture be
revised at its own gate, D3's analogous clause stands on its own terms.
Should 1780 itself be rejected or materially revised at its gate, D3
stands alone: a conflicted landing already falls under D3's refusal
clause — it cannot publish the session's write-set completely on a
verified-current base — so conflict-surfacing mechanics become this
spec's design territory instead of an inherited contract, and the D6
supersession lapses as moot.)

**Spec 1840 (PR [#1654](https://github.com/forwardimpact/monorepo/pull/1654),
allocation reservation for contended wiki singletons) is a competing
WHAT on the same allocation act**, open concurrently in the same
lineage. The two share the load-bearing diagnosis — allocation identity
must be durable independent of the page landing (1840 R5), on a surface
that never silently loses a record (1840 R7) — but bind the mint with
opposite contracts: 1840 gates every mint and contended landing behind a
prior acquisition-confirmed reservation; this spec makes the anchor
publication itself the allocation, first-published-wins, with
reservations demoted to detection. They cannot both bind the same mint.
Requirement-level map for the adjudicating human:

| 1840 requirement | Status if 1850's allocation contract is approved |
|---|---|
| R1 (reserve before mint), R6 (reservation expiry) | Superseded — D1's atomic publication dissolves the reserve/confirm/expire machinery rather than implementing it. |
| R4 (winner determination) | Replaced with a weaker timing guarantee, not dissolved: 1840 has the loser learn it lost *before* minting; under D1 the loser publishes, is detected at rebuild, and re-mints against the visible sequence (SC7). Prevention versus detection of double-allocation is the live trade between the two contracts. |
| R2 (reservation-gated landings), R3 (repair passes reserve) | Superseded in their gate-on-reservation semantics — D5 forbids exclusion semantics; landings are bound by D3 instead, repair passes allocate via D1 like any mint. |
| R5 (allocation of record durable past a dead landing), R7 (record surface never silently loses) | Satisfied by construction — the anchor record is an allocation-of-record on a server-serialized surface; D1 meets both constraints. One narrowing: R7's loud-refusal-on-contention clause becomes detection-at-rebuild — contention is never refused at publication, only resolved first-published-wins (SC7). |
| R8 (apparatus write-sets completable) | Compatible with D2; not modified here. |

Three considerations for that adjudication: (a) 1840's problem statement
("the floor has worked once in the field") does not incorporate the
occurrence-#69/#70 and M38/M39 evidence above, under which the
reservation apparatus is a three-time victim of the collision class it
mitigates; (b) approval of either spec's allocation contract supersedes
the other's; (c) the gating difference — 1840 D2 bounds adoption to the
interim floor's footprint until the 6/24 read, while this spec carries
no analogous adoption bound: its approval settles the contract with
only the design and plan gates as sequencing. Approving 1840 defers
field adoption to the 6/24 read; approving this spec does not. The 6/24
read — 1840's declared adoption-scope gate, and an evaluation input for
this spec — receives both specs as artifacts.

## Scope

### In scope

| Component | What changes |
|---|---|
| Identifier allocation (occurrence ordinals, near-miss numbers, fold indexes, meta-instances) | Allocation moves to append-only, server-serialized allocation anchors — a platform-ordered record no merge can erase (§ Decisions D1). An identifier is allocated when its anchor publishes; the ledger page never allocates. The anchor hosting surface and body format are design choices. |
| Ledger page `wiki/parallel-collision-ledger.md` and the MEMORY.md cross-cutting row | Become derived projections of the anchor record (§ Decisions D2). Erasure of a projection is a cache miss repaired by rebuild, not a loss event demanding forensics. |
| Existing corpus backfill | Every pre-anchor ledger entry registers its event key in the anchor record — most entries already cite anchors; those without one receive a backfill anchor — so the rebuild guarantee covers the whole corpus, not just prospective mints. |
| Wiki landing path (the `fit-wiki push` surface of the shared write operation, all callers: Stop hook, CI post-run, manual) | Commit-scoped landings (§ Decisions D3): a landing publishes the session's own write-set, completely, on a verified-current base, or refuses loudly — never a stale side-pick, never a stale fast-forward, never a sweep of a concurrent session's fresh content from a shared tree. |
| Ledger conventions (today the Conventions section of the ledger page; home per design, discoverable from the ledger page header) | SHA/event-keyed identity codified as the lookup key for every ledger entry; ordinal labels are display-only (§ Decisions D4). |
| Interim reservation floor | Retained as a tripwire — a double-allocation detector whose claim-row collisions are themselves evidence — and explicitly demoted from serializer (§ Decisions D5). |

### Out of scope

- **Facilitator-side ask serialization and edit-intent declaration** —
  the lever Exp #1565 measures; its 6/24 read and the 7/02 RFC #873
  lineage verdict own that decision. This spec neither assumes nor
  forecloses it.
- **Specs 1750/1780 content** — ancestry guarding, push-outcome honesty,
  and loud conflicts proceed on their own PRs. Sole exceptions: the 1780
  D6 supersession and the landing-path fetch tightening stated in
  § Relationship.
- **Spec 1840** — its allocation-contract conflict and requirement map
  are stated in § Relationship for adjudication; nothing else of 1840 is
  modified or absorbed here.
- **Exp 51's measures and CSV schema** — the experiment keeps measuring
  through its 6/24 verdict; this spec changes what the measures observe,
  not how they are recorded.
- **The boot-digest obstacle family** (#1446 lineage) — distinct
  mechanism, keeps its 7/02 rollup.
- **Wiki content budgets and surface structure** (summaries, weekly
  logs, Carry inventories) — the draft 1730/1610/1490 family's
  territory; untouched here. D3 changes landing *semantics* for the
  whole shared seam, which incidentally protects those surfaces, but
  their formats, budgets, and audit rules are not in this spec.

## Decisions

| # | Decision |
|---|---|
| D1 | **Allocation authority lives at append-only, server-serialized anchors.** An identifier exists iff an allocation anchor for it has published; anchor publication order is the serialization. Concurrent mints still race, but the race is decided by the anchor sequence — first-published wins, the loser re-mints against the visible sequence — and no outcome can be erased by a merge. |
| D2 | **The ledger page and the MEMORY row are derived projections holding no sole-copy state.** Every allocation and event entry is rebuildable from the anchor record; authored prose whose record of authority is an anchor (adjudications, renumber maps, convention changes) cites that anchor. Any divergence between projection and anchor record resolves to the anchors. |
| D3 | **Commit-scoped landings, every caller.** The wiki landing path publishes the session's own write-set, completely, on a base verified current against a successful, non-swallowed remote observation; otherwise it refuses loudly, preserving the session's content locally and naming its recovery path. Stale snapshots of paths the session did not write are never republished, by merge or by fast-forward — the property that closes the fold-n=71 shape and that 1750/1780 leave open. **Concurrent-writer shared trees** — the topology of NM17, NM18, and the run-302/303 shared-checkout specimens, which dominates the evidence corpus — are inside this contract, and there "the session's own write-set" means content attributable to the landing session: a concurrent session's fresh content is never published by this landing (that would re-create the sweep D3 exists to kill) and never reverted, deleted, or otherwise stranded by it — it stays intact in the working tree for its owning session's landing to carry. Where the landing path cannot attribute tree content to its session, it refuses with the same loud-refusal properties. Per-session write-set attribution is therefore a precondition the design must supply for concurrent topologies; per-session working-tree isolation is the canonical mechanism, and the choice of mechanism is design territory. **Named availability cost, accepted:** refusal-on-unverifiable-base means a transient remote failure at session close strands the record locally behind a blocked stop until retried — sessions that today proceed and usually fast-forward harmlessly will refuse instead. D3 trades availability for consistency at the landing seam; the corpus prices silent loss above deferred publication. Conflict handling itself stays 1780's contract (rejection fallback stated in § Relationship); D3 replaces 1780 D6's sweep-contract criterion as stated there. |
| D4 | **Identity is the event key; labels are display.** Every ledger entry's durable key is its event SHA or anchor id; ordinals, fold indexes, and meta numbers are display labels resolvable through the key, and label changes are lossless by construction. The labeling policy after a detected double-allocation (renumber, as today, vs. stable ordinals with gaps) is an open design parameter — D1 makes the case rare either way. |
| D5 | **The reservation floor survives as tripwire, not serializer.** Claim-row reservations continue, valued for making double-allocation *visible* pre-mint when they survive; no step treats a surviving claim as exclusion, and a lost claim row voids no allocation (the anchor is the allocation). Whether the tripwire's signal justifies its noise is an input to the Exp #1565 6/24 read, which may retire it. |

**Approving this spec settles D1–D5 as proposed at the WHAT level** —
including the supersessions named in § Relationship (1780 D6 and the
failed-fetch⇒transport criterion row retired on the push surface; the
1840 rows marked superseded or replaced). The approval signal may settle
the two layers separately — allocation (D1/D2/D4/D5) and landing (D3) —
by naming the split; an unqualified approval settles both. Two
parameters stay open by declaration: D4's post-detection labeling policy
(design chooses) and D5's eventual retirement (Exp #1565 read input).
Mechanism choices — anchor hosting surface and body format, rebuild
tooling shape, hook wiring, per-session attribution mechanism,
conventions home — are design territory with their own review gate.

## Success criteria

"The landing surface" below is the `fit-wiki push` surface of the shared
write operation; "the procedure" is the allocation procedure in the
conventions document discoverable from the ledger page header.

| # | Claim | Verification |
|---|---|---|
| 1 | Allocating a new ordinal, fold index, or meta number requires zero writes to the ledger page or the MEMORY cross-cutting row at allocation time. | The procedure contains no page-edit step before anchor publication; a conformant allocation is demonstrable with the projection files absent. |
| 2 | Both projections (ledger page and MEMORY row) are rebuildable from the anchor record alone, including the backfilled corpus, and every authored prose section whose record of authority is an anchor cites it. | Delete both projections in a scratch clone, run the rebuild procedure, diff against the anchor sequence: zero missing identifiers or event entries; the rebuild output lists any section lacking its anchor citation. |
| 3 | A landing on the landing surface never republishes stale content on paths the session did not write, by merge or by fast-forward. | Simulated landings exercising both shapes (stale-tree merge; stale-tree fast-forward) against a moved shared tip: the landed tip retains the foreign content in both. |
| 4 | A landing on the landing surface publishes the session's own write-set completely when the base verifies current. | Simulated landing with session-authored changes on a current base: every authored change is at the landed tip. |
| 5 | A landing that cannot verify its base current — including when the fetch failed or was swallowed — refuses: non-zero exit, no reverting commit, session content preserved locally, recovery path named. | Simulated landings against an unobservable remote and against a moved tip without refetch: both refuse with the stated properties. |
| 6 | Any historical ledger entry resolves identically through its event key before and after a label change. | Look up a relabeled event by its recorded SHA/anchor id (e.g. the occurrence renumbered #68→#69 via its eraser SHA) in both label generations: same record. |
| 7 | Two anchors claiming the same identifier are detected at rebuild time, resolved first-published-wins, and the losing mint is re-issued against the visible sequence rather than silently merged. | Rebuild over a constructed double-allocation flags the conflict, emits the first-published assignment, and the procedure directs the loser's re-mint. |
| 8 | Exp 51's measurement pipeline records identically before and after: the measures CSV header and event-file format under `wiki/metrics/exp-51-ledger-format/` are unchanged. | Diff of the CSV header and event-file format against the pre-change form: empty. |
| 9 | The reservation floor carries detection-only semantics: a lost claim row voids no allocation, and a surviving claim collision is recorded as evidence, not treated as exclusion. | The procedure states reservation outcomes carry no exclusion semantics; a simulated claim-row erasure between reservation and mint leaves the allocation valid at rebuild. |
| 10 | The anchor surface the design chooses exhibits D1's substrate properties: a published anchor survives any wiki landing, merge, or projection loss unchanged, and concurrent anchor publications receive one total order that every observer's read agrees on. | Adversarial replay of the eraser corpus's shapes (stale-tree merge landing, stale fast-forward landing, projection deletion) with a published anchor in place: the anchor is unchanged and resolvable afterward; two concurrently published anchors read back in the same order from independent observers; no wiki landing, merge, or projection operation can edit or delete a published anchor in place (the anchor surface's own amendment affordances are outside this criterion — the corpus itself amends anchors, e.g. the M31 map — and divergence introduced by amendment resolves per D2). |
| 11 | A landing in a tree holding a concurrent session's fresh content never publishes that content and never reverts, deletes, or strands it; absent per-session attribution, the landing refuses with criterion 5's properties. | Simulated concurrent-writer tree (leg B's fresh uncommitted edits present when leg A's landing fires): under the design's attribution mechanism, A's write-set is at the landed tip, B's content is absent from it and intact in the working tree; with attribution unavailable, the landing refuses — non-zero exit, no commit, both sessions' content preserved locally. |

## Evidence index

Display labels below are read at the 04:16Z pin and remain subject to
the corpus's own convention: resolve by anchor id or event SHA, not by
label (§ Decisions D4).

- Running tally and mechanism corpus: `wiki/parallel-collision-ledger.md`;
  MEMORY.md cross-cutting row (counter + latest pointers). Figures in
  § Problem are pinned at the
  [M38/M39 mint](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4687409412)
  (2026-06-12 04:16Z), which leads the page's deferred transcription.
- Reservation-floor first-use failure: mint
  [#1564 issuecomment-4687130357](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4687130357)
  (M36); claim-row erasure verified at
  [#1564 issuecomment-4687240556](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4687240556)
  (occurrence #69, labeled "#68" at mint time); publication-lag and
  CSV-erasure corrections of record at the M38/M39 mint above.
- Non-merge stale-tree fast-forward eraser:
  [#1564 issuecomment-4687152288](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4687152288)
  (fold n=71).
- Concurrent-writer shared-tree topology (D3's attribution clause,
  criterion 11): NM17 dual-lane shared-tree collision
  ([#1564 issuecomment-4686191205](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4686191205),
  reclassification of record), NM18 same-ask third-leg dual-execution
  ([#1564 issuecomment-4687051395](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4687051395)),
  and the run-302/303 phantom write-set specimens stranded in the shared
  checkout's object store (ledger page, floor-assisted-catch family).
- Segment-loss firings: Exp 51 firing records on
  [#1585](https://github.com/forwardimpact/monorepo/issues/1585) (clause
  fired n=5).
- Lossless-renumber precedent: the
  [M31](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4685849797)
  (amended
  [4685913368](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4685913368)),
  [M34](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4686985915),
  and
  [M35](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4687087410)
  renumber maps.

— Product Manager 🌱
