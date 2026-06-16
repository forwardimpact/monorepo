# Design (a): fit-trace CLI quality-of-life for browse-mode analysis

## Problem restated

Spec 1220 ships six user-visible `fit-trace` CLI changes: three aggregator
verbs (`tool-calls`, `commands`, `paths`), variadic file arguments with
source attribution on cross-trace-meaningful verbs, a `compare` verb, default
human-readable output with `--format json` opt-in, and `stats --by-tool` /
`--summary`. The user-facing promise is that the documented grounded-theory
method no longer requires Python wrappers.

## Component map

```mermaid
graph TD
  CLI[bin/fit-trace.js<br/>verb registry + arg parsing] --> CMD[src/commands/trace.js<br/>per-verb handlers]
  CMD --> MULTI[src/trace-multi.js NEW<br/>multi-file orchestrator]
  CMD --> RENDER[src/trace-render.js NEW<br/>per-verb text renderers]
  MULTI --> QUERY[src/trace-query.js<br/>analysis primitives + new methods]
  CMD --> QUERY
  CMD --> SIG[src/signature-filter.js<br/>unchanged]
```

Two new modules (`trace-multi.js`, `trace-render.js`), three existing files
extended (`bin/fit-trace.js`, `commands/trace.js`, `trace-query.js`), two
documentation surfaces updated (`.claude/skills/fit-trace/SKILL.md`,
`websites/fit/docs/libraries/prove-changes/trace-analysis/index.md`).

## Multi-file data flow

```mermaid
sequenceDiagram
  participant H as handler
  participant M as trace-multi
  participant Q as trace-query
  participant R as trace-render
  H->>M: runOver(files, q)  [per-record verbs]
  loop file in files
    M->>Q: q(TraceQuery(file))
    Q-->>M: records
  end
  M-->>H: concat; tag source iff N>1
  Note over H,M: aggregate(files, q, key) merges by key, sums count,<br/>emits sources:[] iff N>1
  H->>R: render(records, {multi:N>1, signatures})
  R-->>H: text (or pass-through JSON under --format json)
```

`runOver` is the per-record path; `aggregate` is the frequency rollup. Source
attribution (line prefix in text, `source`/`sources` field in JSON) is
suppressed identically in both paths when N==1.

## Verb classification

| Class | Verbs | Argv shape |
| --- | --- | --- |
| Cross-trace (variadic, source-tagged when N>1) | `overview`, `count`, `head`, `tail`, `tools`, `errors`, `reasoning`, `timeline`, `stats`, `init`, `filter`, `tool-calls`, `commands`, `paths` | `<files...>` |
| Single-file (extra positional binds one file) | `batch`, `tool <name>`, `turn <index>`, `search <pattern>` | unchanged |
| Two-file (positional pair) | `compare` | `<file-a> <file-b>` |
| Admin / IO (out of scope) | `runs`, `download`, `by-discussion`, `split`, `assert` | unchanged |

`count` and `timeline` emit plain text today; the format flip is a no-op for
them but they stay in the cross-trace class so multi-file invocation gets
source attribution like every other variadic verb. `init` and `filter` go
variadic because their output is per-trace and source attribution makes
cross-case browsing legible without shell loops — the same reason the
aggregator verbs are variadic.

## Query primitives — `src/trace-query.js`

| Addition | Returns | Notes |
| --- | --- | --- |
| `toolCalls()` | `[{turnIndex, name, toolUseId, input, result}]` | `result` is `{content, isError}` joined by `toolUseId`; orphaned calls emit `result: null` (see Key Decisions) |
| `commands(re?)` | `[{turnIndex, toolUseId, command}]` | Filters `tool_use` blocks where `name === "Bash"`; optional regex tested against `input.command` |
| `paths(prefix?)` | `[{path, count}]` sorted by `count desc`, `path asc` tiebreak | Distinct `input.file_path` across `Read`, `Edit`, `Write`; optional `startsWith` prefix |
| `compare(other, {aIdentity, bIdentity})` | `{a, b, toolDelta, pathDelta}` (see below) | `other` is a peer `TraceQuery`; identities are basename-derived `{caseName, participant}` (the query has no filename). See Key Decisions rows "`compare()` return shape", "`compare()` per-trace surface", "`compare` identity source" |
| `statsByTool()` | `{perTool:[{tool, turns, inputTokens, outputTokens, costShare}], totals}` | Each `tool_use` block gets an equal share of its host turn's usage; assistant turns lacking any `tool_use` go to the `(no-tool)` bucket. Cost-share basis and rounding rule live in Key Decisions. The criterion-6 invariant — `Σ(inputTokens)` and `Σ(outputTokens)` across buckets equal the totals from `stats()` — holds by construction |
| `statsSummary()` | `{totals}` | Existing `stats().totals`; suppresses `perTurn` |

Per-side shape for `compare`: each of `a` and `b` carries
`{metadata:{caseName, participant}, turnCount, tools:string[], paths:string[],
pathCount, cost}` — `caseName`/`participant` are parsed from each input's
basename against the `split` convention `trace--<case>--<participant>.<role>.ndjson`,
falling back to the raw basename as `caseName` (with `participant: null`) when a
name doesn't match (`compare` accepts arbitrary files). The trace's own
`metadata` block carries no case/participant — see Key Decisions row "`compare`
identity source"; `tools` is the distinct tool-name list (criterion 4 "distinct tools used");
`paths` is the distinct file-path list (criterion 4 "paths touched");
`pathCount` is `paths.length` for at-a-glance asymmetry; `cost` is
`stats().totals.totalCostUsd`. `toolDelta` is `[{tool, a, b, diff}]` over the
union of both sides' tool sets. `pathDelta` is `[{path, a, b, diff}]` over the
union of both sides' path sets, sorted by `|diff| desc`. Identical traces
emit zero deltas in both arrays. Empty traces emit zeroed counters and empty
lists with `metadata.marker = "(empty)"` on the affected side(s).

The existing `collectToolUseIds(turns, name)` helper is generalised to a
`Map<toolUseId, {turnIndex, name, input}>` covering every assistant `tool_use`
block (optionally filtered by name) — the shared join key feeding
`toolCalls()`, `commands()`, and the existing `tool(name)` path.

## Multi-file orchestrator — `src/trace-multi.js`

| Function | Behaviour |
| --- | --- |
| `runOver(files, query)` | Loads each file (basename → `TraceQuery`), calls `query(tq)`, tags each emitted record with `source: <basename>` only when N>1. Concatenates file-then-record order. |
| `aggregate(files, query, key)` | Merges record arrays keyed by `key(record)` summing `count`; produces a single frequency-sorted list. Used by `paths` and `tools`. Records carry `sources: string[]` only when N>1 (see Key Decisions row "Aggregated `sources` plurality") |
| `compareTwo(a, b)` | Loads two files, derives each side's `{caseName, participant}` from its basename (the convention parse), and threads them into `traceA.compare(traceB, {aIdentity, bIdentity})` — the `TraceQuery` has no filename of its own. Not variadic. |

Two functions, not one with a branching policy parameter — the verb-class
table above pins which function each handler reaches for.

## Output rendering — `src/trace-render.js`

One named export per renderable verb. Each renderer accepts the query
result plus `{multi: boolean, signatures: boolean}` and returns a string.

| Renderer | Default text shape |
| --- | --- |
| `renderToolCalls` | `[turnIdx] <Tool> <toolUseId>` header, `  in: <one-line input>`, `  out: <one-line result or "(no result)">` per block |
| `renderCommands` | `[turnIdx] <command-text>` one per line (grep-friendly, newlines in command text escaped) |
| `renderPaths` | `<count>\t<path>` columns, frequency-sorted |
| `renderCompare` | Two-column block: metadata header, per-row metric, then `Tool \| A \| B \| Δ` toolDelta table and `Path \| A \| B \| Δ` pathDelta table |
| `renderStatsByTool` | Columns: `Tool \| Turns \| In \| Out \| Share` sorted by `Share desc` |
| `renderStatsSummary` | Totals block only (matches today's `stats().totals` lines) |
| `renderSearch` | `[turnIdx] <match-prefix>: <excerpt>` one record-line per match. Under `--format json`, the matched-block interior carries the new representation per spec criterion 5's `search` exception (top-level envelope shape preserved, interior may change) |
| Default rule (every other renderable verb) | Existing JSON shape textified — one record per block, fields newline-separated, no JSON braces or quotes. Applies to `overview`, `head`, `tail`, `tools`, `errors`, `reasoning`, `init`, `filter`, `tool`, `turn`, `batch`, `stats` (un-flagged) |

Under multi-file invocation, record-per-line renderers (`commands`, `paths`)
prepend `<basename>:` to each line (`grep -H` convention); block renderers
(`tool-calls`, `compare`, `stats`, etc.) emit `# <basename>` header above each
block. Source attribution is suppressed when N==1.

## CLI surface — `bin/fit-trace.js`

| Change | Detail |
| --- | --- |
| Verb registry adds `tool-calls`, `commands`, `paths`, `compare` | Args: `<files...>` (cross-trace class), `<file-a> <file-b>` for `compare` |
| Args change to variadic on cross-trace verbs | Existing `<file>` becomes `<files...>` |
| `head`/`tail` carry `--lines <n>` instead of `[N]` | See Key Decisions for rationale and rejected alternative |
| New global option `--format <text\|json>` | Default `text`; `json` opts back into today's JSON envelope. Accepted on every verb; a no-op on `count`, `timeline`, and admin verbs (they emit their existing text on both settings) |
| `commands` flag `--match <regex>` | Filters records on Bash command text |
| `paths` flag `--prefix <string>` | Filters by `startsWith` |
| `stats` flags `--by-tool`, `--summary` | Existing per-turn output is the default when neither flag is set. Flags compose: `--by-tool` switches the per-turn array to per-tool buckets; `--summary` further suppresses any per-bucket/per-turn array, emitting `totals` only. Behaviour under multi-file invocation is governed by Key Decisions row "Multi-file `stats` aggregation" |

`--signatures` is preserved as-is; `--format json` honours it on every verb.
`compare`'s two file positionals bypass the multi-file orchestrator.

## Key decisions

| Decision | Choice | Rejected | Why |
| --- | --- | --- | --- |
| Text renderer location | New `src/trace-render.js` | Inline in `commands/trace.js` | Existing `src/render/` is for live-stream renderers; trace renderers are query-output formatters with a different lifecycle. A separate module keeps `commands/trace.js` focused on dispatch and lets tests import the renderers directly |
| Multi-file orchestrator location | New `src/trace-multi.js` | Inline per handler | The same load-tag-concat / aggregate-and-sort logic repeats across 13 verbs; central residence is the only way to keep source-attribution and aggregation rules consistent |
| Aggregating vs per-record dispatch | Two functions (`runOver`, `aggregate`) | One function with a branching policy parameter | A split read cleaner than a parameter switch; the verb-class table pins membership so the choice is not a per-call-site decision |
| `head`/`tail` `[N]` positional | Move to `--lines <n>` flag | Keep `head`/`tail` single-file | Variadic `<files...>` cannot coexist with an optional positional `[N]` (parse becomes ambiguous). Keeping them single-file would carve them out of cross-trace browsing — exactly the friction the spec exists to remove. The flag migration is the smaller break and bounded by spec Risks row 1c |
| Multi-file `stats` aggregation | One block per file via `runOver`; no cross-file token sum | Cross-file sum into a single combined block | Per-file blocks preserve the criterion-6 invariant inside each block and let the analyst spot per-trace cost asymmetry; cross-file sums hide which trace contributed which bucket and break the structural-equivalence story under multi-file. Structural equivalence is excluded under multi-file per criterion 5 |
| `tool-calls` name | Keep the spec's proposed `tool-calls` | Rename to `calls` / `invocations` | Risk row 5 in the spec accepts cross-referencing in `--help` and the published guide as the mitigation; renaming creates a search-term the existing reflection doesn't anticipate |
| `commands` filter semantics | Regex via `new RegExp(val)` tested against `input.command` | Substring | `search` already uses regex on trace content; consistency wins over a second pattern syntax. Substring is achievable via literal regex |
| `paths` filter semantics | Prefix via `String.prototype.startsWith` | Regex | Spec calls out prefix; matches the file-path mental model; avoids regex-escaping path separators |
| `compare()` return shape | `{a, b, toolDelta, pathDelta}` — per-side objects carry the per-trace facts, two delta arrays keyed by metric type (tool / path) | Flat `{metric, a, b, diff}[]` with per-trace facts as delta metadata | Per-side objects keep "distinct tools used" / "paths touched" structurally separate from "per-tool/per-path delta" the way criterion 4 reads them; flat shape forces consumers to filter metadata rows out of metric rows and loses the natural shape of "two traces, two sets, two deltas" |
| `compare()` per-trace surface | Per-side `tools: string[]`, `paths: string[]`, plus `pathDelta` to mirror `toolDelta` | Cardinality-only (`tools: number`, `paths: number`) with no `pathDelta` | Cardinality-only drops comparison signal criterion 4 promises (tool/path identity is lost; per-path delta has no surface). The set-plus-cardinality shape costs ~one extra field per side and one delta array |
| `compare` identity source | Parse `caseName`/`participant` from the input basename via the `split` convention `trace--<case>--<participant>.<role>.ndjson`; raw basename as `caseName` when it doesn't match | Read `metadata:{caseName, participant}` from the trace's `metadata` block | `TraceCollector` only writes `metadata` on the `init` event (`{timestamp, sessionId, model, claudeCodeVersion, tools, permissionMode}`) — no case/participant — so reading them there yields `undefined` and criterion 4 ("case name, participant MUST appear") fails. The basename is the only carrier of that identity, consistent with the `source: <basename>` attribution; the fallback keeps `compare` non-error on arbitrary filenames |
| `compare` edge cases | Empty trace emits zeroed counters with `metadata.marker = "(empty)"`; `caseName`/`participant` still resolve from the basename | Throw on empty | Spec criterion 4 requires non-error behaviour; sentinel parenthesised string mirrors `(no-tool)`. Basename-derived identity means even an init-less empty trace still names its side |
| Orphan-call sentinel in `tool-calls` | `result: null` (key always present) | `{}` empty object; omitting the key | Spec line 136 requires "present and explicitly empty, never silently dropped". `null` carries that signal in one token without inventing a sub-object shape (`{}` would also have to define what "missing fields" means for `content`/`isError`, expanding the contract); always-present key keeps the JSON shape uniform so downstream `jq` queries don't branch |
| `stats --by-tool` non-tool bucket | Sentinel `(no-tool)` | Bucket name like `_text` or `null` | Claude API tool names are camelCase identifiers; parentheses are guaranteed never to collide |
| `stats --by-tool` cost-share basis | Total tokens — `(input + output) / Σ(input + output)` | Output-only; model-priced USD; input-only | Spec wording is "token-proportional cost share"; total-tokens captures both sides of the bill, doesn't depend on a model-price table that drifts, and stays inside the `[0,1]` invariant. Model-priced share would tie the contract to pricing data outside the trace; output-only ignores the input cost dominant on Sonnet/Opus |
| Cost-share rounding strategy | Largest bucket absorbs the residual so the column sums to exactly 1.0 | Largest-remainder method; banker's rounding | Single-bucket absorption is one line of code and the binding test fixture can assert `sum === 1.0` without modelling rounding error; the residual is bounded by per-bucket precision and never material against `[0, 1]` |
| Structural-equivalence binding | JSON fixtures per affected verb are the binding reference; `--format json` output deep-equals the fixture via `JSON.parse` | Re-derive shapes from runtime | Risks row 2 mitigation pins fixtures as the binding reference; runtime derivation defeats the contract. (Fixture capture cadence is a plan-step concern.) |
| Source attribution shape | `source: <basename>` in JSON; `<basename>:` line / `# <basename>` block prefix in text | Full path; relative-path-from-cwd; parent-dir prefix only on basename collision | Basename is what aggregation needs and stays grep-friendly. Full path inflates record width and leaks local layout. Relative-from-cwd has the same leak when traces live under a per-case subdir. Parent-prefix-on-collision adds a runtime detection step and asymmetric output that's harder to script against. **Accepted collision risk**: two traces sharing a basename across directories (per-case subdir layouts) collide — disambiguation is the caller's job (rename inputs, or run from inside one directory). The plan-step fixture set covers the no-collision shape; collision behaviour is documented in the published guide |
| Aggregated `sources` plurality | `aggregate()` records carry `sources: string[]` | Pick singular (`source: string`) for parity with `runOver` | Frequency-rolled records merge entries from multiple files; collapsing to a single source loses provenance for any path or tool that appeared in more than one trace. The spec wording "the source filename" (singular, criterion 3) is satisfied by `runOver`; aggregator widening to plural is deliberate and bounded to the rollup path. `--format json` output is shape-stable on this widening because aggregator verbs only emit `sources` when N>1 (excluded from criterion 5 deep-equality per Risks row 4) |

## Out of scope (deferred to plan)

- Exact CHANGELOG copy and migration-note wording (libeval package)
- Test fixture filenames, the deep-equality assertion harness, and the
  fixture-capture step ordering (the binding-fixture contract belongs to
  this design; sequencing belongs to the plan, per spec Risks row 1a which
  governs single-PR shipment)
- The inventory of in-repo `fit-trace` callers that the same-PR update sweep
  must touch — the spec Risks row 1c contract (every in-repo caller updated
  alongside the flip, working tree consistent at the merge commit) is
  in-scope for this design; only the enumeration is plan-deferred
- Wording of the `--help` cross-references between `tool-calls`, `tool`,
  `tools` and the parallel guide edits

— Staff Engineer 🛠️
