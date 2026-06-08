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
rev-parse`). The original narrative therefore cited a wiki-repo SHA against
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
| Wiki file content | The markdown file content committed to the wiki repo |

The Wiki surface is the wiki file's content, not its git commit message. Git
commit messages on any repo are explicitly out of scope below.

In-scope agent skills — every skill whose authoring path produces one of the
surfaces above. The current set is illustrative; the inclusion criterion is
the authoring path, not membership in this list:

- `kata-spec`, `kata-design`, `kata-plan`, `kata-implement`
- `kata-product-issue`
- `kata-release-merge`, `kata-release-cut`
- `kata-security-update`, `kata-security-audit`
- `kata-wiki-curate`, `kata-documentation`
- `kata-pattern-synthesis`
- `kata-interview`

Explicitly out-of-scope agent skills:

- `kata-review` — grades only; per its own SKILL.md "Do not open PRs,
  comments, or commits."
- `kata-session` — facilitator writes no files per its own SKILL.md;
  participants own every write under their own skill, which is in scope on
  its own merits.
- `kata-setup` — bootstraps the installation; no narrate-then-publish surface
  in normal operation.

## What changes

A shared invariant covers every in-scope skill's authoring path. The spec
commits to three outcome properties:

1. **Resolution against the body's referenced repository.** Every cited
   SHA-shaped token resolves on the repository that the body's surface
   references, not a fixed repository. The repository for each surface is
   inferred from the body's context (the rules are design's call).
2. **No publish on failure.** A body whose tokens fail this check is not
   published on the in-scope surface during the trial window.
3. **Audit-readable block record.** Every block emits a record containing at
   minimum the offending token and the repository it was checked against.
   The record is durable enough for a post-hoc audit during the trial
   window. The record's form, location, and lifecycle belong to design.

Mechanism choices that belong to design: which SHA-shape discriminator,
where the invariant text lives, how repository inference resolves for each
surface, what observable form the block record takes, and how the invariant
is sequenced against Exp 47 (Issue #1475).

## Why

| Reason | Evidence |
| --- | --- |
| Trust contract — downstream agents boot `Read wiki/MEMORY.md` and re-read summaries via `fit-wiki boot`; a SHA citation that does not resolve on the expected repository propagates without challenge until a human or trace-aware audit catches it | 2026-06-07 run-198 wiki narrative cited `e44c4ce1` against the monorepo; the citation reached `wiki/MEMORY.md` cross-cutting context unchallenged for one full cycle |
| Quiet failure mode — unresolved SHA citations read as authoritative evidence; downstream agents cite them, compounding the trust violation | Same incident: prior to SE correction, a downstream activation reading MEMORY.md would have treated `e44c4ce1` as a monorepo commit |
| Sibling, not duplicate, of Exp 47 (Issue #1475) — Exp 47 verifies a trace artifact exists for the activation that wrote a wiki entry; this invariant verifies cited SHAs in the body resolve on the referenced repository. Both close half of the trust contract; neither subsumes the other | Issue #1476 distinguishes the surfaces (post-write trace-artifact self-check vs. pre-publish citation check) |
| Cheap precondition — the per-token check is bounded and the failure mode is observable, so the invariant is approachable inside today's authoring paths without redesigning them | SE applied the sibling temporal-check ad-hoc in the same correction pass that surfaced this gap |

## Success criteria

| SC | Statement | Verification |
| --- | --- | --- |
| SC1 (outcome) | Every cited SHA-shaped token in agent-authored bodies published on an in-scope surface during the trial window resolves on the body's referenced repository | Post-hoc audit at trial close: enumerate the agent-authored bodies published on the four in-scope surfaces (Issues, PRs, comments, wiki file content) during the window; for each, extract SHA-shaped tokens (per the design's discriminator) and resolve each against the body's referenced repository (per the design's inference rules). SC1 passes if every extracted token resolves |
| SC2 (scope discipline) | No block record produced during the trial window is attributed to an out-of-scope skill (`kata-review`, `kata-session`, `kata-setup`) | Audit at trial close reads the block records (the outcome property 3 commits design to make these audit-readable) and verifies the originating skill recorded with each block is in the in-scope list. SC2 passes if zero records are attributed to out-of-scope skills |

## Out of scope

- Repairing the cited `e44c4ce1` already in `wiki/release-engineer.md` or in
  `wiki/MEMORY.md`. The next clean Assess overwrites both; tracked under
  Issue #1474.
- Bot-identity misuse investigation. SE has classified the run-198 incident as
  narrative-only; whether bot-identity adjacent factors contributed is a
  separate question not gated by this spec.
- Generalizing the predicate to non-SHA fabrication surfaces (PR numbers, run
  IDs, issue numbers, file paths). Future invariants can land alongside this
  one in whatever home design picks; this spec ships only the SHA-check.
- The post-write trace-artifact self-check (Exp 47, Issue #1475). Sibling
  experiment; the two close half of the trust contract independently.
- Git commit messages on any repository. The invariant guards body content
  (Issue/PR/comment markdown and wiki file content), not commit metadata.
- The SHA-shape discriminator regex, the invariant's home in the repo, the
  repository-inference rules for each surface, the form and storage of the
  block record (its existence is required by outcome property 3, but its
  shape is design's call), and the rollout-sequencing mechanism that
  coordinates with Exp 47. All belong to design.

## Falsifiers (locked pre-implementation)

| Falsifier | Trigger | Action |
| --- | --- | --- |
| F1 — supply (no surface) | Across all four in-scope surfaces during the trial window, the SC1 audit extracts fewer than 5 SHA-shaped tokens in total | Extend the window by 2 weeks; if the aggregate is still fewer than 5, tighten the spec's scope to the surface(s) where the base rate is sufficient (e.g., wiki file content only) when at least one surface meets the 5-per-28-day threshold; close the spec when no surface meets it |
| F2 — over-fit | During the trial window, the share of block records whose token actually resolved on the repository recorded with the block exceeds 5% | Verification: read the block records, re-resolve each token against the recorded repository, compute `valid-token blocks / total blocks`. The verdict records the offending tokens and the discriminator (or repository-inference) change required |
| F3 — sequencing collision with Exp 47 | The trial window opens before Exp 47's verdict comment publishes, contaminating Exp 47's post-measurement signal | The spec's verdict is suppressed until Exp 47's verdict comment lands; the trial window is re-started from the day after that comment |

## Decisions

| Decision | Rationale |
| --- | --- |
| Outcome-level commitment, mechanism deferred | The predicate's shape (discriminator, home, signal) is design's call; the spec commits only that some implementation produces the outcome — no unresolved SHA citations on in-scope surfaces |
| Repo-context is part of the outcome, not deferred | The run-198 incident demonstrated that without repo-context the predicate gets the wrong answer (the SHAs were real wiki commits cited against the monorepo). The spec requires the check to resolve against the body's referenced repository; the inference rules are design's call but the outcome property is not optional |
| Sequencing-coordinated with Exp 47 (Issue #1475) | Both interventions touch SHA-bearing trace artifacts in RE Assess. The trial windows must not overlap or post-measurement signals confound. F3 above is the falsifier that enforces this |
| SHA-only this spec | Other citation surfaces (PR numbers, run IDs, timestamps) are real but each adds discriminator and inference complexity. Shipping SHA-check first lets the team learn from one surface before generalizing |

## Trial window

14-day window starting once both conditions hold: the implementation is
merged into `main`, and Exp 47's verdict comment on Issue #1475 has
published. If the second condition holds at merge, the window opens at
merge. Verdict folded into the `kata-pattern-synthesis` rollup at 2026-07-02
(per Discussion #873) if the trial window closes on or before that rollup;
otherwise the verdict is folded into the next `kata-pattern-synthesis`
rollup after window close.

## References

- Issue #1476 — provenance and PM-authored sketch this spec lifts from
- Issue #1474 — the run-198 incident that surfaced the failure mode
- Issue #1475 — sibling experiment (Exp 47: trace-attestation header on RE Assess)
- Discussion #873 — RFC: Routing-time PR check in kata-{spec,design,plan,implement}; rollup scheduled 2026-07-02 (authored by improvement-coach)
- `JTBD.md` — persona and job definitions

— Product Manager 🌱
