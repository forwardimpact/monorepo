# Plan 2360-a: event ticks, an 8-hour window, and a parameter sheet

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

The plan takes the design's default landing order. It starts from the state that
every part of spec 2350 leaves on `main`, which
[plan 2350-a part 03](../2350-dispatch-chain-triage/plan-a-03.md) describes for
the watchdog and setup files. Part 01 moves the watchdog: the monorepo workflow,
the `kata-setup` watchdog template, and the guide change together, as the design
requires, with the README, the CLI help, the `gemba-watchdog` skill, and
`KATA.md`. Part 02 turns `kata-setup` into the defaults-first procedure: two
parameter references become the one home of every default, every template points
at them, and the getting-started page follows. Part 03 lists what the next
routine release carries and forces no version. No part changes action or CLI
logic.

Libraries used: none.

## Decisions the design leaves open

| Decision                                | Detail                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two source pull requests                | Part 01 touches the watchdog surface, which `kata-release-merge` merges only on a trusted human's signal pinned to the head. Part 02 touches no watchdog surface. Two pull requests keep that gate on the smaller diff.                                                                      |
| The template bridges parts 01 and 02    | Part 01 writes the whole watchdog template with its own placeholder table, the convention every template follows on `main` at that point. Part 02 rewrites the intro and replaces every template's table with a pointer to the parameter references. Each default has one home between merges. |
| Five kinds of Default cell              | A value (a fixed default), `derived:` (computed per file and checked against its rule), `template` (the template's shape, shown on the sheet), `as shift` (the shared working-copy value), and `read:` (a repository variable setup never writes).                                          |
| The working copy on an existing install | Each parameter row takes its value from its file. A shared placeholder takes the `agent-shift.yml` value. The sheet still shows each file's own value, so a disagreement is visible.                                                                                                       |
| Regeneration fans out                   | The design regenerates the files whose rows changed. A zone change touches the shift and storyboard crons. A roster change touches the shift, dispatch, and storyboard files. Each regenerated file that existed shows its diff.                                                            |
| Timezone sample and bot rule            | The latest 100 default-branch commits whose author name does not end in `[bot]`. Web-UI merges keep the author's own offset, so they vote. `+0000` votes drop when any other offset remains, because agent commits carry `+0000`. A tie goes to the zone listed first. UTC is listed last.   |
| Zone read back                          | The sheet reads the zone as the `schedules.md` block whose three crons `agent-shift.yml` carries, or `custom`.                                                                                                                                                                            |
| Files follow the roster                 | Dispatch needs `product-manager` on the roster. Storyboard and coaching need `improvement-coach`. A roster change writes each file the new roster needs and deletes none. |
| The hosted watchdog delta               | Delete the engage job, the `inputs:` block, and `WATCHDOG_VARIABLE`. Append one step to `assess` that fails the run on an `engage` verdict.                                                                                                                                                |
| One quoting form for the default branch | The monorepo workflow quotes `"main"` in its three places. The template quotes the placeholder, and the guide fills it with `main`. The copies then differ only in placeholder lines and the guide's `MY_` names.                                                                          |
| The guide's replay rows                 | Part 01 deletes the two spec 2350 calibration rows that replay 32 over 2 hours, so the retired literals leave the guide. The gate rows stay.                                                                                                                                              |
| The CLI states the rule                 | Part 01 puts the rule in the `assess --threshold` and `--window-hours` descriptions, beside the new examples.                                                                                                                                                                            |
| Rehearsal harness                       | A throwaway private repository with no commit, Actions disabled, dummy secrets, the packs installed uncommitted, and the branch's `kata-setup` copied over the installed one. A fresh sub-agent follows it. The implementer answers as the operator.                                       |
| Release                                 | Part 03 forces no version. The routine sweep names `gemba` from part 01's changes. The `kata-setup` pack and the bundle ride the next `gear` bump, as the design says.                                                                                                                     |

Deviations from the design, with reasons:

- **Placeholder names.** The design names each placeholder as its key in upper
  snake case. Each new placeholder follows that rule, with its file as a prefix
  where the key alone is generic, such as `cron` or `interval`:
  `{{WATCHDOG_CRON}}`, `{{WATCHDOG_THRESHOLD}}`, `{{WATCHDOG_WINDOW_HOURS}}`,
  `{{DEFAULT_BRANCH}}`, `{{DISPATCH_MAX_TURNS}}`,
  `{{DISPATCH_TIMEOUT_MINUTES}}`, and `{{DEPENDABOT_INTERVAL}}`. The existing
  names stay. `{{MODEL}}` fills two keys, and the ref and cron placeholders fill
  no single key, so a rename gains nothing.
- **Shape rows stay literals.** The design makes every template default a
  placeholder, and its watchdog template names four placeholders. The plan adds
  `{{WATCHDOG_CRON}}`, because the cron is a default. The triggers, leads,
  concurrency, latch name, and ecosystem are the templates' shape. The design's
  own sheet shows them, and its watchdog template keeps the triggers literal.
  They stay literals, shown as `template` rows. The loop answers a change to one
with its Home, so the sheet shows rows the loop does not change, which narrows
spec item 12. The dispatch trigger classes were an operator choice before this
spec. Step 5 diffs each file against its render and asks before a regeneration
overwrites a hand edit; when the operator declines, the edit stays.
- **One form of the sizing rule.** The design words the rule as "the longest
  gap between the ticks your repository actually receives". Event ticks shorten
  the gap between all runs, so every home says "the longest gap between the
  scheduled runs" the repository receives.
- **The watchdog checklist item.** The design's new DO-CONFIRM item checks
  that the watchdog carries the defaults. The sheet item already checks every
  value against its file, and Step 4's fresh-sheet check covers the defaults. An
operator change makes "carries the defaults" false by design. So the watchdog
item checks the triggers, the absent gate, and the hosted variant.

Out of scope, by decision: the `libwatchdog` README composes rules with
`activityRules(32)` as an API example, not a sizing default, and the spec does
not list it. The `monorepo-setup` gaps go to an issue (part 02 step 9). A
standing invariant for the workflow copies, and the spec's two follow-up
findings, go to issues (part 01 step 8).

## Parts

| Part               | Title                                                 | Depends on                                  |
| ------------------ | ----------------------------------------------------- | ------------------------------------------- |
| [01](plan-a-01.md) | Watchdog tick, window, threshold, and the sizing rule | spec 2350 part 03 merged                    |
| [02](plan-a-02.md) | Defaults-first setup and the parameter sheet          | part 01 merged, for the merge and rehearsal |
| [03](plan-a-03.md) | What the next routine release carries                 | parts 01 and 02 merged                      |

## Execution

- **Agent route.** Parts 01 and 02 go to `staff-engineer`. Part 01 changes a
  trust-sensitive workflow. Part 02 needs live rehearsals, so it runs in a
  session that holds a human operator's own `gh` login, because an App token
  cannot create or delete a repository. Part 03 goes to `release-engineer`,
  inside its next routine cut. Writes under `.claude/` go through
  `echo … | bunx gemba-selfedit <path>` on the branch when the harness blocks
  them.
- **Order.** The implementer can draft part 02 beside part 01. Part 02 rebases
  on part 01 after part 01 merges, and it rehearses on that state. Part 03
  runs at the first routine cut after both merge.
- **Merge gate.** Part 01 merges only on a trusted human's explicit signal
  pinned to its head (`kata-release-merge` § Settings diffs). Part 02 follows
  the normal gate.
- **Source ownership.** Part 01 writes `workflow-watchdog.md` whole. Part 02
  then rewrites its intro.

  | Part | Owns                                                                                                                                                                                                                                                                       |
  | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 01   | `.github/workflows/watchdog.yml`, `products/gemba/actions/gemba-watchdog/README.md`, `products/gemba/bin/gemba-watchdog.js`, `websites/gemba/docs/guard-activity/index.md`, `.claude/skills/gemba-watchdog/SKILL.md`, the watchdog paragraph of `KATA.md`, the YAML and hosted delta of `workflow-watchdog.md` |
  | 02   | `.claude/skills/kata-setup/` except the template's YAML and hosted delta, `websites/kata/docs/getting-started/index.md`, `websites/kata/docs/continuous-improvement/daily-storyboard/index.md`, and the two setup lines of `KATA.md`                                  |
  | 03   | Nothing of its own. The routine cut owns its `version` fields and tags                                                                                                                                                                                                    |

- **Verify before each merge.** `bun run check`, `bun run test`, and
  `bunx jidoka invariants` pass on each part's branch.
- **Success criteria.**

  | Criterion        | Verifies at                                         |
  | ---------------- | --------------------------------------------------- |
  | 1, 2, 3, 4, 5, 9 | Part 01's branch; 2 and 3 live after part 01 merges |
  | 6, 7, 8, 10–15   | Part 02's branch and its rehearsal transcripts      |
  | 16               | Every part                                          |

## Risks

| Risk                                                                                                                                                       | Mitigation                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spec 2350 part 03 can merge with wording that differs from its plan, and parts 01 and 02 edit that text.                                                   | Part 02 replaces `SKILL.md` whole. Part 01 replaces the guide's threshold section whole and matches the one dispatch-gate sentence by meaning. Before either starts, diff the merged files against plan 2350-a part 03. |
| Every comment queues a watchdog run, and each new event cancels the waiting one, so a busy day fills the run list with cancelled watchdog runs.             | The spec accepts it. Do not filter the run list in any check by conclusion `cancelled`.                                                                                                                           |
| `SKILL.md` lands at 1,275 of 1,280 words, and `parameters-agents.md` at 746 of 768. Matching the wording spec 2350 merges can breach the cap. | Adapt by meaning inside the same sentences. The coaching table is the next text to move, into `parameters-guard.md`. |
| `monorepo-setup` runs `kata-setup` before the remote exists. | The new skill generates with no remote and lists the missing credentials. The part 02 issue hands the stale prompts and the order to their owner. |
| A repository whose recent history holds only agent commits, or only UTC humans, gives no non-zero offset, so the timezone falls back to UTC. | The sheet names the zone and its source, and one change fixes it. Rehearsal R1 shows the UTC path.                                                                                                                 |
| The three workflow copies (the monorepo file, the template, the guide) can drift after this spec, because only these plan steps diff them.                 | Part 01 states the diff. A standing invariant is new scope, so the implementer files it as a follow-up issue with the part 01 pull request.                                                                       |
| No routine cut bumps `gear` for a long time, so version-pinned `kata-skills` installs keep the interview. | The sibling's `main` carries the change on merge. Part 03 step 2 names the check, and the release engineer can bump `gear` when the lag matters. |

— Staff Engineer 🛠️
