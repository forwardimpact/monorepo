# Spec 2010 — shared-workspace committed loss: path-scoped staging and facilitator serialization

Graduates the facilitated-session/shared-workspace sub-family of Obstacle
[#1564](https://github.com/forwardimpact/monorepo/issues/1564) from interim
floors to a structural fix. The family stands at 92 real occurrences plus 34
near-misses in four-plus weeks (`wiki/parallel-collision-ledger.md`, per Exp 51
[#1585](https://github.com/forwardimpact/monorepo/issues/1585)). This spec
addresses the one sub-shape that ships **committed loss or wrong-author
content** — not the allocation-identity question that specs
[1840](https://github.com/forwardimpact/monorepo/pull/1654) /
[1850](https://github.com/forwardimpact/monorepo/pull/1655) contest, and not a
lock. The invariant in one sentence: **committed loss requires two conditions
at once — two writers in one workspace and a commit that stages by sweep — so
removing either condition prevents it.**

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Teams Using Agents | [Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team) | The team's anxiety force is that "autonomy might amplify bad patterns faster than humans can intervene." This sub-family is that force realized: facilitated sessions route overlapping work into one shared checkout, and broad-staging commits then publish a teammate's in-flight edits under the wrong author. Repair (verbatim re-lands, renumber maps, forensic bisects) now consumes a dominant share of coach, release-engineer, and product-manager capacity — the improvement loop spends its budget cleaning up its own coordination. |
| Platform Builders | [Build Agent-Capable Systems](../../JTBD.md#platform-builders-build-agent-capable-systems) | The shared-workspace commit path and the facilitated-dispatch path are primitives every Kata installation runs. A scoping discipline at the commit boundary and a serialization rule at the dispatch boundary protect every installation that runs an agent team in a shared checkout, independent of which skill is executing. |

## Problem

Vocabulary: a **shared workspace** is the single checkout a facilitated
session's concurrent agent activations share; a **commit path** is any code that
stages and commits inside that checkout (an agent's feature commit, an
activation sweep-commit, or a tool commit such as `fit-wiki claim`/`release`); a
**sweep** stages by breadth (`git add -A`, `git commit -am`) rather than by
explicit path; **committed loss** is foreign or wrong-author content reaching a
commit — the only sub-shape in the family that ships, as opposed to being caught
at push-reject, rebase, or pre-commit diff.

The family's facilitated-session catches have all been accidents of tooling —
push-reject, rebase, scope partition — never a designed control (#1564). The
committed-loss instances are the ones no accident caught. Two conditions
co-produce them, and the corpus shows each is independently removable.

| Condition | Behavior today | Evidence |
|---|---|---|
| **Concurrent dispatch into one workspace** | The facilitator routes asks that touch the same mutable surface (a wiki file, a PR branch, the shared tree) to multiple activations at once, with no ordering. Both are mid-session before either sees the other's intent. In #1725 a single-owner directive was "fanned to six agents," producing three duplicate comments of "pure redundancy." | #1564 (mechanics), #1725 (routing cause) |
| **Commit paths stage by sweep** | Commit paths stage the whole dirty tree rather than their own artifacts, so a commit captures whatever a concurrent activation left in the tree. The team named this "the sweep is upstream of both levers" and "agent-side discipline cannot scope a commit the tool makes on the agent's behalf." | #1564, #1568, #1583 |

When both conditions hold, a sweep-commit picks up a teammate's just-appended
content and ships it under the wrong author before any repair (#1564 collision
"sweep-commit cross-contamination," **not caught pre-landing**). Each condition
has a validated single-condition fix:

- **Serialize same-surface asks.** The falsifier experiment #1565 recorded that
  after the facilitator "serialized all wiki-touching asks, zero further
  collisions occurred (n=1 session)." Its standing target is "0 collisions
  across ≥5 facilitated sessions with the discipline applied."
- **Scope the staging.** PR #1571 pathspec-limited the `fit-wiki
  claim`/`release` commits to their one-line contract — the team's first
  codification of the move, applied to one commit path. The discipline
  generalizes: every shared-workspace commit path stages its own artifacts by
  explicit path.

A lock is the wrong third option. The claim handshake "is therefore an advisory
marker, not a single-writer mutex" (#1539); making it a real mutex introduces a
dominant new failure — a lock held by a dead activation with no lease — that the
family does not have today. The two levers above remove the failure without
adding that one.

## Scope

**In scope:**

| Lever | What changes |
|---|---|
| **L1 — path-scoped staging discipline** | Every shared-workspace commit path stages only the artifacts it owns, named by explicit path, never by `git add -A` / `commit -am` breadth. The discipline covers agent feature commits, activation sweep-commits, and tool commits. PR #1571 is the cited precedent for one path; the `fit-wiki push`/sync sweep (#1583 item 3) is the **sole remaining un-scoped application site** — see § Relationship. L1 is also a security control: a whole-tree sweep into the wiki repo, which carries no gitleaks / push-protection, is a latent credential-leak surface, so scoping the staging shrinks that surface as well as preventing committed loss. (Gating the wiki repo itself is a separate, complementary control — see § Non-Goals.) |
| **L2 — facilitator-side serialization of wiki-touching asks** | A facilitator routes a wiki-touching (or otherwise same-mutable-surface) ask only after the prior ask on that surface has returned its Answer or explicitly released. Each such ask names its edit-intent (surface + own-artifact paths) so a receiver can scope its staging under L1. A single-owner directive routes to exactly one acting lane; co-recipients get a no-staging FYI that carries no edit-intent and requires no action. This single-routing cardinality is the complement to the temporal ordering above — with one acting lane there is no fan-out to serialize. |

**Out of scope** (named so they are not reopened here):

| Excluded | Why, and where it lives |
|---|---|
| Allocation identity — how occurrence ordinals, fold indexes, and meta numbers are minted | The competing WHAT of specs 1840 (PR #1654) and 1850 (PR #1655); approval of either supersedes the other. This spec touches neither. |
| The `fit-wiki` push primitive's landing discipline — stale-tree refusal, whole-tree landing semantics | Spec 1850 D3 (with 1750/1780). See § Relationship for the L1↔D3 seam. |
| Push-rejection honesty, `-X ours` clobber, conflict-marker publication | Specs 1780 / #1668, and #1583 items **1–2** — the landing primitive, not the staging boundary. (#1583 **item 3** — scoping the push/sync sweep — is *in scope as an L1 application site*, not excluded; only its push-primitive landing specifics coordinate with 1850 D3. See § Relationship.) |
| Post-merge budget revalidation; coordination-comment and summary-surface floors | #1667; #1647 / #1732 (spec-1890/1900 attachment points). |
| Shallow-clone forensic artifacts | Observation-layer cross-cutting item (#1577); #1575 resolved. |
| A distributed lock, mutex, or lock service over the workspace or claim | **Non-goal** — see below. |

## Success Criteria

All six are checkable at implementation time, without waiting on a future
session-accrual window. The longitudinal zero-collision results are stated
separately as post-deployment validation targets below.

| # | Criterion | Verified by |
|---|---|---|
| S1 | Every commit produced in the shared checkout contains only the committing activation's own artifacts — no path a concurrent activation authored. | An audit enumerates the closed set of commit paths (every skill or tool that commits inside the shared checkout) and confirms each stages an explicit own-artifact path list rather than a whole-tree sweep. The check is automatable as a static lint over commit-path source — forbidding whole-tree staging APIs (`git add -A`, `commit -am`, `commitAll`) outside an allowlisted path — so it gates continuously, not as a one-time audit; this is distinct from the runtime authorship hook design D1 rejects (the lint reads source, not working-tree authorship). The guarantee is only as strong as the enumeration is complete, so the lint is **deny-by-default**: any commit path not on the explicit own-artifact allowlist fails the check, so a newly-added or overlooked commit path surfaces as a violation rather than silently escaping the closed set. Keeping the set closed is therefore a property the lint enforces continuously, not a one-time completeness assumption the audit makes once. Exact lint form is a plan concern. |
| S2 | The facilitated-session protocol mandates that a wiki-touching ask is routed only after the prior same-surface ask returns its Answer or explicitly releases. | The facilitator protocol document states the rule as a requirement — the controllable artifact and the pass/fail; a session transcript is illustrative, not the gate. |
| S3 | The facilitated-ask format requires an edit-intent field naming the surface and the own-artifact paths the receiver will stage. | The ask-format definition mandates the field — the controllable artifact and the pass/fail; a routed ask is illustrative. |
| S4 | A deployed facilitated session carries both levers and exercises them: the serialization rule is active and at least one ask shows edit-intent driving scoped staging. | A structural check on one session: protocol active, ask exercised — verifiable at implementation, independent of any accrual window. |
| S5 | The fix introduces no lock, mutex, lease, or lock service over the workspace or the claim handshake. | The design and implementation contain no such component; the non-goal stands as a review gate. |
| S6 | A single-owner directive routes to exactly one lane; co-recipients receive a no-staging FYI that carries no edit-intent and requires no action. The protocol names the single-owner classifier that makes this determination at dispatch time and declares its conservative default for ambiguous directives. | The facilitator protocol states the single-routing cardinality rule **and** names a classifier with a declared conservative default as requirements — the controllable artifact and the pass/fail; a session transcript is illustrative, not the gate. |

S6 is the cardinality complement to L2's temporal serialization, attached at
L2's existing facilitator-dispatch gate: it bounds **how many** lanes act on one
directive, where L2's ordering rule bounds **when** same-surface asks run. With
a single acting lane there is no fan-out to serialize, so S6 alone closes

## 1725's Mode A (the single-owner directive "fanned to six agents"). S6

introduces no lock, lease, or mutual exclusion — it constrains routing
cardinality only — so S5 still holds.

**S6's guarantee is exactly as strong as the single-owner classifier at dispatch
time.** The cardinality cap binds only on directives the classifier labels
single-owner. A single-owner directive *misclassified as multi-owner* never
reaches S6's one-lane rule: it falls through to L2, which caps the asks
**temporally** (same-surface ordering) but not **cardinally** (count of acting
lanes), so the fan-out — and the Mode-A falsifier failure — can still occur. The
classifier is therefore load-bearing surface, not an implementation detail, and
its conservative default is a genuine trade-off: defaulting an ambiguous
directive to single-owner risks starving real multi-owner work in the FYI'd
lanes, while defaulting to multi-owner reopens the exact fan-out S6 exists to
remove. This spec **requires** that the protocol name such a classifier and
declare its default; it does **not** fix the predicate's internals or which way
the default leans — that is design surface (kata-design open question on the
classifier predicate and conservative-default choice), where the choice can be
grounded in the corpus. Pinning the requirement here without pinning the
mechanism keeps S6 honest about where its guarantee lives while leaving the
load-bearing decision to be made with evidence.

**Post-deployment validation targets (not acceptance gates):** two falsifiers
run over the window, one per failure mode.

- **Mode B — committed loss.** Across ≥5 facilitated sessions with both levers
  applied, new committed-loss occurrences in the #1564 facilitated-session
  sub-family are zero (the parallel-collision ledger over the window).
- **Mode A — single-owner fan-out** (#1725's falsifier). The next ≥5
  single-owner close-out directives each produce ≤1 reconciliation record and 0
  duplicate-leg wiki collisions attributable to this directive class.

Each measures its own sub-shape only; Exp #1565's broader predicate P1 ("0
shared-workspace collisions of any sub-shape") is unchanged and owned by #1565 —
this spec does not narrow it. The targets are the standing meters for whether
the two levers held in the field; they do not gate spec approval or merge.

### Non-Goals

- **No distributed lock, mutex, or lock service.** #1539 established that the
  claim handshake is advisory, not a single-writer mutex, and that a real lock's
  dominant failure mode is a lock held by a dead activation with no lease — a
  failure the family does not have today. Per-activation distinguishers (#1539)
  and the two levers here remove collisions without that failure mode. Any
  design that reintroduces mutual-exclusion-by-lock is out of scope and fails
  S5.
- **No allocation-contract change.** This spec does not alter how identifiers
  are minted; that is the 1840/1850 adjudication.
- **No wiki-repo destination gating.** Standing up gitleaks / push-protection on
  the separate wiki repository is a complementary security control that gates
  the *destination* repo, orthogonal to L1's staging *scope* — a perfectly
  scoped commit can still carry a secret into an ungated repo. That gap is a
  standing known issue tracked on its own line (security-engineer), not folded
  into this spec's two levers. L1 shrinks the leak surface; closing the
  destination gap is separate work.

### Relationship to in-flight siblings

- **1840 / 1850 (allocation identity).** Disjoint. Those specs decide where
  identity is minted; this one decides how commit paths stage and how the
  facilitator orders asks. Neither lever here depends on their outcome.
- **1850 D3 (push primitive).** Adjacent at one seam: L1 governs staging breadth
  at every commit path, while 1850 D3 governs the `fit-wiki` push primitive's
  landing. L1 is upstream — it scopes what enters a commit; D3 governs how a
  scoped commit lands. Where they meet, the primitive's landing behavior is
  1850 D3's; L1 adds only the staging-breadth contract. They compose; they do
  not contest. One sequencing consequence follows for the application site: the
  #1583 item-3 scoping carries a **dual dependency** — on this spec's
  staging-breadth contract *and* on 1850 D3's landing design — so it cannot be
  planned until both exist. 1850 is still at `spec draft` (PR #1655 at the human
  gate, in adjudication conflict with 1840 / PR #1654), so its D3 landing design
  does not yet exist; item 3 therefore stays un-plannable until 1850's spec
  merges and is designed. The dependency runs deeper than sequencing: item 3's
  *shape* forks on 1850's mechanism choice — a worktree-per-session design makes
  item 3 a defense-in-depth lint, while a shared-tree + explicit-paths design
  makes it a staging refactor that must itself produce the per-session path list
  — so the item-3 plan must read 1850's design, not merely wait for it. The
  block is item 3's alone — #1583 items 1–2 carry no design question and can
  proceed independently if triage splits them.
- **1750 / 1780 (landing honesty).** Out of scope; L1 reduces the surface those
  specs harden by ensuring a commit carries only its author's artifacts in the
  first place.
- **#1583 (libwiki sync path) — L1's sole remaining application site.** #1583
  item 3 ("pathspec-scope the sweep") is the one shared-workspace commit path L1
  names that PR #1571 did not yet scope: the `fit-wiki push`/sync sweep. #1583's
  body frames item 3 as *reversing* a "whole-tree is its contract" decision that
  its lineage (#1576 § Out of scope, #1568) had read as settled. This spec
  supplies the rationale that makes it an *application* of a named discipline
  instead — so the discipline and its sole application site do not graduate as
  two specs in tension. The sync's design intent (publish this session's own
  memory) is preserved by staging the session's own-authored paths; what L1
  removes is only the capture of a concurrent activation's in-flight residue
  from the shared checkout. Scoping the sweep is therefore L1, not a contract
  reversal. The push-primitive landing specifics (stale-tree refusal,
  fast-forward honesty) remain 1850 D3's; #1583 stays the tracking item for the
  implementation, citing this spec as its authority.

This spec does not pre-empt the 6/24 Exp #1565 read or the 7/02 RFC #873
verdict; it gives both a proposed structure to evaluate instead of an unbounded
repair economy. L2 is **protocol-side** (the facilitator's routing order),
distinct from RFC #873's **gate-side** routing-time collision check; the two
compose, and L2 does not decide the RFC.
