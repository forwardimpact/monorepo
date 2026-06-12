# Spec 1920 — Wiki sync merge discipline for shared singletons

When parallel sessions land writes on the same row-structured wiki
singleton — the Active Claims table in MEMORY.md, canonically — the shared
sync operation (`WikiSync.commitAndPush` in `libwiki`, behind the
`fit-wiki push`, `claim`, and `release` surfaces) resolves the resulting
contention at the line level, and a line-level resolution of a
row-structured surface is wrong in every direction it can fall:
side-picking erases teammates' rows, union-merging resurrects the writer's
own released rows. This spec defines the **merge discipline** for those
surfaces. The invariant in one sentence: **a non-conserving landing on a
row-structured singleton is resolved by re-running the row operation
against the fresh remote tip — rebase the operation, not the lines.**

This spec is the merge-resolution member of the #1564 structural series.
Spec 1780 (PR #1601) makes contention *honest*: the side-picking fallback
is removed, push outcomes are grounded, conflicts fail loudly, and a push
that would delete a foreign row "refuses or re-merges" (its D5) — but 1780
defines only the refusal; the re-merge is left undefined. Honesty alone
leaves recovery to a manual remediation turn, and the dominant conflict
class — two parallel writers at the same table tail — re-conflicts
deterministically on every retry, so every routine claim collision costs
an agent turn. 1920 defines the re-merge that is always safe for rows
landed through the registered operations, so the write lands without a
human or agent repair pass. Contention without a recorded operation behind
it stays on the fail-loud path — re-apply never guesses.

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The Active Claims table routes who works on what; every sync-merge erasure of a claim row (§ Problem) de-routes work protection until a teammate notices and runs a forensic restore, and restoration passes now consume security-engineer, release-engineer, and coach capacity that should go to improvement work. |
| Platform Builders | [Build Agent-Capable Systems](../../libraries/README.md#jobs-to-be-done) | `WikiSync.commitAndPush` in `libwiki` is the one primitive every agent session publishes through. It owns no resolution semantics for the structured surfaces written through its own claim/release commands, so each installation running agents on a shared wiki inherits a publish path whose conflict behavior destroys exactly the records the commands exist to protect. |

## Problem

On 2026-06-12 the claim row for spec 1910 (PR #1682) was erased from the
shared wiki's MEMORY.md four times in approximately two minutes, by two
distinct mechanism classes, after each repair had verifiably landed:

| # | Event (UTC) | Mechanism class | What happened |
|---|---|---|---|
| 1–3 | 09:10:00–09:10:09 (merges `3c56624f`, `47c188ef`, `aa145ed9`) | Stale-base side-pick storm | Three parallel session legs, each on a base predating the row's repair, hit a rebase conflict on the Active Claims tail hunk; the sync operation's fallback merge resolved every conflicted hunk to the local side and the fire-and-forget push published the erasure. Collateral on the same hunk: the spec-1900 row's PR field reverted from `pr=1681` to unset. |
| 4 | 09:12:04 (merge `f736b4e3`) | Orphan-snapshot clobber | A session-snapshot lineage merged taking its side's MEMORY.md wholesale — the master parent had the freshly restored row, the snapshot side did not, and the take landed without a textual conflict. The restore that fixed erasures 1–3 was published one second before this merge re-erased it. |

The two classes split across the series. Class 1 surfaces as a reconcile
conflict, which this spec's discipline resolves directly. Class 2 is
conflict-free, so it is only *detectable* by 1780 D5's write-time
conservation comparison; once refused, a registered intent-backed
operation re-applies (§ Decisions D1, criterion 8), while an intent-less
landing — the shape of the specimen itself, a whole-session snapshot —
stays refused loudly (criterion 6). Either way the erasure no longer
publishes.

Same-day sibling specimen, same resolution class, different singleton: a
metrics CSV annotation landed by the product-manager (run 412) was dropped
by two successive merge side-picks and absent from the tip for ~7 minutes
until the owner's post-push re-probe caught it and re-applied by hand
(coach capture
[#1564 issuecomment-4689812401 § 2](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4689812401)).

**The dominant mechanism is a named behavior, not weather**: the
rebase-conflict fallback in `WikiSync.commitAndPush` resolves conflicted
hunks with an ours-side strategy option, inside the shared session-end
push path. Any session leg that hits a staleness window while a sibling
has edited the same singleton hunk reproduces the erasure
deterministically. Forensics: release-engineer run-511 mechanism record
and security-engineer run-119 restore record, both anchored from the coach
captures
[#1564 issuecomment-4689812401](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4689812401)
and
[#1564 issuecomment-4689910805](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4689910805).

### Why no gated spec owns this

The four #1564-series specs at the human gate each cover a different
layer; none defines what a *correct* resolution of a contended singleton
write is:

| Spec | Layer it owns | What it leaves open |
|---|---|---|
| 1780 (PR #1601) | Outcome honesty: fallback removed, conflicts fail loudly, foreign-row deletion refuses or re-merges (D5), bounded retry helps only the no-textual-overlap race (D3) | D5 defines the refusal but not the re-merge; recovery is a manual remediation turn, and the table-tail class re-conflicts on every retry by construction |
| 1840 (PR #1654) | Reservation before label mints and contended-singleton writes | Says when a write may be attempted, not how a contended landing resolves |
| 1850 (PR #1655) | Allocation off the contested page; commit-scoped landings | Moves identity off the contested surface; rows still land on shared singletons and still collide |
| 1890 (PR #1673) | Structural corruption (conflict markers): detection and publish guards | Guards against publishing an unresolved merge, not against resolving one wrongly |

## Scope

### In scope

| Component | What changes |
|---|---|
| Singleton merge discipline (`libwiki` `WikiSync.commitAndPush`) | No publish path may resolve a contended hunk of a registered row-structured singleton textually — neither side-biased nor union. Resolution is operation re-apply where recorded intent exists (§ Decisions D1), fail-loud everywhere else (§ Decisions D4). |
| Registered operations (`fit-wiki claim`, `fit-wiki release`, `fit-wiki release --expired`) | These surfaces record enough operation intent that a contended landing can be re-derived against the fresh remote tip instead of merged textually (§ Decisions D2). |
| Singleton registry | The set of surfaces governed by the discipline is explicit and declared, with the Active Claims table as the founding member (§ Decisions D3). |
| Reconcile boundary | Every reconcile — the MEMORY.md-scoped claim/release landing and the whole-tree session-end sweep alike — defines its behavior for mixed contention: intent-backed singleton rows recover, everything else fails loud, never a partial publish (§ Decisions D4). |
| Contract documentation | The `commitAndPush` contract documentation states the discipline, the registry's members, and the boundary with spec 1780's fail-loud floor, traceable to this spec. |

### Out of scope

- **Outcome honesty, grounded success reporting, retry bounds, and the
  foreign-row deletion refusal itself** — spec 1780 owns the floor this
  spec builds on; its taxonomy and D5 detection are unchanged. This spec
  adds only the re-merge a D5 refusal of a registered operation invokes.
- **Label allocation and reservation** — specs 1840/1850. This spec governs
  how a row write lands, not how its identity was allocated.
- **Conflict-marker detection and publish guards** — spec 1890.
- **Prose surfaces** (run logs, summaries, ledger narrative): line-level
  conflicts there have no row semantics to re-apply; they keep the
  fail-loud contract.
- **Conflict frequency** — parallel claims still collide textually at the
  table tail; this spec makes the collision lossless, not rarer.

## Decisions

Each decision names its carried alternative where the approval signal
adjudicates a choice.

**D1 — Resolution by operation re-apply, bounded.** When the landing of a
registered singleton operation is found non-conserving — surfaced as a
reconcile conflict on the row's hunk, or (jointly with spec 1780 D5, once
landed) as a write-time conservation refusal — the operation is re-applied
against the freshly observed remote tip and the result lands. Re-apply is
bounded: if contention persists when the bound is exhausted (the bound's
value is design territory; at least one round), the landing fails loud —
never textually; re-apply rounds are distinct from and compose with 1780
D3's single push retry. The remedy menu from the release-engineer's
run-511 forensics was three deep; the other two are carried as
alternatives, not chosen: *(b) union-merge attribute on the singleton
file* — line-level; known degradation already on record: it resurrects the
writer's own just-released rows and duplicates near-identical lines.
*(c) bounded re-fetch and rebase retry before any fallback* — shrinks the
staleness window but cannot close it, and already exists in constrained
form as 1780 D3, where it is shown not to help the deterministic
table-tail class.

**D2 — Intent-derived, idempotent, freshness-respecting re-apply.**
Re-apply derives from recorded operation intent, never from the contended
text; the registered surfaces record whatever a re-derivation needs (the
record's shape is design territory). Three properties bind: re-applying an
add onto a tip that already carries the row is a no-op; re-applying after
own-row release never resurrects the released row; and an expiry-driven
release re-evaluates against the tip, so a renewal landed since the stale
read is not removed. *Alternative carried:* re-apply by replaying the
local diff hunk — simpler, but it reintroduces textual resolution and
fails the idempotence properties.

**D3 — Explicit singleton registry, founding member Active Claims.** The
discipline binds surfaces declared in an explicit registry, each
declaring what re-derivation on that surface needs (the declaration's
shape is design territory). Founding member: the MEMORY.md Active Claims
table (the claim/release surfaces). Named candidates whose adoption is
each a separate spec-approval signal: STATUS.md phase rows, metrics CSV
appends — the run-412 specimen shows the class generalizes. *Alternative
carried:* apply the discipline to every structured-looking hunk
heuristically — no declaration burden, but a misclassified prose hunk
would be "re-applied" without intent to derive from.

**D4 — Reconcile boundary: intent-backed rows recover, everything else
fails loud.** In any reconcile — command-scoped or whole-tree — a
contended hunk recovers by re-apply only when it belongs to a registered
singleton *and* the session holds recorded intent covering its own write
to that row; foreign rows are conserved by re-deriving on the tip, never
by holding intent for them. Every other contended hunk — prose, an
unregistered surface, or a registered-singleton row edited outside the
registered operations (the intent-less case: there is nothing to
re-derive from) — fails loud, and the failure fails the whole publish: no
partial landing that splits a session's record. *Alternative carried:*
confine re-apply to the claim/release command surfaces and fail loud on
any sweep conflict — simpler boundary, but it leaves the storm's actual
firing site (the shared session-end path) paying a remediation turn for
the dominant, automatically recoverable class.

**D5 — Series coordination with 1780.** 1780 and 1920 amend the same
operation; whichever lands second rebases on the first. Re-apply
intercepts the conflict branch for registered operations *ahead of* any
fallback, so the discipline is deliverable on 1920's implementation alone;
the fail-loud floor for everything else, the grounded outcome taxonomy,
and the D5 refusal are 1780 deliverables. Joint criteria (6–8 below) come
into force when both implementations have landed, and the second-landing
implementation's plan carries the activation step — the named-owner
pattern 1780 D3 establishes for the symmetric case. If the human gate
revises 1780's D5, criterion 8 tracks the revised refusal trigger under
the same approval signal. A re-applied landing reports its outcome through
1780's grounded taxonomy once landed; re-apply earns no exemption from
grounded success. *Alternative carried:* none — this is a coordination
constraint between series peers, not an adjudicable choice.

## Success criteria

Criteria 1–5 bind on this spec's implementation alone (re-apply intercepts
ahead of any fallback — § Decisions D5); criteria 6–8 are joint with spec
1780 and come into force once both implementations have landed, activation
carried by the second-landing plan. Each criterion is verified in
`libwiki`'s test suite unless stated otherwise.

| # | Claim | Verification |
|---|---|---|
| 1 | Two parallel claims appending to the Active Claims tail both land | Concurrent-writer test: a stale-base leg lands its claim after a sibling's claim published; both rows present at the simulated origin tip |
| 2 | A release racing a foreign claim on the same tail lands both outcomes | Concurrent release-vs-claim test: the origin tip holds the foreign claim row and no longer holds the released row |
| 3 | Re-apply is keyed-idempotent and freshness-respecting | Tests: re-applying an add onto a tip already carrying the row yields no duplicate; re-apply after own-row release leaves the row absent; an expired-release re-applied onto a tip carrying a renewal leaves the renewed row intact |
| 4 | The storm geometry (Problem table, class 1) is a regression fixture | Fixture test: a stale-base leg contending on the Active Claims tail publishes without erasing the freshly repaired row or reverting a sibling row's fields |
| 5 | A published resolution of a contended registered-row hunk is never textual | Test: after a contended landing, the origin tip shows either the re-applied row set or no landing at all — never a side-biased or union text |
| 6 | An intent-less or unregistered contended hunk fails the whole publish loudly | Mixed-conflict sweep test: the origin tip is unchanged, nothing partial publishes, and the outcome reports the conflict reason |
| 7 | A re-applied landing reports through the grounded outcome taxonomy | Outcome-report assertion on the re-apply path: the reported reason class is a grounded *landed* per 1780 D2, never an ungrounded success |
| 8 | A conflict-free stale-tree landing that would drop a registered foreign row (Problem table, class 2) recovers when intent-backed | Test: a registered intent-backed operation on a stale tree that would drop a foreign row is refused per 1780 D5 and re-applies, conserving the foreign row and landing the local operation (the intent-less shape of the class-2 specimen itself is criterion 6's) |
| 9 | The registry and the discipline are documented contract | The `commitAndPush` contract documentation names the registered surfaces and states the re-apply/fail-loud boundary, traceable to this spec |

— Product Manager 🌱
