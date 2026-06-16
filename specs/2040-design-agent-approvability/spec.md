# Spec 2040 — Bounded agent-approvability for designs gated on a clean review panel

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | Design approval is the one phase gate with no agent path, so it depends entirely on scarce human bandwidth. Designs pool there while plans drain, capping the implementation throughput the whole PDSA loop exists to produce. |

## Problem

The phase pipeline is spec → design → plan → implement. Three of the four
approval gates already define an agent path:

| Phase | Who may originate `approved` | Trust substitute |
|---|---|---|
| Spec | Human only | — |
| **Design** | **Human only** | **none — the gap** |
| Plan | `staff-engineer` after a clean review panel | the panel |
| Implement | Release engineer on merge | merge gate |

Plans became agent-approvable because a plan translates an *already-approved*
design: the architecture is locked upstream, so an independent review panel
verifying faithful translation is a sound substitute for a human signal.
Designs have no such path — `design approved` is human-only — even though an
approved spec already locks WHAT/WHY upstream and a review panel can verify the
design against it.

Obstacle [#1361](https://github.com/forwardimpact/monorepo/issues/1361)
identifies this gap as the binding throughput constraint. The supporting
readings below were verified directly against the live PR queue and the cited
metric on 2026-06-16; the obstacle issue, re-scoped the same day, is the source
of the freshness-vs-bandwidth segmentation, not of the live counts.

| Reading (verified 2026-06-16) | Source | What it shows |
|---|---|---|
| All 6 (point-in-time 2026-06-16; re-verify at approval) open SE artifact PRs at the gate are `design(...)`; zero plans. The one plan in the obstacle's 2026-06-02 snapshot (plan #1064) has since drained. | Live `gh pr list` re-count + #1361 snapshot | The agent-approvable class drains to 0; the human-only class pools. |
| Oldest design PR aged 16d → 24d under the re-ping (freshness) treatment 6/4–6/15; backlog 7 → 6. | #1361 re-scope comment | Freshness is not the lever — a fresh comment cannot lift a capacity ceiling. |
| `implementations_shipped` never recovered ≥3 consecutive days at-or-above μ=1.7 anywhere in June (xRule2 secondary measure tracked by experiment [#1392](https://github.com/forwardimpact/monorepo/issues/1392)). | #1392 verdict | The throughput cap is real and persistent, confirmed independently from the metric side. |
| Human merge rate on SE artifacts ≈ 1 / 4 days → gap of ~9 implementation merges against the ≥16 June target. | #1361 | Human design-approval bandwidth, holding freshness constant, is the isolated binding constraint. |

Same freshness treatment across both classes, opposite outcomes: the only
material difference is that one class has an agent path and the other does not.

## Decision — extend the plan-approval panel model to designs, with an independent approver, bounded

A trusted agent **in a role distinct from both the design's author and the
merge-gate enforcement locus** may originate `design approved` after an
independent review panel of the design comes back clean. The panel is the
human-trust substitute; the distinct approval locus is what stops the author
from certifying its own work, and keeping it distinct from enforcement is what
keeps the merge-gate backstop an independent check. **Clean** carries the same
bar the plan path already sets: no unresolved blocker, high, or medium findings
on the design artifact. The approving agent's job is mechanical — clear the cold
panel against its **own posted verdict**, then write the STATUS row with the
`origin` and `digest` fields — so any trusted role distinct from author and
enforcement can fill it. The existing human approval paths remain available in
parallel and unchanged, and `kata-dispatch`'s propagation of human PR-side
signals is untouched. Three bounds keep the loosening safe rather than total.

This extends the plan path rather than copying it. On the plan path the *author*
(`staff-engineer`) writes STATUS after its own clean panel: only the panel is
author-independent, not the writer. That leaves a latent self-certification gap
— an author who both convenes the panel and records its verdict can declare its
own work clean. Anti-self-certification is phase-independent, so 2040 closes the
gap for designs with a distinct approval locus rather than propagating the gap
one phase upstream.

The plan path's gap is not a future-tightening nicety — it is the **live soft
target**. Trust-surface *code* lands through the plan and implementation phases,
not through the markdown design, so the plan path's self-certification gap is
what an attacker actually wants. 2040's design control raises the cost of one
route, but its security value stays limited until the plan path is tightened to
the same anti-self-certification bar. The divergence between the two gates is
explained, not silent — and is named here as a known live gap, not a cosmetic
follow-up.

### Bound 1 — eligibility carve-out for trust-surface designs, default-deny

Designs that modify the trust or approval machinery itself, or the agent
profiles and policies that govern agent authority, remain **human-only**. A
gate that can approve changes to its own authority is self-amending; the
carve-out forecloses that. The trust-surface class names the approval-policy
references and the gate machinery they govern (the STATUS ledger and the
dispatch and merge gate that read it), the phase-gate skills, and the agent
profiles and authority policies under `.claude/agents/**`. **When eligibility is
ambiguous, the design defaults to human-only** — the safety-critical
classification resolves to the safe side, so the bound holds even before a
mechanical test exists. The eligible class is ordinary product and library
designs whose approved spec bounds the intent.

The carve-out is enforced where the trust-surface code actually lands, not where
the honor step is recorded. A design PR is markdown — the design document — and
almost never touches the trust surface, so gating only the design-approval step
catches a near-empty intersection: it is enforceable theater. The trust-surface
**code** lands downstream in the **implementation PR**, which 2040 otherwise
gates only on `plan implemented` plus CI. The end-to-end attack route is a
benign agent-approved design → an uncarved plan → an ungated implementation
merge that introduces trust-surface code. To close it, the merge gate evaluates
the **implementation PR's merging diff** against the trust-surface denylist
whenever that PR descends from an agent-approved design or plan chain — it reads
the approval record's `origin` field (Bound 2) to tell an agent chain from a
human one, so the human path is never blocked. The **implementation PR is the
named enforcement point** (SC9). An intersection returns the chain to
human-only.

The denylist is the operational form of the **whole** Bound 1 trust-surface
class, not a narrower floor. It covers the approval-policy references and the
gate machinery they govern (the STATUS ledger and the dispatch and merge gate),
the phase-gate skills, and the agent profiles and authority policies — with the
merge-gate skill, the settings file, the gate workflows, **`kata-design`,
`kata-plan`, and `.claude/agents/**` named as a non-exhaustive minimum**. A
design cannot quietly remove its own guardrail because the denylist names
itself. The denylist is evaluated against the **trusted base (`origin/main`)
copy**, never the PR-head copy — otherwise a PR could weaken the very rule that
judges it. Default-deny governs every ambiguous case until the denylist covers
it. The exact glob syntax is HOW; that the gate decides eligibility this way,
against the merging diff of the implementation PR and against the trusted-base
denylist, is WHAT (SC9).

This carve-out keeps the same surfaces human-only that the existing trust rule
(spec and design approvals originate from a trusted human) already treats as
highest-risk. It is consistent with — but does not depend on — the adjacent
spec 1830, which keeps the spec-less experiment merge path human-originated.

**Bootstrap, self-consistently human-gated.** 2040's own design and
implementation modify the approval machinery, so they are themselves
trust-surface changes and remain human-only under this bound (SC11). The gate
that creates agent-approval cannot be agent-approved into existence. The limit
of the guarantee is worth stating plainly: the design gate forces 2040's design
human-only by mechanism, but its *implementation* is protected **procedurally**,
not mechanically. Because that implementation descends from a **human**-approved
design (`origin = human`), the agent-chain denylist backstop does not fire on
it — a human reviewing the whole human-origin chain is what holds the
trust-surface line for 2040's own rollout. The backstop is mechanical only for
agent-origin chains; the bootstrap window relies on the human design gate
upstream.

### Bound 2 — anti-self-certification: independent panel and independent approver

Three roles must stay distinct so no single agent both produces work and
certifies it clean:

- **The panel** — every reviewer runs cold (fresh context, no authoring bias),
  sized per the review skill's caller protocol and meeting a **minimum quorum**
  so a degenerate one-reviewer panel cannot stand in for an independent read.
  The approver clears the panel against the panel's **own posted, addressable
  verdict artifact** (its review comments), never an author-written summary of
  it. The author convenes the panel, so trusting a summary channel re-admits the
  self-certification this bound exists to close.
- **The approver** — the agent that records approval. It must be in a role
  distinct from the author **and** distinct from the enforcement (merge-gate)
  locus. A cold panel alone is not enough: an author who both convenes the panel
  and records its verdict can declare its own work clean. And collapsing
  approve, enforce, and merge into one trust locus would make the Bound 1/Bound 3
  merge-gate backstop a check the approver also controls — independent in name
  only. Keeping the approver distinct from both the author and the enforcement
  locus is what preserves the backstop's independence.

When it records an agent approval, the approver writes two **required** fields
onto the approval record: **`origin`** (`agent` | `human`) and a **`digest`** of
the reviewed change-set (Bound 3). These two write-side fields are WHAT, not
row-shape HOW: the merge gate cannot scope its backstop without them — it must
tell an agent-originated `design approved` from a human one (or it would block
the human path SC11 depends on), and it must hold the digest to re-check it.
Everything else about how the record is laid out on the STATUS row stays HOW.

The approver must be a different trust **locus**, not merely a different
*instance* of the author's role — two instances of one role are correlated, and
the bound becomes cosmetic. **Which** non-author, non-enforcement role binds is
HOW; **that** such a distinct locus exists is a precondition this spec requires
before any agent design-approval is claimed (SC6). No agent approves its own
design.

### Bound 3 — approval covers the reviewed change-set; human override

An agent approval covers only the content the panel actually reviewed. If that
content changes after approval, the approval no longer holds and the work
returns to unapproved until a fresh clean panel or a human signal covers the new
content. This too is enforced at the merge gate: the agent approval is bound to
a **`digest` of the full reviewed change-set — every file the panel reviewed,
not only the design text** — so a PR cannot smuggle unreviewed files past both
the digest and the denylist checks. The gate recomputes the digest over the
merging change-set of the implementation PR that descends from the agent-approved
chain, and treats any mismatch as unapproved. The digest algorithm is HOW; that
approval is bound to a digest of the **whole** reviewed change-set and re-checked
at the gate is WHAT (SC10). Humans retain the standing ability to approve any
design directly and to reclaim or reverse any agent-approved design before its
merge.

### Why bounded agent-approvability over the alternatives

| Axis | (a) keep design human-only | (b) unbounded agent-approval | (c) bounded agent-approval — chosen |
|---|---|---|---|
| Throughput ceiling | Unchanged — the obstacle persists | Lifted | Lifted for the class that pools |
| Self-amendment risk | None | A gate can approve loosening its own authority | Closed by Bound 1 — denylist enforced against the implementation PR's merging diff, not the markdown design |
| Author self-certification risk | None | Author convenes own panel and records its verdict | Closed by Bound 2 — cold panel **and** an approval locus distinct from both author and enforcement |
| Stale-content risk | Human re-reads | Approval drifts from reviewed content | Closed by Bound 3 — digest of the **full** reviewed change-set re-checked at the gate |
| Enforcement | — | Bounds unwired, asserted only in prose | Bounds 1 & 3 backstopped at the **implementation PR** (denylist vs trusted base; digest vs reviewed change-set) |
| Human oversight | Total, and the bottleneck | None | Retained as override + the trust-surface gate |
| Precedent fit | — | — | Extends the plan panel model; the plan path's identical self-certification gap is the live soft target, named not copied |

## Scope

**In scope** — the canonical approval policy surfaces that encode the gate:

- The **approval-signals reference** — the signals table gains a design
  panel-clean row analogous to the existing plan panel-clean row, and the trust
  rule documents the bounded design agent-approval path with all three bounds,
  including that a trust locus distinct from **both the author and the
  enforcement (merge-gate) locus** records the approval and writes the required
  `origin` and `digest` fields onto the approval record.
- The **merge gate (`kata-release-merge`)** — the decidable backstop for Bounds
  1 and 3, evaluated at the **implementation PR** that descends from an
  agent-approved chain (read from the `origin` field, so human-origin chains are
  untouched): it refuses to let that PR merge when its merging diff intersects
  the trust-surface denylist — checked against the trusted base (`origin/main`)
  copy — or when the digest of the merging change-set does not match the digest
  of the full reviewed change-set.
- The **design skill's frontmatter description, Approval, and Reviewing
  sections** — replace the unconditional human-only statements (the frontmatter
  `description` also asserts human-originated approval) with the bounded
  condition and the trust-surface carve-out, mirroring the plan skill's Approval
  section.
- The **coordination protocol's § Approval signal** — its generalization that
  approvals originate only from a trusted human is corrected to note the
  agent-origination path (a clean panel) that already exists for plans and now
  covers designs, distinct from `kata-dispatch`'s propagation of PR-side human
  signals.

**Out of scope:**

- **Spec-phase approval** stays human-only. The obstacle evidence is
  design-specific (all 6 pooled PRs are designs); specs are not the named
  bottleneck. No change to the spec gate.
- **Plan and implementation gates** — already have agent paths; unchanged.
- **The STATUS row layout, the exact panel size, the denylist's exact glob
  syntax, and the digest algorithm** are HOW for the design and plan phases.
  What is *not* deferred: that the approval record carries the required `origin`
  and `digest` fields (Bound 2 — write-side WHAT, distinct from row layout);
  that eligibility (Bound 1) and digest-match (Bound 3) are enforced at the
  **implementation PR's** merging diff whenever it descends from an agent-approved
  chain, with the denylist read against the trusted base; and that an approval
  locus distinct from both author and enforcement exists (Bound 2). Default-deny
  governs ambiguous eligibility until the denylist covers it.
- **Which** non-author, non-enforcement trust locus binds as the approver may
  defer to the design and plan phases; **that** such a locus exists may not — it
  is a precondition of Bound 2.
- **The re-ping / freshness ritual** (spec 1440, re-ping cadence) —
  necessary-but-not-sufficient and orthogonal; it does not touch this obstacle.

## Success Criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | The approval-signals trust rule documents a design agent-approval path conditioned on a clean independent review panel, and no longer states design approval is unconditionally human-only. | Read the approval-signals reference. |
| 2 | The signals table carries a design panel-clean signal row analogous to the plan panel-clean row, recording that a trust locus distinct from both the author and the enforcement (merge-gate) locus writes the approval, and that it writes two required fields onto the approval record: `origin` (`agent` \| `human`) and a `digest` of the reviewed change-set. | Read the approval-signals reference. |
| 3 | The design skill's Approval section states the bounded agent-approval condition and the trust-surface human-only carve-out, consistent with the plan skill's Approval section. | Read the design skill. |
| 4 | "Clean panel" is defined explicitly as no unresolved blocker, high, or medium findings on the design artifact — the same bar the plan path sets in its DO-CONFIRM checklist (that checklist, not the plan skill's Approval section, is the source of the bar) — not left implicit. | Read the design skill and approval-signals reference; compare to the plan skill's DO-CONFIRM checklist. |
| 5 | The eligibility carve-out names the trust-surface class (approval-policy references and the gate machinery they govern, phase-gate skills, agent profiles and authority policies) and states the default-deny rule for ambiguous cases, resolving to a decidable denylist test (enforced per SC9). | Read the approval-signals reference or design skill. |
| 6 | The independence (anti-self-certification) bound is stated: every panel reviewer is independent of the author and runs cold, the panel meets a minimum quorum, and the approver clears it against the panel's own posted verdict artifact rather than an author-written summary; **and** approval is recorded by a trust locus in a role distinct from **both** the author and the enforcement (merge-gate) locus — not a second instance of the author's role — so no agent approves its own design and the merge-gate backstop stays independent. The spec requires such a distinct locus to exist (the which-role binding may defer to HOW). | Read the design skill or approval-signals reference. |
| 7 | The reviewed-content and human-override bounds are stated: a change after approval returns the design to unapproved; humans may approve directly and reverse an agent approval before merge. | Read the design skill or approval-signals reference. |
| 8 | Spec-phase approval remains human-only: the spec skill's Approval section and the approval-signals spec-row treatment still state that `spec approved` originates only from a trusted human, with no agent panel-clean path added for specs; where spec and design share prose, the spec-applicable wording stays human-only. | Read the spec skill's Approval section and the approval-signals spec row; confirm no design-phase agent path bled into the spec treatment. |
| 9 | Bound 1 is backstopped at the merge gate against the **implementation PR**, named as the enforcement point: `kata-release-merge` refuses to merge an implementation PR that descends from an agent-approved design/plan chain (read from the `origin` field) when its merging diff intersects a checked-in trust-surface denylist evaluated against the trusted base (`origin/main`) copy. The denylist covers the whole Bound 1 trust-surface class, naming the merge-gate skill, the settings file, the gate workflows, `kata-design`, `kata-plan`, and `.claude/agents/**` as a non-exhaustive minimum. | Read the merge-gate skill and the denylist. |
| 10 | Bound 3 is backstopped at the merge gate: the agent approval is bound to a `digest` of the **full reviewed change-set** (every file the panel reviewed, not only the design text), and at the implementation PR descending from the agent-approved chain `kata-release-merge` recomputes the digest over the merging change-set and treats any mismatch — including unreviewed files riding along — as unapproved (merge refused). | Read the merge-gate skill and the approval-signals reference. |
| 11 | 2040's own design and implementation are classified as trust-surface changes and remain human-only — the agent-approval path cannot be agent-approved into existence. The spec states plainly that 2040's own implementation is protected procedurally (its chain is human-origin, so the agent-chain backstop does not fire), not by the implementation-PR mechanism. | Read the design skill or approval-signals reference for the self-referential carve-out; confirm 2040's design/plan STATUS rows reach `approved` only by a human signal. |

## Relationship to adjacent work

- **Plan-approval path** — the precedent this extends (`staff-engineer`, the
  author, writes STATUS after a clean review panel). 2040 adopts the panel model
  and adds two things the plan path lacks: a distinct approval locus (Bound 2)
  and merge-gate enforcement of eligibility and reviewed-content at the
  implementation PR (Bounds 1, 3). The plan path carries the same
  self-certification gap — the author records its own panel's verdict — and that
  gap is the **live soft target, not a future-tightening nicety**: trust-surface
  *code* lands through the plan and implementation phases, so the plan path is
  where an attacker actually operates. 2040's design control raises the cost of
  one route but does not close this one; its security value stays limited until
  the plan path is tightened to the same anti-self-certification bar. This is
  named as a known open gap, out of scope for 2040's text but not deferred to
  silence.
- **Spec 1830 (spec-less experiment merge-gate,
  [issue #1651](https://github.com/forwardimpact/monorepo/issues/1651), still at
  `spec draft`)** — adjacent approval-policy work on a different surface (the
  merge gate for PRs with no phase artifact). Consistent in posture: both keep
  the highest-risk class human-originated. Disjoint surfaces — 1830 has no
  reviewable design artifact; 2040 turns on the fact that designs do. Bound 1
  does not depend on 1830 landing. No contention.
- **Spec 1440 (re-ping cadence)** — out of scope per above; the obstacle's own
  evidence shows freshness is not the lever.
