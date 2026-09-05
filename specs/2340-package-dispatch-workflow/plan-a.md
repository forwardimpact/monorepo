# Plan 2340-a: `kata-agent` runs the dispatch

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

CONTRIBUTING.md § Releasing sets the part boundaries. A consumer may pin its
producer only after the producer ships, so the four release tiers of that
section become four parts and four pull requests. Part 01 carries the tier-1
and tier-2 source: the `gemba-harness callback` absent-trace branch and the
`gemba-bootstrap` empty-means-default input. Part 02 gives `kata-agent` the
five inputs, the token stamp, and the callback step, and it pins the
`gemba-bootstrap` release that part 01 produced. Part 03 turns the wrapper
workflow, the setup template, and the instruction surfaces over to the
`kata-agent` release that part 02 produced. Part 04 is the runbook for the
three cuts between the code parts and for the consumer repository.

Libraries used: libharness (`callback` command, `sumTraceCost`), libmock
(`createMockFs` in the callback test).

## Scope notes for the approver

Three decisions this plan makes that the spec and the design leave open. Each
is deliberate. Each is the approver's to overturn.

| Decision                     | Detail                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Four pull requests, not one  | spec.md § Rollout constraint names three sibling releases between the source change and the repin. Part 02 pins a `gemba-bootstrap` SHA that exists only after part 01 ships, and part 03 pins a `kata-agent` SHA that exists only after part 02 ships. No two of these parts can share a pull request.                                                                              |
| Three extra workflow pins    | spec.md § Included names `.github/workflows/kata-dispatch.yml` alone. Part 03 also repins `kata-shift.yml`, `kata-storyboard.yml`, and `kata-coaching.yml` to the same `kata-agent` release. Without those three pins, `x-auth-anomaly.md`'s new sentence ("every `kata-agent` surface carries the stamp") is false for three of the four surfaces until Dependabot bumps them.       |
| Two files outside § Included | Part 01 also edits `products/gemba/bin/gemba-harness.js` (the `--trace-file` option description, which states the flag is required) and `libraries/libharness/src/events/github.js` (a docstring that names `kata-dispatch.yml` as its caller). design-a.md § Removed names the second. The first would publish a `--help` line that contradicts the command after this change. |

## Parts

| Part                      | Title                                        | Depends on                  |
| ------------------------- | -------------------------------------------- | --------------------------- |
| [01](plan-a-01.md)        | Callback verb and bootstrap input            | —                           |
| [04 tier 1-2](plan-a-04.md) | Cut `gear` and `gemba-bootstrap`           | 01                          |
| [02](plan-a-02.md)        | `kata-agent` runs the dispatch               | 04 tier 2                   |
| [04 tier 3](plan-a-04.md) | Cut `kata-agent`                             | 02                          |
| [03](plan-a-03.md)        | Wrapper, template, and instruction surfaces  | 04 tier 3                   |
| [04 tier 5](plan-a-04.md) | The reference consumer                       | 04 tier 3                   |

## Execution

- **Agent route.** Parts 01, 02, and 03 go to `staff-engineer`. Each one
  carries JavaScript, action YAML, or workflow YAML, so no part is docs-only.
  `technical-writer` reviews the prose part 03 adds to `workflow-dispatch.md`,
  `SKILL.md`, and `x-auth-anomaly.md`. Part 04 goes to `release-engineer` for
  tiers 1 to 3 and to `staff-engineer` for tier 5.
- **Strictly sequential.** No two parts run in parallel. Each code part pins a
  release the previous part produced. Part 04's tiers interleave with the code
  parts in the order the Parts table lists.
- **File ownership.** Each file has exactly one owning part. Part 01 owns every
  line under `libraries/libharness/` and
  `products/gemba/actions/gemba-bootstrap/`. Part 02 owns every line under
  `products/kata/actions/kata-agent/`, the `gemba-bootstrap` pin included. Part
  03 owns every line under `.github/workflows/` and
  `.claude/skills/kata-setup/`. No two parts edit one file.
- **Verify before each cut.** `bun run check` and `bun run test` pass on each
  part's branch before it merges. Part 04 tags only commits already on `main`.
- **Success criteria.** Criteria 1 to 5 verify on part 02's branch. Criteria 8,
  9, and 12 verify on part 03's branch, and 6 with them. Criterion 7 verifies
  after part 03 merges and one dispatch run finishes. Criterion 11 verifies
  after tier 3. Criterion 10 verifies in the consumer repository's own pull
  request.

## Risks

| Risk                                                                                                                                                                                                                                                                                                            | Mitigation                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Part 02's callback step calls the `gemba-harness` binary that `fit-install.sh` pins, not workspace source. Merged before tier 2, a dispatch run with an empty trace path hits the old required-flag guard and exits 1 instead of posting the placeholder.                                                        | Part 02 merges only after tier 2 tags `gemba-bootstrap`, and its own `gemba-bootstrap` pin is the proof that it did.                                                                    |
| A run that fails before the bootstrap step leaves no `gemba-harness` binary on the runner. The `always()` callback step then fails as "command not found" and adds a second red step to an already red run. No callback posts.                                                                                   | design-a.md accepts the gap. `Report run cost` already behaves this way. Do not add a guard: a guard would hide the same failure on the cost step, which the action deliberately lacks. |
| `gemba-bootstrap`'s `bun-version` input default changes from `1.3.11` to `""`. A caller that reads the declared default instead of calling the action sees an empty string.                                                                                                                                     | Part 01 keeps the resolved value in the input description and in the README row, so both surfaces still name `1.3.11`.                                                                  |
| `Release: Tag` tags only commits reachable from the default branch. A squash merge leaves the branch's own commits off `main`.                                                                                                                                                                                   | Part 04 tags the `main` commit each merge produced, never a branch commit. CONTRIBUTING.md § Releasing states the rule.                                                                 |
| Between part 02's merge and part 03's merge, `publish-actions.yml` mirrors a `kata-agent` that carries the callback step, while every consumer still pins `v1.0.9`.                                                                                                                                              | Consumers move only when they repin. Shift, storyboard, and coaching pass no `callback-url`, so the new step skips even after they repin.                                               |
| The reference consumer's dispatch workflow carries a queue-depth concurrency policy and a job timeout that the monorepo's does not.                                                                                                                                                                              | spec.md § Excluded keeps both in the workflow. Part 04 tier 5 preserves the consumer's own values and changes only the steps.                                                           |
