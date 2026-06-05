# Spec 1550 — Sibling-edit workflow: permission-scoped, audit-logged dispatch

## Persona and job

Hired by **Teams Using Agents** so the agent team can edit a sibling
composite-action repo (`forwardimpact/{fit-bootstrap, fit-eval, fit-benchmark,
fit-wiki, kata-agent}`) through a workflow whose contract matches the actual
permission boundary of the installation token, rather than the factually wrong
contract documented today, and without silently widening any agent's permanent
scope to do so.

Related JTBD: *Teams Using Agents — Run a Continuously Improving Agent Team*
([JTBD.md](../../JTBD.md)).

## Problem

`.github/CLAUDE.md` § Editing a published action ends with:

> `GITHUB_TOKEN` in this environment has push rights to every sibling repo
> under `forwardimpact/*`; no extra auth setup is needed.

This sentence is **factually wrong** under the current installation.
`kata-agent-team[bot]`'s installation token is scoped to the monorepo only; it
does not carry push rights into any sibling repo. The documented edit procedure
("Clone into `tmp/`, edit, commit, force-move the `v1` tag, push") cannot be
followed by an agent reading the doc at face value. Anyone — human or agent —
who follows the procedure either (a) gets a 403 at push time, or (b) reaches for
a personal token that broadens the trust boundary without any audit record.

The gap surfaced while diagnosing a `fit-bootstrap` cache-poisoning bug whose
fix required a one-file edit in the sibling repo. Today, the only paths to that
edit are:

1. A trusted human switches credentials manually and pushes from a workstation
   (no CI audit; outside the bot's coordination surface; cannot be invoked from
   `kata-dispatch` or an Issue handoff).
2. `kata-dispatch.yml`'s permanent token scope is widened to include sibling
   repos (every scheduled run thereafter — 3×/day — would hold cross-repo write
   regardless of whether that run touches a sibling).

Spec [1310](../1310-sha-pin-sibling-actions/spec.md) (PR #1208 spec + PR #1210
design, merged 2026-05-26) SHA-pinned the consumption side of the sibling
supply chain across 21 monorepo workflows;
[Discussion #1022](https://github.com/forwardimpact/monorepo/discussions/1022)
ratified that direction at comment
[`discussioncomment-17057478`](https://github.com/forwardimpact/monorepo/discussions/1022#discussioncomment-17057478)
on 2026-05-26. The present gap is on the **editing** side of the same boundary:
the doc for editing a sibling describes a contract the installation token
cannot satisfy, so no first-class path exists for a legitimate sibling edit.
[MEMORY.md § "Sibling-repo composite actions at `@v1` mutable tag"](../../wiki/MEMORY.md)
tracks the 1310 ratification thread and the SE-flagged scope corrections that
extended the in-scope sibling set to five; this spec inherits that five-sibling
boundary on the editing side.

### Why this needs a spec, not a direct PR

The mechanism this spec authorizes introduces new attack surface — token
minting on dispatch, the workflow as a write-gate, and a long-lived audit
destination. Security Engineer concurred on per-invocation `repositories:
<single-sibling>` token minting as the dispatch contract and provided the five
guardrails reproduced verbatim in § Success criteria below. Staff Engineer and
Release Engineer concurred that the choice is policy-touching and asked that
the artefact pass through the kata-spec → design → plan pipeline so the design
phase can settle implementation choices that the spec deliberately leaves
open. The five guardrails are the WHAT-level contract on the eventual
workflow; selection of token-minting Action, audit destination, allowlist
storage location, and step ordering belong in `design-a.md`.

### Threat model the guardrails defend against

The five guardrails defend against five distinct ways a naive sibling-edit
workflow could erode the boundary the dispatch contract is meant to enforce:

| Threat | Guardrail |
|---|---|
| Auto-triggered dispatch from a non-human event (PR comment, issue body, repository_dispatch) executes a sibling edit without human or bot review. | `workflow_dispatch` only (G1). |
| Any GitHub actor with workflow-run rights triggers the workflow under the bot's audit identity. | Actor gate (G2). |
| A sibling identifier supplied as user input is injected via substring, glob, or regex match to reach a sibling outside the documented set. | Single-sibling input validated against fixed allowlist (G3). |
| The minted token holds write on a wider set of repos or write to a wider set of resources (`actions`, `workflows`) than the edit needs. | Token scope (G4). |
| The audit record vanishes with the runner logs and the trail of who edited what cannot be reconstructed. | Persistent audit destination with five named fields (G5). |

### Residual exposure that this spec does not close

The five guardrails bound a narrow contract; they do not eliminate every path
from monorepo identity to sibling write. The spec records the residual rather
than silently inheriting it.

- **Compromised allowlisted dispatcher.** A compromise of
  `kata-agent-team[bot]` or any allowlisted trusted human still results in a
  sibling write under the bot's audit identity, with all five guardrails
  passing.
- **Standing GitHub App installation scope.** Per-invocation token minting
  requires the GitHub App to already be installed on each of the five sibling
  repos with `contents:write`. The *workflow*'s permanent scope is not
  widened by this spec, but the *App*'s installation scope is the precondition
  for minting; an App-credential compromise on the monorepo reaches all five
  siblings through the same minting path.
- **Audit destination integrity.** A persistent destination (Discussion
  comment, Issue, queryable artifact) is not by itself tamper-evident. A
  compromised allowlisted dispatcher whose identity can also edit the
  destination can rewrite or delete its own audit record. This spec requires
  persistence and field completeness; tamper-evidence is out of scope here.
- **Sibling content executed during edit.** Cloning the sibling and running
  an edit step against it executes whatever the sibling's working tree
  contains at clone time (hooks, scripts triggered by the edit step). This
  spec does not require pre-clone verification of sibling content.
- **Sibling-internal references.** Mirrors the spec 1310 residual at the
  edit boundary: pinning the monorepo's reference to a sibling does not
  govern what the sibling itself references internally; an edit landing in a
  sibling may interact with sibling-internal references that this spec does
  not see.

## Scope

### In scope

- A new dispatchable workflow under `.github/workflows/` — named
  `sibling-edit.yml` to match the contract documented in `.github/CLAUDE.md`
  — that, for one named sibling per invocation, mints a credential scoped
  only to that sibling, exposes the cloned sibling to a single edit step,
  and emits an audit record. The workflow's contract surface is bounded by
  the five guardrails in § Success criteria.
- Amendment of `.github/CLAUDE.md` § Editing a published action so the
  documented procedure matches the actual permission boundary and points to
  the new workflow rather than the wrong-contract local-clone procedure.

### Excluded

Explicit at the request of staff-engineer ("if SE wants that, it gets its own
spec — don't bundle"):

- **Broader sibling-edit policy review.** Whether the dispatcher allowlist
  should include trusted humans beyond `kata-agent-team[bot]` is out of scope
  here; this spec accepts a documented trusted-human allowlist as a guardrail
  but does not set its membership.
- **Audit-logging design for non-CI events** (Issue replies, manual edits,
  emergency rollbacks). This spec's audit destination covers only what
  `sibling-edit.yml` itself emits.
- **Expanding the target-sibling allowlist beyond the five named composite
  actions.** Adding a sixth target (or removing a sibling) is a separate
  spec.
- **Sibling-internal references and tag policy.** Already excluded by
  [spec 1310](../1310-sha-pin-sibling-actions/spec.md); not re-litigated here.
- **`.github/CLAUDE.md`'s § Third-party actions table itself.** Mentions of
  `forwardimpact/<sibling>@v1` as canonical published markers remain valid
  per spec 1310's exclusion list.

## Success criteria

The first five rows ("Claim" column) carry the five SE guardrails reproduced
**verbatim** from the kata-spec session that authored this spec. The
"Verifies via" column is this spec's contribution and is tightened so an
implementer cannot satisfy the guardrail's surface text while leaving its
underlying property defeated. The remaining rows cover the workflow's
existence, the documentation correction, and the diff boundary.

| Claim | Verifies via |
|---|---|
| **G1.** `workflow_dispatch` only — no `repository_dispatch`, no `issue_comment` triggers, no auto-events | The workflow's `on:` block names exactly one event (`workflow_dispatch`), with no `repository_dispatch`, `issue_comment`, `schedule`, `push`, `pull_request`, or `workflow_call` keys; an attempted dispatch from any of those event types either does not start the workflow or is rejected before any token-mint step runs. |
| **G2.** Actor gate — `github.actor == 'kata-agent-team[bot]'` OR documented trusted-human allowlist; reject everyone else at job-level `if:` | Every job in the workflow refuses to run unless `github.actor` matches `kata-agent-team[bot]` or a value present in an allowlist enumerated in the workflow source itself (literal values in the workflow file, or a value referenced from another file in the monorepo that the workflow `cat`s and shows in its log on entry); allowlist references via repo settings, environment secrets, or external lookups are insufficient; a dispatch attempted by an actor outside the resulting set produces a failed run with the actor recorded in the audit destination (see G5). |
| **G3.** Single-sibling input validated against fixed allowlist `[fit-bootstrap, fit-eval, fit-benchmark, fit-wiki, kata-agent]` (reject substring/glob/regex injection) | Before any token-mint step or any shell/script interpolation of the input, the workflow compares the input by literal-equality (case-sensitive, no leading/trailing whitespace, no shell expansion, no regex) against exactly the five named values; a dispatch carrying any other value exits non-zero before the token-mint step runs and is recorded in the audit destination (see G5). |
| **G4.** Token minted with `repositories: <chosen-sibling>` only and `contents:write` only — no `actions:write`, no `workflows:write` | At runtime, the workflow mints at most one credential whose effective write reach is exactly one repository (the value validated in G3) and exactly the `contents` resource; the workflow does not request, derive, or reuse a credential that grants `actions`, `workflows`, or any other resource on the sibling, and does not obtain an OIDC-federated credential out-of-band that broadens this scope; the workflow's own top-level `permissions:` block on the monorepo side grants no more than what the monorepo-side operations of this workflow require (audit-write, input handling, edit-step orchestration) and does not declare `write-all` or unrestricted scope; the edit step's `env:` block exposes only the minted sibling-only credential and the validated `sibling` input — pre-existing repository or organization secrets (e.g. `NPM_TOKEN`, `ANTHROPIC_API_KEY`, `KATA_APP_PRIVATE_KEY`, signing credentials) are not passed into the edit step's environment individually or via `${{ secrets }}` / `toJSON(secrets)` expansion; the audit record (G5) includes the minted credential's declared `repositories` and `permissions` fields so a reviewer can verify the runtime scope after the fact. |
| **G5.** Audit log emitted to a persistent destination (Discussion comment, Issue, or queryable artifact) with `{actor, sibling, commit_sha_being_pushed, invocation_time, workflow_run_id}` — not just runner logs that rotate | One audit record is written per **invocation attempt** — including attempts rejected at the actor gate (G2) or the input-validation gate (G3) before any token-mint or edit step runs, and including attempts that reach the edit step and then succeed or fail; the audit-write is structured so any attempt past the actor gate yields at minimum an intent record independent of the main job's exit state — a single audit-write step at end-of-job within the same job as token-mint, edit, and push is insufficient, because a hard crash, OOM, or cancellation between input-validation and audit-write would leave no record — to a destination documented in `.github/CLAUDE.md` (Discussion comment, Issue, or a repository-tracked artifact); the record carries all five fields, with `commit_sha_being_pushed` set to the literal value pushed on a successful run and to `n/a` plus one of an enumerated set of reason codes (e.g. `actor-rejected`, `sibling-rejected`, `edit-failed`, `push-rejected`, vocabulary fixed by `design-a.md`) on any run where no push occurred; the audit-write uses the workflow's monorepo-side `GITHUB_TOKEN` identity (not the minted sibling-only credential, which cannot reach a monorepo destination) so the audit-write is itself observable in the destination's history; `.github/CLAUDE.md` names the destination so future readers can find prior records. |
| The workflow exists and runs end-to-end against at least one sibling. | The workflow file is present on the merge commit; the implementation PR description links to one completed dispatch run against one allowlisted sibling, that run reports green status, and the linked audit record satisfies G5. |
| `.github/CLAUDE.md` § Editing a published action no longer asserts that `GITHUB_TOKEN` has push rights to sibling repos. | The section contains a positive statement that the in-workflow `GITHUB_TOKEN` is monorepo-scoped and that the dispatchable sibling-edit workflow is the supported edit path; the section links to the workflow and to the audit destination named in G5. |
| The implementation PR's required checks all pass. | The PR that lands this spec's implementation reports green on every check the branch-protection rules for `main` mark required at merge time. |
| The implementation PR's diff stays within the file sets in scope. | The PR diff touches only the new sibling-edit workflow file, `.github/CLAUDE.md`, the spec/design/plan tree under `specs/1550-sibling-edit-workflow/`, and (if the design phase factors out a reusable composite action for token-minting or audit-emission) one new directory under `.github/actions/`. No permanent-scope change to any pre-existing workflow including `kata-dispatch.yml`, and no edits to a sibling repo, appear in this spec's diff. The end-to-end run required by the row above may write to a sibling at runtime; that runtime effect is observable through the audit destination, not through this PR's diff. |

— Product Manager 🌱
