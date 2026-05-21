# Spec 1220: fit-trace CLI quality-of-life for browse-mode analysis

## Problem

The `fit-trace` CLI optimises for the analyst who already knows which
artefact to extract. The documented analysis method
([`.claude/skills/fit-trace/SKILL.md`:126-147](../../.claude/skills/fit-trace/SKILL.md))
recommends grounded-theory exploration — "let findings emerge from the data
rather than testing a hypothesis" — that requires synthesis primitives the
CLI does not expose, and ships every analysis verb's output as JSON by
default so any caller browsing for theory pays a wrapper tax twice over:
no aggregation primitive, plus extract-from-JSON to display.

Two independent analysis sessions in May 2026 confirmed the gap is
structural, not workflow-specific:

| Session | Scope | Traces | fit-trace calls | Python wrappers written |
| --- | --- | --- | --- | --- |
| 2026-05-16 | Memory protocol study across kata skills | 2 | ~22 | 8 |
| 2026-05-17 | kata-interview quality-of-life over 2 runs × 2 participants | 2 | ~23 | 7 |

Across both sessions, the wrappers reconstructed the same views:

- `tool_use → tool_result` pairing by `toolUseId` (every Python wrapper)
- "What Bash commands ran?" via regex over `tool_use.input.command`
- "What files were touched?" by grouping `Read`/`Edit`/`Write` by `file_path`
- Side-by-side comparison of two same-workflow traces with different outcomes

The CLI today registers 19 commands in
[`libraries/libeval/bin/fit-trace.js`](../../libraries/libeval/bin/fit-trace.js):
15 are analyst-facing (`overview`, `count`, `batch`, `head`, `tail`,
`search`, `tools`, `tool`, `errors`, `reasoning`, `timeline`, `stats`,
`init`, `turn`, `filter`); four are administrative or IO (`runs`,
`download`, `split`, `assert`). Every analyst-facing verb except `count`
and `timeline` emits a JSON envelope via `writeJSON`
([`libraries/libeval/src/commands/trace.js`](../../libraries/libeval/src/commands/trace.js)).
Envelope shapes vary across verbs (a flat array from `errors`, an array of
`{turn, matches[]}` records from `search`, plain turn objects from
`tool <name>`), so each analysis pass writes a fresh wrapper per verb.
The `toolUseId`-collection helper exists internally
([`libraries/libeval/src/trace-query.js`:359-370](../../libraries/libeval/src/trace-query.js))
but is reachable only via `tool <name>`, which returns turn objects that
still require caller-side reconstruction of the pairing.

Cumulative reflection:
[`wiki/fit-trace-reflection-2026-05-16.md`](../../wiki/fit-trace-reflection-2026-05-16.md)
catalogues 19 numbered pain points across both sessions; the six addressed
below recurred independently in both passes. The remaining 13 are
quality-of-life polish (see Out of Scope).

## Why this matters

**Platform Builders: Evaluate and Improve Agents**
([JTBD.md:257-283](../../JTBD.md)):

- **Big Hire ([JTBD.md:263](../../JTBD.md)):** "Help me prove whether agent
  changes improved outcomes with reproducible evidence."
- **Little Hire ([JTBD.md:266-267](../../JTBD.md)):** "Help me generate test
  data and chart agent metrics to distinguish signal from noise."

The documented `fit-trace` analysis method is the canonical way to build
that evidence base from real agent traces. Kata teams running PDSA-Study
([KATA.md](../../KATA.md)) consume `fit-trace` for the same job, one layer
up. The CLI and the skill currently teach contradictory workflows — the
skill says "browse to form a theory", the CLI surface optimises for
"extract a known field from JSON". Closing the gap turns `fit-trace` from
a JSON-extraction utility into a tool that supports the analysis the skill
documents.

## Why bundle all six

The six changes are bundled into one spec rather than carved into three
along the issue's "1 / 3 / 6" leverage axis because they share a single
user-visible promise: that following the documented method does not
require Python wrappers. Shipping changes 1-3 alone (the issue's "three
ship" carve) closes the aggregation gap but leaves the JSON-default tax
intact, so every aggregator output still requires a wrapper to display.
Shipping changes 5-6 alone makes existing output friendlier but leaves
the aggregation primitives missing. The Python-wrapper tax is paid as
long as either side of the gap remains. The bundling boundary respects
that contract; staging within the bundle is a HOW decision for the
design.

## Scope

Six user-visible changes to the `fit-trace` CLI contract. Affected
surfaces:

| Surface | Role |
| --- | --- |
| `libraries/libeval/bin/fit-trace.js` | Verb registration and argument parsing |
| `libraries/libeval/src/commands/trace.js` | Verb handlers and output emission |
| `libraries/libeval/src/trace-query.js` | Analysis primitives, including the existing `collectToolUseIds` ID-gathering helper |
| `.claude/skills/fit-trace/SKILL.md` | Method-to-surface alignment in the documented analysis flow |
| `websites/fit/docs/libraries/prove-changes/trace-analysis/index.md` (guide source) | Caller-facing documentation referenced by the skill and the CLI `--help` |

### Verb-set vocabulary used below

- **Analyst-facing verbs (15):** `overview`, `count`, `batch`, `head`,
  `tail`, `search`, `tools`, `tool`, `errors`, `reasoning`, `timeline`,
  `stats`, `init`, `turn`, `filter`. Of these, 13 emit JSON today (all
  except `count` and `timeline`, which emit plain text).
- **Administrative or IO verbs (4):** `runs`, `download`, `split`,
  `assert`. Out of scope for the default-output and variadic-file
  changes; not mentioned again below.
- **Variadic-eligible verbs (10 after this spec):** the 7 existing
  analyst-facing verbs whose contract is cross-trace meaningful
  (`overview`, `search`, `tools`, `errors`, `reasoning`, `stats`,
  `filter`) plus the 3 new aggregator verbs (`tool-calls`, `commands`,
  `paths`). Verbs whose argv binds an additional positional to a single
  file (`batch`, `head`, `tail`, `tool`, `turn`), the single-trace verbs
  whose output makes no sense aggregated (`count`, `timeline`, `init`),
  and the explicitly two-file verb `compare` are excluded.

None of the four new verb names (`tool-calls`, `commands`, `paths`,
`compare`) collide with names in the existing 19-verb registry. `tool-calls`
is one character from `tool` and `tools`; that ambiguity is acknowledged
in Risks below.

### The six changes

Proposed verb and flag names follow the originating issue
([#996](https://github.com/forwardimpact/monorepo/issues/996)).

| # | Change | Type | Visible contract |
| --- | --- | --- | --- |
| 1 | `tool-calls` verb | NEW VERB | Emits one record per `tool_use` block in the trace, each carrying the matching `tool_result` joined by `toolUseId`. Records lacking a result (orphaned calls) MUST be emitted with the result field present and explicitly empty (the exact empty sentinel is a design choice), never silently dropped. |
| 2 | `commands` and `paths` verbs | NEW VERBS | `commands` emits one record per `tool_use` block whose `name === "Bash"`, carrying the command text; supports an inline filter that restricts emission to records whose command text matches the filter. `paths` emits a frequency-sorted list whose entries are the distinct `file_path` arguments to `Read`, `Edit`, and `Write` tool calls; supports an optional prefix filter. |
| 3 | Variadic file arguments + source-prefixed records | CHANGE TO THE 10 VARIADIC-ELIGIBLE VERBS | The 10 verbs enumerated under "Variadic-eligible verbs" above accept one or more files. With multiple files, every emitted record carries the source filename per the `grep -H` convention. With a single file (whether passed literally or via a glob that expands to one match), no source-filename prefix appears. |
| 4 | `compare` verb | NEW VERB | Takes exactly two trace files and emits a side-by-side view of, for each trace: turn count, distinct tools used, paths touched, and cost; plus a per-tool delta of tool-invocation frequencies. Each trace's identifying metadata (case name, participant) MUST appear in the output. Behaviour on edge cases MUST be defined and non-error: two identical traces emit zero deltas with metadata; either or both traces empty emit zeroed counters and an "empty trace" marker on the affected side(s). |
| 5 | Default human-readable output; JSON opt-in via `--format json` | CHANGE TO ANALYSIS VERBS THAT EMIT JSON (TODAY OR ON FIRST SHIP) | The 13 existing JSON-emitting analyst-facing verbs (`overview`, `batch`, `head`, `tail`, `search`, `tools`, `tool`, `errors`, `reasoning`, `stats`, `init`, `turn`, `filter`) and the 4 new verbs (`tool-calls`, `commands`, `paths`, `compare`) flip default output to grep/awk/eyeball-friendly text. `--format json` opts back in. The JSON shape under `--format json` MUST be structurally equivalent to today's default JSON for the 13 existing verbs — `JSON.parse` on the two outputs MUST produce equal objects under deep structural equality, with thinking-signature inclusion controlled by today's `--signatures` flag (preserved as-is). `count` and `timeline` (plain text today) are unchanged. `search` is the explicit exception: under `--format json` its matched-block representation MAY change (the spec is redefining what a `search` record carries), so structural-equivalence is required only for the top-level envelope shape (an array of records) and not for the per-match interior. |
| 6 | `stats --by-tool` and `stats --summary` | EXTEND EXISTING VERB | `--by-tool` emits a per-tool record set carrying turn count, cumulative input tokens, cumulative output tokens, and a token-proportional cost share (a fraction summing to 1.0 across all buckets, or equivalently a per-bucket dollar value derived as the bucket's token share of `stats().totals.totalCostUsd`). Token-attribution rule: each `tool_use` block contributes an equal share of its host turn's usage to that block's tool name; assistant turns containing no `tool_use` block contribute their full usage to a clearly-non-tool sentinel bucket (the bucket name is a design choice but MUST be impossible to collide with any real tool name — e.g. surrounded by parentheses or other characters tool names cannot contain). The sum of input tokens and the sum of output tokens across all buckets MUST equal the corresponding totals returned by `npx fit-trace stats <file>` un-flagged. `--summary` suppresses the per-turn array and emits totals only. |

### Out of scope

| Item | Reason deferred |
| --- | --- |
| The remaining 13 pain points in `wiki/fit-trace-reflection-2026-05-16.md` (default participant filter, `runs` filter, hook-event surfacing, `Stop` hook coverage, cross-trace queries beyond `compare`, participant cast in `download` output, timeline truncation, `ToolSearch` counting, `numTurns` per-participant accuracy, `structured.json` vs ndjson canonicality, plus three others). | Quality-of-life polish. The issue body classifies these explicitly as outside the top-6 leverage. Revisit after the six above land and the reflection is updated. |
| JSON envelope unification across verbs (today's shapes vary). | Spec preserves today's JSON shapes under `--format json` so existing scripted callers migrate with one flag. Unifying envelopes is a separate breaking change with its own migration story; not coupled to the default-output flip. |
| Variadic on the verbs whose argv binds additional positionals to a single file (`batch`, `head`, `tail`, `tool`, `turn`) and on the single-trace verbs (`count`, `timeline`, `init`). | Either parser ambiguity (positional collisions) or no cross-trace meaning. A future spec can revisit if cross-trace use cases emerge. |
| New non-CLI surfaces (web viewer, language bindings). | The friction is on the CLI; no signal that another surface is needed. |
| External-consumer migration tooling beyond `--format json`. | The `--format json` opt-in is the migration path. External consumers are unknown in number; building tooling for them is not warranted. In-repo callers are updated alongside the change (see Risks). |

## Success criteria

Each criterion describes the post-change contract and names a verification
path that becomes runnable once the change lands. Cited verification
commands ARE NOT runnable today; they describe what an acceptance check
will exercise.

1. **Tool-call pairing is one verb call away.** `npx fit-trace tool-calls
   <file>` emits one record per `tool_use` block in the trace, each
   carrying either a paired `tool_result` field (joined by `toolUseId`)
   or an explicitly-empty result placeholder for orphaned calls. Verifiable
   by running `npx fit-trace tool-calls <file> --format json | jq length`
   against a trace, then independently summing the `tool_use`-block counts
   from `npx fit-trace tool <T> --format json | jq '[.[] | .content[]? | select(.type=="tool_use" and .name=="<T>")] | length'` across every distinct tool name observed in the trace; the two totals MUST be equal.

2. **Bash-command and path aggregators exist as first-class verbs.**
   `npx fit-trace commands <file>` emits one record per `tool_use` block
   whose `name === "Bash"`, carrying the command text. The inline filter
   restricts emission to records whose command text matches the filter.
   `npx fit-trace paths <file>` emits a frequency-sorted list whose
   entries are the distinct `file_path` arguments to `Read`, `Edit`, and
   `Write` tool calls in the trace; the optional prefix filter restricts
   emission to paths whose value begins with the prefix. Both verbs are
   verifiable by independently extracting the same set from the trace's
   structured content and confirming `commands` emits one record per
   `Bash` block and `paths` emits one record per distinct file path,
   sorted by descending frequency.

3. **Multi-file analysis works without shell loops.** The 10 variadic-
   eligible verbs enumerated under "Verb-set vocabulary" accept one or
   more files. With multiple files, every emitted record carries its
   source filename. With a single file (whether passed literally or via a
   glob that expands to one match), no source-filename prefix appears.
   Verifiable by running `npx fit-trace paths
   /tmp/trace-*/structured.json --filter wiki/` and confirming a single
   combined frequency-sorted list emerges with each record's source
   filename present when the glob expands to more than one match.

4. **Side-by-side comparison is one verb call away.** `npx fit-trace
   compare <a> <b>` emits a single output covering, for both traces: turn
   count, distinct tools used, paths touched, and cost; plus a per-tool
   delta of tool-invocation frequencies. Each trace's identifying
   metadata (case name, participant) appears in the output. On two
   identical files the delta table emits zero deltas and metadata still
   appears for both sides. With either or both traces empty, the verb
   exits 0 and emits zeroed counters for the empty side(s) with a clearly
   labelled empty-trace marker; it does not error or refuse to run.

5. **Default output is human-readable; `--format json` opts in and is
   shape-stable.** The 13 existing JSON-emitting analyst-facing verbs and
   the 4 new verbs default to text output that does not parse as JSON.
   `--format json` returns a structurally-equivalent shape to the verb's
   current default output for the 13 existing verbs — `JSON.parse` of
   today's output and `JSON.parse` of tomorrow's `--format json` output
   MUST be deep-structurally-equal under thinking-signature behaviour
   preserved by today's `--signatures` flag. `search` is the exception:
   under `--format json` its top-level envelope (an array of records)
   MUST remain structurally compatible, but the matched-block interior
   MAY carry the new machine-parseable representation that the default
   output introduces. Verifiable by running each affected verb both ways
   and asserting `JSON.parse` deep equality of the captured baseline JSON
   against the post-change `--format json` output (with the `search`
   exception scoped to top-level shape only).

6. **`stats` answers cost-per-tool and summary-only questions.**
   `npx fit-trace stats <file> --by-tool` emits a per-tool record set
   carrying turn count, cumulative input tokens, cumulative output
   tokens, and a token-proportional cost share. Per the attribution rule
   in change 6, the sums of input tokens and output tokens across all
   buckets equal the corresponding totals returned by `npx fit-trace
   stats <file>` un-flagged. The cost share fields sum to the total cost
   returned by un-flagged `stats` (or to 1.0 if reported as a fraction).
   `npx fit-trace stats <file> --summary` emits only the totals block,
   suppressing the per-turn array.

## Risks

| Risk | Magnitude | Mitigation contract |
| --- | --- | --- |
| Change 5 breaks every current consumer scripting against JSON-default output. | Medium — repo-internal callers exist (the wiki reflection cites Python wrappers); external callers are unknown. | (a) `--format json` MUST land in the same PR as the default-output flip — no commit lands one without the other. (b) The JSON output under `--format json` MUST be structurally equivalent (via `JSON.parse` deep equality, signatures controlled by today's `--signatures` flag) to today's default output for the 13 existing JSON-emitting verbs; `search`'s exception is scoped to the matched-block interior. (c) The PR MUST inventory every in-repo caller of `fit-trace`'s analysis verbs (`rg 'fit-trace ' libraries/ services/ products/ scripts/ tests/ docs/ websites/`, then filter to lines that pipe to `jq`, `python`, or `node`) and update each in the same PR. (d) The change MUST add a CHANGELOG entry under the libeval package documenting the flip and the migration. |
| Change 5's structural-equivalence claim may be hard to honour if the design refactors shared rendering code. | Low — fixtures bind the contract. | The design MUST capture a JSON fixture per affected verb on `main` before refactoring, then verify `--format json` output against the fixture via `JSON.parse` deep equality. The fixture set is the binding reference. |
| `compare` over very different traces (different participants, different workflows) may emit misleading deltas. | Low — caller-driven choice of inputs. | Each trace's identifying metadata (case name, participant) MUST appear in the output so the caller can see what was compared. No automatic alignment beyond the documented per-tool delta is performed. |
| Variadic file arguments could double-count records or hide source attribution if applied inconsistently across verbs. | Low — only matters cross-file. | With more than one file, every emitted record carries the source filename in both default text and `--format json` output. With a single file, no prefix appears. The contract is uniform across the 10 variadic-eligible verbs. |
| `tool-calls` and the existing `tool`/`tools` verbs differ by one character; users may confuse them. | Low — naming proposed by issue and adopted here. | CLI `--help` for `tool-calls`, `tool`, and `tools` MUST cross-reference each other, and the published trace-analysis guide MUST show all three in adjacent examples so the differences are visible at first encounter. |
