# Plan 2340-a: `kata-agent` runs the dispatch

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

CONTRIBUTING.md § Releasing sets the part boundaries, because a consumer may
pin its producer only after the producer ships: part 01 carries the source that
ships in the gear bundle and in `gemba-bootstrap`, part 02 gives `kata-agent`
the five inputs and the stamp against the `gemba-bootstrap` release part 01
produced, part 03 turns the wrapper, the template, and the instruction surfaces
over to the `kata-agent` release part 02 produced, and part 04 runs the cuts
between them and the reference consumer.

Libraries used: libharness (`callback` command, `sumTraceCost`), libmock
(`createMockFs` in the callback test).

## Scope notes for the approver

Four decisions the spec and the design leave open. Each is the approver's to
overturn.

| Decision                      | Detail                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Four pull requests            | spec.md § Rollout constraint names three sibling releases between the source change and the repin. Part 02 pins a `gemba-bootstrap` SHA that exists only after part 01 ships. Part 03 pins a `kata-agent` SHA that exists only after part 02 ships. No two of these parts can share a pull request.                                                 |
| Three extra workflow pins     | spec.md § Included names `.github/workflows/kata-dispatch.yml` alone, and design-a.md § Token stamp says shift, storyboard, and coaching "gain the stamp with no change to their workflows". That holds only once they pin a `kata-agent` release carrying the stamp. Part 03 step 2 moves those three pins, which is the change the design implies but does not name. |
| Two pins repaired in part 02  | `kata-agent` pins `actions/checkout` at v6 and an older `create-github-app-token` v3 SHA than `kata-dispatch.yml` does. Packaging the dispatch would move every dispatch run onto the older pair permanently, because `.github/dependabot.yml` scopes its `github-actions` ecosystem to `/` and `/.github/actions/*` and never scans `products/kata/actions/`. Part 02 step 3 repairs both. |
| Nine files outside § Included | See the table below. Each carries a statement this change makes false, or rides the release chain the spec requires.                                                                                                                                                                                                                                |

| File outside spec § Included                            | Part | Why it changes                                                                                                                  |
| ------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| `products/gemba/bin/gemba-harness.js`                   | 01   | The `--trace-file` help does not say the flag is optional. After this change it must.                                            |
| `libraries/libharness/src/events/github.js`             | 01   | design-a.md § Removed names its docstring, which cites a `kata-dispatch.yml` step that no longer exists.                         |
| `libraries/libharness/test/events-github.test.js`       | 01   | One test name cites the same retired step.                                                                                       |
| `products/gemba/actions/gemba-harness/README.md`        | 01   | design-a.md § Components names it: the callback recipe drops the trace-file guard.                                               |
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
  JavaScript, action YAML, or workflow YAML, so no part is docs-only. Request a
  `technical-writer` review on part 03's own pull request for the prose it adds
  to `workflow-dispatch.md`, `SKILL.md`, and `x-auth-anomaly.md`. Part 04 tiers
  1 to 3 go to `release-engineer`. Tier 4 needs an HTTPS endpoint the runner can
  read, so it goes to an operator. Tier 5 goes to `staff-engineer`.
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
  | 04   | `products/gemba/actions/gemba-bootstrap/fit-install.sh`, the reference consumer's `agent-dispatch.yml`, and the `version` field of any package the release sweep names                           |

- **Verify before each cut.** `bun run check` and `bun run test` pass on each
  part's branch before it merges. Part 04 tags only commits already on `main`.
- **Success criteria.**

  | Criterion   | Verifies at                                                                                                                   |
  | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
  | 1, 2, 5     | Part 02's branch                                                                                                              |
  | 3           | Part 03's branch. It spans three files: part 01 lands the test, part 02 clears `curl` from `action.yml`, part 03 from the workflow. |
  | 4           | Part 03's branch. Part 02 adds the stamp, part 03 clears it from `.github/workflows/`.                                         |
  | 6, 8, 9, 12 | Part 03's branch                                                                                                              |
  | 11          | Part 03's branch. Tier 3 lands the tag half; the "SHA `kata-dispatch.yml` pins" half exists only once part 03 writes that pin. |
  | 7           | Part 04 tier 4, one dispatch run after part 03 merges                                                                         |
  | 10          | The reference consumer's own pull request, part 04 tier 5                                                                     |

## Risks

| Risk                                                                                                                                                                                                                                                                             | Mitigation                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A bridge dispatch that trips the killswitch loses its terminal verdict. Today `kata-dispatch.yml` posts the `curl` placeholder on that path, because the placeholder needs no installed binary. After this change the callback step calls `gemba-harness`, which the failed run never installed. | design-a.md § Step sequence accepts the pre-bootstrap gap. This row names the killswitch as its most common case, so the approver weighs it beside spec.md § Accepted regression. Overturning it means a bridge-side dispatch timeout, which is its own change. |
| Dispatch wiki writes move from the workflow's pinned `gemba-wiki@ad00429… # v1.0.2` onto `kata-agent`'s internal `gemba-wiki@v1`, a mutable tag.                                                                                                                                | `.github/CLAUDE.md` § Third-party actions sanctions a sibling pinning its own internal `uses:` at `@v1`. The change is real and this row discloses it. Reversing it means SHA-pinning inside `kata-agent`, which the design does not ask for. |
| `.github/CLAUDE.md` sits at exactly 768 of its 768-word cap, so any net addition reddens `jidoka instructions` inside `bun run check`.                                                                                                                                          | Part 03 step 6 budgets an offsetting trim in the same edit and verifies with the tool. The edit lands back at exactly 768, measured.                                                                                             |
| `Release: Tag` tags only commits reachable from the default branch, and a squash merge leaves the branch's own commits off `main`. A SHA copied from a pull request is untaggable.                                                                                               | Each tier reads the SHA from the sibling repository's tag after the merge, never from the pull request.                                                                                                                          |
| The reference consumer's dispatch workflow carries a queue-depth concurrency policy and a job timeout the monorepo's lacks.                                                                                                                                                      | spec.md § Excluded keeps both in the workflow. Part 04 tier 5 preserves the consumer's values and changes only the steps.                                                                                                        |
