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

## Decision — extend the plan-approval trust model to designs, bounded

A trusted agent may originate `design approved` after an independent review
panel of the design comes back clean — mirroring the plan-approval path, with
the panel (independent of the author, exactly as on the plan path) as the
human-trust substitute.
**Clean** carries the same bar the plan path already sets: no unresolved
blocker, high, or medium findings on the design artifact. The existing human
approval paths remain available in parallel and unchanged, and the approving
agent writes the STATUS row directly (as `staff-engineer` does for plans), so
`kata-dispatch`'s propagation of human PR-side signals is untouched. Three
bounds keep the loosening safe rather than total.

### Bound 1 — eligibility carve-out for trust-surface designs, default-deny

Designs that modify the trust or approval machinery itself, or the agent
profiles and policies that govern agent authority, remain **human-only**. A
gate that can approve changes to its own authority is self-amending; the
carve-out forecloses that. The trust-surface class names the approval-policy
references and the gate machinery they govern (the STATUS ledger and the
dispatch and merge gate that read it), the phase-gate skills, and the agent
profiles and authority policies under `.claude/agents/**`. **When eligibility
is ambiguous, the design defaults
to human-only** — the safety-critical classification resolves to the safe side,
so the bound holds even before a mechanical test exists. The design phase must
turn this class into a decidable test on the artifact; default-deny governs
every ambiguous case until that test exists. The eligible class is ordinary
product and library designs whose approved spec bounds the intent.

This carve-out keeps the same surfaces human-only that the existing trust rule
(spec and design approvals originate from a trusted human) already treats as
highest-risk. It is consistent with — but does not depend on — the adjacent
spec 1830, which keeps the spec-less experiment merge path human-originated.

### Bound 2 — an independent review panel, not approver identity

Every panel reviewer must be independent of the design's author: the panel runs
cold, with fresh context and no authoring bias, sized per the review skill's
caller protocol. The panel — not the approver's identity — is the trust
substitute, exactly as on the plan path. As there, the design's author may write
the STATUS row, but only after that independent panel returns clean; the author
cannot rubber-stamp, because the gate is the panel's verdict, which the author
does not control. The approving agent is never one of the panel's reviewers, so
no agent both grades a design and records its approval.

### Bound 3 — approval covers reviewed content; human override

An agent approval covers only the design content the panel reviewed. If the
design changes after approval, the approval no longer holds and the design
returns to unapproved until a fresh clean panel or a human signal covers the
new content. How a post-approval edit is detected and the row returned to
unapproved is a mechanism for the design and plan phases; this bound states the
invariant that mechanism must enforce. Humans retain the standing ability to
approve any design directly and to reclaim or reverse any agent-approved design
before its merge.

### Why bounded agent-approvability over the alternatives

| Axis | (a) keep design human-only | (b) unbounded agent-approval | (c) bounded agent-approval — chosen |
|---|---|---|---|
| Throughput ceiling | Unchanged — the obstacle persists | Lifted | Lifted for the class that pools |
| Self-amendment risk | None | A gate can approve loosening its own authority | Closed by Bound 1 |
| Author rubber-stamp risk | None | Author could self-certify | Closed by Bound 2 — the cold independent panel, which the author cannot bias, gates approval |
| Stale-content risk | Human re-reads | Approval drifts from reviewed content | Closed by Bound 3 |
| Human oversight | Total, and the bottleneck | None | Retained as override + the trust-surface gate |
| Precedent fit | — | — | Reuses the plan path's trust model intact |

## Scope

**In scope** — the canonical approval policy surfaces that encode the gate:

- The **approval-signals reference** — the signals table gains a design
  panel-clean row analogous to the existing plan panel-clean row, and the trust
  rule documents the bounded design agent-approval path with all three bounds,
  including who writes the STATUS row.
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
- **The exact STATUS row representation, the panel size, the mechanical
  eligibility test** for the trust-surface carve-out, **and the post-approval
  change-detection hook** (Bound 3) — these are WHICH/WHERE/HOW for the design
  and plan phases. The default-deny rule (Bound 1) governs ambiguity until that
  test exists. The approving agent's role is *not* deferred: it is the design's
  author writing STATUS after a clean panel, exactly as on the plan path.
- **The re-ping / freshness ritual** (spec 1440, re-ping cadence) —
  necessary-but-not-sufficient and orthogonal; it does not touch this obstacle.

## Success Criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | The approval-signals trust rule documents a design agent-approval path conditioned on a clean independent review panel, and no longer states design approval is unconditionally human-only. | Read the approval-signals reference. |
| 2 | The signals table carries a design panel-clean signal row analogous to the plan panel-clean row, naming the agent that writes the STATUS row. | Read the approval-signals reference. |
| 3 | The design skill's Approval section states the bounded agent-approval condition and the trust-surface human-only carve-out, consistent with the plan skill's Approval section. | Read the design skill. |
| 4 | "Clean panel" is defined explicitly as no unresolved blocker, high, or medium findings on the design artifact — the same bar the plan path sets in its DO-CONFIRM checklist (that checklist, not the plan skill's Approval section, is the source of the bar) — not left implicit. | Read the design skill and approval-signals reference; compare to the plan skill's DO-CONFIRM checklist. |
| 5 | The eligibility carve-out names the trust-surface class (approval-policy references and the gate machinery they govern, phase-gate skills, agent profiles and authority policies) and states the default-deny rule for ambiguous cases, committing the design phase to a decidable eligibility test. | Read the approval-signals reference or design skill. |
| 6 | The independence bound is stated: every panel reviewer is independent of the design author, the panel runs cold, and the approving agent is never one of its reviewers — so no design is approved absent an independent clean panel. | Read the design skill or approval-signals reference. |
| 7 | The reviewed-content and human-override bounds are stated: a change after approval returns the design to unapproved; humans may approve directly and reverse an agent approval before merge. | Read the design skill or approval-signals reference. |
| 8 | Spec-phase approval remains human-only: the spec skill's Approval section and the approval-signals spec-row treatment still state that `spec approved` originates only from a trusted human, with no agent panel-clean path added for specs; where spec and design share prose, the spec-applicable wording stays human-only. | Read the spec skill's Approval section and the approval-signals spec row; confirm no design-phase agent path bled into the spec treatment. |

## Relationship to adjacent work

- **Plan-approval path** — the precedent this mirrors (`staff-engineer` writes
  STATUS after a clean review panel). Reuses its trust model; the only new
  element is applying it one phase upstream with the trust-surface carve-out.
- **Spec 1830 (spec-less experiment merge-gate,
  [issue #1651](https://github.com/forwardimpact/monorepo/issues/1651), still at
  `spec draft`)** — adjacent approval-policy work on a different surface (the
  merge gate for PRs with no phase artifact). Consistent in posture: both keep
  the highest-risk class human-originated. Disjoint surfaces — 1830 has no
  reviewable design artifact; 2040 turns on the fact that designs do. Bound 1
  does not depend on 1830 landing. No contention.
- **Spec 1440 (re-ping cadence)** — out of scope per above; the obstacle's own
  evidence shows freshness is not the lever.
