# Spec 2370: The metrics read slice comes from the caller or the file, never from a built-in workflow name, and this repository takes its installations' workflow names

**Classification:** product. The change lands on the published `gemba-xmr`
and `gemba-wiki` surfaces, the libraries behind them, and their consumer
documentation. This repository's workflows, the two bridge services' dispatch
target, KATA.md, the workflow enumeration, and this wiki's metrics history are
internal companions.

**Persona and job:** Teams Using Agents. The primary job is Gemba's
[Stand Up and Operate an Agent Team](../../JTBD.md#teams-using-agents-stand-up-and-operate-an-agent-team).
Its Big Hire includes "measure outcomes". Its Little Hire is "chart one
metric with a single command". The storyboard read serves Kata's
[Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team):
the Study step reads the XmR blocks to tell signal from noise. The two bridge
services carry the Discussion and Teams channels of that same Kata job.

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
work happened". The issue names four values in play. A read of that
installation's wiki on 2026-10-07 counted six distinct values. Three of
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

### This repository is not shaped like the installations it generates

`kata-setup` writes `agent-shift.yml`, `agent-dispatch.yml`,
`agent-storyboard.yml`, and `agent-coaching.yml`, with `Agent:` display names
and, on the three that have one, `agent-*` concurrency groups. This repository
runs the same four workflows as `kata-shift.yml`, `kata-dispatch.yml`,
`kata-storyboard.yml`, and `kata-coaching.yml`, with `Kata:` display names and
`kata-*` groups. The platform's built-in slice works here by coincidence of
that naming, so the defect above reproduces only on an installation. The
mismatch reaches past this repository. Counts are as of 2026-10-08.

| Surface                                       | Behaviour today                                                                                                                                                                                                                              | Consequence                                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| The GitHub Discussions and Teams bridges      | Each service dispatches the workflow file `kata-dispatch.yml` by a built-in name, the bridge library's comments repeat it, and the bridge README documents it. The public FIT bridge pages already promise `agent-dispatch.yml`.                | No installation that `kata-setup` generated has the file the services dispatch. A bridge pointed at one dispatches nothing. |
| The published pack and the published actions  | The `kata-spec`, `kata-design`, `kata-plan`, and `kata-release-merge` skills, one agent profile, one agent reference, and the root CLAUDE.md name the dispatch workflow `kata-dispatch` 17 times. A trace-discovery reference lists runs by the display name `Kata: Dispatch`. The `kata-agent` and `kata-interview` actions say the killswitch halts "every `kata-*` workflow". | The pack's own genericity rule forbids naming this repository's workflows, and every installation reader meets names it does not have. |
| The workflow enumeration and this repository's prose | The enumeration globs `kata-*.yml`. KATA.md names the four workflows 24 times and, with `.github/CLAUDE.md` and three more comments, describes the agent workflows as "the `kata-*` workflows".                                         | The surfaces that explain the team use names the reader's installation does not have.                                       |
| This wiki's metrics history                   | 1,506 shift cells, 375 dispatch cells, and 37 coaching cells across 19 files under either header form carry the `kata-` names as their `event_type`. Nine of them came from the pinned literal or a hand-passed flag, not from the workflow. One more file with its own six-column header holds 106 shift cells that no reader slices. | After the change, rows written after a rename form a second slice beside the history, and every chart's baseline restarts. |

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
| Two writer rules                           | `record` derives the value from the host workflow. `product-mix` pins `kata-shift` inside a shared library.                                                                        | The pin is a hidden literal where the caller's choice belongs. The pinned stream is the only one the default read sees, by accident.    |
| A zero-match filter is a well-formed empty | `analyze`, `list`, and `summarize` exit 0 with valid output and an empty metric set when the slice matches no row of a non-empty file. Only `chart` fails.                          | A reader cannot tell "no work happened" from "the tool did not look".                                                                   |
| `validate` cannot see a shifted row        | A row whose unquoted `note` holds a comma parses with too many fields. Later fields shift. `validate` checks only that `event_type` is non-empty, so the shifted row passes.       | Hand-edited corruption is undetectable by tooling. `record` quotes the note, so a `record` write does not produce this shape. A note that holds a newline splits one write into two short lines, which P5 also catches. |

The shifted-row fixture:

```csv
date,metric,value,unit,run,note,event_type,host_run
2026-01-02,widgets,2,count,,note with a comma, which shifts everything,kata-shift,124
```

`gemba-xmr validate` reports it `Valid` and exits 0. Line 2 has nine fields.

### Values drift in shape as well as in name

On 2026-10-07 this monorepo's wiki held `kata-shift` beside `kata-shift` with a
trailing carriage return in one file, a second file with the same variant of
another value, rows with an empty `event_type` in three files, and five files
whose header is not the schema's, which the parser reads by position: three read
as empty, one reads numbers as slices, and one reads a real value. It also held
six rows whose field count is outside the schema (two, six, or nine fields). A
rule that compares raw cells reads a single-workflow file as two slices.

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
existed, invented independently by three agents. On 2026-10-07 this monorepo's
wiki held 30 rows across five files whose value is `interactive`, each passed
by hand.
`host_run` already has the off-workflow value `local`. `event_type` has none.

## Proposal

| #   | What changes                                                                                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | No read surface carries a built-in slice name. A read resolves its slice by the rules under § Slice resolution: the caller's explicit choice first, the file's sole value second, and a failure that lists the values present otherwise.                                                                                                       |
| P2  | An explicit slice other than `*` that matches no row of a non-empty file is a failed read. The message lists the values present with their row counts.                                                                                                                                                                                         |
| P3  | A storyboard XmR block can name its slice. The marker carries it, and the renderer honours it. A marker that names none follows P1 against its file. A marker's tokens are the `key=value` words after the CSV path, and the known keys are `event_type` and `prior`; the first word without `=` begins free text, which is not a token. Every XmR render failure (a missing file, a metric with no rows in the resolved slice, a failed slice resolution, an unknown token, a known key with a value the renderer cannot use) renders as a notice inside the block that names the cause. A refresh that completes writes every block, as a chart or as a notice. |
| P4  | One writer rule. `product-mix` takes an explicit slice from its caller and forwards it to `record`. Without one, `record`'s own rule applies. A `record` failure is a `product-mix` failure with the same message. The literal is removed. The product manager's instruction names `agent-shift` for the `product_share` stream, the stream the board measures, so that series stays whole across the workflows and sessions that run it. |
| P5  | `validate` rejects a row whose field count is outside the schema: fewer than seven fields or more than eight. Seven fields means `host_run` is absent. The check holds under both header forms. The error names the line, the expected range, and the actual count.                                                                           |
| P6  | The consumer documentation, the published skills, and the storyboard template state the rules in P1 to P3 and P7. Every mention of a `kata-shift` default and the "pass `--event-type` on every read" caveat are removed. Examples use a neutral workflow name. Every published `gemba-xmr analyze` invocation names a slice, because the examples teach the vocabulary and P1 serves the flag-free read. Every surface that documents the marker grammar shows the slice token. The marker token is a convention an installation's boards carry, so it takes an entry in the `kata-setup` changelog of spec 2390 once that changelog exists. |
| P7  | `record` writes the reserved value `interactive` when the caller names no slice and no host workflow exists. `--event-type` still overrides. The value is documented as reserved: it is not a workflow filename, and no workflow file may take that name. `record` never refuses a row for a missing slice.                                   |
| P8  | This repository's four agent workflows take the file names, the display names, and, where one exists, the concurrency group names that `kata-setup` writes. Their content is otherwise unchanged. `kata-interview.yml` and `curate-wiki.yml` are this repository's own and keep their names.                                          |
| P9  | The two bridge services dispatch `agent-dispatch.yml`, the name every installation that runs the dispatch workflow has, and the name has one home. The bridge documentation says so.                                                                                                                                                 |
| P10 | The published skills, the agent profiles and references, the published actions, the root CLAUDE.md, and the design notes name the dispatch workflow by its role and the agent workflows by what they are, never by this repository's old names or the `kata-*` glob. A command that needs a display name uses the installation's. The workflow enumeration, KATA.md, and `.github/CLAUDE.md` describe the agent workflows by the new names, and the killswitch statement still covers the interview workflow. |
| P11 | This wiki's metrics history follows the rename once. In every metrics CSV under either header form, a cell under `event_type` whose trimmed value is an old basename takes the new basename, and no other byte of the file changes. A row whose field count is outside the schema is left as it is, and P5 reports it. The file with its own header is left as it is. The nine rows whose old name came from the pinned literal or a hand-passed flag follow too: the name meant the shift stream, and the stream's name is now `agent-shift`. A marker on any board that names an old slice takes the new name. The rewrite runs with the agent workflows halted by the killswitch and no run in flight, and it lands as one publish. No installation holds rows that a renamed workflow stamped; the few rows an installation holds under the pinned name came from no workflow of that name, stay as history in their own slice, and do not convert. The same rule would move them, and no one writes an installation's wiki. |

### Slice resolution

`event_type` names the stream a row belongs to. Its default is the host
workflow, because a workflow is a stream. A caller that writes a row for
another stream names that stream. An off-workflow write with no named stream
is `interactive`. A value is compared after surrounding whitespace, including
a trailing carriage return, is removed. An empty value is not a slice.

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
By default that is the installation's shift workflow filename. A read that
checks rows the session itself wrote names the session's own slice, which is
its host workflow. A participant whose file holds one kind of work may name
`*`.

**Compatibility stance:** clean break. The built-in default is removed with
no alias, and P11 is the one rewrite of recorded rows this spec makes.

Consequences on upgrade:

- No CSV row changes on any installation. Rows carry the honest name of the
  workflow that produced them, and a rewrite would falsify provenance. This
  repository's P11 rewrite is the exception the rename makes honest.
- A renamed workflow file is a new workflow to GitHub Actions. Its run
  history stays under the old file's entry. The trace tooling lists runs by a
  name pattern that matches both display names, and the reference that lists
  runs by display name names the new one.
- `validate` is advisory today: no audit or CI step calls it, so P5's new
  failures block no push.
- The wiki's boot-time integrity sweep re-asserts each lane's previous rows
  by exact content, so the P11 rewrite makes every lane report its prior rows
  as absent once. The report is detection only.
- An installation's `product_share` series starts from the slice the product
  manager names. Its few pinned rows stay in their own slice as history.
- The default `gemba-wiki refresh` renders the current month's board. A past
  board is rendered only when the caller passes its path, and then its
  token-less markers over multi-slice files render the P3 notice.
- A marker over a multi-slice file that names no slice renders the P3 notice
  until someone adds the token. The notice is the migration aid for every
  installation. This monorepo's `staff-engineer` file carries four values, so
  the template that seeds markers carries the token.
- After the first off-workflow `record`, a file that CI also writes carries two
  slices, and a read with no flag must name one. On this tenant 11 of 20
  schema-header files already hold two or more slices, so most participant reads
  name a slice and the flag-free read serves the single-workflow file. The
  `product_share` series is one such file: the product manager runs
  `product-mix` under several workflows and in interactive sessions, so its
  marker names a slice.
- A shift that lands on seven or eight fields is not detectable by count. P5
  catches the shape a `record` write does not produce.
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
| This repository's `kata-shift.yml`, `kata-dispatch.yml`, `kata-storyboard.yml`, and `kata-coaching.yml`                                                                                                                                                                                                                                                                                                                                                                      | P8. Names only.                                                   |
| The bridge library, the GitHub Discussions and Teams bridge services, their tests, and the bridge README                                                                                                                                                                                                                                                                                                                                                                   | P9. One home for the dispatch target.                             |
| The published skills, the agent profiles and references, the published actions, the root CLAUDE.md, and the design notes that name the old workflows or the glob; the trace-discovery reference; the trace reader's comments; KATA.md, `.github/CLAUDE.md`, the comments in `watchdog.yml`, `package-macos.yml`, and the signing action's README; the workflow enumeration topic                                                                                        | P10.                                                              |
| This wiki's metrics CSVs under either header form, and any board marker that names an old slice                                                                                                                                                                                                                                                                                                                                                                             | P11. One rewrite, under the killswitch.                           |

### Excluded

| Excluded                                                            | Why                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any rewrite of recorded rows beyond P11                             | Provenance. The next CI run would write the workflow basename again.                                                                                                                                                                                                |
| Content parity between this repository's workflows and the `kata-setup` templates | The shift workflow drifts from its template by a few lines: literal crons, the turn-cap and timeout overrides, and the model and wiki inputs it omits. Spec 2390's update procedure runs in this repository, because the skill's references are held here at source, and shows that drift file by file. |
| A configurable dispatch target in the bridges                      | `kata-setup` fixes the file name with no parameter, so every installation that runs the dispatch workflow has `agent-dispatch.yml`. A setting is a second home for a name the generator already fixes. The libxmr default was one tenant's file name; the bridge name is the generator's.             |
| The inverse rename: the templates take the `kata-*` names          | Existing installations already hold `agent-*` files, and the bridges would then mismatch every one of them. `kata` names the pack; `agent` names what an installation runs.                                                                                                                       |
| Rows outside the schema, the file with its own header, trace files under `metrics/`, and wiki prose that names an old slice as history | P11 rewrites the cells a reader filters on. P5 reports the malformed rows. No reader slices the other file. History pages stay as written.                                                                                                     |
| A closed set of `event_type` values                                 | Design 1540-a chose an open set. The workflow directory owns the names. This spec keeps that.                                                                                                                                                                       |
| A per-installation configuration key for a default slice           | Gemba must not read Kata's settings file (spec 2290: the agent is the loader, and no runtime library participates). The installation data also shows no single installation-wide slice. One board renders files whose rows come from different workflows. |
| A read default derived from `$GITHUB_WORKFLOW_REF`                  | The storyboard and coaching workflows read rows that other workflows wrote.                                                                                                                                                                                         |
| `product-mix`'s two existing no-row exits                           | A window with no labeled merged PR, and a failed PR query, exit 0 with no row today and keep doing so. P4 changes only the `record` failure path.                                                                                                                   |
| A CSV that fails integrity parsing (git conflict markers)           | The refresh fails visibly today. That stays. An unparseable file is not a render failure of one block.                                                                                                                                                              |
| The `""` escape inside a quoted `note`                              | A separate parser limitation.                                                                                                                                                                                                                                       |
| The seven-column legacy header allowance                            | Unchanged. P5 accepts seven or eight fields under either header.                                                                                                                                                                                                    |
| The `kata-` prefix rule for metric directories in `gemba-wiki init` | The Gemba overview names it as the second tenant default. It is a separate surface.                                                                                                                                                                                 |

## Release order

P8 to P11 are severable from P1 to P7 and ride this spec because the rename is
what makes this repository share its installations' shape, so spec 2390's
procedure runs here and the platform's own tenant is no longer special. The
rename lands after the library change is released and repinned in this
repository, so the renamed workflows and the boards read under the new
contract. The bridge services release and redeploy with the rename; between
the two, a bridge dispatch into this repository finds no workflow, and every
generated installation goes from a bridge that dispatches nothing to one that
dispatches its workflow. The wiki is not tracked by this repository, so the
P11 rewrite happens after the rename merges, once no run started under an old
name is in flight, with the agent workflows halted, and where no old-name
workflow hosts it. The merging session's own rows carry an old name, and the
rewrite covers them.

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
| S1 | A row recorded under a non-monorepo workflow name is visible to a read with no flag. | Run the two-command reproduction above with the current year in the file name. `gemba-xmr list` prints the `widgets` row and exits 0. |
| S2  | A read with no slice on a file that carries several values fails and names them.                  | Run `gemba-xmr analyze <csv>` on a file with two `event_type` values. The exit code is non-zero. The message lists both values with their row counts.                                                                                                         |
| S3  | A read whose slice matches no row of a non-empty file fails and names the values present.         | Run `gemba-xmr list <csv> --event-type nope` on a non-empty file. The exit code is non-zero. The message lists each value present with its row count. Run the same command with `--event-type '*'`. It prints every metric and exits 0.                      |
| S4  | A read with no slice on a file whose rows all carry an empty value fails.                         | Run `gemba-xmr list <csv>` on such a file. The exit code is non-zero. The message reports the count of empty-value rows.                                                                                                                                      |
| S5 | A value with surrounding whitespace is the same slice as the bare value. | Run `gemba-xmr list <csv>` on a legacy-header file whose rows carry `x` and `x` with a trailing carriage return. The read resolves to `x` and the metric's point count equals the row count. |
| S6  | No read surface holds a built-in slice name.                                                       | `rg -n 'kata-shift' libraries/libxmr/src libraries/libwiki/src` returns no match. A library test shows that the analysis API rejects a call with no slice.                                                                                                   |
| S7  | `product-mix` forwards an explicit slice.                                                          | Run `gemba-wiki product-mix --event-type probe` on a window with at least one labeled merged PR. The appended row carries `probe`.                                                                                                                             |
| S8  | `product-mix` and `record` share one writer rule.                                                  | On a window with at least one labeled merged PR, run `gemba-wiki product-mix` with `GITHUB_WORKFLOW_REF` set to an `agent-shift.yml` ref. The appended row carries `agent-shift`. Run it with neither the flag nor the variable. The appended row carries `interactive`. |
| S9  | `validate` rejects a row whose field count is outside the schema.                                  | Run `gemba-xmr validate` on the shifted-row fixture above. The exit code is non-zero. The error names line 2, the range 7 to 8, and the count 9. Run it on a legacy-header file that holds seven-field and eight-field rows. It passes.                      |
| S10 | A storyboard block renders the slice its marker names.                                             | Run `gemba-wiki refresh` on a board whose marker names a slice over a multi-slice file. The chart lines inside the block's code fence equal the chart lines that `gemba-xmr chart <csv> --metric <m> --event-type <slice>` prints after its header line.        |
| S11 | A storyboard block whose marker names no slice over a single-slice file renders the chart.        | Run `gemba-wiki refresh` on such a board. The chart lines inside the block equal the chart lines for that file's one value.                                                                                                                                   |
| S12 | A storyboard block whose marker names no slice over a multi-slice file renders a notice.           | Run `gemba-wiki refresh` on such a board. The block body names the values present and the marker token to add.                                                                                                                                                |
| S13 | A block whose metric has no rows in the resolved slice, whose file is missing, whose file holds only empty values, or whose marker carries an unknown token or an unusable known value renders a notice. | Run `gemba-wiki refresh` on a board with one marker of each kind. Each block body names its cause, and every block is written. |
| S14 | Published docs, skills, and the template carry no `kata-shift` or `kata-dispatch` value. | `rg -n -e kata-shift -e kata-dispatch websites/gemba websites/kata/docs/continuous-improvement .claude/skills/gemba-xmr .claude/skills/gemba-wiki .claude/skills/kata-session .claude/skills/kata-implement/references libraries/libxmr/README.md libraries/libwiki/README.md products/gemba/bin` returns no match. |
| S15 | Every published `gemba-xmr analyze` invocation names a slice. | `rg -n 'gemba-xmr analyze (<|\S+\.csv)' .claude/skills websites/gemba websites/kata/docs products/gemba/bin/gemba-xmr.js` lists only invocations that carry `--event-type`, on the same line or on the continuation line that follows it. |
| S16 | The storyboard template and every marker-grammar home show the slice token. | `rg -n '<!-- xmr:[^:]+:' .claude/skills websites libraries/libwiki/README.md` lists only lines that also carry `event_type=`. |
| S17 | The `gemba-xmr` skill documents `interactive` as reserved.                                         | The skill's `event_type` description names `interactive` as the off-workflow value and states that no workflow file may take that name.                                                                                                                       |
| S18 | An off-workflow `record` with no flag writes the reserved value.                                   | Run `gemba-xmr record` with `GITHUB_WORKFLOW_REF` and `GITHUB_RUN_ID` unset and no `--event-type`. The exit code is 0. The appended row carries `interactive` and `local`.                                                                                     |
| S19 | This repository's agent workflows carry the installation's file names. | `ls .github/workflows/agent-*.yml .github/workflows/kata-*.yml` lists `agent-coaching.yml`, `agent-dispatch.yml`, `agent-shift.yml`, `agent-storyboard.yml`, and `kata-interview.yml`, and nothing else; `grep -h 'group:' .github/workflows/agent-*.yml` prints three lines, each naming an `agent-` group. |
| S20 | Their display names equal the templates'. | `grep -h '^name:' .github/workflows/agent-*.yml` prints four lines whose values are `Agent: Coaching`, `Agent: Dispatch`, `Agent: Shift`, and `Agent: Storyboard`. |
| S21 | The bridges dispatch the installation's workflow from one home. | `rg -n -e kata-dispatch -e WORKFLOW_FILE services libraries/libbridge` returns no match, `rg -n 'agent-dispatch.yml' libraries/libbridge/src` matches in one file, and `rg -n 'agent-dispatch.yml' services/ghbridge/README.md` matches. |
| S22 | The enumeration, this repository's prose, the published actions, and the pack name the new files. | `rg -n -e kata-shift -e kata-storyboard -e kata-coaching -e kata-dispatch KATA.md CLAUDE.md .github .jidoka .claude design websites products/kata/actions libraries/libharness/src` returns no match; `rg -n -e 'kata-\*`?\s*(agent |
| S23 | The history follows the rename and loses nothing. | For every metrics CSV under either header form, `gemba-xmr list <csv> --event-type kata-shift`, and likewise for `kata-dispatch` and `kata-coaching`, fails as a zero-match read or reports an empty file; in the rewrite commit, each file's line count equals its count in the commit's parent; and `gemba-xmr list <csv> --event-type agent-shift` at the commit reports at least the point counts that `--event-type kata-shift` reported at the parent. |
| S24 | The rewrite landed as one publish that changed only the cells it meant to. | The wiki's history holds one commit that touches only metrics CSVs and storyboard pages. Its diff against its parent adds and removes no lines, and every changed line differs from its predecessor only in the `event_type` cell. |
| S25 | No board names an old slice. | `rg -n 'event_type=kata-' wiki/storyboard-*.md` returns no match. |
| S26 | The marker token has its installation entry when the changelog exists. | If `.claude/skills/kata-setup/references/changelog.md` exists at the second merge, `rg -n 'event_type=' .claude/skills/kata-setup/references/changelog.md` matches. Otherwise the P3 notice is the installation's path and this criterion is void. |
