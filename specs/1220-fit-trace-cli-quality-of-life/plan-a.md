# Plan (a): fit-trace CLI quality-of-life for browse-mode analysis

Implements [design-a](design-a.md) for [spec 1220](spec.md).

## Approach

Land the whole bundle in one PR so the default-output flip and `--format json`
opt-in ship together (spec Risks row 1a). Sequence: capture per-verb JSON
fixtures from the current behaviour **first** (step 1), so the
structural-equivalence contract has a frozen reference before any renderer
exists; export `loadTrace` and add the query primitives (step 2), build the two
orchestrator/render modules (steps 3-4), wire the CLI verbs and `--format`
switch (step 5), flip handlers to route through render + multi (step 6), extend
`stats` (step 7), sweep in-repo caller examples (step 8), update the two method
surfaces and the CHANGELOG (steps 9-10). Each step is independently verifiable
against `bun test libraries/libeval` and the spec's six criteria. Internal
contributors run the binary as `bunx fit-trace …` (or `node
libraries/libeval/bin/fit-trace.js …`); `npx` appears only in caller-facing
docs.

Libraries used: libeval (TraceQuery, and the existing `loadTrace` wrapping
TraceCollector), libcli (createCli — positionals pass through as a raw array, so
variadic needs no parser change), libconfig (createScriptConfig), libtelemetry
(logger).

## Step 1: Capture baseline JSON fixtures (structural-equivalence reference)

Intent: freeze today's `--format json`-equivalent output per affected verb
before any code changes, so the equivalence test (step 6) binds against a
reference, not runtime re-derivation (spec Risks row 1b).

- Created: `libraries/libeval/test/fixtures/trace-1220.ndjson` — one
  hand-built NDJSON trace exercising every block type: assistant text turns,
  `Bash`/`Read`/`Edit`/`Write` `tool_use` blocks, paired and one orphaned
  `tool_result`, an error result, a thinking block with a signature, and usage
  on every assistant turn.
- Created: `libraries/libeval/test/fixtures/trace-query-1220/{overview,head,tail,tools,errors,reasoning,init,filter,tool,turn,batch,stats}.json`
  — captured by running each method's current code path over the fixture
  (e.g. `createTraceQuery(...).overview()` → `JSON.stringify(stripSignatures(...), null, 2)`).
  `head`/`tail` are captured at the post-change default `n = 10` so the
  equivalence comparison in step 6 (which invokes `--lines 10`) is
  apples-to-apples. Capture is a committed, retained fixture-builder script
  `test/fixtures/trace-query-1220/build.mjs` (not a throwaway), so the frozen
  reference is regenerable after a legitimate schema change.

Verification: a new `test/trace-1220-equivalence.test.js` (added in step 6)
reads each fixture and deep-equals it against the post-change `--format json`
output; in this step the fixtures and the builder are committed.

## Step 2: Query primitives + export `loadTrace` — `src/trace-query.js`, `src/commands/trace.js`

Intent: add the six analysis methods, generalise the ID helper, and make
`loadTrace` injectable so the step-3 orchestrator can load files without
duplicating IO policy.

- Modified: `libraries/libeval/src/trace-query.js`
- Modified: `libraries/libeval/src/commands/trace.js` — change `loadTrace`
  (line 240) from module-private to `export function loadTrace(file)`; no
  body change. This is the single load entry point step 3 injects.

Add to `TraceQuery`:

```js
toolCalls()      // [{turnIndex, name, toolUseId, input, result}]; result is
                 // {content, isError} joined by toolUseId, or null for orphans
commands(re)     // [{turnIndex, toolUseId, command}]; Bash blocks; if re given,
                 // new RegExp(re).test(input.command)
paths(prefix)    // [{path, count}] sorted count desc, path asc; distinct
                 // file_path across Read/Edit/Write; prefix via startsWith
compare(other, {aIdentity, bIdentity})  // {a, b, toolDelta, pathDelta}
statsByTool()    // {perTool:[{tool, turns, inputTokens, outputTokens, costShare}], totals}
statsSummary()   // {totals} — this.stats().totals, no perTurn
```

- Add a new module-private `collectToolUseBlocks(turns, name?)` returning
  `Map<toolUseId, {turnIndex, name, input}>` over every assistant `tool_use`
  block (name filter optional). `toolCalls` and `commands` consume it. Keep the
  existing `collectToolUseIds(turns, name)` (the `Set`-returning helper at line
  359) and the existing `tool(name)` body byte-unchanged so `tool()`'s ordering
  (assistant turns then matching result turns, sorted by `index`) is preserved;
  `collectToolUseIds` may delegate to `new Set(collectToolUseBlocks(turns, name).keys())`
  only if the existing `tool()` test still passes unchanged.
- `statsByTool`: each `tool_use` block in an assistant turn gets `usage/(#tool_use
  blocks in that turn)` of `inputTokens` and `outputTokens`; assistant turns with
  zero `tool_use` blocks contribute full usage to the `(no-tool)` bucket. The
  per-bucket `turns` field counts the distinct host turns that contributed at
  least one block to that bucket (a turn with two distinct tools counts once in
  each tool's bucket). `costShare` = `(in+out)/Σ(in+out)` per bucket; the
  largest bucket absorbs the residual so the column sums to exactly `1.0`.
  Attribution covers only `inputTokens`/`outputTokens` (the two fields spec
  criterion 6 names); cache-token fields are **not** bucketed. `totals` is
  `this.stats().totals` verbatim (carries the cache fields un-split), so
  `Σ bucket.inputTokens === totals.inputTokens` and
  `Σ bucket.outputTokens === totals.outputTokens` hold by construction — the
  exact equality spec criterion 6 verifies.
- `compare`: build per-side `{metadata:{caseName, participant}, turnCount,
  tools:string[], paths:string[], pathCount, cost}` from `this` and `other`;
  `metadata` comes from the passed `aIdentity`/`bIdentity` (TraceQuery carries no
  filename). `toolDelta` = `[{tool, a, b, diff}]` over the union of both tool
  sets; `pathDelta` = `[{path, a, b, diff}]` over the union of both path sets,
  sorted `|diff|` desc. Empty side: zeroed counters, empty lists,
  `metadata.marker = "(empty)"`.

Verification: extend `test/trace-query.test.js` with cases per method:
`toolCalls` count equals `tool_use` block count and orphan emits `result:null`;
`commands` filter; `paths` frequency+prefix; `statsByTool` token sums equal
`stats().totals` and `costShare` sums to `1.0`; `compare` identical-traces zero
deltas and empty-trace marker. `bun test libraries/libeval/test/trace-query.test.js`.

## Step 3: Multi-file orchestrator — `src/trace-multi.js`

Intent: centralise load-tag-concat and aggregate-and-sort so all 14 cross-trace
verbs share one source-attribution rule.

- Created: `libraries/libeval/src/trace-multi.js`

```js
runOver(files, query, load)        // load each file → TraceQuery, call query(tq),
                                   // tag each record source:<basename> iff files.length>1;
                                   // concat in file-then-record order
aggregate(files, query, key, load) // merge record arrays by key(record), summing each
                                   // record's existing count field (not occurrence count),
                                   // frequency-sort by count desc; records carry
                                   // sources:string[] iff files.length>1
compareTwo(a, b, load)             // load two files, derive each {caseName,participant}
                                   // from basename via the split convention, thread into
                                   // a.compare(b, {aIdentity, bIdentity})
```

- `load` is injected (the now-exported `loadTrace` from `commands/trace.js`,
  step 2) so the module stays IO-policy-free and unit-testable with a stub.
- `aggregate` keys: `paths` uses `key = r => r.path` and sums `r.count`; `tools`
  uses `key = r => r.tool` and sums `r.count` (both query results already carry
  `count`, so the merge sums the existing field rather than re-counting). The
  merged record re-emits the same key field plus the summed `count`.
- Basename identity parse: match `trace--<case>--<participant>.<role>.ndjson`;
  on no match, `caseName` = basename minus the final `.ndjson` extension only,
  `participant` = `null`.

Verification: new `test/trace-multi.test.js` — `runOver` over two files tags
`source`, over one file does not; `aggregate` merges counts and emits `sources`
only when N>1; `compareTwo` parses convention and fallback names.
`bun test libraries/libeval/test/trace-multi.test.js`.

## Step 4: Output rendering — `src/trace-render.js`

Intent: one text renderer per renderable verb; each accepts the query result
plus `{multi, signatures}` and returns a string.

- Created: `libraries/libeval/src/trace-render.js`

Exports `renderToolCalls`, `renderCommands`, `renderPaths`, `renderCompare`,
`renderStatsByTool`, `renderStatsSummary`, `renderSearch`, and a `renderDefault`
covering every other renderable verb (`overview`, `head`, `tail`, `tools`,
`errors`, `reasoning`, `init`, `filter`, `tool`, `turn`, `batch`, `stats`
un-flagged), per the design's renderer table. Text shapes:

- `renderToolCalls`: `[turnIdx] <Tool> <toolUseId>` / `  in: <one-line input>`
  / `  out: <one-line result or "(no result)">`.
- `renderCommands`: `[turnIdx] <command>` per line, newlines escaped.
- `renderPaths`: `<count>\t<path>` frequency-sorted.
- `renderCompare`: metadata header printing `caseName` and `participant` for
  both sides (`participant` → `(none)` when null), per-row metrics, then
  `Tool | A | B | Δ` and `Path | A | B | Δ` tables.
- `renderStatsByTool`: `Tool | Turns | In | Out | Share` sorted Share desc.
- `renderSearch`: `[turnIdx] <prefix>: <excerpt>` per match.
- Multi: record-per-line renderers prepend `<basename>:`; block renderers emit
  `# <basename>` headers. Suppressed when N==1.
- `trace-multi.js` and `trace-render.js` are internal modules; tests import them
  by relative path (the pattern `commands/trace.js` already uses), so they stay
  off the published `src/index.js` surface. No `index.js` change.

Verification: new `test/trace-render.test.js` asserts each renderer's text shape
and the `(none)`/`(no result)`/`(empty)` sentinels. `bun test libraries/libeval/test/trace-render.test.js`.

## Step 5: CLI surface — `bin/fit-trace.js`

Intent: register the four new verbs, switch cross-trace verbs to variadic
`<files...>`, add the global `--format` option and the new per-verb flags.

- Modified: `libraries/libeval/bin/fit-trace.js`

- Register `tool-calls` (`<files...>`), `commands` (`<files...>`, option
  `--match <regex>`), `paths` (`<files...>`, option `--prefix <string>`),
  `compare` (`<file-a> <file-b>`).
- Change `args` to `<files...>` on `overview`, `count`, `head`, `tail`, `tools`,
  `errors`, `reasoning`, `timeline`, `stats`, `init`, `filter`.
- `head`/`tail`: drop the `[N]` positional, add option `--lines <n>` (default
  10).
- Global option `--format`: `{ type: "string", description: "Output format: text (default) or json", default: "text" }`. This is distinct
  from the pre-existing global `json` boolean, which only controls `--help`
  rendering (`cli.js:54` `#renderHelp(command, values.json)`) and never fires
  during normal command dispatch — leave `json` unchanged. The new help text
  for `--format` makes the split explicit so callers don't confuse `--format
  json` (command output) with `--json` (help output). No rename of `json`:
  renaming would break the documented help-as-JSON surface for no gain.
- `stats` options `--by-tool`, `--summary` (both `type: "boolean"`).
- Add the new handler imports and `COMMANDS` entries
  (`runToolCallsCommand`, `runCommandsCommand`, `runPathsCommand`,
  `runCompareCommand`).
- `--help` cross-references: `tool-calls`, `tool`, `tools` descriptions each
  name the other two (spec Risks row 5). Add `examples` entries for the four new
  verbs and a `--format json` example.

Verification: `node libraries/libeval/bin/fit-trace.js --help` lists the four
new verbs and `--format`; `node ... tool-calls --help` cross-references `tool`
and `tools`.

## Step 6: Flip handlers through render + multi — `src/commands/trace.js`

Intent: every analyst-facing handler routes its query result through the
matching renderer by default and emits today's JSON only under `--format json`;
cross-trace handlers consume the variadic file list via `trace-multi`.

- Modified: `libraries/libeval/src/commands/trace.js`

- Replace each cross-trace handler body with: gather `files` from all leading
  positional args, call `runOver`/`aggregate` (per the verb-class table) with
  the verb's query closure, then `emit(result, renderer, values)` where `emit`
  writes `renderer(result, {multi: files.length>1, signatures})` unless
  `values.format === "json"`, in which case it calls the existing `writeJSON`.
- `paths` and `tools` use `aggregate`; the other cross-trace verbs use `runOver`.
- Add handlers `runToolCallsCommand`, `runCommandsCommand` (reads
  `values.match`), `runPathsCommand` (reads `values.prefix`),
  `runCompareCommand` (calls `compareTwo(args[0], args[1], loadTrace)`).
- `head`/`tail` read `values.lines` (default 10) instead of `args[1]`.
- `search`/`tool`/`turn`/`batch` keep their extra positional and stay
  single-file. Under `--format json`, `tool`/`turn`/`batch` emit today's shape
  unchanged; `search` keeps today's top-level array but its matched-block
  interior carries the new machine-parseable representation `renderSearch`
  introduces (criterion 5 `search` exception — interior changes, envelope does
  not).
- `count`/`timeline` keep emitting their exact current plain text under both
  `--format` settings. They route through `runOver` **only** to gain the
  `# <basename>` block header when N>1; under N==1 `runOver` suppresses the
  prefix, so single-file output is byte-identical to today (criterion 5 "count,
  timeline are unchanged"). The handlers pass `count`/`timeline` query results
  straight to `process.stdout.write` as today, not through a record renderer.
- `loadTrace` is the injected loader (exported in step 2); the orchestrator
  receives it as the `load` argument — no second loader path.

- Created: `libraries/libeval/test/trace-1220-equivalence.test.js` — for each
  verb in step 1's fixture set, capture the post-change handler's stdout by
  stubbing `process.stdout.write` (push each chunk to an array, restore in a
  `finally`), invoke the handler with a single file and `values.format = "json"`,
  then `JSON.parse` the captured string and the committed baseline fixture and
  assert `assert.deepStrictEqual`. `search` asserts only that both parse to a
  top-level array of equal length (criterion 5 exception). Each verb is run with
  and without `values.signatures` to confirm signature behaviour matches the
  fixture.

Verification: `bun test libraries/libeval/test/trace-1220-equivalence.test.js`
plus the full `bun test libraries/libeval`; manual single-file vs multi-file run
of `paths`/`tool-calls`/`count` confirms source attribution appears only when
N>1.

## Step 7: Extend `stats` handler

Intent: wire `--by-tool` and `--summary` into the `stats` handler and renderers.

- Modified: `libraries/libeval/src/commands/trace.js` (`runStatsCommand`)

- `--summary` → `statsSummary()` (renders/JSON-emits `totals` only).
- `--by-tool` → `statsByTool()`; `--by-tool --summary` → `totals` only.
- Neither flag → existing `stats()` per-turn output (unchanged default).
- Multi-file: one block per file via `runOver` (no cross-file token sum).

Verification: `bunx fit-trace stats <fixture> --by-tool --format json` bucket
`inputTokens`/`outputTokens` sums equal the un-flagged
`bunx fit-trace stats <fixture> --format json` `totals.inputTokens`/`outputTokens`
(cache fields excluded), and `costShare` sums to 1.0; `--summary` omits the
per-turn array. Covered by step 2's query tests plus a handler-level assertion in
the equivalence test.

## Step 8: In-repo caller sweep — working-tree consistency at merge

Intent: keep every in-repo `fit-trace` analysis-verb invocation correct under
the default-output flip in the same PR (spec Risks row 1c; design lines 182-185
defer only the enumeration to here).

The enumeration (from `rg 'fit-trace (overview|count|batch|head|tail|search|tools|tool|errors|reasoning|timeline|stats|init|turn|filter)' --glob '!specs/**'`)
is documentation and skill examples only — no committed script parses
`fit-trace` JSON output, so the flip breaks no in-repo automation; the sweep is
example-text alignment.

- Modified: `.claude/skills/fit-eval/SKILL.md` (lines ~98, 126) — example
  `overview`/`timeline`/`search`/`errors`/`stats` invocations now print text by
  default; note `--format json` where an example previously implied a JSON
  envelope.
- Modified: `websites/fit/docs/libraries/prove-changes/index.md` (lines
  ~299-338) and `.../run-eval/index.md` (lines ~163-165) — same default-output
  note; `head`/`tail` examples switch `N` positional to `--lines N`.
- Modified: `.claude/skills/fit-benchmark/SKILL.md` (line ~180) — the
  `fit-trace overview` reference is consumption-agnostic; confirm it reads
  correctly under text default (no change expected, verified not assumed).

Verification: `rg -n 'fit-trace .* [0-9]+$' .claude/skills websites/fit/docs`
finds no surviving `head`/`tail` positional-`N` example; `just check` passes.

## Step 9: Method-surface documentation

Intent: align the documented method with the new surface (spec scope rows for
SKILL.md and the guide; Risks row 5 cross-references).

- Modified: `.claude/skills/fit-trace/SKILL.md` — add the aggregator verbs
  (`tool-calls`, `commands`, `paths`), `compare`, and `stats --by-tool/--summary`
  to the method walkthrough; note default text output and `--format json`;
  show `tool-calls`/`tool`/`tools` adjacently.
- Modified:
  `websites/fit/docs/libraries/prove-changes/trace-analysis/index.md` — same
  additions in the caller-facing guide, including a multi-file glob example
  showing source attribution and the basename-collision caveat (design Key
  Decisions "Source attribution shape").

Writing under `.claude/`: follow self-improvement.md; if blocked, use
`echo … | bunx fit-selfedit <path>`.

Verification: `rg 'tool-calls' .claude/skills/fit-trace/SKILL.md websites/fit/docs/libraries/prove-changes/trace-analysis/index.md` shows the cross-references; `just check` doc lint passes.

## Step 10: CHANGELOG

Intent: document the default-output flip and the `--format json` migration
(spec Risks row 1d).

- Created: `libraries/libeval/CHANGELOG.md` — one entry under an unreleased
  heading describing the six changes and the single-flag (`--format json`)
  migration for scripted consumers. No `CHANGELOG.md` exists in-repo today and
  release tooling (`kata-release-cut`) does not consume one, so this file is
  documentation-only; confirm `just check` accepts it (it is plain Markdown
  under a package dir, which the doc lint already covers).

Verification: file exists and names `--format json` as the migration path.

## Risks

- **libcli help rendering for `<files...>`.** The `args` string is descriptive
  only (positionals pass through raw), so variadic parsing already works; the
  risk is purely that help text reads naturally. Mitigation: verify `--help`
  output in step 5.
- **Token-share residual on a single bucket.** Absorbing the rounding residual
  into the largest bucket can shift its share by up to (bucket-count × float
  epsilon); the binding test asserts `sum === 1.0` and per-bucket `≥ 0`, which
  is the only invariant the spec pins.
- **Fixture drift if `stripSignatures` changes.** The baseline fixtures encode
  today's signature-stripping behaviour; if `signature-filter.js` changes
  independently, the equivalence test fails loudly — that is the intended guard,
  not a defect.

## Execution

Single engineering agent (`staff-engineer`), sequential — steps share
`commands/trace.js` and the fixture set, so parallelism offers no real
isolation, and the doc steps (8-10) depend on the final verb/flag names settled
in steps 5-7. Keep all ten steps in one agent rather than routing docs to
`technical-writer`: the doc edits are short and must match the just-shipped
surface exactly, so splitting them across agents adds a handoff without
reducing risk.

— Staff Engineer 🛠️
