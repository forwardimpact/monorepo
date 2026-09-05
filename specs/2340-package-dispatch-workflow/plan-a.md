# Plan 2340-a: `kata-agent` runs the dispatch

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

CONTRIBUTING.md § Releasing sets the part boundaries. A consumer may pin its
producer only after the producer ships, so the release tiers of that section
split this change into three code parts and one runbook. Part 01 carries the
source that ships in the gear bundle and in `gemba-bootstrap`. Part 02 gives
`kata-agent` the five inputs, the token stamp, and the callback step, and it
pins the `gemba-bootstrap` release part 01 produced. Part 03 turns the wrapper
workflow, the setup template, and the instruction surfaces over to the
`kata-agent` release part 02 produced. Part 04 runs the cuts between them and
the reference consumer.

The change lands as four pull requests in this repository (parts 01, 02, 03,
and part 04's `fit-install.sh` pin), one release-cut commit on `main` for the
gear bump, and one pull request in `forwardimpact/bionova-apps-v2`.

Libraries used: libharness (`callback` command, `sumTraceCost`), libmock
(`createMockFs` in the callback test).

## Scope notes for the approver

Three decisions the spec and the design leave open. Each is the approver's to
overturn.

| Decision                        | Detail                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Four pull requests              | spec.md § Rollout constraint names three sibling releases between the source change and the repin. Part 02 pins a `gemba-bootstrap` SHA that exists only after part 01 ships. Part 03 pins a `kata-agent` SHA that exists only after part 02 ships. No two of these parts can share a pull request.                                        |
| Three extra workflow pins       | spec.md § Included names `.github/workflows/kata-dispatch.yml` alone. Part 03 also repins `kata-shift.yml`, `kata-storyboard.yml`, and `kata-coaching.yml` to the same `kata-agent` release. Those pins are what make the stamp reach the three surfaces spec.md § Problem names as stampless today.                                       |
| Seven files outside § Included  | See the table below. Each one either carries a statement this change makes false, or rides the release chain the spec requires.                                                                                                                                                                                                            |

| File outside spec § Included                       | Part | Why it changes                                                                                                             |
| -------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| `products/gemba/bin/gemba-harness.js`              | 01   | The `--trace-file` help reads "Path to the NDJSON trace file". After this change the flag is optional, and the help must say so. |
| `libraries/libharness/src/events/github.js`        | 01   | design-a.md § Removed names its docstring, which cites a `kata-dispatch.yml` step this change deletes.                     |
| `products/gemba/actions/gemba-harness/README.md`   | 01   | design-a.md § Components names it: the callback recipe drops the trace-file guard.                                          |
| `products/gemba/actions/gemba-bootstrap/README.md` | 01   | It documents the `bun-version` input that `action.yml` changes.                                                             |
| `products/gemba/actions/gemba-bootstrap/fit-install.sh` | 04 | Tier 2 of the release chain. Nothing consumes the new gear bundle until this default moves.                               |
| `products/gear/package.json`                       | 04   | Tier 1 of the release chain. The `gemba-harness` binary a runner installs comes from a gear release.                       |
| `.github/workflows/kata-{shift,storyboard,coaching}.yml` | 03 | Row 2 above.                                                                                                            |

## Parts

| Part                        | Title                                       | Depends on |
| --------------------------- | ------------------------------------------- | ---------- |
| [01](plan-a-01.md)          | Callback verb and bootstrap input           | —          |
| [04 tier 1-2](plan-a-04.md) | Cut `gear` and `gemba-bootstrap`            | 01         |
| [02](plan-a-02.md)          | `kata-agent` runs the dispatch              | 04 tier 2  |
| [04 tier 3](plan-a-04.md)   | Cut `kata-agent`                            | 02         |
| [03](plan-a-03.md)          | Wrapper, template, and instruction surfaces | 04 tier 3  |
| [04 tier 4](plan-a-04.md)   | Acceptance run                              | 03         |
| [04 tier 5](plan-a-04.md)   | The reference consumer                      | 04 tier 3  |

## Execution

- **Agent route.** Parts 01, 02, and 03 go to `staff-engineer`. Each carries
  JavaScript, action YAML, or workflow YAML, so no part is docs-only.
  `technical-writer` reviews the prose part 03 adds to `workflow-dispatch.md`,
  `SKILL.md`, and `x-auth-anomaly.md`. Part 04 tiers 1 to 3 go to
  `release-engineer`. Part 04 tiers 4 and 5 go to `staff-engineer`.
- **Strictly sequential.** No two parts run in parallel. Each code part pins a
  release the previous part produced. Part 04's tiers interleave with the code
  parts in the order the Parts table lists.
- **File ownership.** Each file has exactly one owning part, so no two parts
  edit one file.

  | Part | Owns                                                                                                                                                                                    |
  | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | 01   | `libraries/libharness/`, `products/gemba/bin/gemba-harness.js`, `products/gemba/actions/gemba-harness/README.md`, and `action.yml` plus `README.md` under `products/gemba/actions/gemba-bootstrap/` |
  | 02   | `products/kata/actions/kata-agent/`                                                                                                                                                     |
  | 03   | `.github/workflows/`, `.claude/skills/kata-setup/`, `.claude/agents/x-auth-anomaly.md`, `.github/CLAUDE.md`                                                                              |
  | 04   | `products/gear/package.json`, `products/gemba/actions/gemba-bootstrap/fit-install.sh`, and the reference consumer's `agent-dispatch.yml`                                                 |

- **Verify before each cut.** `bun run check` and `bun run test` pass on each
  part's branch before it merges. Part 04 tags only commits already on `main`.
- **Success criteria.**

  | Criterion  | Verifies at                                                              |
  | ---------- | ------------------------------------------------------------------------ |
  | 1, 2, 5    | Part 02's branch                                                         |
  | 3, 4       | Part 03's branch. Each spans two files, one owned by part 02 and one by part 03. Part 01 lands criterion 3's test half. |
  | 6, 8, 9, 12 | Part 03's branch                                                        |
  | 11         | Part 04 tier 3                                                           |
  | 7          | Part 04 tier 4, one dispatch run after part 03 merges                    |
  | 10         | The reference consumer's own pull request, part 04 tier 5                |

## Risks

| Risk                                                                                                                                                                                                                                                                             | Mitigation                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A bridge dispatch that trips the killswitch loses its terminal verdict. Today `kata-dispatch.yml` posts the `curl` placeholder on that path, because the placeholder needs no installed binary. After this change the callback step calls `gemba-harness`, which the failed run never installed. | design-a.md § Step sequence accepts the pre-bootstrap gap. This row names the killswitch as its most common case, so the approver weighs it beside spec.md § Accepted regression. Overturning it means a bridge-side dispatch timeout, which is its own change. |
| `.github/CLAUDE.md` sits at exactly 768 of its 768-word cap, so any net addition reddens `jidoka instructions` inside `bun run check`.                                                                                                                                          | Part 03 step 6 budgets an offsetting trim in the same edit and verifies with the tool.                                                                                                                                                            |
| Dispatch runs move from the workflow's `actions/checkout` v7.0.1 pin to `kata-agent`'s v6 pin, and to a different `create-github-app-token` v3 SHA. Both are older.                                                                                                              | Dependabot scans `products/kata/actions/*/action.yml` on its `github-actions` ecosystem and carries the bumps. The plan does not repin them here, because that widens part 02 beyond the design.                                                   |
| `Release: Tag` tags only commits reachable from the default branch, and a squash merge leaves the branch's own commits off `main`. A SHA copied from the pull request is untaggable.                                                                                             | Each tier reads the SHA from `main` after the merge, never from the pull request.                                                                                                                                                                 |
| The reference consumer's dispatch workflow carries a queue-depth concurrency policy and a job timeout the monorepo's lacks.                                                                                                                                                      | spec.md § Excluded keeps both in the workflow. Part 04 tier 5 preserves the consumer's values and changes only the steps.                                                                                                                          |
