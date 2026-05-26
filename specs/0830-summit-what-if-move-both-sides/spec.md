# Spec 0830 — `fit-summit what-if --move` shows impact on both teams

## Problem

`fit-summit what-if <source-team> --move <member> --to <dest-team>` simulates
moving a person between two reporting teams but renders only the source team's
coverage and risk diff. Engineering leaders evaluating a move have to run the
command twice — once with each team as the positional argument — to see the
full picture, and even then the two diffs are returned in separate invocations
they have to mentally compose.

This is a long-standing gap, not a new request:

- **User-testing finding (issue #331, 2026-04-11).** Reporter expected the
  `--move` diff to show both sides because the natural framing of the question
  is "what happens to my org if I move this person?", not "what does the source
  team lose?". The one-sided output was experienced as incomplete.
- **Original product specification (`specs/0090-summit-product/spec.md`,
  lines 377–392).** The Summit product spec includes a worked example of
  `what-if --move` rendering "Platform impact" and "Payments impact" as
  side-by-side sections with a `Net:` summary. The two-sided rendering is the
  documented intended behaviour.
- **Implementation regression.** The current command handler computes only the
  source team's before/after snapshots — `products/summit/src/commands/what-if.js`
  lines 43–56 take a single `target` (the positional arg) and pass that
  team's snapshots through `diffCoverage` / `diffRisks` and into the formatters.
  The mutation function `doMove` (`products/summit/src/aggregation/what-if.js`
  lines 193–217) already moves the member from source to destination on the
  cloned roster, so the destination team's after-state is computable from the
  same `mutated` roster the command already produces. Nothing about the
  underlying computation blocks two-sided rendering; the command stops short of
  asking for it.

The CLI `--help` text does not flag the asymmetry. A user reading the help
output for `--move` cannot tell that the positional team arg is interpreted as
the team that loses the member rather than as a neutral context for the
scenario.

### JTBD

The job served is **Engineering Leaders → Staff Teams to Succeed**
([JTBD.md § Engineering Leaders: Staff Teams to Succeed](../../JTBD.md#engineering-leaders-staff-teams-to-succeed)).
A leader's Big Hire is "make staffing decisions I can defend by seeing what
each role requires" — a move decision is defensible only if both teams' impact
is visible together. A one-sided diff competes with "gut feel" rather than
displacing it.

## Goal

The `what-if --move` output presents both the source and destination teams'
coverage and risk diffs in a single invocation, in all three output formats
(text, JSON, markdown). The user no longer has to invoke the command twice to
see the destination side, and the rendered output makes which team is which
unambiguous on the page (or in the JSON document) without the user remembering
which positional argument they typed.

The destination-team fields are confined to `--move` scenarios. `--add`,
`--remove`, and `--promote` continue to render exactly one team's diff
(the target team) — they do not have a second team and the output shape is
unchanged for them.

## Scope (in)

| Surface                                         | File                                                    | What changes                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command handler                                 | `products/summit/src/commands/what-if.js` (43–77)       | For `--move` scenarios, compute the destination team's before/after snapshots in addition to the source team's, and pass both pairs of diffs to the formatters.                           |
| Text formatter                                  | `products/summit/src/formatters/what-if/text.js`        | For `--move` scenarios, render two labelled sections (one per team) covering capability changes and risk changes; preserve the existing single-section layout for non-move scenarios.     |
| JSON formatter                                  | `products/summit/src/formatters/what-if/json.js`        | For `--move` scenarios, emit a document that names both teams and carries each team's diffs; preserve the current shape exactly for non-move scenarios.                                   |
| Markdown formatter                              | `products/summit/src/formatters/what-if/markdown.js`    | For `--move` scenarios, render two labelled sections analogous to the text formatter; preserve the current single-table layout for non-move scenarios.                                    |
| Tests                                           | `products/summit/test/what-if.test.js` (and siblings)   | Cover destination-team computation and formatter output for `--move` in all three formats; cover non-move scenarios remaining unchanged.                                                  |
| CLI `--help`                                    | `products/summit/bin/fit-summit.js` (105–136)           | Help text for the `what-if` `<team>` positional and the `--move`/`--to` options makes clear that the positional team arg is the source team for `--move` and that the diff covers both teams. |

## Scope (out)

- **Mutation behaviour.** `doMove`
  (`products/summit/src/aggregation/what-if.js` lines 193–217) already produces
  the correct mutated roster; nothing about it changes. Cross-type moves (the
  "reporting teams only" guard at line 201) and the not-found errors stay as
  they are.
- **Diff functions.** `diffCoverage` and `diffRisks` are already pure functions
  of two snapshots; they continue to be called per-team without modification.
- **Other scenario types.** `--add`, `--remove`, `--promote` keep their current
  output shapes byte-for-byte. The both-sides rendering applies only to
  `--move`.
- **Project-team moves.** `--move` is currently restricted to reporting teams.
  This spec does not lift that restriction.
- **A `Net:` narrative summary.** The original spec 0090 example showed a
  `Net: ...` line ("Payments gains more than Platform loses…"). Producing that
  narrative requires a model decision (what is "more"? coverage delta? risk
  count?). It is out of scope here; the two-sided diff itself is the headline
  improvement and the narrative can be a follow-up.
- **`fit-summit compare`.** A separate `compare` subcommand exists for
  side-by-side team comparison and is not affected.
- **The web UI surface.** Summit has an `InvocationContext`-bound web view per
  `products/CLAUDE.md` § Invocation context; this spec leaves the web rendering
  changes (if any) to the design step, since the contract change for `--move`
  flows through the shared presenter.

## Success criteria

| #  | Claim                                                                                                                                                                                                                                                  | Verification                                                                                                                                                                                                                                                                                                                                                                                       |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | A single invocation of `fit-summit what-if <src> --move <name> --to <dst>` shows the source team's capability diff, the source team's risk diff, the destination team's capability diff, and the destination team's risk diff in the text format.     | Integration test: invoke the text formatter against a fixture where the moved member changes capability depth and resolves a single-point-of-failure on the destination team; assert all four sections appear; assert each section is labelled with its team id; assert source-team and destination-team capability changes are not interleaved in the same section.                              |
| 2  | The JSON output for a `--move` scenario carries one diff entry per team, each labelled with its `teamId`, such that a reader can attribute a `capabilityChanges` array and a `riskChanges` object to each team without consulting the original CLI invocation. The shape is fixed in the design and is the same for every `--move` invocation. JSON consumers branch on `scenario.type === "move"` to read the move-shaped document; non-move documents keep their current shape (criterion 4). | Integration test: invoke the JSON formatter on the same fixture; parse the result; assert there is exactly one diff entry for `<src>` and one for `<dst>`, each carrying a `teamId` field, a `capabilityChanges` array, and a `riskChanges` object. Static inspection: the design names the precise top-level shape (e.g. `teams: [...]` array vs. `source`/`destination` keys) and the JSON formatter implements that shape. |
| 3  | The markdown output for a `--move` scenario renders two labelled sections, one per team, each carrying its own capability-changes table.                                                                                                                | Integration test: invoke the markdown formatter on the same fixture; assert two distinct headings naming the source and destination teams precede their respective tables.                                                                                                                                                                                                                          |
| 4  | Non-move scenarios (`--add` reporting-team, `--add --project --allocation`, `--remove`, `--promote`, `--promote --focus`) produce byte-identical output to the pre-change implementation for text, JSON, and markdown.                                | Snapshot test: capture text/JSON/markdown output for the five named scenarios before the change merges and commit the captured outputs as fixtures under `products/summit/test/fixtures/what-if/<scenario-id>.{txt,json,md}`; the post-change test reads each fixture and asserts equality against the post-change output. The fixtures are part of the implementation PR's diff so the baseline is reproducible long after the change merges. |
| 5  | A user reading `fit-summit what-if --help` learns that the positional team arg is the source team for `--move` and that the diff covers both teams.                                                                                                     | Static inspection: the libcli definition's option help (or section description) for `--move`/`--to` includes language identifying source and destination roles and stating that the move output covers both.                                                                                                                                                                                       |
| 6  | When the moved member's transit changes risk on the destination team (e.g. resolves a single-point-of-failure), that risk change appears in the destination team's risk section of the text output, not the source team's.                              | Unit test on the integration formatter or the command handler: fixture chosen so the member's arrival removes a destination-team SPOF; assert the SPOF removal is rendered under the destination team label and is not rendered under the source team label.                                                                                                                                       |
| 7  | A `--move` invocation applies the scenario exactly once: the destination-team's after-snapshot reflects the same roster mutation the source-team's after-snapshot does, with no divergence between the two teams' views of which member moved.        | Behavioural test: construct a fixture where the moved member is the only person carrying a particular skill on either team; invoke the command; assert the source team's after-snapshot shows that skill removed and the destination team's after-snapshot shows it gained, against the same `mutated` roster. (The HOW — whether this is one `applyScenario` call or several — is a design decision.)                                  |

## Notes — evidence pointers (for design)

- One-sided computation today: `runWhatIfCommand`
  (`products/summit/src/commands/what-if.js` 27–77) — single `target` resolved
  from positional args, single `before`/`after` snapshot pair.
- Mutation already moves on both teams: `doMove`
  (`products/summit/src/aggregation/what-if.js` 193–217) — the cloned roster's
  destination team already carries the moved member after `applyScenario`
  returns, so a second snapshot at `{ teamId: scenario.toTeamId }` over the
  same `mutated` roster is sufficient.
- Diff functions are per-team and already pure: `diffCoverage`, `diffRisks`
  (`products/summit/src/aggregation/what-if.js` 50–144).
- Scenario shape carries the destination id: `parseScenario`
  (`products/summit/src/aggregation/scenarios.js` 81–88) — `scenario.toTeamId`
  is populated for every move scenario; the formatter and JSON shapes can
  rely on it.
- Existing test coverage: `products/summit/test/what-if.test.js` 122–138
  exercises `applyScenario move` mutation but does not exercise the
  formatters' move output. The new tests add formatter coverage for `--move`
  and snapshot coverage for the unchanged formats of other scenario types.
- Original product spec example: `specs/0090-summit-product/spec.md` 377–392.
- Issue: [#331](https://github.com/forwardimpact/monorepo/issues/331).
