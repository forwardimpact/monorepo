# Plan 2340-a: `kata-agent` runs the dispatch

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

CONTRIBUTING.md § Releasing sets the part boundaries, because a consumer may
pin its producer only after the producer ships: part 01 carries the source that
ships in the gear bundle and in `gemba-bootstrap`, part 02 gives `kata-agent`
the five inputs and the stamp against the `gemba-bootstrap` release part 01
produced, part 03 turns the wrapper, the template, and the instruction surfaces
over to the `kata-agent` release part 02 produced, part 04 cuts the three
releases between them, and part 05 accepts the result and updates the reference
consumer.

Libraries used: libharness (`callback` command, `sumTraceCost`), libmock
(`createMockFs` in the callback test).

## Scope notes for the approver

Four decisions the spec and the design leave open. Each is the approver's to
overturn.

| Decision                          | Detail                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Four pull requests                | spec.md § Rollout constraint names three sibling releases between the source change and the repin. Part 02 pins a `gemba-bootstrap` SHA that exists only after part 01 ships. Part 03 pins a `kata-agent` SHA that exists only after part 02 ships. No two of these parts can share a pull request.                                                 |
| Three extra workflow pins         | spec.md § Included names `.github/workflows/kata-dispatch.yml` alone, and design-a.md § Token stamp says shift, storyboard, and coaching "gain the stamp with no change to their workflows". That holds for their step inputs and needs their pins to move. Part 03 step 2 moves them, which is the change the design implies without naming.       |
| Stale action pins left alone      | `kata-agent` pins `actions/checkout` at v6 and an older `create-github-app-token` SHA than `kata-dispatch.yml` does, so packaging moves dispatch runs onto the older pair. Repairing it inside `kata-agent` would ship a `checkout` **major** bump to every external consumer, and would still leave the same stale pair in `gemba-wiki`, `gemba-bootstrap`, and `kata-interview`, which `kata-agent` invokes. Part 02 step 3 routes the root cause (Dependabot never scans `products/*/actions/`) to an issue instead. The § Risks row records the move. |
| Stamp playbook states a rule      | design-a.md § Components asks § Stampless surfaces to name what remains, "`kata-interview` and sessions outside Actions". That inventory is incomplete: `eval-guide.yml` runs a stampless `gemba-harness` session and three more `eval-*` workflows run stampless `gemba-benchmark` sessions. Part 03 step 5 names `kata-interview` as the design asks and adds a rule instead of a closed list, because the file ships to installations this repository never sees. |

| File outside spec § Included                            | Part | Why it changes                                                                                                                  |
| ------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| `products/gemba/bin/gemba-harness.js`                   | 01   | The `--trace-file` help does not say the flag is optional. After this change it must.                                            |
| `libraries/libharness/src/events/github.js`             | 01   | design-a.md § Removed names its docstring, which cites a `kata-dispatch.yml` step that no longer exists.                         |
| `libraries/libharness/test/events-github.test.js`       | 01   | One `describe` name cites the same retired step.                                                                                 |
| `products/gemba/actions/gemba-harness/README.md`        | 01   | design-a.md § Components names its callback recipe. Its task-source table also names two of the three sources the action declares. |
| `products/gemba/actions/gemba-bootstrap/README.md`      | 01   | It documents the `bun-version` input that `action.yml` changes.                                                                  |
| `products/gemba/actions/gemba-bootstrap/fit-install.sh` | 04   | Tier 2 of the release chain. Nothing consumes the new gear bundle until this default moves.                                      |
| `.github/workflows/kata-shift.yml`                      | 03   | Row 2 above.                                                                                                                     |
| `.github/workflows/kata-storyboard.yml`                 | 03   | Row 2 above.                                                                                                                     |
| `.github/workflows/kata-coaching.yml`                   | 03   | Row 2 above.                                                                                                                     |

Part 04 also bumps version fields in `products/gear/package.json`,
`products/gemba/package.json`, `libraries/libharness/package.json`, and the
lockfile. Those are release-cut edits rather than source changes, so the
ownership table below scopes them separately.

## Parts

| Part               | Title                                       | Depends on |
| ------------------ | ------------------------------------------- | ---------- |
| [01](plan-a-01.md) | Callback verb and bootstrap input           | —          |
| [04 tier 1-2](plan-a-04.md) | Cut `gear` and `gemba-bootstrap`   | 01         |
| [02](plan-a-02.md) | `kata-agent` runs the dispatch              | 04 tier 2  |
| [04 tier 3](plan-a-04.md) | Cut `kata-agent`                     | 02         |
| [03](plan-a-03.md) | Wrapper, template, and instruction surfaces | 04 tier 3  |
| [05](plan-a-05.md) | Acceptance run and the reference consumer   | 03         |

## Execution

- **Agent route.** Parts 01, 02, 03, and 05 go to `staff-engineer`. Each
  carries JavaScript, action YAML, or workflow YAML, so no part is docs-only.
  Request a `technical-writer` review on part 03's own pull request for the
  prose it adds to `workflow-dispatch.md`, `SKILL.md`, and `x-auth-anomaly.md`.
  Part 04 goes to `release-engineer`. Part 05 step 1 needs an HTTPS endpoint
  whose request log a person can read, so pair with an operator for it.
- **Strictly sequential.** No two parts run in parallel. Each code part pins a
  release the previous part produced. Part 04's tiers interleave with the code
  parts in the order the Parts table lists.
- **Source ownership.** Each source file has exactly one owning part, so no two
  parts make a source change to one file.

  | Part | Owns                                                                                                                                                                                            |
  | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 01   | `libraries/libharness/src/` and `test/`, `products/gemba/bin/gemba-harness.js`, `products/gemba/actions/gemba-harness/README.md`, and `action.yml` plus `README.md` under `products/gemba/actions/gemba-bootstrap/` |
  | 02   | `products/kata/actions/kata-agent/`                                                                                                                                                             |
  | 03   | `.github/workflows/`, `.claude/skills/kata-setup/`, `.claude/agents/x-auth-anomaly.md`, `.github/CLAUDE.md`                                                                                      |
  | 04   | `products/gemba/actions/gemba-bootstrap/fit-install.sh`, and the `version` field of `products/gear/package.json` plus any package the release sweep names                                        |
  | 05   | The reference consumer's `agent-dispatch.yml`                                                                                                                                                   |

- **Verify before each cut.** `bun run check` and `bun run test` pass on each
  part's branch before it merges. Part 04 tags only commits already on `main`.
- **Success criteria.**

  | Criterion   | Verifies at                                                                                                                                     |
  | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 1, 2, 5     | Part 02's branch                                                                                                                                |
  | 3           | Part 03's branch. Part 01 lands the test. `kata-agent/action.yml` carries no `curl` today, so part 02 only has to add none. Part 03 removes the workflow's. |
  | 4           | Part 03's branch. Part 02 adds the stamp, part 03 clears it from `.github/workflows/`.                                                           |
  | 6, 8, 9, 12 | Part 03's branch                                                                                                                                |
  | 11          | Part 03's branch. Tier 3 lands the tag half; the "SHA `kata-dispatch.yml` pins" half exists only once part 03 writes that pin.                   |
  | 7           | Part 05 step 1, one dispatch run after part 03 merges                                                                                           |
  | 10          | The reference consumer's own pull request, part 05 step 2                                                                                       |

## Risks

| Risk                                                                                                                                                                                                                                                                             | Mitigation                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A bridge dispatch that trips the killswitch loses its terminal verdict. Today `kata-dispatch.yml` posts the `curl` placeholder on that path, because the placeholder needs no installed binary. After this change the callback step calls `gemba-harness`, which the failed run never installed. | design-a.md § Step sequence accepts the pre-bootstrap gap. This row names the killswitch as its most common case, so the approver weighs it beside spec.md § Accepted regression. Overturning it means a bridge-side dispatch timeout, which is its own change. |
| Packaging moves every dispatch run onto `kata-agent`'s pins: `actions/checkout` v6 instead of v7.0.1, an older `create-github-app-token` v3 SHA, `gemba-harness` v1.0.5 instead of v1.0.4, and `gemba-wiki@v1` instead of the pinned v1.0.2.                                     | § Scope notes row 3 explains why the plan does not repair them here. Part 02 step 3 routes the Dependabot coverage gap to an issue, which is the fix that reaches all six stale pins across the four sibling actions.                              |
| The `bun-version` fallback expression runs in no repository check. `bun run test` excludes `products/gemba/actions/`, and every workflow stays on the old `gemba-bootstrap` until part 03. Its first live execution is a `kata-*` run after part 03 repins all four workflows.  | Tiers 2 and 3 read it statically at the tagged SHA. Part 05 step 1's acceptance run is its first live exercise, and it runs before the reference consumer adopts anything.                                                                        |
| One pull request (part 03) moves all four `kata-*` workflows onto a `kata-agent` release that also carries a new `gemba-bootstrap`, a new gear bundle, and the pin moves above.                                                                                                  | Roll back by reverting part 03's pin commit, which returns all four workflows to `v1.0.9`. The sibling releases are append-only and stay valid, so no tag needs deleting.                                                                          |
| `.github/CLAUDE.md` sits at exactly 768 of its 768-word cap, and `kata-setup/SKILL.md` at exactly its 192-line cap. Either edit can redden `jidoka instructions` inside `bun run check`.                                                                                        | Part 03 step 6 budgets an offsetting trim, measured back to exactly 768. Part 03 step 4 net-removes lines from `SKILL.md`.                                                                                                                        |
| `Release: Tag` tags only commits reachable from the default branch, and a squash merge leaves the branch's own commits off `main`. A SHA copied from a pull request is untaggable.                                                                                               | Each tier reads the SHA from the sibling repository's tag after the merge, never from the pull request.                                                                                                                                           |
| The reference consumer's dispatch workflow carries a queue-depth concurrency policy and a job timeout the monorepo's lacks.                                                                                                                                                      | spec.md § Excluded keeps both in the workflow. Part 05 step 2 preserves the consumer's values and changes only the steps.                                                                                                                         |
