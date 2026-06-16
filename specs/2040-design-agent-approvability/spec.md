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

Trust-surface *code* lands through the plan and implementation phases, not
through the markdown design — so the plan leg, not the design, is where an
attacker would route an escalation. The fail-closed merge-gate backstop (Bound
1) is built around exactly that: on a trust-surface diff it refuses the merge
unless *every* leg of the chain is **verifiably** human (tied to an independent
trusted-human signal, never a self-asserted field), so an agent-approved or
agent-forged plan leg refuses the trust-surface code (while a PR with no chain at
all falls through to the existing author-trust gate unchanged). What that does
**not** reach is the plan path's self-certification of *non*-trust-surface
content — an author recording its own plan panel's verdict on ordinary code. That residual
independence gap is real and is **flagged here for the same Bound 2 tightening**,
out of scope for 2040's text but named, not deferred to silence. The divergence
between the two gates is explained, not silent.

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
gates only on `plan implemented` plus CI. The attack route the carve-out must
close is: a benign human-approved design → an agent-approved *or agent-forged*
plan or implementation → a merge that introduces trust-surface code. The backstop
must not depend on the agent pipeline honestly reporting its own approval as
agent-origin — that would relocate the very self-certification this spec removes
from the STATUS verdict onto the `origin` field. So the gate rests on two
principles: **`origin = human` is verifiable from a gate-observable PR-side human
signal, never self-asserted**, and on a trust-surface diff **field-absence fails
toward arming**.

The gate first evaluates the **implementation PR's merging diff** against the
trust-surface denylist, against the trusted base (`origin/main`) copy. If the
diff does **not** intersect the denylist, 2040 adds nothing — the PR merges under
the existing `plan implemented` + CI gate. If it **does** intersect (a
trust-surface diff), the gate **refuses the merge unless one of these holds**:

- **The PR carries an approval chain and *every* leg of it is verifiably human.**
  A leg counts as human only when its approval is a **gate-observable,
  human-actor-attributed PR-side signal** the gate checks against the GitHub
  event — never the wiki `origin` field, and never an in-session approval (which
  leaves no GitHub artifact to verify against). Two signals qualify:
  - **Canonical** — an **APPROVED pull-request review by a top-7 human account**.
    GitHub binds the review to the human identity; a bot token cannot forge it,
    and the review is retained on the merged PR.
  - **Acceptable** — a `<phase>:approved` **label whose `labeled` timeline event
    actor is a top-7 human account**. A bot applying the label is recorded as the
    bot and rejected.

  An agent-authored STATUS stamp, an in-session-only approval, and an approval
  comment do **not** qualify. Each leg's signal lives on its own merged
  design/plan PR, which retains the review and timeline for the cross-PR lookup.
  A leg that is `origin = agent`, missing, unreadable, or lacking a qualifying
  signal does not count as human, and *any* such leg on a trust-surface diff arms
  the backstop. There is no "but another leg already reads agent" qualifier — the
  attacker controls its own leg's stamp — so the discriminator is "a verifiable
  human signal on every leg," not "does any leg happen to say agent." Either the
  whole chain is verifiably human or the change stays human-only.
- **The PR carries no approval chain at all** — spec-less trusted-human
  trust-surface maintenance, a maintainer's one-off `fix:`/`refactor:` touching
  `.claude/agents/**` or a phase-gate skill. It falls back to the **existing
  author-trust + CI gate, unchanged**, which already rests on a gate-observable
  human identity (a top-7 human author/approver) that an agent cannot satisfy.
  2040 invents no new block for legitimate human maintenance — rev 5's fix for
  spec-less human work stands.

This closes the dodges a self-asserted field allowed. An agent that **omits** its
plan leg's `origin` no longer reads as "no agent chain" — the chain exists, the
leg carries no qualifying signal, so on a trust-surface diff it arms. An agent
that **writes `origin = human`** no longer counts — the wiki stamp is not a
signal the gate trusts; only the PR-side GitHub event is. And a new agent record
can no longer **impersonate a legacy one** (below).

**This is a real operational change, scoped to the trust-surface class.**
Trust-surface (denylist-intersecting) approvals must henceforth be emitted as a
PR-side human signal — an APPROVED review or a human-applied `<phase>:approved`
label — **not in-session**, or the leg does not count and the backstop arms (the
change stays human-only). The live queue emits neither today: across the last 40
merged PRs there were 0 APPROVED reviews, across 50 PRs 0 human `labeled` events,
and STATUS is authored by `kata-agent-team[bot]`. So this genuinely changes how
trust-surface approvals are recorded — but only for that class.

It is **not** a throughput regression. Verification only bites when a chain would
otherwise avoid the denylist on a **trust-surface** diff — and trust-surface
*designs* are human-only anyway under Bound 1. Ordinary product and library
designs whose diff does **not** intersect the denylist are unaffected: arming is
harmless there because the denylist check passes regardless, so an unverifiable
or in-session human leg costs nothing. The verification burden falls solely on
the high-risk class, which is where it belongs.

**Legacy transition is a precondition, not a deferred ambiguity.** Designs and
plans approved before 2040 ships carry no `origin` field and emit no qualifying
PR-side signal, so **field-absence alone no longer proves trusted origin**. A
legacy record cannot stand the backstop down on absence: relying on a legacy
chain on a trust-surface diff **requires a one-time re-attestation that produces
a verifiable signal** (an APPROVED human review or a human-applied label on the
record's PR). A legacy chain that is not re-attested arms. After this one-time
pass there are no unverifiable trust-surface approvals left, so a missing field
or absent signal thereafter **always arms** on a trust-surface diff. The
re-attestation mechanism and its cutoff are HOW; that legacy records cannot stand
down on absence alone and must carry a verifiable signal before the fallback is
trusted is WHAT (SC9).

Reading only the design's `origin` is not enough — code is authorized through the
plan leg — which is why `origin` is required on the **plan** approval record too
(Bound 2, scope) and every leg must be independently verifiable. The
**implementation PR is the named enforcement point** (SC9).

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

**Bootstrap — 2040's own introduction is gated procedurally; steady state is
mechanism-backed.** 2040's own design and implementation modify the approval
machinery, so they are themselves trust-surface changes and remain human-only
(SC11). For 2040's *own introduction* this is a **procedural** guarantee: a human
must approve and merge its spec, design, and implementation. The fail-closed
backstop cannot enforce it, because the backstop — the agent-chain origin check,
the plan-`origin` field, the denylist naming `kata-plan` and `kata-release-merge`
— does not exist until 2040's implementation PR creates it. A gate cannot fire on
the PR that introduces it: 2040's own implementation merges under the *pre-2040*
gate, which has no denylist and no origin check. The verifiable-signal rule
deepens this — 2040's own machinery cannot emit a gate-checkable signal for
itself before it exists — so the bootstrap rests on human approval, as revision 3
stated.

What *is* mechanism-backed is the **steady state**: once 2040 has shipped, no
future agent chain can weaken the machinery, because any such PR intersects the
self-naming denylist and the gate fails closed (refused). The gate self-protects
going forward — it just does not, and cannot, gate the PR that creates it.

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

Every approval record carries two **required** fields — for a design *or* a
plan, written by an agent *or* a human: **`origin`** (`agent` | `human`) and a
**`digest`** of that artifact's reviewed change-set (Bound 3). Both legs stamp
`origin`. Crucially, **`origin = human` is gate-verifiable, not self-asserted**:
on a trust-surface chain a leg counts as human only when the gate can tie it to a
**gate-observable, human-actor-attributed PR-side signal** — an APPROVED
pull-request review by a top-7 human account (canonical) or a `<phase>:approved`
label whose `labeled` event actor is a top-7 human account (acceptable; a bot
actor is rejected). An **in-session approval does not qualify** — it leaves no
GitHub artifact to verify against — nor does an agent-written STATUS stamp or an
approval comment; an **agent-written record cannot declare itself human**. The
agent path writes `origin = agent`; a leg that is `origin = agent`, missing,
unreadable, or lacking a qualifying signal does not count as human, so on a
trust-surface diff Bound 1 arms (the safe direction — field-absence fails toward
arming, and a self-asserted human stamp buys nothing). These are write-side WHAT, not row-shape HOW: the merge gate
cannot run its fail-closed backstop without a verifiable `origin` on each leg,
and cannot re-check content drift without each artifact's `digest`. Everything
else about how the record is laid out on the STATUS row stays HOW.

The approver must be a different trust **locus**, not merely a different
*instance* of the author's role — two instances of one role are correlated, and
the bound becomes cosmetic. **Which** non-author, non-enforcement role binds is
HOW; **that** such a distinct locus exists is a precondition this spec requires
before any agent design-approval is claimed (SC6). The role population that
qualifies (non-author, non-enforcement) is non-empty, so the precondition is
satisfiable — but it must be **discharged at design time by naming the bound
role, not assumed**; until a design names it, no agent design-approval is
eligible. No agent approves its own design.

### Bound 3 — approval covers the reviewed artifact; human override

An agent approval covers only the content the panel actually reviewed — and the
panel reviews the *artifact*: the design on the design leg, the plan on the plan
leg. The approval is bound to a **`digest` of that artifact's full reviewed
change-set — every file in the reviewed PR, not only the design or plan text**,
so the reviewed PR cannot smuggle unreviewed files alongside the artifact. If
the artifact changes after approval the digest stops matching and the approval
no longer holds: the gate recomputes the digest **at that artifact's own PR
head** and returns it to unapproved until a fresh clean panel or a human signal
covers the new content.

This anti-staleness check stays on the boundary the panel actually read. A
design-phase review cannot vouch for an implementation-phase diff — they are
disjoint file populations and nothing pre-reviews the implementation code — so
the digest is **not** stretched across the design→implementation boundary. At
the implementation PR the **denylist (Bound 1) is the sole 2040 check**. Any
anti-smuggle protection at the implementation rests on its own basis — the
implementation conforming to the *approved plan* — which belongs to the
unchanged plan and implementation gates, not to this digest. The digest
algorithm is HOW; that each approval is bound to a digest of its **whole**
reviewed artifact and re-checked at that artifact's PR head is WHAT (SC10).
Humans retain the standing ability to approve any design directly and to reclaim
or reverse any agent-approved design before its merge.

### Why bounded agent-approvability over the alternatives

| Axis | (a) keep design human-only | (b) unbounded agent-approval | (c) bounded agent-approval — chosen |
|---|---|---|---|
| Throughput ceiling | Unchanged — the obstacle persists | Lifted | Lifted for the class that pools |
| Self-amendment risk | None | A gate can approve loosening its own authority | Closed by Bound 1 — denylist on the implementation PR's merging diff; a trust-surface diff is refused unless every chain leg is **verifiably** human (no-chain PRs fall through to the existing author-trust gate). `origin = human` is gate-verified, not self-asserted |
| Author self-certification risk | None | Author convenes own panel and records its verdict | Closed by Bound 2 — cold panel **and** an approval locus distinct from both author and enforcement |
| Stale-content risk | Human re-reads | Approval drifts from reviewed content | Closed by Bound 3 — each leg's digest re-checked at that artifact's own PR head, re-opening approval on change |
| Enforcement | — | Bounds unwired, asserted only in prose | Bound 1 denylist at the implementation PR (vs trusted base; trust-surface diff needs every leg verifiably human, else refused); Bound 3 digest at each reviewed artifact's PR head |
| Human oversight | Total, and the bottleneck | None | Retained as override + the trust-surface gate; legitimate human trust-surface maintenance unaffected |
| Precedent fit | — | — | Extends the plan panel model; the plan path's residual self-certification of non-trust-surface content is named, not copied |

## Scope

**In scope** — the canonical approval policy surfaces that encode the gate:

- The **approval-signals reference** — the signals table gains a design
  panel-clean row analogous to the existing plan panel-clean row, and the trust
  rule documents the bounded design agent-approval path with all three bounds,
  including that a trust locus distinct from **both the author and the
  enforcement (merge-gate) locus** records the approval. Every approval record —
  design and plan, agent and human — carries the required `origin` and `digest`
  fields, with `origin = human` on a trust-surface chain **verifiable only
  against a gate-observable, human-actor-attributed PR-side signal** — an APPROVED
  review by a top-7 human account, or a `<phase>:approved` label whose `labeled`
  actor is a top-7 human — never a self-asserted wiki stamp and never an
  in-session approval. The reference states plainly that trust-surface approvals
  must be emitted as such a PR-side signal.
- The **plan approval write path** (`kata-plan` and the locus that records a
  plan approval) — gains the same `origin` and `digest` stamping on its approval
  record. This does not change who may approve a plan or the clean-panel bar
  (agents still may, after a clean panel); it adds only the provenance the
  end-to-end fail-closed check needs in order to see an agent-approved plan leg.
- The **merge gate (`kata-release-merge`)** — the decidable backstop for Bound
  1, evaluated at the **implementation PR**. It checks the merging diff against
  the trust-surface denylist (trusted base `origin/main` copy); on a
  **trust-surface (intersecting) diff** it refuses the merge unless either
  *every* leg of the PR's approval chain is **verifiably human** — backed by a
  gate-observable PR-side signal (an APPROVED review by a top-7 human, or a
  `<phase>:approved` label whose `labeled` actor is a top-7 human), never a
  self-asserted `origin` field and never an in-session approval; any leg that is
  `origin = agent`, missing, unreadable, or lacking that signal arms it, with no
  "another leg already reads agent" qualifier — **or** the PR carries no approval
  chain at all and clears the existing author-trust + CI gate (spec-less human
  maintenance). The Bound 3 digest is checked separately, at each reviewed
  artifact's own PR head, not at the implementation PR.
- A **one-time legacy re-attestation** is a **deployment precondition** of the
  legacy fallback. Pre-2040 records carry no `origin` and emit no PR-side signal,
  so field-absence alone no longer proves trusted origin: a legacy chain on a
  trust-surface diff stands down only if it is re-attested with a verifiable
  signal (an APPROVED human review or a human-applied label on its PR); an
  un-re-attested legacy chain arms. After this one-time pass no unverifiable
  trust-surface approval remains, so a missing field or absent signal thereafter
  always arms on a trust-surface diff. The re-attestation mechanism and cutoff
  are HOW; that legacy cannot stand down on absence alone is WHAT (SC9).
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
- **Plan and implementation approval logic** — who may approve, and the
  clean-panel bar, are unchanged: agents still approve plans after a clean panel.
  The only addition is provenance — the plan approval record now stamps
  `origin`/`digest` so the fail-closed agent-chain check can see an agent plan leg.
- **The STATUS row layout, the exact panel size, the denylist's exact glob
  syntax, and the digest algorithm** are HOW for the design and plan phases.
  What is *not* deferred: that every approval record carries the required
  `origin` and `digest` fields (Bound 2 — write-side WHAT, distinct from row
  layout); that `origin = human` on a trust-surface chain is **verifiable only
  against a gate-observable PR-side human signal (APPROVED review or human-applied
  label), never self-asserted and never in-session**; that on a trust-surface
  diff Bound 1 refuses the merge unless **every** chain leg carries that signal
  (no-chain PRs fall back to the existing author-trust + CI gate), with the
  denylist read against the trusted base; that legacy chains must be re-attested
  with a verifiable signal **before** the legacy fallback is trusted; that Bound
  3's digest is re-checked at **each reviewed
  artifact's own PR head** (not stretched to the implementation diff); and that
  an approval locus distinct from both author and enforcement exists (Bound 2).
  Default-deny governs ambiguous eligibility until the denylist covers it.
- **Which** non-author, non-enforcement trust locus binds as the approver may
  defer to the design and plan phases; **that** such a locus exists may not — it
  is a precondition of Bound 2.
- **The re-ping / freshness ritual** (spec 1440, re-ping cadence) —
  necessary-but-not-sufficient and orthogonal; it does not touch this obstacle.

## Success Criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | The approval-signals trust rule documents a design agent-approval path conditioned on a clean independent review panel, and no longer states design approval is unconditionally human-only. | Read the approval-signals reference. |
| 2 | The signals table carries a design panel-clean signal row analogous to the plan panel-clean row, recording that a trust locus distinct from both the author and the enforcement (merge-gate) locus writes the approval. Every approval record — design and plan, agent and human — carries two required fields: `origin` (`agent` \| `human`) and a `digest` of that artifact's reviewed change-set. `origin = human` on a trust-surface chain is **verifiable only against a gate-observable, human-actor-attributed PR-side signal** — an APPROVED review by a top-7 human account, or a `<phase>:approved` label whose `labeled` actor is a top-7 human — never a self-asserted wiki stamp, an in-session approval, or a comment. The reference states that trust-surface approvals must be emitted as such a PR-side signal. | Read the approval-signals reference. |
| 3 | The design skill's Approval section states the bounded agent-approval condition and the trust-surface human-only carve-out, consistent with the plan skill's Approval section. | Read the design skill. |
| 4 | "Clean panel" is defined explicitly as no unresolved blocker, high, or medium findings on the design artifact — the same bar the plan path sets in its DO-CONFIRM checklist (that checklist, not the plan skill's Approval section, is the source of the bar) — not left implicit. | Read the design skill and approval-signals reference; compare to the plan skill's DO-CONFIRM checklist. |
| 5 | The eligibility carve-out names the trust-surface class (approval-policy references and the gate machinery they govern, phase-gate skills, agent profiles and authority policies) and states the default-deny rule for ambiguous cases, resolving to a decidable denylist test (enforced per SC9). | Read the approval-signals reference or design skill. |
| 6 | The independence (anti-self-certification) bound is stated: every panel reviewer is independent of the author and runs cold, the panel meets a minimum quorum, and the approver clears it against the panel's own posted verdict artifact rather than an author-written summary; **and** approval is recorded by a trust locus in a role distinct from **both** the author and the enforcement (merge-gate) locus — not a second instance of the author's role — so no agent approves its own design and the merge-gate backstop stays independent. The spec requires such a distinct locus to exist (the which-role binding may defer to HOW) and states that the existence precondition is discharged at design time by naming the bound role, not merely assumed. | Read the design skill or approval-signals reference. |
| 7 | The reviewed-content and human-override bounds are stated: a change after approval returns the design to unapproved; humans may approve directly and reverse an agent approval before merge. | Read the design skill or approval-signals reference. |
| 8 | Spec-phase approval remains human-only: the spec skill's Approval section and the approval-signals spec-row treatment still state that `spec approved` originates only from a trusted human, with no agent panel-clean path added for specs; where spec and design share prose, the spec-applicable wording stays human-only. | Read the spec skill's Approval section and the approval-signals spec row; confirm no design-phase agent path bled into the spec treatment. |
| 9 | Bound 1 is backstopped at the merge gate against the **implementation PR**, named as the enforcement point: `kata-release-merge` checks the merging diff against a checked-in trust-surface denylist evaluated against the trusted base (`origin/main`) copy. On a **trust-surface (intersecting) diff** it refuses the merge unless either *every* leg of the PR's approval chain is **verifiably human** — backed by a gate-observable PR-side signal (an APPROVED review by a top-7 human, or a `<phase>:approved` label whose `labeled` actor is a top-7 human), never a self-asserted `origin` field and never an in-session approval; any leg that is `origin = agent`, missing, unreadable, or lacking that signal arms it, with **no "another leg already reads agent" qualifier** — or the PR has no approval chain at all and clears the existing author-trust + CI gate (spec-less human maintenance preserved). A **one-time legacy re-attestation** producing a verifiable signal is a precondition of trusting the fallback (field-absence alone no longer proves trusted origin), so post-transition a missing field or absent signal always arms on a trust-surface diff. This is a real operational change scoped to the trust-surface class: trust-surface approvals must now be emitted as a PR-side human signal, not in-session. The denylist covers the whole Bound 1 trust-surface class, naming the merge-gate skill, the settings file, the gate workflows, `kata-design`, `kata-plan`, and `.claude/agents/**` as a non-exhaustive minimum. | Read the merge-gate skill and the denylist. |
| 10 | Bound 3 is the anti-staleness check, bound to the reviewed artifact and not stretched across the design→implementation boundary: each approval (design and plan) is bound to a `digest` of **that artifact's full reviewed change-set** (every file in the reviewed PR, not only the design or plan text), `kata-release-merge` recomputes the digest **at that artifact's own PR head**, and any change re-opens approval (mismatch → unapproved). The implementation PR is checked by the Bound 1 denylist only; the digest is not recomputed over the implementation diff. | Read the merge-gate skill and the approval-signals reference. |
| 11 | 2040's own design and implementation are classified as trust-surface changes and remain human-only — the agent-approval path cannot be agent-approved into existence. The spec states that 2040's **own introduction** is gated **procedurally** (a human approves and merges its spec, design, and implementation), because the backstop does not exist until 2040's implementation PR creates it — a gate cannot fire on the PR that introduces it. The **steady-state** claim is mechanism-backed: once shipped, any future agent chain that would weaken the machinery intersects the self-naming denylist and is refused fail-closed. | Read the design skill or approval-signals reference for the self-referential carve-out; confirm 2040's design/plan STATUS rows reach `approved` only by a human signal. |

## Relationship to adjacent work

- **Plan-approval path** — the precedent this extends (`staff-engineer`, the
  author, writes STATUS after a clean review panel). 2040 adopts the panel model
  and adds: a distinct approval locus for designs (Bound 2), merge-gate
  enforcement of eligibility at the implementation PR (Bound 1), and digest-bound
  anti-staleness at each reviewed artifact's own PR head (Bound 3). The plan leg
  now stamps a gate-verifiable `origin`, so a trust-surface diff is refused
  unless the plan (and design) leg is verifiably human — load-bearing, because the
  trust-surface code an attacker wants routes through the plan, and an
  agent-approved *or agent-forged* plan leg can no longer stand the gate down.
  What the denylist does **not** close is the plan path's self-certification
  of *non*-trust-surface content — an author recording its own plan panel's
  verdict on ordinary code. That residual is flagged for the same Bound 2
  anti-self-certification tightening; out of scope for 2040's text but named, not
  deferred to silence.
- **Spec 1830 (spec-less experiment merge-gate,
  [issue #1651](https://github.com/forwardimpact/monorepo/issues/1651), still at
  `spec draft`)** — adjacent approval-policy work on a different surface (the
  merge gate for PRs with no phase artifact). Consistent in posture: both keep
  the highest-risk class human-originated. Disjoint surfaces — 1830 has no
  reviewable design artifact; 2040 turns on the fact that designs do. Bound 1
  does not depend on 1830 landing. No contention.
- **Spec 1440 (re-ping cadence)** — out of scope per above; the obstacle's own
  evidence shows freshness is not the lever.
