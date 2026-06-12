# Spec 1960 — Wiki landing path: post-push integrity instrument (integrity axis)

Thin sibling of spec 1900 in the family anchored on
[#1667](https://github.com/forwardimpact/monorepo/issues/1667) → PR
[#1681](https://github.com/forwardimpact/monorepo/pull/1681). Authored
against the staff-engineer
[design disposition](https://github.com/forwardimpact/monorepo/pull/1681#issuecomment-4690930953)
of the two 1900-family inputs
([all-lane floor](https://github.com/forwardimpact/monorepo/pull/1681#issuecomment-4690603948),
[probe-scope supplement](https://github.com/forwardimpact/monorepo/pull/1681#issuecomment-4690675162));
the disposition's adopt/decline rulings are carried here as binding shape.
Spec 1900's own text is unchanged by this spec.

Throughout, a **lane** is one agent identity's wiki write stream — the
agent the landing and boot flows run as, owning that agent's memory files
(summary, weekly logs, metrics). "Every lane" means every configured agent
identity, with no per-agent exceptions.

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The wiki is the team's memory. A sibling lane's merge can silently un-publish an agent's already-landed record — eight corpus members to date, the worst absent for 28m19s across a file rotation. Detection today is one lane's practice plus vigilance: whether an erasure is caught in seconds or by accident half an hour later depends on who happens to re-read. Erased records include the team's own incident evidence, so an uncaught erasure orphans the evidence chain every countermeasure cites. |
| Platform Builders | [Build Agent-Capable Systems](../../JTBD.md#platform-builders-build-agent-capable-systems) | The wiki sync library presents push as durable publication, but durability ends at the push receipt: a concurrent sibling landing seconds later can drop the pushed content with no signal to the writer, whose flow has already exited. No consumer-side check exists for "is what I published still there?" — neither at the landing flow's close nor at the next session's boot. |

## Problem

Ledger [#1564](https://github.com/forwardimpact/monorepo/issues/1564)
records a corpus of own-authored wiki-record erasures: a lane's landed
content is dropped at origin by a sibling session's merge side-pick or
stale-base landing. Corpus n=8 (side-pick ×6, stale-base ×2) at the
[eighth-member adjudication](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4690673013).

This class is a **structural residual** — no existing or in-flight gate can
cover it:

- **Pre-push gates measure the outgoing tree.** Spec 1890 (structure axis)
  and spec 1900 (size axis) re-validate the writer's own outgoing push. The
  eraser here is a *different* session's push, landing after the victim's
  flow exited — the eighth member's eraser merged 18s after the victim's
  push, in a window the victim's flow never executes.
- **Eraser-side authorship checks are excluded by design.** The spec-1780
  lineage's pre-push content-diff floor is deliberately authorship-keyed
  (decision D5): same-writer/different-session carriers sit inside its
  exclusion so that rotation-by-design never becomes a refusal
  ([SecE confirmation](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4690539659)).
  Widening it onto owner self-edits would trade this defect class for a
  false-refusal class.

Victim-side post-push probing is therefore the only instrument shape that
covers the residual. The corpus measures both what the instrument buys and
where its current practiced form is blind:

| Member | Detection | Window | What it establishes |
|---|---|---|---|
| 418b (PM, 6/12) | Post-push own-entry re-read (probe) | 42s, commit-timestamp basis | First mechanically-detected published member; designed detection bounds exposure to seconds. |
| Sixth (SE, 6/12) | Same-pass owner vigilance, no probe | — | The detection cell hardens into a class property only if the probe is an all-lane floor; one lane's practice leaves every other lane vigilance-bounded. |
| Eighth (6/12) | Reconciliation-read vigilance | 28m19s, crossed a file rotation | A *prior* run's record is outside every per-run probe execution's scope, structurally. The victim's home file ceased to exist mid-window, and the victim was itself the record of the seventh member's erasure — an unrestored recursive erasure orphans the family's evidence chain. |

Two further measured facts bind the design:

- **Wiki push receipts are unrecoverable** (verified on the thread: the
  wiki repository exposes no events API; pushes surface only as coalesced,
  page-keyed events). The detector's wall-clock is the only receipt-grade
  upper bound on exposure a lane can ever have; commit-timestamp arithmetic
  is the labeled fallback basis.
- **Residence can outlive the victim's home file.** The eighth member's
  window crossed a part-file split, so any path-keyed presence check
  false-positives on rotation.

## What

The wiki landing and boot flows gain a two-tier post-push integrity
instrument, run by **every lane** (the all-lane floor, adopted in the
disposition §1; PM-lane practice graduates unchanged into tier 1).

### Tier 1 — current landing (landing flow)

After each push, the flow verifies the writer's **just-pushed delta** (the
"own landed entry" of the adopted floor, generalized to every file the
push touched) is present at the origin tip, and surfaces any absence;
presence is silent. Bounds same-window erasure of the current landing —
the 418b detection (42s) as flow behaviour instead of lane practice.

### Tier 2 — lane-record boot sweep (boot flow)

At session boot, after fetch, the flow verifies the lane's **prior-session
push set** — every push the lane has made since its last tier-2 sweep, the
early claim-time push and the session-close push alike, not only the final
one — is still content-present at the fetched origin tip, and surfaces any
absence. This converts the reconciliation read that caught the eighth
member from vigilance into an instrument, and reaches the latency floor of
any session-based instrument — the inter-session gap — for one bounded
verification per boot. On a lane's first boot, with no prior push, the
sweep verifies vacuously.

- **Content-keyed, not path-keyed**: pushed content counts as present when
  it exists somewhere in the lane's files at the tip, regardless of which
  file carries it — presence must survive legitimate rotations and part
  splits.
- **Additions only**: the predicate covers content the push added or
  retained; a deletion asserts nothing, so the lane's own trims and
  rotations never trigger a detection.
- **Sweep domain is the lane's own files.** Content the push carried into
  shared singletons or another agent's surfaces (a status row, a memo
  delivered into a teammate's inbox) is legitimately consumed or
  transitioned at session cadence and is excluded from tier 2 — its
  durability is owned by its own semantics. Tier 1, whose window is
  seconds, verifies the full delta including those surfaces.
- **Recursive victims need no special mechanism**: restore and detection
  records are lane pushes like any other, so the prior-session push-set
  scope covers them automatically. Special-casing them would put
  victim-content classification inside the instrument — declined per the
  disposition §4, on the same axis discipline the corpus's membership
  rulings enforce.

### Detection semantics — both tiers

- **Detection wall-clock stamp, binding.** Every detection record stamps
  the detector's wall-clock; exposure arithmetic derived from commit
  timestamps is labeled as the fallback basis it is.
- **Fail-visible, never auto-restoring.** The instrument surfaces absence
  for owner adjudication; it never restores content. A sibling same-lane
  session or a cross-lane curation pass may have legitimately rotated,
  condensed, or archived the content — auto-restore would convert
  rotation-by-design into resurrection, the false-positive class D5's
  exclusion exists to avoid. Mirrors spec 1900's "the gate refuses, never
  edits."
- **Degenerate cases are detections, not skips.** When tier 2 cannot
  resolve what to verify — the reference to the prior-session push set is
  itself missing at the fetched tip (the eraser class can strike the very
  record the sweep keys on) — the sweep surfaces that as a detection;
  silently verifying nothing would fail invisible.
- **The instrument's checks write nothing.** Detections surface in the
  flow's output. Any resulting detection or restore *record* is an
  ordinary owner-authored memory entry landed through the normal flow —
  which is exactly how tier 2's recursive coverage reaches it.
- **Adjudication-sufficient output.** A detection names the absent content
  (its push-time home and identity) precisely enough for the owning lane to
  decide restore-vs-rotation without re-deriving the history.

## Coordination with the family and in-flight siblings

| Sibling | Boundary with this spec |
|---|---|
| Spec 1900 (size axis, PR #1681) | Family parent; its text is unchanged. Different predicate (budget measures of the outgoing tree vs presence of landed content at origin), different seam (pre-push vs post-push), different actor (own flow vs sibling eraser). |
| Spec 1890 (structure axis, PR #1673) | This instrument does **not** attach at 1890's post-landing re-validation point — that point gates the outgoing push; this instrument runs after publication and at boot, per the disposition §5. |
| Spec 1780 lineage (push-outcome honesty, PR #1601) | D5's authorship-keyed exclusion is deliberate and unchanged; this spec is the designated owner of the residual inside it. No widening of 1780 onto owner self-edits. |
| Specs 1750 / 1920 (ancestry guard, merge discipline) | Prevention-side: they narrow the eraser class at the eraser's flow. This instrument is detection-side for whatever residual still lands; complementary, no overlap. |
| Ledger #1564 | Evidence corpus and adjudication chain; comment-layer anchoring (the coach's anchor-commit citation rule) is the complementary durability half this eraser class cannot reach. |

## Out of scope

- **Auto-restore or any automatic repair** — owner adjudication only.
- **Eraser-side prevention** — specs 1750/1890/1920 territory; no
  authorship-keyed eraser checks (D5's exclusion stands).
- **The next-N-origin-tips sweep form — declined as drawn** (disposition
  §2): no lane has a process alive between sessions to observe
  intermediate tips, and the latest-tip check dominates for detection.
- **Standing whole-history audit.** Each push set is verified once by
  tier 1 at push time and once by tier 2 at the next boot; an erasure
  striking content a past sweep already verified is outside the
  instrument — that residual remains covered by reconciliation-read
  vigilance and the comment-layer anchor rule, the accepted trade of the
  one-verification-per-boot latency floor.
- **Foreign content and shared-surface durability** — the instrument
  verifies the lane's own pushes; watching other lanes' content is the
  audit's and owners' job, and content delivered into shared singletons or
  teammates' surfaces is consumed under those surfaces' own semantics
  (tier-2 domain bullet above).
- **Spec 1900's size axis and its gate semantics** — unchanged.
- **Comment-layer evidence anchoring** — the coach's citation rule is
  practice-layer and complementary; not mechanized here.

## Success criteria

Each criterion is verified by the wiki library's (libwiki) test suite, run
via the repository's test command.

| # | Claim |
|---|---|
| 1 | After a successful push whose delta is present at the origin tip, tier 1 surfaces no detection. |
| 2 | When the origin tip has moved past the push and any of the writer's just-pushed content is absent from it, tier 1 surfaces a detection naming the absent content. |
| 3 | At boot, after fetch, tier 2 verifies the lane's prior-session push set — including pushes that were not the session's final push — is content-present at the fetched origin tip and surfaces a detection for any absent content. |
| 4 | Pushed content relocated by a file rotation or part split — present at the tip in a different lane file than at push time — is reported present; rotation alone never triggers a detection. |
| 5 | Content the lane's own push deleted is never reported absent — trim and rotation pushes verify cleanly. |
| 6 | A restore or detection record erased after landing is caught by tier 2 at the lane's next boot through the ordinary prior-session push-set scope, with no recursive-victim special case in the instrument. |
| 7 | When tier 2 cannot resolve the prior-session push set at the fetched tip, it surfaces a detection rather than verifying vacuously. |
| 8 | Every detection carries the detector's wall-clock stamp, and any exposure figure derived from commit timestamps is labeled as the fallback basis. |
| 9 | The instrument's checks never write: on any detection, the working tree and origin are unchanged by the check itself. |
| 10 | A detection names the absent content's push-time file and its content identity sufficiently for the owner to adjudicate restore-vs-rotation. |
| 11 | Both tiers apply identical detection semantics for any configured agent lane. |
| 12 | A clean push and a clean boot produce no new output, no exit-status change, and no tree writes attributable to the instrument — no behaviour change on the happy path beyond the verification itself. |

## Evidence

- Design disposition this spec is authored against (adopt: all-lane floor,
  two-tier scope, wall-clock stamps, recursive-victim rationale; decline:
  spec-1900 absorption, next-N-tips form):
  [staff-engineer disposition](https://github.com/forwardimpact/monorepo/pull/1681#issuecomment-4690930953).
- All-lane floor question, 418b/sixth-member evidence, and push-receipt
  unrecoverability verification:
  [first 1900-family input](https://github.com/forwardimpact/monorepo/pull/1681#issuecomment-4690603948).
- Probe-scope gap, latency-is-consequence, and recursive-victim shape:
  [supplement input](https://github.com/forwardimpact/monorepo/pull/1681#issuecomment-4690675162).
- Eighth-member adjudication (corpus n=8, 28m19s residence, rotation-crossing
  window, reconciliation-read detection cell):
  [#1564 adjudication](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4690673013).
- D5 authorship-keyed exclusion rationale and seventh-member verification:
  [SecE confirmation](https://github.com/forwardimpact/monorepo/issues/1564#issuecomment-4690539659).
- Settlement arc precedent (the same #1667-settlement → spec arc that
  produced spec 1900):
  [#1667 settlement](https://github.com/forwardimpact/monorepo/issues/1667#issuecomment-4689232559).

— Product Manager 🌱
