# Spec 2090: Work-Item Provider Abstraction

## Problem

The kata-* skills coordinate work through GitHub primitives — issues, pull
requests, labels, reviews — invoked via the `gh` CLI. The coupling does not live
in the spec/design/plan skill bodies, which defer coordination to shared
resources; it lives in those shared resources and in the operational skills that
invoke `gh` directly. `work-definition.md` lists each work-type's "Created via"
as a GitHub action (labeled issue, `gh` Discussion, direct git ops);
`coordination-protocol.md` routes outputs to GitHub channels and carries a `gh`
CLI section; `approval-signals.md` reads approval from PR labels, comments, and
reviews. The skills and references that file, gate, merge, triage, and patch
then call `gh` — the precise set is discoverable by grepping for `gh ` across
the kata-* skills and the shared references, and is broader than any short list.

This binds the engineering standard's coordination model to one vendor and
blocks two outcomes:

1. **The coordination half of each skill goes unmeasured.** `fit-benchmark` runs
   each task in an ephemeral working directory seeded only with the family's
   fixtures, with no forge credentials and no remote configured; a coordination
   step that calls a remote forge cannot run there, and a benchmark must stay
   reproducible and offline regardless. The `kata-skills` benchmark family is
   four independent tasks — three grade a single produced artifact each (spec,
   design, plan) by rubric and judge, and the fourth grades the implementation
   against a hidden test suite. None of the four exercises a coordination step:
   filing a finding, opening a change, gating it on a trusted signal, merging
   it. Coordination is half of what the kata skills do, so a change to filing,
   gating, or merging ships with no evidence it improved anything.

2. **There is no seam for other forges.** A team running the standard against
   Jira or GitLab has nowhere to fit those systems, because the skills and
   references name `gh` rather than an operation.

This blocks the job Teams Using Agents hire Kata to do — *"Help me run an
autonomous, continuously improving development team that plans, ships, studies
its own traces, and acts on findings"* (JTBD.md § Teams Using Agents: Run a
Continuously Improving Agent Team) — whose Trigger is precisely that "nobody can
tell whether the team is getting better." A team cannot tell whether the half of
the loop it cannot benchmark is improving. The instrument that would measure it,
`fit-benchmark` (the eval tooling within Gear), cannot reach the coordination
half while it is GitHub-bound.

## What Changes

Generalize the two GitHub nouns into one substrate-neutral concept, the **work
item**, with two kinds and a shared envelope, then describe the GitHub binding
as one of several interchangeable **providers** in a shared resource the kata-*
skills read. Skills and references name the abstract operation and point to the
matrix; the matrix records the concrete commands per provider.

Work-item model:

| Concept | Generalizes | What it is |
| --- | --- | --- |
| **ticket** | GitHub issue | A tracked unit of work or finding (bug, feature, obstacle, experiment, RFC). |
| **change** | GitHub pull request | A proposed diff carrying an approval gate. |
| **envelope** | both | The capabilities every work item shares: stable identity, state, discussion, labels, and linkage to other items. Where a provider cannot express a capability, the matrix states how that capability degrades for it. |

Provider matrix — the shared resource mapping each abstract operation (create
ticket, list, comment, open change, gate, merge) to the concrete commands per
provider, plus how an installation selects its active provider:

| Provider | Role |
| --- | --- |
| **github** | The current behaviour. Remains the default and production binding. |
| **filesystem** | New. Tickets and changes live as files in the working tree, so coordination needs no network or remote forge. |
| **jira**, **gitlab** | Future. Enabled by the seam; not built in this spec. |

## Scope

Affected entities:

- A new shared resource defining the work-item model, the provider matrix, and
  how the active provider is selected. It must ship to every installation that
  consumes the kata-* skills, so a consuming team can add a provider (outcome 2);
  which published surface hosts it is a design decision.
- The work-type catalogue and routing in `work-definition.md` and
  `coordination-protocol.md`, re-expressed over work items rather than GitHub
  nouns.
- The approval-signal vocabulary in `approval-signals.md`, generalized so a
  "trusted signal" is expressible by any provider.
- Every kata-* skill and shared reference that invokes `gh` for coordination
  (the full set is the grep result from § Problem, and includes the
  obstacle/experiment recipes in `kata-session`'s `issue-lifecycle.md`),
  re-pointed at the abstract operations.
- The `kata-skills` benchmark family, which gains at least one end-to-end
  coordination task graded against the filesystem provider.

Excluded:

- **No new library or CLI.** The abstraction is a shared resource plus skill
  wording; agents run provider-specific commands directly.
- **No Jira or GitLab implementation.** This spec establishes the seam only.
- **No change to GitHub as the production default.**
- **No storage-format decision.** How the filesystem provider lays out its files
  is left to the design.
- `wiki/STATUS.md` and `kata-dispatch` keep their mechanics; only the
  provider-specific signals they read (PR labels, comments, reviews, merge
  events) are re-expressed as work-item signals.

## Delivered Outcome

The primary, accountable outcome is the **measurement seam**: end-to-end kata
coordination becomes benchmarkable offline via the filesystem provider. The
genericization of the references and `gh`-invoking skills is the necessary means
to it — a coordination task cannot be benchmarked offline unless the skills it
exercises stop calling `gh` directly. Multi-forge portability (Jira, GitLab) is
an enabled consequence of the same seam; building those providers is future
work.

## Success Criteria

| # | Criterion | Verified by |
| --- | --- | --- |
| 1 | A shared resource defines the work-item model (ticket, change, envelope) and a provider matrix listing the abstract operations with at least `github` and `filesystem` columns and a provider-selection rule. | The resource exists; it contains both columns, every listed operation, and the selection rule. |
| 2 | Commands that act on a forge's work items (issue, pull-request, discussion, review, label, and remote-git operations) appear in the kata-* skills and shared references only within the github column of the matrix. | Grep for those commands across the kata-* skills and shared references returns hits only inside the matrix. |
| 3 | `work-definition.md`, `coordination-protocol.md`, and `approval-signals.md` express work-types, routing, and approval signals over work-item operations, with no GitHub-noun routing outside the matrix. | Review of the three references finds zero coordination instructions naming a GitHub primitive directly. |
| 4 | The end-to-end coordination benchmark task completes under the filesystem provider with no network access and no remote forge. | The task runs to a verdict in the sandbox with networking unavailable. |
| 5 | The abstract operation names the skills use are provider-independent; any provider-specific behaviour appears only in the matrix (including stated degradations per the envelope). | Skill and reference wording outside the matrix contains no provider-specific branching. |
| 6 | The `kata-skills` benchmark family includes an end-to-end coordination task graded by invariants asserting on the resulting work-item files. | The task directory exists; its `invariants.sh` asserts on the work-item files. |
| 7 | The shared resource reaches consuming installations along with the skills that cite it. | The resource resides on the surface that syncs to installations (the published skill pack), not a tree that stays in-repo. |
| 8 | The new resource and skill edits introduce no monorepo leakage, and published skills still install cleanly into a fresh repository. | The skill-genericity invariant check passes. |
