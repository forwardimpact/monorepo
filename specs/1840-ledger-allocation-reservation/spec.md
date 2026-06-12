# Spec 1840 — Allocation reservation for contended wiki singletons

Parallel session legs allocate labels (fold indices, meta ordinals,
occurrence numbers) and land writes on the same wiki singletons — the
parallel-collision ledger page, its counter line, and the MEMORY.md
cross-cutting row — with no serialization point. Allocation is
first-come-unpublished: a leg picks the "next free" label from a read
that is stale the moment a sibling leg reads the same value, and the
collision surfaces only later, as erased segments and forensic
restoration passes. This spec defines a **reservation step**: no label
mints and no contended-singleton write lands without a prior published,
acquisition-confirmed reservation. The invariant in one sentence:
**allocation is decided at reservation time, not discovered at
restoration time.**

Vocabulary, for readers outside the Exp 51 record: a **leg** is one of
several concurrent session lanes writing the same wiki; a **side-pick**
is a merge resolving a contested file wholesale to one side; **fold
indices (n=…)** and **meta ordinals (M…)** are label classes minted
against shared counters on the ledger; **M30-class** names a write-set
that died in a working tree and never published.

The step is required by Exp 51's own segment-loss escalation clause —
the 6/12 routing decision reads it REQUIRED at n=1 and confirmed at
n=2; the n=2 record phrases it as effective at the 6/24 read; required
under either reading. The 2026-06-24 Exp 51 / Exp #1565 verdict read
remains the **adoption-scope gate**: this spec defines WHAT the step
is; the read decides how widely it is adopted.

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The collision ledger is the team's record of its own coordination failures. Under facilitated-session leg density, parallel legs double-allocate its labels and erase each other's segments — the measurement system destroys its own measurements, and every firing costs a full forensic restoration pass (unshallow, pickaxe, blob value-reads) that displaces improvement work. |
| Platform Builders | [Build Agent-Capable Systems](../../libraries/README.md#jobs-to-be-done) | The wiki write path offers no primitive that serializes allocation on a contended surface, so the failure mode recurs wherever shared agent memory keeps an append-numbered record. This spec defines the step for the ledger family only; whether it generalizes to other surfaces is the 6/24 read's decision. |

## Problem

Exp 51 (#1585) moved the ledger to one-segment-per-line so concurrent
amendments auto-merge additively. Segments still die: merges and
session-close hooks side-pick whole stale trees over live carriers, and
mutually blind legs allocate the same label from the same stale read.
The experiment's escalation clause — fire on any full segment loss —
has fired five times:

| Firing | Event | Record |
|---|---|---|
| n=1 (M17) | First post-migration segment loss; the clause's reservation-step escalation path activates (see the reading note above) | #1585 escalation series |
| n=2 (M31) | Cross-leg double-allocation of occurrence #66 + folds n=46–n=49; merge erased the first-anchored segments; requirement confirmed | #1585 issuecomment-4685849915 |
| n=3 (M34) | First-landed fold-n=63 segment fully erased 35s post-publication by a mutually blind sibling landing; three legs had allocated n=63, two allocated n=67 | #1585 issuecomment-4686987127 |
| n=4 (M35) | Session-close hook wave erased four page-landed fold segments three times in one four-minute window | #1585 issuecomment-4687090038 |
| n=5 (M36) | A session-close hook re-landed five segments per the first-landed map and side-picked away three others plus a reconciliation segment | #1585 issuecomment-4687130438 |

The mechanism series behind the firings (numbers, not narratives):

- **Inter-arrivals are collapsing**: ~22h → ~4h → ~16min → ~14min —
  the rate tracks facilitated-session leg density, not chance.
- **Repair passes are the most exposed class**: 4 of 5 firings hit
  repair/reconciliation write-sets. The system now performs
  repair-of-repair-of-repair recursion; each firing costs roughly one
  forensic restoration pass.
- **The session-close hook is a writer, not a courier**: 3 of 5
  firings were hook-carried — the hook publishes the working-tree
  state on a possibly stale base, minutes after the session authored
  it. Any reservation that only serializes in-session writes misses
  the carrier.
- **Allocations outlive their landings**: comment-layer mints whose
  page write-sets died in working trees (M30-class) still hold valid
  label identity — the reconciliation of n=3 turned on exactly such a
  mint. Zero Exp 51 measure-CSV rows published across 8 consecutive
  passes during the 6/12 storm window: under storm cadence even the
  instrument's write path dies, so allocation identity cannot depend
  on the page landing succeeding.
- **Reconciliation itself now collides**: dual-M34 reconciliation maps,
  three legs allocating fold n=63 — the repair layer reproduces the
  failure it repairs.

An interim coach-lane floor was adopted 2026-06-12 (~03:5xZ,
time-stamped for pre/post segmentation): a claims-table reservation
naming the label range is pushed before any label mint or ledger write,
with a pre-stated falsifier — a cross-leg double-allocation while both
legs honored the floor means the floor design is insufficient. The
claims table was chosen as the one surface that has survived every
storm to date, and the floor has worked once in the field. It is one
lane, one surface, and manual discipline; this spec is its
generalization into a defined step with a contract.

## What

The reservation step, stated as requirements on whatever primitive the
design chooses. The deliverable is tooling that enforces this contract
at the shared write seam — the interim floor's manual discipline is
what this spec replaces, not what it codifies.

| # | Requirement |
|---|---|
| R1 | **Reserve before mint.** A leg obtains a published, acquisition-confirmed reservation naming the label range or singleton segment before minting any label or landing any write to a contended singleton. A local, unpublished reservation reserves nothing; acquisition is confirmed only once the reservation is published and the leg has verified it holds the winning reservation per R4. |
| R2 | **Every writer the team controls is bound; every carrier is detectable.** In-session landings and session-close hook landings publish their own contended-singleton content only under a held reservation — the hook is a writer, not a courier. Damage any landing or merge does to *other* legs' reserved content — including the seams owned by the 1730/1750/1780 family — is the carrier case: the contract there is detection against the reservation record plus forensics-free recovery per R5, not prevention. |
| R3 | **Repair passes are first-class allocators.** Restoration and reconciliation write-sets reserve exactly as first mints do; there is no repair exemption. |
| R4 | **Exactly one contending leg proceeds to mint.** The winner among contending reservations is decided by a rule every leg can evaluate from the published state before minting; no leg mints without confirming it holds the winning reservation. The loser learns before minting, not from forensics. |
| R5 | **The reservation record is the allocation of record.** Labels mint by recording the mint against the reservation record, so the mint fact is published and the minted-versus-unminted distinction is decidable from published state. A minted allocation's identity is durable even when the reserving leg's page landing later dies unpublished; a subsequent pass completes the landing from the record without re-allocating. |
| R6 | **Unminted reservations expire; minted allocations never do.** A reservation with no published mint record becomes re-allocatable after a bounded period without manual repair, so a crashed or abandoned reserver cannot block allocation. Expiry never re-opens a range whose mint record is published: minted allocations stand per R5 whether or not the landing completed. |
| R7 | **The reservation surface never silently loses a record.** Every contender either holds a published reservation record or receives a loud refusal — contention is never last-writer-wins. A reservation or mint record erased by an external carrier is detectable and recoverable from published history. The substrate is the design's choice, constrained by these properties. |
| R8 | **Apparatus write-sets are completable.** A pass's Exp 51 measure rows and event files register identity and content such that a write-set that dies unpublished is completable by a later pass from the registration, not from forensic re-derivation. |

## Success criteria

Criteria 1, 5, 6, and 8 verify at implementation time; criteria 2–4
and 7 are field measures whose windows open at each lane/surface's
adoption-record timestamp and close at the 6/24 read (and subsequent
named reads). A quiet field window is evidence, not proof — the
falsifier shape only ever falsifies.

| # | Claim | Verification |
|---|---|---|
| 1 | Two legs contending for one label range: exactly one proceeds to mint, and the other observes its loss before minting. | Test in the implementing change exercising concurrent acquisition. |
| 2 | Cross-leg double-allocations in adopted lanes while all contending legs hold confirmed reservations: zero in the window. | Reservation records cross-checked against the ledger Meta-instances series and the `residual_counter_collisions` series in `wiki/metrics/exp-51-ledger-format/2026.csv`, post-adoption segment. |
| 3 | Escalation firings rooted in an allocation contract violation in an adopted lane: zero in the window. | #1585 firing-record series, root attributed per the rule below, segmented at the adoption-record timestamps. |
| 4 | Restoration passes rooted in lost or contested allocation identity in adopted lanes: zero in the window. | `restoration_passes` series in `wiki/metrics/exp-51-ledger-format/2026.csv`, root attribution recorded in each row's `note` field per the rule below, post-adoption segment. |
| 5 | A hook-carried landing that would replace reserved-and-landed content is detected against the reservation record and recovered without a forensic pass. | Test in the implementing change exercising a stale hook landing over a reserved segment, plus the collision-ledger hook-carrier occurrence class post-adoption. |
| 6 | An unminted reservation whose holder never lands expires within its bound and the range is re-allocated without manual repair; a range with a published mint record is never re-allocated on expiry. | Tests in the implementing change exercising both expiry shapes. |
| 7 | Each adopting lane/surface has a time-stamped adoption record on the parallel-collision ledger page (Floors/Conventions section), so pre/post comparison is mechanical. | The 6/24 read cites the adoption records it consumes from that one location. |
| 8 | A measure-row write-set whose landing dies unpublished is completed by a subsequent pass from its registration. | Test in the implementing change exercising completion after a dead landing. |

**Attribution rule** (criteria 3–4): the root of a firing or
restoration pass is the first contract violation in its causal chain.
A double-allocation or a mint outside a confirmed reservation roots to
this step even when an erasing merge carried the damage (the M31
shape); erasure of reservation-compliant allocations by a side-picking
merge or push roots to the carrier and attributes to the
1730/1750/1780 family.

## Scope

### In scope

| Surface / concern | What the spec covers |
|---|---|
| Contended wiki singletons | The parallel-collision ledger page segments and counter line, and the MEMORY.md cross-cutting row pointer state, as the motivating instances of the general class: any wiki surface where parallel legs allocate from a shared "next free" value. |
| Label classes | Occurrence numbers, fold indices, meta ordinals, near-miss labels — any monotonic label range minted against a shared counter. |
| Apparatus write-set durability | The Exp 51 measure-CSV append path is covered by R8 — its rows carry no shared "next free" value, but their write-sets die in working trees (M30-class) and must be completable from their registration. |
| Writer classes | In-session authored landings and session-close hook landings (bound, R2); sync merges carrying either (detectable and recoverable, R2/R5). |
| Reservation lifecycle | Acquisition, confirmation-by-publication, winner determination, expiry of unminted reservations, completion-from-reservation after a dead landing (R1, R4, R5, R6). |
| Pre/post instrumentation | Adoption timestamps per lane/surface so the 6/24 read and later XmR segmentation are mechanical. |

### Out of scope

- **Merge- and push-path honesty** — ancestry guarding, push-outcome
  reporting, foreign claim-row conservation, and
  compliant-by-construction writes belong to the spec family
  1730/1750/1780, all unchanged at the human gate. The reservation
  step assumes those seams may still misbehave and serializes
  *allocation* regardless; it does not fix side-picking merges, and
  misses caused by them attribute to that family per the success
  criteria.
- **Exp 51 itself** — design v2, measures, and the 6/24 run-until are
  unchanged; no mid-run tampering with the measured system.
- **Adoption scope beyond the defined step** — which lanes and
  surfaces adopt the reservation, and whether it generalizes past the
  ledger family, is decided at the 6/24 verdict read, not here.
- **Renumbering history** — pre-adoption allocations stay adjudicated
  by the existing first-landed precedent; the reservation governs
  future allocation only.

## Decisions

| # | Decision |
|---|---|
| D1 | **First-landed adjudication is retained** as the tie-breaker for anything that predates a reservation or escapes one; the reservation reduces how often it is needed, it does not replace it. |
| D2 | **Pre-6/24 adoption is bounded to the interim floor's footprint**: the step may formalize or replace the coach-lane floor on the lanes and surfaces already under it (the clause's own escalation path, time-stamped for segmentation — not mid-run tampering); adoption anywhere else waits for the 6/24 read. |
