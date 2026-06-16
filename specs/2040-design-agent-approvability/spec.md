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

A trusted agent **in a role distinct from the design's author** may originate
`design approved` after an independent review panel of the design comes back
clean. The panel is the human-trust substitute; the distinct approval locus is
what stops the author from certifying its own work. **Clean** carries the same
bar the plan path already sets: no unresolved blocker, high, or medium findings
on the design artifact. The approving agent's job is mechanical — confirm the
cold panel returned clean and write the STATUS row — so any trusted non-author
role can fill it. The existing human approval paths remain available in parallel
and unchanged, and `kata-dispatch`'s propagation of human PR-side signals is
untouched. Three bounds keep the loosening safe rather than total.

This extends the plan path rather than copying it. On the plan path the *author*
(`staff-engineer`) writes STATUS after its own clean panel: only the panel is
author-independent, not the writer. That leaves a latent self-certification gap
— an author who both convenes the panel and records its verdict can declare its
own work clean. Anti-self-certification is phase-independent, so 2040 closes the
gap for designs with a distinct approval locus and flags the plan path for the
same tightening, rather than propagating the gap one phase upstream. The
divergence between the two gates is therefore explained, not silent.

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

The carve-out is enforced at the merge gate, not merely asserted in prose: the
gate refuses to honor an agent `design approved` whose change-set touches the
trust surface, evaluated against the diff that actually merges (not just the
diff the panel saw). The trust-surface set is decided against a checked-in
denylist — and the denylist names itself, the settings file, and the gate
workflows, so a design cannot quietly remove its own guardrail. Default-deny
governs every ambiguous case until the denylist covers it. The exact glob syntax
is HOW; that the gate decides eligibility this way is WHAT (SC9).

This carve-out keeps the same surfaces human-only that the existing trust rule
(spec and design approvals originate from a trusted human) already treats as
highest-risk. It is consistent with — but does not depend on — the adjacent
spec 1830, which keeps the spec-less experiment merge path human-originated.

**Bootstrap, self-consistently human-gated.** 2040's own design and
implementation modify the approval machinery, so they are themselves
trust-surface changes and remain human-only under this bound. The gate that
creates agent-approval cannot be agent-approved into existence.

### Bound 2 — anti-self-certification: independent panel and independent approver

Two loci must be independent of the design's author. **The panel:** every
reviewer runs cold — fresh context, no authoring bias, sized per the review
skill's caller protocol. **The approver:** the agent that records approval
(confirms the panel clean, writes STATUS) is in a role distinct from the
author's. A cold panel alone is not enough — an author who both convenes the
panel and records its verdict can declare its own work clean. Requiring a
distinct approval locus closes that self-certification gap.

The approver must be a different trust **locus**, not merely a different
*instance* of the author's role. Two instances of one role are correlated
reviewers, and the bound becomes cosmetic. Because the approver's job is
mechanical, any trusted non-author role can serve — the merge gate's release
locus already qualifies, so a satisfying locus exists today. **Which** role
binds is HOW; **that** such a locus exists is a precondition this spec requires
before any agent design-approval is claimed (SC6). No agent approves its own
design.

### Bound 3 — approval covers reviewed content; human override

An agent approval covers only the design content the panel reviewed. If the
design changes after approval, the approval no longer holds and the design
returns to unapproved until a fresh clean panel or a human signal covers the
new content. This too is enforced at the merge gate: the agent approval is bound
to a digest of the reviewed design content, the gate recomputes that digest at
PR head before merge, and a mismatch is treated as unapproved. The digest
algorithm is HOW; that approval is digest-bound and re-checked at the gate is
WHAT (SC10). Humans retain the standing ability to approve any design directly
and to reclaim or reverse any agent-approved design before its merge.

### Why bounded agent-approvability over the alternatives

| Axis | (a) keep design human-only | (b) unbounded agent-approval | (c) bounded agent-approval — chosen |
|---|---|---|---|
| Throughput ceiling | Unchanged — the obstacle persists | Lifted | Lifted for the class that pools |
| Self-amendment risk | None | A gate can approve loosening its own authority | Closed by Bound 1 |
| Author self-certification risk | None | Author convenes own panel and records its verdict | Closed by Bound 2 — cold panel **and** a distinct approval locus |
| Stale-content risk | Human re-reads | Approval drifts from reviewed content | Closed by Bound 3 — digest re-checked at the merge gate |
| Enforcement | — | Bounds unwired, asserted only in prose | Bounds 1 & 3 backstopped at the merge gate against the merging diff |
| Human oversight | Total, and the bottleneck | None | Retained as override + the trust-surface gate |
| Precedent fit | — | — | Extends the plan panel model; closes its latent self-certification gap rather than copying it |

## Scope

**In scope** — the canonical approval policy surfaces that encode the gate:

- The **approval-signals reference** — the signals table gains a design
  panel-clean row analogous to the existing plan panel-clean row, and the trust
  rule documents the bounded design agent-approval path with all three bounds,
  including that a trust locus distinct from the author records the approval.
- The **merge gate (`kata-release-merge`)** — the decidable backstop for Bounds
  1 and 3: it refuses an agent `design approved` whose change-set intersects the
  trust-surface denylist, and whose approval digest does not match the design at
  PR head, both evaluated against the diff that actually merges.
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
- **The STATUS row representation, the panel size, the denylist's exact glob
  syntax, and the digest algorithm** are HOW for the design and plan phases.
  What is *not* deferred: that eligibility (Bound 1) and digest-match (Bound 3)
  are enforced at the merge gate against the merging diff, and that an approval
  locus distinct from the author exists (Bound 2). Default-deny governs ambiguous
  eligibility until the denylist covers it.
- **Which** non-author trust locus binds as the approver may defer to the design
  and plan phases; **that** such a locus exists may not — it is a precondition of
  Bound 2.
- **The re-ping / freshness ritual** (spec 1440, re-ping cadence) —
  necessary-but-not-sufficient and orthogonal; it does not touch this obstacle.

## Success Criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | The approval-signals trust rule documents a design agent-approval path conditioned on a clean independent review panel, and no longer states design approval is unconditionally human-only. | Read the approval-signals reference. |
| 2 | The signals table carries a design panel-clean signal row analogous to the plan panel-clean row, recording that a trust locus distinct from the author writes the STATUS row. | Read the approval-signals reference. |
| 3 | The design skill's Approval section states the bounded agent-approval condition and the trust-surface human-only carve-out, consistent with the plan skill's Approval section. | Read the design skill. |
| 4 | "Clean panel" is defined explicitly as no unresolved blocker, high, or medium findings on the design artifact — the same bar the plan path sets in its DO-CONFIRM checklist (that checklist, not the plan skill's Approval section, is the source of the bar) — not left implicit. | Read the design skill and approval-signals reference; compare to the plan skill's DO-CONFIRM checklist. |
| 5 | The eligibility carve-out names the trust-surface class (approval-policy references and the gate machinery they govern, phase-gate skills, agent profiles and authority policies) and states the default-deny rule for ambiguous cases, resolving to a decidable denylist test (enforced per SC9). | Read the approval-signals reference or design skill. |
| 6 | The independence (anti-self-certification) bound is stated: every panel reviewer is independent of the author and runs cold, **and** approval is recorded by a trust locus in a role distinct from the author — not a second instance of the author's role — so no agent approves its own design. The spec requires such a distinct locus to exist (the which-role binding may defer to HOW). | Read the design skill or approval-signals reference. |
| 7 | The reviewed-content and human-override bounds are stated: a change after approval returns the design to unapproved; humans may approve directly and reverse an agent approval before merge. | Read the design skill or approval-signals reference. |
| 8 | Spec-phase approval remains human-only: the spec skill's Approval section and the approval-signals spec-row treatment still state that `spec approved` originates only from a trusted human, with no agent panel-clean path added for specs; where spec and design share prose, the spec-applicable wording stays human-only. | Read the spec skill's Approval section and the approval-signals spec row; confirm no design-phase agent path bled into the spec treatment. |
| 9 | Bound 1 is backstopped at the merge gate: `kata-release-merge` honors an agent `design approved` only when the design's change-set, evaluated against the diff that actually merges, does not intersect a checked-in trust-surface denylist; the denylist includes itself, the settings file, and the gate workflows. | Read the merge-gate skill and the denylist. |
| 10 | Bound 3 is backstopped at the merge gate: the agent approval is bound to a digest of the reviewed design content, `kata-release-merge` recomputes the digest at PR head, and a mismatch is treated as unapproved (merge refused). | Read the merge-gate skill and the approval-signals reference. |
| 11 | 2040's own design and implementation are classified as trust-surface changes and remain human-only — the agent-approval path cannot be agent-approved into existence. | Read the design skill or approval-signals reference for the self-referential carve-out; confirm 2040's design/plan STATUS rows reach `approved` only by a human signal. |

## Relationship to adjacent work

- **Plan-approval path** — the precedent this extends (`staff-engineer`, the
  author, writes STATUS after a clean review panel). 2040 adopts the panel model
  and adds two things the plan path lacks: a distinct approval locus (Bound 2)
  and merge-gate enforcement of eligibility and reviewed-content (Bounds 1, 3).
  The plan path carries the same latent self-certification gap — the author
  records its own panel's verdict — which is **flagged here for a future
  tightening**, out of scope for 2040. Keeping the two adjacent gates' controls
  explained rather than divergent-and-silent is itself a safety property.
- **Spec 1830 (spec-less experiment merge-gate,
  [issue #1651](https://github.com/forwardimpact/monorepo/issues/1651), still at
  `spec draft`)** — adjacent approval-policy work on a different surface (the
  merge gate for PRs with no phase artifact). Consistent in posture: both keep
  the highest-risk class human-originated. Disjoint surfaces — 1830 has no
  reviewable design artifact; 2040 turns on the fact that designs do. Bound 1
  does not depend on 1830 landing. No contention.
- **Spec 1440 (re-ping cadence)** — out of scope per above; the obstacle's own
  evidence shows freshness is not the lever.
