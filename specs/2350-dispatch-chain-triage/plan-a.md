# Plan 2350-a: a self-caused gate before checkout

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Three source parts own disjoint files: part 01 changes `libharness` (the actor
line, `stand_down`, the prompts, the trace verbs), part 02 changes the
`kata-agent` action and adds its test workflow, and part 03 changes the watchdog
tick, the `kata-setup` skill, the guides, and the `libwatchdog` jobs block. Part
04 is the release chain CONTRIBUTING.md § Releasing forces between a
`libharness` change and a `kata-agent` run that shows it: the gear bundle, the
installer pin, the `kata-agent` pin of `gemba-bootstrap`, the `kata-agent` cut,
and this repository's pins. The gate needs no release to test, because part 02's
workflow runs the action from the checkout. Part 03 is one pull request with no
other content, because spec 2360 replaces its numbers and its template next.

Libraries used: libharness (`composeTaskFromGitHubEvent`, `resolveTaskContent`,
`concludeSession`, `TraceCollector`, `TraceQuery`, `sumTraceCost`), libmock
(`createMockFs`).

## Decisions the design leaves open

| Decision                                | Detail                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The actor rule is a script file         | Part 02 puts the rule in `classify-actor.sh`; the classify step runs it through `$GITHUB_ACTION_PATH`, the way `gemba-bootstrap` runs `fit-install.sh`. The step stays the one home the design names.                                                                                                                                                     |
| Four action outputs                     | Part 02 declares `actor-class`, `actor-login`, `dispatch-verdict`, and `stood-down` as action outputs, because a caller cannot read a composite step's outputs. The raw verdict lets a caller tell a breach from a measurement that never ran.                                                                                                            |
| A failed measurement stands down        | The nested measurement step runs with `continue-on-error: true`, and the verdict step stands a self actor down on any verdict other than `quiet`. A download or install failure then stands the run down green, with the summary line, the way `unreadable` does.                                                                                         |
| Two readers of the orchestrator summary | The design names one reader for the overview and cost verbs. The overview verb reads the collector's capture through the trace document. The cost verb reads `orchestrator.verdict` from a structured document and `readTraceSummary` from NDJSON, the scanner the callback verb already uses.                                                            |
| The test workflow runs two sessions     | A human fixture and a no-artifact fixture reach the harness step with `mode: run`, three turns, `allowed-tools: Read`, and `wiki: "false"`. The session's own exit code is not the test: the step continues on error and the assertions read the action's outputs. The gate job admits same-repository, non-Dependabot pull requests and manual dispatch. |
| Criterion 12's literals                 | The action inputs are the one home. The README inputs table documents the two defaults as that input's own documentation, and the guide's calibration table names the rule it replays. No workflow, template, CLI flag, or other prose carries `24` or `2` as a default. Part 02 step 5 verifies it with `rg`.                                            |
| The watchdog template in hosted mode    | The template has one block. A hosted installation holds no App key, so its engage job fails at the token mint on a breach: a red run, nothing written. The reference states it; the skill points to the reference.                                                                                                                                        |
| Trace document version                  | Part 01 adds an optional `orchestrator` field to the structured trace document and moves its version to `1.3.0`.                                                                                                                                                                                                                                          |
| Gate prose merges after the gate ships  | The `kata-setup` checklist, the dispatch template, and the dispatch workflow name the gate. Part 03 merges after part 04 tier 3 cuts the `kata-agent` release that carries it, and part 04 tier 4 rewrites the workflow comments in the repin pull request.                                                                                               |
| `kata-interview` keeps `app-slug`       | design-a.md § Removals names the `kata-agent` input only. Part 02 step 6 files the `kata-interview` input as an issue.                                                                                                                                                                                                                                    |

## Parts

| Part               | Title                                              | Depends on                    |
| ------------------ | -------------------------------------------------- | ----------------------------- |
| [01](plan-a-01.md) | The actor line, `stand_down`, and the trace verbs  | —                             |
| [02](plan-a-02.md) | The gate in `kata-agent` and its test workflow     | —                             |
| [03](plan-a-03.md) | Watchdog tick, setup template, guides, and catalog | 04 tier 3, for the merge only |
| [04](plan-a-04.md) | Release chain, repin, and acceptance               | 01, 02                        |

## Execution

- **Agent route.** Parts 01 and 02 go to `staff-engineer`. Part 03 goes to
  `technical-writer`: two cron lines, two references, one skill, three doc
  pages, and one jobs block. Its writes under `.claude/skills/` go through
  `bunx gemba-selfedit` on the branch. Part 04 goes to `release-engineer`.
- **Order.** Parts 01, 02, and 03 are drafted in parallel. Part 04 starts after
  parts 01 and 02 merge. Part 03's pull request merges after part 04 tier 3, so
  the skill's `{{KATA_AGENT_REF}}` resolves to a release that carries the gate
  the skill names.
- **Source ownership.** Each file has one owning part, with one sequential
  hand-off: part 04 tier 3 moves the `gemba-bootstrap` pin line in
  `kata-agent/action.yml` after part 02 has merged.

  | Part | Owns                                                                                                                                                                                                                                             |
  | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | 01   | `libraries/libharness/src/` and `libraries/libharness/test/`                                                                                                                                                                                     |
  | 02   | `products/kata/actions/kata-agent/`, `.github/workflows/check-kata-agent.yml`, `.github/CLAUDE.md`                                                                                                                                               |
  | 03   | `.github/workflows/watchdog.yml`, `products/gemba/actions/gemba-watchdog/README.md`, `websites/gemba/docs/`, `.claude/skills/kata-setup/`, `libraries/libwatchdog/package.json`, `libraries/README.md`                                           |
  | 04   | `.github/workflows/kata-*.yml`, `products/gemba/actions/gemba-bootstrap/fit-install.sh`, `products/gear/package.json`, the lockfile, the `version` fields the release sweep names, and the `gemba-bootstrap` pin line in `kata-agent/action.yml` |

- **Verify before each merge.** `bun run check`, `bun run test`, and
  `bunx jidoka invariants` pass on each part's branch.
- **Success criteria.**

  | Criterion          | Verifies at                                                                                                            |
  | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
  | 1, 2, 3, 4, 5      | Part 02's branch: the test workflow. Criterion 5's `workflow_dispatch` path runs on a manual dispatch of that workflow |
  | 12                 | Part 02 step 5's `rg` line                                                                                             |
  | 6, 7, 8, 9, 10, 11 | Part 01's branch: unit tests. Criteria 6 and 7 verify live at part 04's acceptance run                                 |
  | 13, 14             | Part 03's branch                                                                                                       |
  | 15                 | Parts 01 and 03 for their homes; part 04 for `kata-dispatch.yml`                                                       |
  | 16                 | Every part                                                                                                             |

## Risks

| Risk                                                                                                                                                                                     | Mitigation                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec 2360 changes the watchdog numbers and the tick's role, and its plan rewrites part 03's files.                                                                                       | Part 03 carries nothing else. The watchdog literals live in `watchdog.yml`, the template, the watchdog README's usage block, and the guide's window sentence, command examples, CI wiring, and calibration table; the skill names none. That list is the next plan's inventory. |
| `kata-setup/SKILL.md` sits at 190 of its 192 lines after frontmatter, and the line budget is inclusive.                                                                                  | Part 03 step 6's edits net minus two lines after reflow; it gates on `jidoka instructions` before it commits.                                                                                                                                                                   |
| The classify step reads the mint's `app-slug` output. If the pinned `create-github-app-token` SHA did not export it, no run would ever read as `self`.                                   | The pinned SHA declares the output. Part 02's self fixture takes the slug from the same output and asserts `stood-down=true`; an empty slug fails that job.                                                                                                                     |
| The test workflow needs the App secrets and the API key, which fork and Dependabot pull requests do not carry, and the monorepo's `KATA_KILLSWITCH` variable has read truthy for months. | The gate job's `if:` admits same-repository, non-Dependabot pull requests and manual dispatch. The workflow passes no `killswitch` input.                                                                                                                                       |
| The structured trace document gains a field, and the overview verb gains a key that a stored fixture deep-equals.                                                                        | Part 01 step 7 regenerates `fixtures/trace-query-1220/` with its `build.mjs`, formats it, and runs the parity and equivalence tests.                                                                                                                                            |
| The nested `gemba-watchdog` pin inside `kata-agent` is not Dependabot-scanned, the same gap the previous action plan routed to an issue.                                                 | Part 02 pins the SHA `watchdog.yml` pins today and says in the README's dispatch-gate subsection that the pin moves by hand.                                                                                                                                                    |
| A broken nested pin (a removed asset, a stale digest) makes every self-caused run stand down green, and the brake goes dark for self-caused work while human work runs.                  | The summary line carries the raw verdict, or `unmeasured` when none ran, and the `dispatch-verdict` output carries the raw verdict or nothing. The check workflow's self case asserts `engage`, so a broken pin reddens the action's own check.                                 |
| `Release: Tag` tags only commits reachable from `main`; a squash merge leaves branch commits off `main`.                                                                                 | Every tier in part 04 reads the SHA from the sibling's tag after the merge.                                                                                                                                                                                                     |
