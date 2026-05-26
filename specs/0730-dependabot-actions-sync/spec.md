# Spec 0730 — Dependabot ↔ `.github/actions/` directory sync

## Problem

`.github/dependabot.yml` requires manual enumeration of every directory under
`.github/actions/` in its `directories:` list (currently 5 action-directory
entries plus the workflow-root `/`). Whenever composite actions are added,
renamed, or deleted, this list silently falls out of sync with the filesystem
and the new path goes unscanned by Dependabot — opening a supply-chain coverage
blind spot until the next audit catches it.

The same compliance mechanism has now failed three times in 30 days, all sharing
the same root cause — per-directory enumeration drifting from the filesystem:

| #   | Date       | Event                                                                                                                                                                          | Reference                                          |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 1   | 2026-04-27 | Original blind spot — `actions/upload-artifact@v4` in `.github/actions/kata-action/` 3 majors stale, no auto-bump PRs ever proposed (config only listed `/`, not action dirs). | Closed by PR #551 — added explicit `directories:`. |
| 2   | 2026-04-29 | Re-introduction — commit `0194cb0f` ("simplify workflows…") split `kata-action/` into `kata-action-agent/` + `kata-action-eval/`. `dependabot.yml` not updated in the same PR. | Both new directories unscanned.                    |
| 3   | 2026-04-30 | Surfacing — Dependabot auto-closed PR #556 ("`actions/upload-artifact` 4.6.2 → 7.0.1 in /.github/actions/kata-action") because the targeted path no longer exists.             | Hand-fixed by PR #615.                             |

The fix in #615 restores coverage but does not change the underlying mechanism —
a fourth recurrence is on the same trajectory the moment the next composite
action lands or moves. Three identical failures in 30 days under the
contributors-must-remember model is sufficient evidence that the mechanism
layer, not the policy layer, is where this needs to be addressed.

## Goal

Adding, renaming, or deleting a `.github/actions/<dir>/` directory must not
silently leave that directory unscanned by Dependabot, **without** requiring a
new manual step in the contributor's workflow.

## Scope (in)

- `.github/dependabot.yml` — the mechanism by which `.github/actions/<dir>/`
  entries are tracked for the `github-actions` ecosystem.
- The merge-gate behaviour for PRs that add, rename, or delete a directory under
  `.github/actions/` — such PRs must not be able to land while leaving
  Dependabot's scan set out of sync with the filesystem. The artefacts the
  design changes to enforce this are design's choice.

## Scope (out)

- The `npm` / `bun` ecosystem block (`minor-and-patch` grouping, schedule,
  `open-pull-requests-limit`) — unchanged.
- The `schedule:` cadence, `enable-beta-ecosystems`, or any other unrelated
  Dependabot config field.
- Workflow-file scanning at `/` (the root entry must remain — workflows under
  `.github/workflows/` continue to be covered as today).
- The composite actions themselves (their pinning, their version bumps).
- Any change to action-pinning policy or SHA-pin enforcement.

## Success criteria

Define the **filesystem set** as the set of directories `D` for which
`.github/actions/<D>/action.yml` or `.github/actions/<D>/action.yaml` exists in
the repository tree. Define the **scan set** as the list of paths in the
`directories:` field of the `github-actions` ecosystem block of
`.github/dependabot.yml`, with any glob patterns expanded against the repository
tree at merge time. The **coverage invariant** is `filesystem set ⊆ scan set`
AND `(scan set ∖ {/}) ⊆ filesystem set` — every action directory is scanned, and
no scan-set entry under `.github/actions/` points at a non-existent directory.

| #   | Claim                                                                                                                                         | Verification                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The coverage invariant holds for the repository's `main` branch after the change merges.                                                      | Compute the filesystem set and scan set as defined above and verify both subset relations. The check does not depend on any specific action being stale.                                                                                                                                                            |
| 2   | A PR that adds `.github/actions/<new>/action.yml` cannot reach `main` while breaking the coverage invariant.                                  | Replay test: take any diff that introduces a new `.github/actions/<new>/action.yml` (e.g., a fresh `_canary` directory) and changes nothing else; if applied to the post-change `main`, the coverage invariant must hold for the resulting tree before the change reaches `main`.                                   |
| 3   | A PR that renames `.github/actions/<old>/` to `.github/actions/<new>/` cannot reach `main` while breaking the coverage invariant.             | Replay test: take a directory-rename diff that changes nothing else; if applied to the post-change `main`, the coverage invariant must hold before the change reaches `main`.                                                                                                                                       |
| 4   | A PR that deletes `.github/actions/<dir>/` cannot reach `main` while breaking the coverage invariant (the failure mode of incident #3 above). | Replay test: take a directory-delete diff that changes nothing else; if applied to the post-change `main`, the coverage invariant must hold before the change reaches `main`.                                                                                                                                       |
| 5   | Workflow-file scanning at the repository root is unaffected.                                                                                  | After the change, the scan set of the `github-actions` ecosystem block contains `/`. Verified by static inspection of `.github/dependabot.yml` at merge time.                                                                                                                                                       |
| 6   | The contributor changing a composite action runs no new step.                                                                                 | The change set introduces no new required edit, command, or instruction in the contributor flow for adding / renaming / deleting a directory under `.github/actions/`. Verified by inspecting the change set: no new "and also edit `.github/dependabot.yml`" requirement appears in any developer-facing document. |

## Notes

### Replay tests

Criteria 2–4 are verifiable today by replaying the deltas of the three recorded
incidents against the post-change repository:

- **Incident #1 → criterion 2**: re-applying the `kata-action/` introduction
  delta.
- **Incident #2 → criteria 2 + 3**: re-applying the `0194cb0f` split.
- **Incident #3 → criterion 4**: re-applying the `kata-action/` deletion delta.

If the post-change repository handles all three replays without a coverage gap,
the spec is met.

### Handoff context for design

Staff-engineer surfaced two candidate levers when handing this spec over (see
`wiki/security-engineer-2026-W18.md` § 2026-04-30 and the facilitator brief that
initiated this spec). The design phase picks one, verifies feasibility, and
documents the trade-offs. The success criteria above are agnostic to the
selection.
