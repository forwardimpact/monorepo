# Spec 2370: The metrics read slice comes from the caller or the file, never from a built-in workflow name

**Classification:** product. The change lands on the published `gemba-xmr`
and `gemba-wiki` surfaces, the libraries behind them, and their consumer
documentation.

**Persona and job:** Teams Using Agents. The primary job is Gemba's
[Stand Up and Operate an Agent Team](../../JTBD.md#teams-using-agents-stand-up-and-operate-an-agent-team).
Its Big Hire includes "measure outcomes". Its Little Hire is "chart one
metric with a single command". The storyboard read serves Kata's
[Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team):
the Study step reads the XmR blocks to tell signal from noise.

## Problem

### The write rule and the read rule name different workflows

`gemba-xmr record` stamps each row's `event_type` with the filename of the
workflow that ran it, without `.yml`. Every read command (`analyze`, `chart`,
`list`, `summarize`) and the storyboard renderer behind `gemba-wiki refresh`
filter to one slice. When the caller names no slice, they use the built-in
value `kata-shift`. That value is this monorepo's shift workflow filename.

`kata-setup` writes `agent-shift.yml` into every installation it creates. It
writes `agent-dispatch.yml`, `agent-storyboard.yml`, and `agent-coaching.yml`
when the operator selects the agents that use them. None of these files is
`kata-shift.yml`. No row that `record` stamps from its host workflow on such
an installation is visible to the default read.

| Surface                                           | Rule today                                      | Source of the value         |
| ------------------------------------------------- | ----------------------------------------------- | --------------------------- |
| `gemba-xmr record`                                | `--event-type`, else the host workflow filename | The installation's workflow |
| `gemba-wiki product-mix`                          | the literal `kata-shift`                        | This monorepo               |
| `gemba-xmr analyze`, `chart`, `list`, `summarize` | `--event-type`, else `kata-shift`               | This monorepo               |
| Storyboard XmR block (`gemba-wiki refresh`)       | `kata-shift`, with no way to say otherwise      | This monorepo               |

### Measured on an installation

Issue [#2168](https://github.com/forwardimpact/monorepo/issues/2168) reports
an installation on gemba 0.1.4 where 39 of 42 rows and 12 of 13 CSVs are
invisible to the default read. The team read a month of empty charts as "no
work happened". The issue names four values in play. I read that
installation's wiki on 2026-10-07 and counted six distinct values. Three of
them hold one to three rows each and came from explicit `--event-type` flags.

| Slice values present                                                                  | Files                                        | Rows the default read sees |
| ------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------- |
| `agent-storyboard`, `agent-dispatch`, `agent-session`, `ask-session`, `issue_comment` | 12 of 13                                     | 0                          |
| `kata-shift`                                                                          | 1 of 13 (`product-mix`, which pins the name) | 3                          |

Every storyboard XmR block except `product_share` stays as the refresh found
it, with its seeded placeholder and no chart. The `product_share` block
renders only because its writer ignores the host workflow and pins the
monorepo's name.

### Reproduced in two commands

```sh
GITHUB_WORKFLOW_REF="o/r/.github/workflows/agent-shift.yml@refs/heads/main" \
  gemba-xmr record --skill probe --metric widgets --value 5 --unit count --wiki-root /tmp/w
# metric=widgets n=1 status=insufficient_data latest=5
gemba-xmr list /tmp/w/metrics/probe/2026.csv
# event_type: kata-shift
# Metric  Unit  Points  From  To          (empty table, exit 0)
```

### The accepted risk did not hold

Design 1540-a accepted the coupling between the read default and one workflow
filename. Its mitigation reads: a no-rows-after-filter result "is highly
visible at the next storyboard refresh". The refresh logs `metric-not-found`
to stderr and leaves the block as it found it. Nothing on the board shows a
failed read. The published Gemba documentation now tells every consumer to
pass `--event-type` on every read command "or the default slice returns no
rows". The Gemba site's overview names the default as one of two values that
"still refer to that tenant". The documentation describes the defect as a
known limitation.

### The default inverts the product layers

CONTRIBUTING § Invariants fixes the layer order: Gemba is the runtime
platform, and Kata runs on Gemba. A Gemba library that embeds a Kata workflow
filename as its default puts the tenant above the platform.

### Three more defects in the same contract

| Defect                                     | Behaviour today                                                                                                                                                                     | Consequence                                                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Two writer rules                           | `record` derives the value from the host workflow. `product-mix` pins `kata-shift`.                                                                                                 | The two streams in one installation disagree on provenance. The pinned stream is the only one the default read sees, by accident.       |
| A zero-match filter is a well-formed empty | `analyze`, `list`, and `summarize` exit 0 with valid output and an empty metric set when the slice matches no row of a non-empty file. Only `chart` fails.                          | A reader cannot tell "no work happened" from "the tool did not look".                                                                   |
| `validate` cannot see a shifted row        | A row whose unquoted `note` holds a comma parses with too many fields. Later fields shift. `validate` checks only that `event_type` is non-empty, so the shifted row passes.       | Hand-edited corruption is undetectable by tooling. `record` quotes the note, so the CLI never writes a row with more than eight fields. |

The shifted-row fixture:

```csv
date,metric,value,unit,run,note,event_type,host_run
2026-01-02,widgets,2,count,,note with a comma, which shifts everything,kata-shift,124
```

`gemba-xmr validate` reports it `Valid` and exits 0. Line 2 has nine fields.

### Values drift in shape as well as in name

This monorepo's wiki holds `kata-shift` beside `kata-shift` with a trailing
carriage return in two files, rows with an empty `event_type` in three files,
and two files whose rows all carry an empty value. A rule that compares raw
cells reads a single-workflow file as two slices.

### Off-workflow rows have no honest value

`record` derives `event_type` from the host workflow. Outside GitHub Actions
there is no host workflow, and `record` refuses the row:

```text
gemba-xmr: error: record requires --event-type <name> or $GITHUB_WORKFLOW_REF
```

The only way forward is to invent a value, and `record` accepts any string.
Issue
[forwardimpact/kata-skills#27](https://github.com/forwardimpact/kata-skills/issues/27)
reports 7 of 35 rows on one installation that name workflows which never
existed, invented independently by three agents. This monorepo's wiki holds 23
rows across four files whose value is `interactive`, each passed by hand.
`host_run` already has the off-workflow value `local`. `event_type` has none.

## Proposal

| #   | What changes                                                                                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | No read surface carries a built-in slice name. A read resolves its slice by the rules under § Slice resolution: the caller's explicit choice first, the file's sole value second, and a failure that lists the values present otherwise.                                                                                                       |
| P2  | An explicit slice other than `*` that matches no row of a non-empty file is a failed read. The message lists the values present with their row counts.                                                                                                                                                                                         |
| P3  | A storyboard XmR block can name its slice. The marker carries it, and the renderer honours it. A marker that names none follows P1 against its file. Every XmR render failure (a missing file, a metric with no rows in the resolved slice, a failed slice resolution, an unknown marker token) renders as a notice inside the block that names the cause. The renderer never leaves an XmR block as it found it. |
| P4  | One writer rule. `product-mix` takes an explicit slice from its caller and forwards it to `record`. Without one, `record`'s own rule applies. A `record` failure is a `product-mix` failure with the same message. The literal is removed.                                                                                                     |
| P5  | `validate` rejects a row whose field count is outside the schema: fewer than seven fields or more than eight. Seven fields means `host_run` is absent. The check holds under both header forms. The error names the line, the expected range, and the actual count.                                                                           |
| P6  | The consumer documentation, the published skills, and the storyboard template state the rules in P1 to P3 and P7. Every mention of a `kata-shift` default and the "pass `--event-type` on every read" caveat are removed. Examples use a neutral workflow name. Every published `gemba-xmr analyze` invocation names a slice. Every surface that documents the marker grammar shows the slice token. |
| P7  | `record` writes the reserved value `interactive` when the caller names no slice and no host workflow exists. `--event-type` still overrides. The value is documented as reserved: it is not a workflow filename, and no workflow file may take that name. `record` never refuses a row for a missing slice.                                   |

### Slice resolution

A value is compared after surrounding whitespace, including a trailing
carriage return, is removed. An empty value is not a slice.

| Caller's choice | Values in the file                 | Result                                                                                       |
| --------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| none            | none (header only)                 | An empty report. `chart` keeps its no-metrics exit.                                          |
| none            | exactly one                        | That value. Rows with an empty value are excluded.                                           |
| none            | two or more                        | A failed read. The message lists each value with its row count.                              |
| none            | only empty values                  | A failed read. The message reports the count of rows with an empty value.                    |
| `*`             | any                                | All rows, including rows with an empty value.                                                |
| a name          | the name is present                | Rows with that value.                                                                        |
| a name          | the name is absent, file non-empty | A failed read (P2). The message lists each value present and the count of empty-value rows.  |
| a name          | none (header only)                 | An empty report.                                                                             |

### Participant instructions

The kata-session participant instruction that runs `gemba-xmr analyze` on a
per-agent file names the slice of the workflow whose runs the board measures.
By default that is the installation's shift workflow filename. A participant
whose file holds one kind of work may name `*`.

**Compatibility stance:** clean break. The built-in default is removed with
no alias.

Consequences on upgrade:

- No CSV row changes. Rows carry the honest name of the workflow that
  produced them, and a rewrite would falsify provenance.
- The default `gemba-wiki refresh` renders the current month's board. A past
  board is rendered only when the caller passes its path, and then its
  token-less markers over multi-slice files render the P3 notice.
- A marker over a multi-slice file that names no slice renders the P3 notice
  until someone adds the token. The notice is the migration aid for every
  installation. This monorepo's `staff-engineer` file carries four values, so
  the template that seeds markers carries the token.
- After the first off-workflow `record`, a file that CI also writes carries
  two slices, and a read with no flag must name one. The `product_share`
  series is one such file: the product manager runs `product-mix` under
  several workflows and in interactive sessions, so its marker names a slice.
- A shift that lands on seven or eight fields is not detectable by count. P5
  catches the shape that `record` can never produce.
- An off-workflow `record` or `product-mix` run with no flag now writes a row
  with `interactive` where it refused before.

## Scope

### Included

| Component                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | What changes                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `gemba-xmr` read commands (`analyze`, `chart`, `list`, `summarize`)                                                                                                                                                                                                                                                                                                                                                                                                        | P1 and P2. Each output still names the slice it reports.          |
| `gemba-xmr record`                                                                                                                                                                                                                                                                                                                                                                                                                                                         | P7.                                                               |
| The slice-resolution rule the read commands and the storyboard renderer share                                                                                                                                                                                                                                                                                                                                                                                              | One rule. The design places it.                                   |
| The `libxmr` analysis API                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Callers state the slice. The library holds no default.            |
| `gemba-xmr validate`                                                                                                                                                                                                                                                                                                                                                                                                                                                       | P5.                                                               |
| The storyboard XmR marker grammar and renderer                                                                                                                                                                                                                                                                                                                                                                                                                             | P3. The wiki audit's marker-balance check reads the same grammar. |
| `gemba-wiki product-mix`                                                                                                                                                                                                                                                                                                                                                                                                                                                   | P4.                                                               |
| The storyboard template that seeds markers                                                                                                                                                                                                                                                                                                                                                                                                                                 | Each seeded marker names its slice.                               |
| Published docs and skills: the Gemba XmR analysis page, the predictable-team guide, the wiki-operations page, the Gemba overview, the Kata daily-storyboard page, the `gemba-xmr` and `gemba-wiki` skills and the `gemba-xmr` help examples, the kata-session participant protocol and its storyboard references, the kata-implement route-decision reference, the product-manager profile's `product-mix` step, and the `libxmr` and `libwiki` READMEs                       | P6.                                                               |

### Excluded

| Excluded                                                            | Why                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any rewrite of recorded rows                                        | Provenance. The next CI run would write the workflow basename again.                                                                                                                                                                                                |
| A closed set of `event_type` values                                 | Design 1540-a chose an open set. The workflow directory owns the names. This spec keeps that.                                                                                                                                                                       |
| A per-installation configuration key for a default slice           | Gemba must not read Kata's settings file (spec 2290: the agent is the loader, and no runtime library participates). The installation data also shows no single installation-wide slice. One board renders files whose rows come from different workflows. |
| A read default derived from `$GITHUB_WORKFLOW_REF`                  | The storyboard and coaching workflows read rows that other workflows wrote.                                                                                                                                                                                         |
| `product-mix`'s two existing no-row exits                           | A window with no labeled merged PR, and a failed PR query, exit 0 with no row today and keep doing so. P4 changes only the `record` failure path.                                                                                                                   |
| A CSV that fails integrity parsing (git conflict markers)           | The refresh fails visibly today. That stays. An unparseable file is not a render failure of one block.                                                                                                                                                              |
| The `""` escape inside a quoted `note`                              | A separate parser limitation.                                                                                                                                                                                                                                       |
| The seven-column legacy header allowance                            | Unchanged. P5 accepts seven or eight fields under either header.                                                                                                                                                                                                    |
| The `kata-` prefix rule for metric directories in `gemba-wiki init` | The Gemba overview names it as the second tenant default. It is a separate surface.                                                                                                                                                                                 |

## Relation to spec 1540

This spec supersedes two rows of design 1540-a § Key Decisions: "CLI default
when no `--event-type` filter on read" and "`DEFAULT_SHIFT_TYPE` couples to a
workflow file's filename". It narrows one row: "Smart default at write time"
keeps the flag and the `$GITHUB_WORKFLOW_REF` derivation, and replaces the
final "otherwise reject" with the reserved value in P7. It keeps the other
decisions: the workflow machine name as the value, the `*` all-rows choice,
the open set, and the validator's non-empty rule.

## Success criteria

| #   | Claim                                                                                              | Verification                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | A row recorded under a non-monorepo workflow name is visible to a read with no flag.              | Run the two-command reproduction above. `gemba-xmr list` prints the `widgets` row and exits 0.                                                                                                                                                                |
| S2  | A read with no slice on a file that carries several values fails and names them.                  | Run `gemba-xmr analyze <csv>` on a file with two `event_type` values. The exit code is non-zero. The message lists both values with their row counts.                                                                                                         |
| S3  | A read whose slice matches no row of a non-empty file fails and names the values present.         | Run `gemba-xmr list <csv> --event-type nope` on a non-empty file. The exit code is non-zero. The message lists each value present with its row count. Run the same command with `--event-type '*'`. It prints every metric and exits 0.                      |
| S4  | A read with no slice on a file whose rows all carry an empty value fails.                         | Run `gemba-xmr list <csv>` on such a file. The exit code is non-zero. The message reports the count of empty-value rows.                                                                                                                                      |
| S5  | A value with surrounding whitespace is the same slice as the bare value.                          | Run `gemba-xmr list <csv>` on a file whose rows carry `x` and `x` with a trailing carriage return. The read resolves to `x` and the metric's point count equals the row count.                                                                                |
| S6  | No read surface holds a built-in slice name.                                                       | `rg -n 'kata-shift' libraries/libxmr/src libraries/libwiki/src` returns no match. A library test shows that the analysis API rejects a call with no slice.                                                                                                   |
| S7  | `product-mix` forwards an explicit slice.                                                          | Run `gemba-wiki product-mix --event-type probe` on a window with at least one labeled merged PR. The appended row carries `probe`.                                                                                                                             |
| S8  | `product-mix` and `record` share one writer rule.                                                  | On a window with at least one labeled merged PR, run `gemba-wiki product-mix` with `GITHUB_WORKFLOW_REF` set to an `agent-shift.yml` ref. The appended row carries `agent-shift`. Run it with neither the flag nor the variable. The appended row carries `interactive`. |
| S9  | `validate` rejects a row whose field count is outside the schema.                                  | Run `gemba-xmr validate` on the shifted-row fixture above. The exit code is non-zero. The error names line 2, the range 7 to 8, and the count 9. Run it on a legacy-header file that holds seven-field and eight-field rows. It passes.                      |
| S10 | A storyboard block renders the slice its marker names.                                             | Run `gemba-wiki refresh` on a board whose marker names a slice over a multi-slice file. The chart lines inside the block's code fence equal the chart lines that `gemba-xmr chart <csv> --metric <m> --event-type <slice>` prints after its header line.        |
| S11 | A storyboard block whose marker names no slice over a single-slice file renders the chart.        | Run `gemba-wiki refresh` on such a board. The chart lines inside the block equal the chart lines for that file's one value.                                                                                                                                   |
| S12 | A storyboard block whose marker names no slice over a multi-slice file renders a notice.           | Run `gemba-wiki refresh` on such a board. The block body names the values present and the marker token to add.                                                                                                                                                |
| S13 | A block whose metric has no rows in the resolved slice, whose file is missing, or whose marker carries an unknown token renders a notice. | Run `gemba-wiki refresh` on a board with one marker of each kind. Each block body names its cause. No block is left as it was.                                                                                                       |
| S14 | Published docs, skills, and the template carry no `kata-shift` value.                              | `rg -n 'kata-shift' websites/gemba websites/kata/docs/continuous-improvement .claude/skills/gemba-xmr .claude/skills/gemba-wiki .claude/skills/kata-session .claude/skills/kata-implement/references libraries/libxmr/README.md libraries/libwiki/README.md products/gemba/bin` returns no match. |
| S15 | Every published `gemba-xmr analyze` invocation names a slice.                                      | `rg -n 'gemba-xmr analyze [^\n]*\.csv' .claude/skills websites/gemba websites/kata/docs` lists only lines that also carry `--event-type`.                                                                                                                      |
| S16 | The storyboard template and every marker-grammar home show the slice token.                       | The template's marker example and each page or skill section that shows `<!-- xmr:` carry `event_type=`.                                                                                                                                                      |
| S17 | The `gemba-xmr` skill documents `interactive` as reserved.                                         | The skill's `event_type` description names `interactive` as the off-workflow value and states that no workflow file may take that name.                                                                                                                       |
| S18 | An off-workflow `record` with no flag writes the reserved value.                                   | Run `gemba-xmr record` with `GITHUB_WORKFLOW_REF` and `GITHUB_RUN_ID` unset and no `--event-type`. The exit code is 0. The appended row carries `interactive` and `local`.                                                                                     |
