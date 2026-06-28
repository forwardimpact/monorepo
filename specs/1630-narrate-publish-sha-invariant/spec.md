# Spec 1630 — Narrate-then-publish SHA-existence invariant

## Persona and job

**Teams Using Agents** —
[Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team).
The PDSA loop requires agents whose narrated artifacts (Issues, PRs, comments,
wiki file content) can be trusted as ground truth by downstream agents.
Citations to commit SHAs that fail to resolve on the expected repository break
the trust contract and propagate quietly through `Read wiki/MEMORY.md` and
`fit-wiki boot` until a human or trace-aware audit ground-truths them.

## Problem

Kata agents author narrative bodies that quote commit SHAs as evidence — wiki
summaries cite "last run commit `<sha>`," Issue triages cite forensic SHAs,
release-engineer Assess narratives cite the merge that triggered the activation.
Nothing today verifies the cited SHAs resolve on the expected repository before
publish.

The run-198 wiki narrative in `wiki/release-engineer.md` cited commit
`e44c4ce1`. `gh api repos/forwardimpact/monorepo/commits/e44c4ce1` returns HTTP
422; the SHA does not exist on the monorepo. The forensic correction in
Issue #1476 then named `a24f078a` as the "actual run-198-introducing commit"
on the monorepo; that SHA also returns HTTP 422 on the monorepo. Both SHAs
nonetheless resolve on the wiki repo (verified 2026-06-08 via `git -C wiki
rev-parse` on an unshallowed clone; re-verified 2026-06-11). The original
narrative therefore cited a wiki-repo SHA against
the wrong repository context, and the correction repeated the same shape on a
different SHA.

The narrative reached `wiki/MEMORY.md` Cross-Cutting Priorities unchallenged
for one full cycle before SE forensic correction surfaced the gap. The failure
mode is real either way: an agent body publishes a SHA citation whose
truthfulness was never checked against the repository the body purports to
reference, and downstream agents inherit the unchecked claim.

## Scope

In-scope publish surfaces (the agent-authored bodies that downstream agents
consume as evidence):

| Surface | What "body" means |
| --- | --- |
| GitHub Issue body | The Issue's markdown body |
| GitHub PR body | The PR's markdown body |
| Issue and PR comment body | The comment's markdown body |
| Wiki file content | File content committed to the wiki repo, any text format (markdown, CSV, YAML) |

The Wiki surface is the wiki file's content, not its git commit message. Git
commit messages on any repo are explicitly out of scope below.

Installation boundary: this spec binds the monorepo's own agent
installation. The invariant text ships wherever in-scope skill content
ships — published `kata-skills` packs sync on push to `main`, so downstream
installations receive it at implementation merge, before the verdict.
Accepted with eyes open: unlike most skill changes this one blocks
publishes, and downstream block records contribute no evidence to the
verdict — over-blocking downstream surfaces only through downstream
reports. The trial, success criteria, falsifiers, and verdict are
installation-local; an amend or remove verdict propagates to the packs the
same way.

In-scope authoring paths — every path by which an agent authors one of the
surfaces above. That includes agent skills **and the per-agent profile
routines** (the Assess and memory-protocol writes defined under
`.claude/agents/` — the run-198 narrative was such a write, not a skill
write). The skill set below is illustrative; the inclusion criterion is the
authoring path, not membership in this list. The binding membership set is
enumerated and recorded at window open (§ Trial audit), so the trial's
coverage denominator is concrete even as the list evolves:

- `kata-spec`, `kata-design`, `kata-plan`, `kata-implement`
- `kata-product-issue`
- `kata-release-merge`, `kata-release-cut`
- `kata-security-update`, `kata-security-audit`
- `kata-wiki-curate`, `kata-documentation`
- `kata-pattern-synthesis`
- `kata-interview`
- `kata-session` participant protocol — the obstacle and experiment Issues
  and session wiki writes participants produce during facilitated sessions
  belong to no other skill's authoring path, so they are enumerated here on
  their own merits
- agent-profile routines — each agent's Assess and memory-protocol writes
  (wiki summaries, weekly logs, issue and PR narration outside any skill)
- `kata-dispatch` propagation — the STATUS rows and PR-side comments it
  lands are bodies on in-scope surfaces

Explicitly out-of-scope agent skills:

- `kata-review` — grades only; per its own SKILL.md "Do not open PRs,
  comments, or commits."
- `kata-session` facilitation — the facilitator writes no files per its own
  SKILL.md; participant writes are in scope via the participant-protocol
  entry above.
- `kata-setup` — bootstraps the installation; no narrate-then-publish surface
  in normal operation.

## What changes

A shared invariant covers every in-scope authoring path. The
invariant is standing policy, not a trial-only fixture: it remains in force
after the trial window closes, and the trial verdict decides whether it is
retained, amended, or removed. The spec commits to three outcome properties:

1. **Resolution against the citation's referenced repository.** Every cited
   SHA-shaped token that the body asserts as existing resolves on the
   repository that citation references. Repository context is per-citation,
   not per-body — one body may legitimately cite commits on two repositories
   (the run-198 forensics cite monorepo merges and wiki commits side by
   side) — and is inferred from the citation's surrounding context (the
   rules are design's call). A token whose surrounding text references no
   repository at all is judged against the repository hosting the body's
   surface (the host repo for Issues, PRs, and comments; the wiki repo for
   wiki file content). **Negative citations are exempt**: a token the body
   explicitly cites as non-resolving (forensic corrections, block-record
   quotations, audit reports) is not required to resolve; how a body marks
   a negative citation, and how the check recognizes one, are design's
   call. For audit purposes, negativity — like repository context — is
   judged at audit time from the body's text; the implementation's marking
   is never authoritative for the audit, so implementation-marked negatives
   cannot self-exempt.
2. **No publish on failure, loud to the author.** A body whose tokens fail
   this check is not published on the in-scope surface by the authoring
   path; the block is surfaced to the authoring agent so it can correct the
   citation and republish — silently dropping the body is not a conforming
   outcome. On the wiki surface the property binds authored landings (the
   content the authoring path commits); transient publication of
   working-tree state by session-sync infrastructure operates outside the
   authoring path and is out of scope — session-sync publication integrity
   is governed by the libwiki spec family (1730/1750/1780), not this
   invariant. Conformance to this property's loud-failure requirement is
   verified at implementation review; a silent drop leaves no trial
   artifact, so the trial audit cannot adjudicate it.
3. **Audit-readable block record.** Every block emits a record containing at
   minimum the offending token, the repository it was checked against, the
   originating authoring path (skill or profile routine), an identifier of
   the blocked body's surface, the block time, and enough of the citation's
   surrounding context to re-judge the citation at audit time. The record
   is durable through trial close and the verdict. The record's form,
   location, and lifecycle belong to design.

Mechanism choices that belong to design: which SHA-shape discriminator,
where the invariant text lives, how repository inference resolves for each
surface (including the disposition of citations to repositories the
installation cannot access), what observable forms the block record and the
SC3 coverage signal take, and how the invariant is sequenced against Exp 47
(Issue #1475).

## Why

| Reason | Evidence |
| --- | --- |
| Trust contract — downstream agents boot `Read wiki/MEMORY.md` and re-read summaries via `fit-wiki boot`; a SHA citation that does not resolve on the expected repository propagates without challenge until a human or trace-aware audit catches it | 2026-06-07 run-198 wiki narrative cited `e44c4ce1` against the monorepo; the citation reached `wiki/MEMORY.md` cross-cutting context unchallenged for one full cycle |
| Quiet failure mode — unresolved SHA citations read as authoritative evidence; downstream agents cite them, compounding the trust violation | Same incident: prior to SE correction, a downstream activation reading MEMORY.md would have treated `e44c4ce1` as a monorepo commit |
| Sibling, not duplicate, of Exp 47 (Issue #1475) — Exp 47 verifies a trace artifact exists for the activation that wrote a wiki entry; this invariant verifies cited SHAs in the body resolve on the referenced repository. Both close half of the trust contract; neither subsumes the other | Issues #1474/#1476 distinguish the surfaces (post-write trace-artifact self-check vs. pre-publish citation check) |
| Cheap precondition — the per-token check is bounded and the failure mode is observable, so the invariant is approachable inside today's authoring paths without redesigning them | SE applied the sibling temporal-check ad-hoc in the same correction pass that surfaced this gap |

## Success criteria

All audits are executed by the PM lane: the window-open recording at window
open, the close audit at window close; evidence lands on the trial record.
The shared audit procedure is locked in § Trial audit.

| SC | Statement | Verification |
| --- | --- | --- |
| SC1 (outcome) | Every cited SHA-shaped token asserted as existing in agent-authored bodies published on an in-scope surface during the trial window resolves on the citation's referenced repository | § Trial audit at trial close: SC1 passes if every audited token asserted as existing resolves — at audit time, or at publish time where post-publish history rewrite is evidenced (the verdict names the evidence) |
| SC2 (scope discipline) | No block record produced during the trial window is attributed to an out-of-scope skill (`kata-review`, `kata-setup`, `kata-session` facilitation) | Read the block records at trial close (outcome property 3 makes authoring-path attribution part of the record minimum): SC2 passes if zero records are attributed to the out-of-scope skills — zero total block records satisfies SC2 vacuously (supply is F1's concern, coverage SC3's) |
| SC3 (coverage) | The invariant is active on every in-scope authoring path throughout the trial window | Read the coverage signal at trial close (§ Trial audit requires design to provide one) and spot-verify it: for at least one enumerated path, the auditor confirms the signal's claim against direct evidence (a session trace or published body) rather than accepting self-attestation. SC3 passes if no path enumerated at window open lacked coverage for the full window — a zero-citation, zero-block window still proves the invariant was in force |

## Trial audit

The close audit consumes the window-open record and adjudicates SC1–SC3 and
F1–F2. Locked procedure:

- **Window-open record** — written when the window opens: the enumerated
  in-scope authoring paths, the agent-identity roster (append-only as
  identities join mid-window), and the coverage signal design provides for
  SC3. The record's home is design's call; its existence is not.
- **Population** — bodies published on the four in-scope surfaces during the
  window by rostered identities, each audited at its revision last
  published inside the window. On the wiki surface, authored landings only;
  design must make authored landings distinguishable from session-sync
  working-tree publishes at audit time (outcome property 2's carve-out).
- **Extraction** — an audit discriminator chosen without reading the
  implementation's, then verified a superset of it; if the superset check
  fails, the audit uses the union of the two.
- **Classification** — negativity and repository context judged at audit
  time from each body's text per outcome property 1, independent of the
  implementation's inference rules and marking. Tokens citing repositories
  the installation cannot access are recorded for the verdict and excluded
  from SC1's pass condition.

## Out of scope

- Repairing the cited `e44c4ce1` formerly in `wiki/release-engineer.md` and
  `wiki/MEMORY.md` — subsequent Assess passes have since overwritten both;
  remaining mentions are archival negative citations. Residual repair
  tracked under Issue #1474.
- Bot-identity misuse investigation. SE has classified the run-198 incident as
  narrative-only; whether bot-identity adjacent factors contributed is a
  separate question not gated by this spec.
- Generalizing the predicate to additional publish surfaces (GitHub
  Discussion bodies — agent-authored RFCs are a real citation surface) or to
  non-SHA fabrication surfaces (PR numbers, run IDs, issue numbers, file
  paths). Future invariants can land alongside this one in whatever home
  design picks; this spec ships only the SHA-check on the four surfaces.
- The post-write trace-artifact self-check (Exp 47, Issue #1475). Sibling
  experiment; the two close half of the trust contract independently.
- Git commit messages on any repository. The invariant guards body content
  (Issue/PR/comment markdown and wiki file content), not commit metadata.
- Mechanism choices — the items already enumerated as design's call under
  § What changes (discriminator, invariant home, inference rules,
  negative-citation marking and recognition, block-record shape and
  storage), plus the mechanism that enforces the rollout sequencing fixed
  by § Trial window and F3 (design owns the enforcement, not the ordering
  rule).

## Falsifiers (locked pre-implementation)

| Falsifier | Trigger | Action |
| --- | --- | --- |
| F1 — supply (no surface) | Across all four in-scope surfaces during the trial window, the SC1 audit counts fewer than 5 adjudicable SHA-shaped tokens asserted as existing (counted after excluding negative citations and inaccessible-repository tokens) | Extend the window in effect by 2 weeks. At extended close: if the aggregate adjudicable count reaches 5, adjudicate the trial on the full extended window across all surfaces; if it does not, close the spec — the standing invariant is withdrawn for lack of measurable supply, without prejudice to re-proposing it if supply appears |
| F2 — over-fit | Measured at the close audit: the share of wrongly-blocking events during the window exceeds 5%, with at least 2 such events — repeat records of the same blocked citation as the author retries count as one event; a single event is recorded for the verdict but does not fire F2 | Verification: for each blocked event, judge the citation's referenced repository per § Trial audit's classification rules (independent of the repository the implementation recorded, so inference errors are visible) and re-resolve the token against it, discounting tokens whose cited commits postdate the recorded block time (the verdict names the evidence used); an event is wrongly-blocking if its token resolves. Compute `wrongly-blocking events / total blocked events` (zero blocks: F2 cannot fire). On fire: the verdict records the offending tokens and the discriminator or repository-inference change required; apply that change and restart a window of the length then in effect from the change landing on `main` |
| F3 — sequencing collision with Exp 47 | The trial window opens before Exp 47's verdict comment publishes, contaminating Exp 47's post-measurement signal | The spec's verdict is suppressed until Exp 47's verdict comment lands; the trial window is re-started from the day after that comment. A window opened early by the § Trial window re-adjudication does not fire F3 — the re-adjudication record on Issue #1475 supersedes. (Otherwise a process-error guard: the trigger is impossible while § Trial window's gate holds) |

F1's 5-token floor is deliberately conservative against the observed base
rate: two current wiki weekly-log files alone carry 97 distinct SHA-shaped
tokens (counted 2026-06-11).

## Decisions

| Decision | Rationale |
| --- | --- |
| Outcome-level commitment, mechanism deferred | The predicate's shape (discriminator, home, signal) is design's call; the spec commits only that some implementation produces the outcome — no unresolved SHA citations on in-scope surfaces |
| Repo-context is part of the outcome, not deferred | The run-198 incident demonstrated that without repo-context the predicate gets the wrong answer (the SHAs were real wiki commits cited against the monorepo). The spec requires the check to resolve against the body's referenced repository; the inference rules are design's call but the outcome property is not optional |
| Sequencing-coordinated with Exp 47 (Issue #1475) | Both interventions touch SHA-bearing trace artifacts in RE Assess. The trial windows must not overlap or post-measurement signals confound. F3 above is the falsifier that enforces this |
| SHA-only this spec | Other citation surfaces (PR numbers, run IDs, timestamps) are real but each adds discriminator and inference complexity. Shipping SHA-check first lets the team learn from one surface before generalizing |
| Negative citations exempt | Requiring forensic corrections' quoted SHAs to resolve would block the correction genre that motivated this spec. Asymmetry accepted: a body wrongly asserting a resolving SHA as non-resolving is not blocked — existence-checking cannot adjudicate negative claims; the SC1 audit notes observed instances for the verdict |
| Standing policy, trial-windowed verdict | A trial-only gate would re-open the gap the day the window closes; the verdict decides retain, amend, or remove |

## Trial window

14-day window starting once both conditions hold: the implementation is
merged into `main`, and Exp 47's verdict comment on Issue #1475 has
published. If the second condition holds at merge, the window opens at
merge. If Exp 47's verdict has not published within 28 days of the
implementation merging, the sequencing gate is re-adjudicated with the
improvement coach (outcome recorded on Issue #1475) rather than holding the
window closed indefinitely.

Verdict folded into the `kata-pattern-synthesis` rollup at 2026-07-02
(per Discussion #873) if the trial window closes on or before that rollup;
otherwise the verdict is folded into the next `kata-pattern-synthesis`
rollup after window close.

## References

- Issue #1476 — provenance and PM-authored sketch this spec lifts from
- Issue #1474 — the run-198 incident that surfaced the failure mode
- Issue #1475 — sibling experiment (Exp 47: trace-attestation header on RE
  Assess)
- Discussion #873 — RFC: Routing-time PR check in
  kata-{spec,design,plan,implement}; rollup scheduled 2026-07-02 (authored by
  improvement-coach)
- `JTBD.md` — persona and job definitions

— Product Manager 🌱
