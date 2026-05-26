# Spec 1310 — SHA-pin sibling `forwardimpact/*` composite actions

## Persona and job

Hired by **Teams Using Agents** to close the only remaining supply-chain
amplification path between sibling repos and the monorepo, so the agent
team can keep running its 3×/day cadence without giving a single
sibling-repo compromise a one-cycle route to write-scoped monorepo
secrets.

Related JTBD: *Teams Using Agents — Run a Continuously Improving Agent
Team* ([JTBD.md](../../JTBD.md)).

## Problem

`CONTRIBUTING.md` § Security Policies states that all third-party
GitHub Actions are pinned to SHA hashes and "never change a pin to a
tag." Today, `.github/workflows/*.yml` consumes four sibling
composite actions under `forwardimpact/*` by tag (`@v1`), and
`.github/CLAUDE.md` § Third-party actions documents a force-tag-move
edit procedure (`git tag -f v1 && git push origin v1 --force`) that
mutates the `v1` reference in place. The practice and the policy
diverge for sibling repos only; every non-sibling third-party action
in the monorepo is already SHA-pinned.

### The divergence in numbers

The tag-pinned sibling surface covers every composite action the
monorepo consumes from a `forwardimpact/*` sibling:

| Sibling | Tag-pinned references | Workflow files touched |
|---|---:|---:|
| `forwardimpact/fit-bootstrap@v1` | 26 | 17 |
| `forwardimpact/kata-agent@v1` | 3 | 3 |
| `forwardimpact/fit-eval@v1` | 3 | 3 |
| `forwardimpact/fit-benchmark@v1` | 1 | 1 |
| **Total references** | **33** | — |
| **Unique workflow files (union)** | — | **20** |

Per-row file counts exceed the unique-file total because several
workflows reference more than one sibling (e.g. `eval-guide.yml`
calls both `fit-bootstrap` and `fit-eval`; `eval-kata.yml` calls both
`fit-bootstrap` and `fit-benchmark`).

### Why a tag pin matters here

Tag references in GitHub Actions are mutable, and the documented edit
procedure makes that mutability load-bearing. A momentary compromise
of any sibling repo lets an attacker re-point `v1` at a poisoned
commit that the next scheduled monorepo run will execute under
monorepo secrets.

The blast radius of that execution is the secret set the affected
workflows expose:

- `ANTHROPIC_API_KEY` — reached through the agent-execution
  workflows (the `kata-*` set plus `eval-guide.yml` and
  `eval-kata.yml`); misuse exposes billing fraud.
- `KATA_APP_ID` and `KATA_APP_PRIVATE_KEY` — reached through the
  `kata-*` workflows that authenticate as the GitHub App; the App
  has write access to `monorepo`, `monorepo.wiki`, `fit-skills`,
  `kata-skills`, and `homebrew-tap`.
- `NPM_TOKEN` — reached through the npm publish path.
- macOS code-signing credentials — reached through the macOS publish
  path; misuse reaches end-user `.app` bundles.

`fit-bootstrap` alone carries 26 of the 33 references and runs on
every workflow that needs the CI environment, including every
`publish-*` workflow and `kata-dispatch.yml`. The threat-model
rationale that justifies SHA-pinning the lower-blast-radius siblings
applies a fortiori to `fit-bootstrap`; SHA-pinning three of the four
would leave the highest-blast-radius sibling tag-pinned, an asymmetry
that does not match the rationale.

### Why the divergence has held until now

The tag-pinned practice was acceptable when the siblings were newer,
the per-edit cadence was higher, and `KATA_APP_PRIVATE_KEY` had a
narrower scope. Three things have shifted since:

1. `KATA_APP_PRIVATE_KEY` now grants write to `homebrew-tap`, which
   ships codesigned `.app` bundles to end-user Macs. A sibling
   compromise therefore reaches end-user binaries, not just CI
   artifacts.
2. The siblings have stabilised; per-edit latency dominates less than
   it did at the practice's origin.
3. Dependabot's `github-actions` ecosystem now reliably opens
   SHA-bump PRs against same-org repos, so the auto-update path that
   the force-tag procedure was originally avoiding is in place.

### Ratification

[Discussion #1022](https://github.com/forwardimpact/monorepo/discussions/1022)
ratified the SHA-pin answer on 2026-05-26 and extended scope to
include `fit-bootstrap` (originally missing from the discussion
body's enumeration). This spec captures the ratified answer for
design and plan to act on.

### Residual exposure that this spec does not close

The siblings reference one another internally (e.g. `kata-agent`
calls `forwardimpact/fit-bootstrap@v1` from within its own
`action.yml`). When a monorepo workflow invokes
`forwardimpact/kata-agent@<sha>`, the SHA pin freezes `kata-agent`'s
entry point, but `kata-agent`'s internal call to `fit-bootstrap@v1`
remains tag-mutable until the sibling repos themselves SHA-pin their
own internal references. That sibling-internal pinning is a
sibling-side decision; this spec excludes it explicitly. The
exposure remains until each sibling adopts its own pinning policy.
The spec records the residual rather than silently inheriting it.

## Scope

### In scope

- Replacing every workflow `uses:` reference to a sibling action
  (`forwardimpact/{fit-bootstrap,kata-agent,fit-eval,fit-benchmark}@v1`)
  in `.github/workflows/*.yml` with a SHA-pinned form that carries a
  `# v1` comment, so the human-readable marker stays legible alongside
  the immutable pin.
- `CONTRIBUTING.md` § Security Policies becoming the single source of
  truth for the pinning rule applied to monorepo workflows, with no
  carve-out language.
- `.github/CLAUDE.md` § Third-party actions retiring the
  force-tag-move edit procedure and documenting an edit flow that
  does not depend on mutating a tag. Which flow is documented is a
  design choice the design and plan settle; the spec requires that
  the new section names *some* non-tag-mutating procedure.
- `.github/CLAUDE.md` adding an explicit clause stating that the
  monorepo's pinning policy governs *workflow `uses:` references to
  sibling actions*, and that *sibling-internal references* (a sibling
  referencing its own subdirectories or the other siblings) are
  governed by the sibling repos.

### Excluded

- **Sibling-internal references.** The pinning policy this spec
  changes governs the monorepo's references to sibling repos.
  References inside a sibling repo (e.g.
  `forwardimpact/kata-agent/post-run@v1` inside `kata-agent`, the
  analogous self-reference in `fit-bootstrap`, and `kata-agent`'s
  internal call to `forwardimpact/fit-bootstrap@v1`) live in the
  sibling repos and are governed there. This spec writes the
  exclusion down; it does not modify those references and does not
  close the residual exposure described in the Problem section.
- **The sibling repos themselves.** Each sibling may continue to tag
  `v1` at known-good commits as a human-readable release marker. No
  sibling-side action is required for this spec to land.
- **Narrative or example `@v1` mentions outside workflow `uses:`
  context.** Files outside `.github/workflows/` may mention
  `forwardimpact/<sibling>@v1` as a published-action identifier,
  user-facing example for external consumers, or descriptive table
  cell — including the third-party-action table inside
  `.github/CLAUDE.md` itself (the rows that name each sibling). The
  pinning policy is about how the monorepo *resolves* a sibling action
  at runtime; narrative mentions of the canonical published tag
  remain valid. External consumers making their own pinning choices
  in their own repos are out of scope.
- **Pinning rules for non-sibling third-party actions.** Already
  SHA-pinned today; the change here is removing the sibling
  divergence, not introducing a new rule.
- **New automation for SHA rotation.** The spec does not require
  new automation. Verifying that Dependabot's existing
  `github-actions` ecosystem configuration will pick up SHA-bump PRs
  against the four siblings is a design-time check, not a spec
  success criterion (the spec cannot test future Dependabot
  behaviour, and gating spec advancement on an externally-timed
  event is not durable).
- **Workflow inventory, job structure, or secret assignments.** No
  change to which workflows exist, which jobs they run, or which
  secrets they hold. The change is purely the form of the reference
  string.

## Success criteria

| Claim | Verifies via |
|---|---|
| No workflow `uses:` line in `.github/workflows/` references a sibling action by mutable ref. | A repository-wide search across `.github/workflows/` for `uses:\s*forwardimpact/(fit-bootstrap\|kata-agent\|fit-eval\|fit-benchmark)@` returns matches in which every match resolves to a 40-character lowercase hexadecimal SHA — no `@v1`, `@main`, `@latest`, or other non-SHA ref remains on any `uses:` line. |
| Every remaining workflow `uses:` reference to a sibling action carries a `# v1` comment on the same line. | The same search reports a trailing `# v1` (the literal canonical marker, agreed for stability against future `v2` cuts; if a sibling cuts a new major, the spec is reopened) on every `uses:` line that references a sibling. |
| The implementation PR's required checks all pass. | The PR that lands this spec's implementation reports green on every check the branch-protection rules for `main` mark required at merge time. |
| `CONTRIBUTING.md` carries the pinning rule as a single source of truth. | The Security Policies section states that all third-party actions, including sibling `forwardimpact/*` repos, are pinned to SHA on workflow `uses:` lines, with no carve-out language. |
| `.github/CLAUDE.md` no longer documents a tag-mutating edit procedure. | The § Third-party actions section contains neither `git tag -f` nor `git push … --force` for any sibling, and the section documents at least one non-tag-mutating edit flow (specific flow chosen by design/plan). |
| `.github/CLAUDE.md` records the sibling-internal-reference exclusion explicitly. | The same section contains a clause stating that workflow `uses:` references to sibling actions are SHA-pinned while sibling-internal references (e.g. `forwardimpact/kata-agent/post-run@v1` inside `kata-agent`) are governed by the sibling repos. |
| The implementation PR's diff stays within the file sets in scope. | The PR diff touches only files matching `.github/workflows/*.yml`, `.github/CLAUDE.md`, and `CONTRIBUTING.md`, plus the spec/design/plan tree under `specs/1310-sha-pin-sibling-actions/`; other paths (such as `.github/dependabot.yml`, narrative documentation, or sibling repos) are not modified by this spec. |

— Product Manager 🌱
