# Plan 2370-a: slice resolution at the read seam, a marker token, one writer rule, and the names an installation has

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

The plan follows the spec's release order in five parts. Part 01 is the
library change: `libxmr` gains the slice module and loses its built-in slice,
`libwiki` gains the marker token and the in-block notices, `product-mix` drops
its literal, and the `gemba` help examples and goldens follow. Part 02 states
the rule and the grammar on every published surface and merges right after
part 01, so the skills name a slice before any binary demands one. Part 03 is
the release train that puts the library into the gear binaries a runner
installs and repins this repository's agent workflows. Part 04 is the second
merge: the rename of this repository's four agent workflows, the bridges'
dispatch target with one home, the names across the pack and this
repository's prose, the enumeration topic, the genericity rule, and the
product-manager's `product-mix` flag, which needs the repinned binary. Part
05 rewrites this wiki's metrics history once, in an operator session, under
the killswitch.

Libraries used: libxmr (parseCSV, parseLine, normalizeSlice, validateCSV,
analyze, listMetrics, analyzeSlice, listSliceMetrics, SliceResolutionError,
CSVIntegrityError, formatTally, HEADER), libwiki (scanMarkers, renderBlock,
WikiSync.commitAndPush), libbridge (dispatchWorkflow, Dispatcher), libmock
(createMockFs, createMockSubprocess, createTestRuntime).

## Decisions the design leaves open

| Decision                       | Detail                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module homes in `libxmr`       | `src/slice.js` holds `tallySlices`, `resolveReadSlice`, `formatTally`, `SliceResolutionError`, `analyzeSlice`, and `listSliceMetrics`. `listMetrics` moves from `csv.js` to `analyze.js` beside `analyze`, and both share one `groupByMetric`. `normalizeSlice` lives in `csv.js` beside the parser that first applies it. `commands/slice.js` is deleted. `sliceLabel` joins the display formatters in `src/format.js` as a package-root export, so the commands and `libwiki`'s renderer print `*` the same way. `withReadGuard` stays in `commands/guard.js`. |
| Shared constants               | `MIN_FIELDS` and `MAX_FIELDS` derive from the two headers in `libxmr/src/constants.js`; they, `LEGACY_HEADER`, and `INTERACTIVE_EVENT_TYPE` stay module-level, and the part 05 scripts read the constants module by path. `libwiki` keeps one `ISO_DATE_RE` in its `constants.js` (moved from the audit rule builder); `libxmr` keeps its own. A cross-package date matcher is outside this spec. |
| One slice normalisation        | `normalizeSlice(value)` returns the trimmed string, or `""` for no choice. `parseLine`, `assertSlice`, `resolveReadSlice`, and `record` call it. Part 01 step 1 holds it.                                                                                                                                                                                                               |
| Tally and error text           | One formatter, `formatTally`, with one `rowCount(n)` helper. The three `SliceResolutionError` messages and the guard's prefix and remedy are the strings in part 01 steps 3 and 4.                                                                                                                                                                                                     |
| Marker token grammar           | `XMR_OPEN_RE` group 3 is the token run; its value atom admits an empty value, so `event_type=` reaches the parser as unusable. `XMR_TOKENS` maps each known key to the block field it sets, its value check, and the placeholder a notice shows for it, and `XMR_TOKEN_REASONS` names `unknown`, `repeated`, and `unusable`; both live in `libwiki/src/constants.js`, the scanner reads the map with `Object.hasOwn`, and the renderer derives the known-key list from it. A block carries `eventType`, `priorReadAnchor`, and `tokenErrors` (`[{ key, value, reason }]`, default `[]`). |
| Notice shape                   | Two blockquote lines, one cause per token error keyed by `XMR_TOKEN_REASONS`, and the known-token detail rendered from the keys of `XMR_TOKENS`, both module constants in the renderer. Part 01 step 8 holds the strings.                                                                                                                                                                                       |
| `product-mix` failure          | `{ ok: false, code: <record's exit code>, error: <record's stderr, trimmed> }`, with `gemba-xmr record failed` when stderr is empty. The operator reads both bins' prefixes; the command does not restate libcli's format to strip one.                                                                                                                                                |
| Neutral workflow name          | `nightly-review` (file `nightly-review.yml`) in every example and page.                                                                                                                                                                                                                                                                                                                 |
| Goldens                        | `stable.csv` keeps `kata-shift` as data. A new `mixed.csv` with two slices feeds `list` with no flag (exit 2) and `list --event-type '*'` (exit 0). Both golden families are recaptured by the capture script with an explicit `--exec`. A new real-bin test replays the `gemba-xmr` cases through the script's own `runCase`, which gains a `cwd` option, because no gate replays them today; the `help` case gains the version transform the `gemba-wiki` cases carry. |
| Test fixtures                  | `libraries/libxmr/test/helpers.js` exports `MIXED_CSV` (legacy header; `dispatch_only` rows with values 1 and 2 under `kata-dispatch`, `shift_only` rows with values 100 and 101 under `kata-shift`) and `SINGLE_CSV` (legacy header; two `shift_only` rows under `kata-shift`). The guard, list, and analyze command cases that need a two-row fixture import them. `summarize.test.js` keeps its twenty-row fixture, renamed `twentyRowCSV(slices)`, for its sufficient-data cases. |
| Display-name test data         | `trace-github.test.js` keeps the `Kata:` names and adds the four `Agent:` names under one `AGENT_WORKFLOW_NAMES` list (both display-name generations), and its test is retitled "matches every agent workflow name".                                                                                                                                                                  |
| Genericity pattern             | `\\bkata-(storyboard\|coaching\|shift\|dispatch)(\\.yml)?\\b` replaces the `.yml`-only pattern. The profiles, the root file, and the actions are covered by the S22 search in part 04.                                                                                                                                                                                                   |
| The `kata-setup` changelog     | Part 04 adds the marker-token entry when `.claude/skills/kata-setup/references/changelog.md` exists on `main` at its merge, in whatever row shape that file states. Otherwise part 04 posts the entry as a comment on spec 2390's part 03 pull request (or its tracking issue), and S26 is void for this spec.                                                                            |
| Tokens on existing boards      | A participant who meets a notice on a block it seeded adds the token at its next storyboard session. No current-month board exists today, so the default refresh creates a skeleton without XmR markers. |
| STATUS rows                    | The master row only, as specs 2350, 2360, and 2390 did. The row reads `design draft` today although design-a.md merged as f82f0f5a6 by a human. The team protocol owes a reconciliation of that merge to `design approved` whatever happens to the amendments. Because this pull request amends that design, the session leaves the row until the approver signals on the amendments on this plan pull request; it then writes `design approved` and `plan approved` in one wiki commit whose message cites the merge commit for the original design and the URL of the approver's comment or review for the amendments. |
| Rebases on specs 2390 and 2400 | Both are at `plan approved` and touch the gemba-wiki skill, the kata-session references, the Gemba pages, the genericity rule, and this repository's pins. Each part rebases on `main` before its panel and re-measures the instruction budgets with `jidoka instructions`. Part 03's version numbers are expected values; the cut takes the next number above the highest tag.        |

Amendments to the design, carried by this pull request. The design was
human-approved by its merge, so the pull request asks the approver for an
explicit signal on the design diff (a comment or review), separate from the
plan approval a `staff-engineer` panel may give:

- **The history rewrite runs in an operator session, not the merging
  session.** The spec forbids an old-name host, the workflow token holds
  `contents: write` only, and a hosted session's own run would never leave
  the wait for in-flight runs. The design's Removals row and its "Contracts"
  sentence now say so.
- **The `gemba-xmr` skill keeps the `--event-type` row and the `event_type`
  bullet as two homes.** Each becomes one tight statement; `jidoka
  instructions` proves the budget. The design's budget sentence now says so.
- **`formatTally` is a package-root export.** The block renderer prints the
  same tally text as the commands. The design's `resolveReadSlice` row now
  names it among the exports.
- **A repeated marker key is a third token error, and the block field is
  `tokenErrors`.** Silent last-wins would hide a board author's mistake. The
  design's `scanMarkers` row and its sequence diagram now say so.
- **`tallySlices` returns `{ counts, empty, total }`.** The resolver and the
  renderer both need the row total to tell a header-only file from an
  all-empty one. The design's `tallySlices` row now says so.

Deviations from the design:

- **`listMetrics` moves to `analyze.js`.** The design names no home; one
  `selectRows` and one `groupByMetric` serve both row consumers.
- **`libwiki`'s `ISO_DATE_RE` moves from the audit rule builder to
  `constants.js`.** The scanner and the audit rules then import one copy
  inside the package; the design names no home for it.
- **A real-bin replay of the `gemba-xmr` goldens joins the test suite, and
  the capture script's `runCase` gains a `cwd` option.** No gate replays
  those goldens today (the committed `help.stdout` prints a version seven
  patches behind the package), so the two new goldens would otherwise be
  dead files.
- **`sliceLabel` lives in `libxmr`'s `format.js`, not the commands module.**
  The block renderer prints the same `* (all rows)` as the commands, and only
  a package-root export reaches both. The design's `analyze` row now says so.
- **The product-manager's `product-mix` flag lands in part 04.** The bare
  `gemba-wiki` a session runs is the gear binary, which rejects the flag until
  part 03 tier 4 repins it.

## Parts

| Part               | Title                                                            | Depends on                                                        |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| [01](plan-a-01.md) | The library: slice resolution, the marker token, one writer rule | nothing to author; merges once part 02 is panel-clean             |
| [02](plan-a-02.md) | The rule and the grammar on every published surface              | authored in parallel; merges right after part 01, same session    |
| [03](plan-a-03.md) | The release train and this repository's repins                   | part 02 merged                                                    |
| [04](plan-a-04.md) | The rename, the bridges, and the names                           | part 03 tier 4 merged                                             |
| [05](plan-a-05.md) | The history rewrite under the killswitch                         | part 04 merged; an operator session                               |

## Execution

Sequential, in part order. Two facts fix the order. A runner's bare `gemba-xmr`
and `gemba-wiki` are the pinned gear binaries the bootstrap installs:
`fit-install.sh` always installs `DEFAULT_TOOLS` (lines 69-70), a named `clis`
set adds to it (only the `--only` switch, parsed at line 151 and taken at
lines 155-161, replaces the set), and the kata-agent action never passes
`--only`. They keep the old contract
until part 03 tier 4 moves the pin. An `npx gemba-xmr` resolves
`node_modules/.bin` to the checkout's `products/gemba/bin/gemba-xmr.js` wherever
the workspace install exists (a developer checkout, and a runner once the
bootstrap restores `node_modules`), so it follows the new contract the moment
part 01 is on `main`; without that install `npx` pulls the published package,
which moves at part 03 tier 1. Between those two moments the old binary honours
`--event-type` and the new source needs it, so the skill text that names a slice
(part 02) must be on `main` before tier 4 and is best on `main` right after part
01: `release-engineer` merges part 01 and then part 02 in one session. Part 03
follows part 02. The product-manager's `product-mix` flag, which the old gear
`gemba-wiki` rejects, waits for part 04. Part 05 is not a pull request: an
operator session with `gh variable` write access runs it right after part 04
merges.

| Part | Route              | Pull request title                                                                              |
| ---- | ------------------ | ----------------------------------------------------------------------------------------------- |
| 01   | `staff-engineer`   | `feat(libxmr)!: the read slice comes from the caller or the file (#2370)`                       |
| 02   | `technical-writer` | `docs(gemba): the slice rule and the marker token on every published surface (#2370)`           |
| 03   | `release-engineer` | release commits and `Release: Tag` dispatches, plus `chore(ci): repin kata-agent (#2370)`       |
| 04   | `staff-engineer`   | `feat(workflows)!: this repository takes its installations' workflow names (#2370)`; the bridge release after the merge is `release-engineer`'s |
| 05   | operator session   | none; a wiki publish                                                                            |

Each merge comment names the next part's owner. Part 05's close writes
`2370 plan implemented`.

Cross-cutting rules for every part:

- Instruction files at or near their caps are listed in the design's
  "Contracts outside the components". `bunx jidoka instructions` exits 0 is
  the proof on every part, and each step that touches one of those files says
  what gives.
- Test fixtures and goldens keep `kata-shift` as data. Only published surfaces
  and library source lose the name.
- Every part runs `bun run check` and `bun run test` before its panel. Steps
  that spawn `node` (the golden capture and its replay test, `product-mix`
  through `npx gemba-xmr`) say so; the local toolchain may be bun-only.

## Risks

| Risk                                                                                                                   | Mitigation                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec 2390's or 2400's parts merge between a panel and a merge and conflict on the gemba-wiki skill or the Gemba pages. | Rebase on `main`, re-run `jidoka instructions`, and record a scoped re-read on the pull request.                                                                                                                       |
| The release cut for part 03 collides with 2390's part 02 on the same tags.                                             | The tag space is append-only. Take the next number above the highest tag and carry it through every tier.                                                                                                             |
| Between the part 01 merge and the part 02 merge, an `npx gemba-xmr analyze` with no flag over a multi-slice file.      | It exits 2 and writes no row. The two merge back to back, so the window is minutes; the bare gear `gemba-xmr` a scheduled run uses keeps the old contract throughout.                                                   |
| Between part 01 and part 03 tier 4, the gear `gemba-wiki` renders boards under the old contract.                       | Intended. The old renderer reads the `kata-shift` slice this wiki still holds, and no board carries a token yet. Tier 4 moves the renderer, and part 05 moves the history.                                              |
| `npm version` in part 03 writes `node_modules/.package-lock.json`, and a later local `npm audit` reads it as stale.    | Delete both npm lockfiles before a local audit (the repository's known trap).                                                                                                                                         |
| The rewrite script changes a byte outside the `event_type` cell.                                                       | Part 05 plans every edit before it writes, checks every changed line pair field by field including the one cell's old-to-new value, and publishes once with `--paths`.                                                |
| A run starts between the killswitch write and the rewrite's push.                                                      | Part 05 queries every non-terminal run status by name, each with a limit far above a day's run count, before it edits.                                                                                                |
| The product manager's `product-mix` runs on this repository before part 05 write `agent-shift` beside `kata-shift`.   | The rewrite maps the old name onto the new, so the two sets become one slice.                                                                                                                                         |
