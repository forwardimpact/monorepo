# Plan 2370-a Part 02: The rule and the grammar on every published surface

P6 and the participant instructions. Every page, skill, reference, and
template the design lists under "Slice-rule homes" and "Marker-grammar homes"
states the rule, loses the `kata-shift` default and the "pass `--event-type`
on every read" caveat, and shows the marker token. No code changes here. The
two library READMEs changed in part 01. The product-manager's `product-mix`
flag is not here; it needs the repinned binary and lands in part 04.

Depends on: part 01 merged. Author in parallel with part 01's review, hold at
panel-clean, and merge right after part 01 in the same `release-engineer`
session (plan-a.md § Execution). Route: `technical-writer`. Pull request title:
`docs(gemba): the slice rule and the marker token on every published surface (#2370)`.

Two texts recur. Use them in the voice of each surface, and keep every clause.

The rule:

> `event_type` names the stream a row belongs to. `record` takes it from
> `--event-type`, else from the host workflow's filename in
> `$GITHUB_WORKFLOW_REF`, else it writes the reserved value `interactive`. No
> workflow file may take that name. A read takes its slice from
> `--event-type`. Without the flag, a file with one value reads that value,
> and a file with several values fails and lists each value with its row
> count. `--event-type '*'` reads every row. A named slice that matches no row
> of a non-empty file fails the same way. Every read names the slice it
> reports.

The grammar:

> `<!-- xmr:<metric>:<csv> [event_type=<slice>] [prior=<YYYY-MM-DD>] [free text] -->`.
> Tokens are `key=value` words directly after the CSV path, in any order. The
> first word without `=` begins free text. A marker with no `event_type` follows
> the read rule against its file. Every render failure renders as a notice
> inside the block that names the cause and the token to add.

The neutral workflow name in every example is `nightly-review`. Settings
block direct writes under `.claude/**`; edit those files through
`echo … | bunx gemba-selfedit <path>` (CLAUDE.md § Contributor Workflow).

Four files sit at or near a `jidoka instructions` cap. Each step below says
what gives. Marker lines are HTML comments, which the markdown formatter does
not reflow (the template's current 88-column marker line proves it). Prose
lines do reflow, so a line-capped file takes its new words on lines that
already exist.

## Step 1: The Gemba pages

State the rule and the grammar where the platform documents them.

Modified: `websites/gemba/index.md`,
`websites/gemba/docs/predictable-team/index.md`,
`websites/gemba/docs/predictable-team/xmr-analysis/index.md`,
`websites/gemba/docs/predictable-team/wiki-operations/index.md`

| File:line                      | Change                                                                                                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.md:173`                 | "Two defaults still refer to that tenant" becomes one: keep the `gemba-wiki` metrics-directory sentence, delete the `gemba-xmr` clause, and say "One default still refers to that tenant."                                               |
| `predictable-team:97,132-139`  | The `record` examples use `--event-type nightly-review`.                                                                                                                                                                                 |
| `predictable-team:100-109`     | Replace the two paragraphs with the rule. Delete "expect `gemba-wiki refresh` to skip those rows".                                                                                                                                       |
| `predictable-team:123-124,190` | The CSV sample row and the JSON sample carry `nightly-review`.                                                                                                                                                                           |
| `predictable-team:156`         | The `event_type` row of the schema table states the stream, the host-workflow default, and the reserved value.                                                                                                                           |
| `predictable-team:176,183,392` | Each `analyze` invocation gains `--event-type nightly-review` (S15).                                                                                                                                                                      |
| `predictable-team:239,244,275` | Each marker gains `event_type=nightly-review` after the CSV path, and the paragraph at 248-250 states the grammar.                                                                                                                       |
| `xmr-analysis:32-34,196`       | The sample rows carry `nightly-review`.                                                                                                                                                                                                  |
| `xmr-analysis:45`              | As `predictable-team:156`.                                                                                                                                                                                                               |
| `xmr-analysis:51-63`           | Keep 51-57 (why slices exist). Replace 59-63 with the rule. The sentence "the commands below need no flag" becomes "the sample file holds one value, so `chart`, `list`, and `summarize` below omit the flag; the `analyze` examples name it, because the examples teach the vocabulary". |
| `xmr-analysis:120,126,213,221` | Each `analyze` invocation gains `--event-type nightly-review` (S15). `chart`, `list`, and `summarize` over the one-value sample stay flag-free.                                                                                            |
| `wiki-operations:116`          | The marker gains `event_type=nightly-review`, and a sentence after 121 states the grammar and the notice.                                                                                                                                |
| `wiki-operations:139-167`      | Add `npx gemba-wiki product-mix --event-type <slice>` to the examples and one sentence: the row's slice is the flag's, else `record`'s own rule, and a `record` failure fails the command.                                                 |

Verify: `rg -n -e kata-shift -e 'on every read' websites/gemba` returns no
match.

## Step 2: The Kata page

Show the token where the Kata site explains the board.

Modified: `websites/kata/docs/continuous-improvement/daily-storyboard/index.md`

- Line 83: the marker grammar with both tokens, and one sentence that a block
  over a file with several streams names its slice or renders a notice.

Verify:
`rg -n 'event_type=' websites/kata/docs/continuous-improvement/daily-storyboard/index.md`
matches (S16).

## Step 3: The `gemba-xmr` skill

State the rule and the reservation inside the word cap.

Modified: `.claude/skills/gemba-xmr/SKILL.md`

The file has about 27 words of headroom. The `--event-type` row and the
`event_type` bullet each become one tight statement (the design, as amended
by this plan), and the four edits below add about 20 words, inside the
headroom with a few to spare. `jidoka instructions` is the proof, and a
rebase that touches this skill re-measures it.

| Line  | New text                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25    | `` - Analyze a metric — `npx gemba-xmr analyze observations.csv --event-type <slice> --metric <name>` ``                                                                                                      |
| 54-55 | `` - `event_type` — the stream a row belongs to: the host workflow's filename without `.yml`, else the reserved `interactive` (no workflow file may take that name) `` (S17)                                   |
| 81    | Flag row purpose: `` On a read, the slice to report; `'*'` reads all rows. Without it, a sole value is read, and several values fail and list them; a name no row carries fails the same way. On `record`, the row's stream. `` |
| 170   | `npx gemba-xmr analyze observations.csv --event-type nightly-review --metric open_vulnerabilities`                                                                                                             |

Verify: `bunx jidoka instructions` exits 0, and
`rg -n 'kata-shift' .claude/skills/gemba-xmr` returns no match.

## Step 4: The `gemba-wiki` skill

Show the grammar inside the line cap.

Modified: `.claude/skills/gemba-wiki/SKILL.md`

The file sits at its line cap (192 body lines under a 9-line frontmatter;
`jidoka instructions` counts it). What gives: the two-line window note (lines
175-176) becomes one line that states the live `:Nd` grammar, and the marker
bullet (line 171) takes two lines. Net zero. The skill has no `product-mix`
bullet, and the design lists it as a marker-grammar home only, so nothing
else changes here.

- Line 171 becomes two lines:

  ```markdown
  - `<!-- xmr:metric:csv [event_type=<slice>] [prior=<YYYY-MM-DD>] -->` …
    `<!-- /xmr -->` — XmR chart blocks; a render failure is an in-block notice
  ```

- Lines 175-176 become one line:
  `` Closed-state markers default to a 7-day window; a `:Nd` suffix sets another. ``

Verify: after `bun run format:md:fix` (the formatter may re-break the list item
after its inline code span), `bunx jidoka instructions` exits 0 and the
file's line count equals its count on `main`.

## Step 5: The kata-session skill and its references

Make every participant read name its slice, and seed the token on new boards.

Modified: `.claude/skills/kata-session/SKILL.md`,
`.claude/skills/kata-session/references/storyboard-template.md`,
`.claude/skills/kata-session/references/team-storyboard.md`

The skill has headroom for the sentence below. The template is at its line cap.
The team-storyboard reference is one word under its cap, and the marker token
takes that word, so its Q2 rewrite is exactly word-neutral.

| File:line                   | Change                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKILL.md:171`              | `` `gemba-xmr analyze <csv> --event-type <slice> --format json` ``, then this sentence after "Your `Answer` summarizes it.": "Name the slice the board measures, by default the installation's shift workflow; rows this session wrote carry the session's own workflow, and a file with one kind of work may take `*`." (32 words) |
| `SKILL.md:45`               | `` `<!-- xmr:... event_type=<slice> -->` marker from `` (one word more)                                                                                                                                                                                                                                                                |
| `storyboard-template.md:50` | `<!-- xmr:{metric_name}:wiki/metrics/{skill}/{YYYY}.csv event_type={slice} Do not edit. Auto-generated. -->` on the one marker line                                                                                                                                                                                                    |
| `team-storyboard.md:21`     | `` `<!-- xmr:{metric}:{csv} event_type={slice} -->` / `` (one word more)                                                                                                                                                                                                                                                               |
| `team-storyboard.md:38-39`  | "run `gemba-xmr analyze` on its own CSV" becomes "run `gemba-xmr analyze` with its slice on its own CSV" (three words more)                                                                                                                                                                                                             |
| `team-storyboard.md:40-41`  | "The facilitator relays these and runs no analysis itself." becomes "The facilitator relays these and analyzes nothing." (two words fewer)                                                                                                                                                                                              |
| `team-storyboard.md:42`     | "Participants flag any metric whose status changed since the last meeting." becomes "Participants flag each metric whose status changed since last meeting." (one word fewer)                                                                                                                                                         |

Verify: `bunx jidoka instructions` exits 0;
`wc -l .claude/skills/kata-session/references/storyboard-template.md` equals
its count on `main`; `rg -n '<!-- xmr:[^:]+:' .claude/skills` lists only lines
that carry `event_type=` (S16).

## Step 6: The route-decision reference

Name the slice on the one `analyze` form the implement skill teaches.

Modified: `.claude/skills/kata-implement/references/route-decision.md`

- Line 36: `` `gemba-xmr analyze … --event-type <slice> --route <id>` ``.

Verify:
`rg -n 'event-type <slice>' .claude/skills/kata-implement/references/route-decision.md`
matches.

## Step 7: The sweep

Close the part's criteria together, on the branch rebased onto `main` after
part 01 merged (the sweep also scans the two READMEs and the `gemba` bin,
which part 01 changes):

```sh
rg -n -e kata-shift -e kata-dispatch websites/gemba websites/kata/docs/continuous-improvement .claude/skills/gemba-xmr .claude/skills/gemba-wiki .claude/skills/kata-session .claude/skills/kata-implement/references libraries/libxmr/README.md libraries/libwiki/README.md products/gemba/bin
rg -n 'gemba-xmr analyze (<|\S+\.csv)' .claude/skills websites/gemba websites/kata/docs products/gemba/bin/gemba-xmr.js
rg -n '<!-- xmr:[^:]+:' .claude/skills websites libraries/libwiki/README.md
bunx jidoka instructions
bun run check
```

The first returns no match (S14). Every line of the second carries
`--event-type` on the line or its continuation (S15). Every line of the third
carries `event_type=` (S16). The last two exit 0.

## Hand-off

After the merge: comment on the pull request that part 03 is running and part
04 waits for its tier 4.
