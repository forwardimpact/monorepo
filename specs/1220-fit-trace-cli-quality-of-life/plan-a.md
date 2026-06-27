# Plan (a): fit-trace CLI quality-of-life for browse-mode analysis

Implements [design-a](design-a.md) for [spec 1220](spec.md).

## Approach

Land the whole bundle in one PR so the default-output flip and `--format json`
opt-in ship together (spec Risks row 1a). Handlers run on libcli's
`InvocationContext` convention already on `main` (spec 1370): one `ctx`, flags
via `ctx.options`, named positionals via `ctx.args.<name>`, IO via
`ctx.deps.runtime`, returning `{ ok: true }`. Multiple files arrive via the
repeated `--file` option (libcli's named-slot `dispatch()` has no variadic
positional). Sequence: capture per-verb JSON fixtures from current behaviour
**first** (step 1), so the structural-equivalence contract has a frozen
reference before any renderer exists; export `loadTrace` (now
`loadTrace(runtime, file)`) and add the query primitives (step 2), build the two
orchestrator/render modules (steps 3-4), wire the CLI verbs, `--file`, and the
`--format` switch (step 5), flip handlers to route through render + multi
(step 6), extend `stats` (step 7), sweep in-repo caller examples (step 8),
update the two method surfaces and the CHANGELOG (steps 9-10). Each step is
independently verifiable against `bun test libraries/libeval` and the spec's six
criteria. Internal contributors run the binary as `bunx fit-trace …`; `npx`
appears only in caller-facing docs.

Libraries used: libeval (TraceQuery, `loadTrace` wrapping TraceCollector),
libcli (createCli, the InvocationContext `dispatch()` with `--file`
`multiple:true`), libutil (the injected `runtime` and
`runtime.fsSync.globSync`), libconfig (createScriptConfig), libtelemetry
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
- Created:
  `libraries/libeval/test/fixtures/trace-query-1220/{overview,head,tail,tools,errors,reasoning,init,filter,tool,turn,batch,stats}.json`
  — captured by running each method's current code path over the fixture (e.g.
  `createTraceQuery(...).overview()` →
  `JSON.stringify(stripSignatures(...), null, 2)`). `head`/`tail` are captured
  at the post-change default `n = 10` so the equivalence comparison in step 6
  (which invokes `--lines 10`) is apples-to-apples. Capture is a committed,
  retained fixture-builder script `test/fixtures/trace-query-1220/build.mjs`
  (not a throwaway), so the frozen reference is regenerable after a legitimate
  schema change.

Verification: a new `test/trace-1220-equivalence.test.js` (added in step 6)
reads each fixture and deep-equals it against the post-change `--format json`
output; in this step the fixtures and the builder are committed.

## Step 2: Query primitives + export `loadTrace` — `src/trace-query.js`, `src/commands/trace.js`

Intent: add the six analysis methods, generalise the ID helper, and export the
existing `loadTrace(runtime, file)` so the step-3 orchestrator can load files
through one IO seam.

- Modified: `libraries/libeval/src/trace-query.js`
- Modified: `libraries/libeval/src/commands/trace.js` — make the existing
  module-private `loadTrace(runtime, file)` (already reading via
  `runtime.fsSync.readFileSync`) an `export function`; no body change. This is
  the single load entry point step 3 injects as
  `(file) => loadTrace(runtime, file)`.

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
  373 on HEAD) and the existing `tool(name)` body byte-unchanged so `tool()`'s
  ordering (assistant turns then matching result turns, sorted by `index`) is
  preserved; `collectToolUseIds` may delegate to
  `new Set(collectToolUseBlocks(turns, name).keys())` only if the existing
  `tool()` test still passes unchanged.
- `statsByTool`: each `tool_use` block in an assistant turn gets
  `usage/(#tool_use blocks in that turn)` of `inputTokens` and `outputTokens`;
  assistant turns with zero `tool_use` blocks contribute full usage to the
  `(no-tool)` bucket. The per-bucket `turns` field counts the distinct host
  turns that contributed at least one block to that bucket (a turn with two
  distinct tools counts once in each tool's bucket). `costShare` =
  `(in+out)/Σ(in+out)` per bucket; the largest bucket absorbs the residual so
  the column sums to exactly `1.0`. Attribution covers only
  `inputTokens`/`outputTokens` (the two fields spec criterion 6 names);
  cache-token fields are **not** bucketed. `totals` is `this.stats().totals`
  verbatim (carries the cache fields un-split), so
  `Σ bucket.inputTokens === totals.inputTokens` and
  `Σ bucket.outputTokens === totals.outputTokens` hold by construction — the
  exact equality spec criterion 6 verifies.
- `compare`: build per-side
  `{metadata:{caseName, participant}, turnCount, tools:string[], paths:string[], pathCount, cost}`
  from `this` and `other`; `metadata` comes from the passed
  `aIdentity`/`bIdentity` (TraceQuery carries no filename). `toolDelta` =
  `[{tool, a, b, diff}]` over the union of both tool sets; `pathDelta` =
  `[{path, a, b, diff}]` over the union of both path sets, sorted `|diff|` desc.
  Empty side: zeroed counters, empty lists, `metadata.marker = "(empty)"`.

Verification: extend `test/trace-query.test.js` with cases per method:
`toolCalls` count equals `tool_use` block count and orphan emits `result:null`;
`commands` filter; `paths` frequency+prefix; `statsByTool` token sums equal
`stats().totals` and `costShare` sums to `1.0`; `compare` identical-traces zero
deltas and empty-trace marker.
`bun test libraries/libeval/test/trace-query.test.js`.

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

- `load` is injected (the handler passes `(file) => loadTrace(runtime, file)`,
  the export from step 2) so the module imports no `node:fs` and unit-tests with
  a stub loader.
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

- `renderToolCalls`: `[turnIdx] <Tool> <toolUseId>` / `in: <one-line input>`
  / `out: <one-line result or "(no result)">`.
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
and the `(none)`/`(no result)`/`(empty)` sentinels.
`bun test libraries/libeval/test/trace-render.test.js`.

## Step 5: CLI surface — `bin/fit-trace.js`

Intent: register the four new verbs, switch cross-trace verbs from a file
positional to the repeated `--file` option, add the global `--format` option
and the new per-verb flags. The registry uses the array-form `args` plus
`argsUsage` that spec 1370 established on `main`, and `handler:` references.

- Modified: `libraries/libeval/bin/fit-trace.js`
- Register `tool-calls` (`args: []`, `--file`), `commands` (`args: []`,
  `--file`, option `--match <regex>`), `paths` (`args: []`, `--file`, option
  `--prefix <string>`), `compare` (`args: ["file-a", "file-b"]`,
  `argsUsage: "<file-a> <file-b>"`). Add their `handler:` entries.
- Change cross-trace verbs `overview`, `count`, `head`, `tail`, `tools`,
  `errors`, `reasoning`, `timeline`, `stats`, `init`, `filter` from
  `args: ["file"]` to `args: []`, and add `--file <path-or-glob>`
  (`{ type: "string", multiple: true }`) to each. `argsUsage` drops the `<file>`
  token. Single-file verbs (`batch`, `tool`, `turn`, `search`) keep their
  positionals unchanged.
- `head`/`tail`: drop the optional `[n]` positional, add option `--lines <n>`
  (default 10 in the handler).
- Global option `--format`: `{ type: "string", default: "text" }`. Distinct
  from the pre-existing global `json` boolean, which only controls `--help`
  rendering (`cli.js:55` `#renderHelp(command, values.json)`) — leave `json`
  unchanged. `--format` help text makes the `--format json` (command output)
  vs `--json` (help output) split explicit.
- `stats` options `--by-tool`, `--summary` (both `type: "boolean"`).
- Add the new handler imports (`runToolCallsCommand`, `runCommandsCommand`,
  `runPathsCommand`, `runCompareCommand`). Dispatch is via libcli `handler:`
  references, not a `COMMANDS` map; `NEEDS_CONFIG` stays `{runs, download}`.
- `--help` cross-references: `tool-calls`, `tool`, `tools` descriptions each
  name the other two (spec Risks row 5). Add `examples` for the four new verbs
  (using `--file`) and a `--format json` example.

Verification: `bunx fit-trace --help` lists the four new verbs and `--format`;
`bunx fit-trace tool-calls --help` cross-references `tool` and `tools` and
shows `--file`.

## Step 6: Flip handlers through render + multi — `src/commands/trace.js`

Intent: every analyst-facing handler takes one `ctx`, routes its query result
through the matching renderer by default, emits today's JSON only under
`--format json`, reads/writes exclusively through `ctx.deps.runtime`, and
returns `{ ok: true }`; cross-trace handlers consume the resolved file list via
`trace-multi`.

- Modified: `libraries/libeval/src/commands/trace.js`
- Add a `resolveFiles(runtime, ctx)` helper: normalise `ctx.options.file` to an
  array, resolve each value (literal path pass-through; values with glob
  metacharacters `*?[{` expanded via `runtime.fsSync.globSync`), flatten, sort.
  Return `{ ok: false, code: 1, error: "<verb>: no files (use --file)" }` (the
  handler surfaces it) when zero resolve.
- Replace each cross-trace handler body with the `ctx` shape: destructure
  `const { runtime } = ctx.deps`; `const files = resolveFiles(runtime, ctx)`
  (return the `{ ok:false }` envelope on zero); build `load = (f) =>
  loadTrace(runtime, f)`; call `runOver`/`aggregate` (per the verb-class table)
  with the verb's query closure; then `emit(runtime, result, renderer, ctx,
  files.length > 1)` where `emit` writes `renderer(result, {multi,
  signatures: !!ctx.options.signatures})` to `runtime.proc.stdout` unless
  `ctx.options.format === "json"`, in which case it calls `writeJSON(runtime,
  payload, ctx.options)`. Return `{ ok: true }`.
- `paths` and `tools` use `aggregate`; the other cross-trace verbs use
  `runOver`.
- Add handlers `runToolCallsCommand`, `runCommandsCommand` (reads
  `ctx.options.match`), `runPathsCommand` (reads `ctx.options.prefix`),
  `runCompareCommand` (reads the two positionals `ctx.args["file-a"]`,
  `ctx.args["file-b"]`, calls `compareTwo(...)` with the injected `load`).
- `head`/`tail` read `ctx.options.lines` (default 10) instead of a positional.
- `search`/`tool`/`turn`/`batch` keep their positionals (`ctx.args.file` etc.)
  and stay single-file. Under `--format json`, `tool`/`turn`/`batch` emit
  today's shape unchanged; `search` keeps today's top-level array but its
  matched-block interior carries the new machine-parseable representation
  `renderSearch` introduces (criterion 5 `search` exception — interior changes,
  envelope does not).
- `count`/`timeline` keep emitting their exact current plain text under both
  `--format` settings, writing to `runtime.proc.stdout`. They route through
  `runOver` **only** to gain the `# <basename>` block header when N>1; under
  N==1 the prefix is suppressed so single-file output is byte-identical to
  today (criterion 5 "count, timeline unchanged"). They do not pass through a
  record renderer.
- Created: `libraries/libeval/test/trace-1220-equivalence.test.js` — follow the
  package's established handler-test pattern (`trace-cost.test.js`:16-28):
  hand-build a `ctx` `{ options, args, deps: { runtime } }` where `runtime` is
  `{ fsSync: createMockFs({ [FILE]: body }), proc: { stdout: { write: (s) =>
  (out += s) } } }` (`createDefaultRuntime()` is unusable here — its frozen bag
  forwards `proc.stdout` to the real stdout and cannot be captured). Read the
  fixture's NDJSON content once, seed it into the mock fs under a literal path,
  and pass that path via `options.file: [FILE]` (cross-trace verbs) or
  `args.file` (single-file verbs). Set `options.format = "json"`, run the
  handler, `JSON.parse` the captured `out` and the committed baseline fixture,
  and `assert.deepStrictEqual`. Literal paths never reach `globSync`, so the
  mock fs needs no glob stub. `search` asserts only that both parse to a
  top-level array of equal length (criterion 5 exception). Each verb is run with
  and without `options.signatures`.
- The one quoted-glob case (a `paths` multi-file test asserting `--file
  'glob'` expansion and source attribution) lives in a separate small test that
  builds its `runtime` from `createDefaultRuntime()` against two on-disk fixture
  copies (the only place `globSync` runs) and captures stdout via a substituted
  `proc.stdout` stub layered over the default runtime's other deps; or, simpler,
  asserts the resolution by passing two literal `--file` values (no glob) so it
  too uses the mock-fs pattern, leaving `globSync` exercised by a direct
  `resolveFiles` unit test.
- Add a `resolveFiles` unit test (in `trace-multi.test.js` or a small new file):
  a literal path returns `[path]` without touching `globSync`; a value with glob
  metacharacters calls `runtime.fsSync.globSync` (stubbed/spied) and flattens
  the result; multiple `--file` values concatenate and sort; zero resolved files
  returns `{ ok: false }`. This isolates the only `globSync` dependency from the
  handler suite.

Verification: `bun test libraries/libeval/test/trace-1220-equivalence.test.js`
plus the full `bun test libraries/libeval`; the equivalence suite confirms the
post-change `head`/`tail` `--lines` default (10) reproduces the pre-change
positional default by binding against the `n=10` baseline fixtures from step 1;
a manual `--file a --file b` run of `paths`/`tool-calls`/`count` confirms source
attribution appears only when N>1.

## Step 7: Extend `stats` handler

Intent: wire `--by-tool` and `--summary` into the `stats` handler and renderers.

- Modified: `libraries/libeval/src/commands/trace.js` (`runStatsCommand`)
- `--summary` → `statsSummary()` (renders/JSON-emits `totals` only).
- `--by-tool` → `statsByTool()`; `--by-tool --summary` → `totals` only.
- Neither flag → existing `stats()` per-turn output (unchanged default).
- Multi-file: one block per file via `runOver` (no cross-file token sum).

Verification: `bunx fit-trace stats <fixture> --by-tool --format json` bucket
`inputTokens`/`outputTokens` sums equal the un-flagged
`bunx fit-trace stats <fixture> --format json`
`totals.inputTokens`/`outputTokens` (cache fields excluded), and `costShare`
sums to 1.0; `--summary` omits the per-turn array. Covered by step 2's query
tests plus a handler-level assertion in the equivalence test.

## Step 8: In-repo caller sweep — working-tree consistency at merge

Intent: keep every in-repo `fit-trace` analysis-verb invocation correct under
the default-output flip **and the file-input surface change** in the same PR
(spec Risks row 1c; the design defers only the enumeration to here).

The enumeration (from
`rg 'fit-trace (overview|count|batch|head|tail|search|tools|tool|errors|reasoning|timeline|stats|init|turn|filter)' --glob '!specs/**'`)
is documentation and skill examples only — no committed script parses
`fit-trace` JSON output, so neither change breaks in-repo automation; the sweep
is example-text alignment. Two transforms: (a) default-output — note
`--format json` where an example previously implied a JSON envelope; (b)
file-input — every cross-trace-verb example `fit-trace <verb> <file>` becomes
`fit-trace <verb> --file <file>` (the 11 existing cross-trace verbs plus the
four new ones); single-file verbs (`tool`, `turn`, `batch`, `search`) keep their
positional file.

- Modified: `.claude/skills/fit-eval/SKILL.md` (lines ~98, 126) — cross-trace
  `overview`/`timeline`/`errors`/`stats` examples take `--file`; `search` keeps
  its positional; note text default / `--format json`.
- Modified: `websites/fit/docs/libraries/prove-changes/index.md` (lines
  ~299-338) and `.../run-eval/index.md` (lines ~163-165) — same `--file` and
  default-output transforms; `head`/`tail` examples switch the `N` positional to
  `--lines N`.
- Modified: `.claude/skills/fit-benchmark/SKILL.md` (line ~180) — the
  `fit-trace overview` reference takes `--file`; confirm it reads correctly
  under text default.

Verification:
`rg -n 'fit-trace (overview|count|head|tail|tools|errors|reasoning|timeline|stats|init|filter) [^-]' .claude/skills websites/fit/docs`
finds no surviving cross-trace positional-file example, and
`rg -n 'fit-trace (head|tail) .* [0-9]+$'` finds no positional-`N`; `just check`
passes.

## Step 9: Method-surface documentation

Intent: align the documented method with the new surface (spec scope rows for
SKILL.md and the guide; Risks row 5 cross-references).

- Modified: `.claude/skills/fit-trace/SKILL.md` — add the aggregator verbs
  (`tool-calls`, `commands`, `paths`), `compare`, and
  `stats --by-tool/--summary` to the method walkthrough; note default text
  output and `--format json`; show `tool-calls`/`tool`/`tools` adjacently.
- Modified:
  `websites/fit/docs/libraries/prove-changes/trace-analysis/index.md` — same
  additions in the caller-facing guide, including a repeated-`--file` and a
  quoted-glob example (`--file 'traces/*.ndjson'`) showing source attribution
  and the basename-collision caveat (design Key Decisions "Source attribution
  shape"), and the `--file` input convention for cross-trace verbs.

Writing under `.claude/`: follow self-improvement.md; if blocked, use
`echo … | bunx fit-selfedit <path>`.

Verification:
`rg 'tool-calls' .claude/skills/fit-trace/SKILL.md websites/fit/docs/libraries/prove-changes/trace-analysis/index.md`
shows the cross-references; `just check` doc lint passes.

## Step 10: CHANGELOG

Intent: document the default-output flip and the `--format json` migration
(spec Risks row 1d).

- Created: `libraries/libeval/CHANGELOG.md` — one entry under an unreleased
  heading describing the six changes, the single-flag (`--format json`)
  migration for scripted consumers, and the cross-trace-verb file-input change
  (positional file → `--file`). No `CHANGELOG.md` exists in-repo today and
  release tooling (`kata-release-cut`) does not consume one, so this file is
  documentation-only; confirm `just check` accepts it (plain Markdown under a
  package dir, which the doc lint already covers).

Verification: file exists and names both `--format json` and `--file` as the
migration changes.

## Risks

- **`--file` resolution and the mock runtime.** Cross-trace verbs read files
  from `ctx.options.file` (libcli `multiple:true` always yields an array) and
  expand glob values via `runtime.fsSync.globSync` — which is on `node:fs`
  (Node 22) but not stubbed by libmock's fs. Mitigation: `resolveFiles` only
  calls `globSync` when a value carries glob metacharacters, so literal-path
  tests (the equivalence suite) need no glob stub; the one quoted-glob test uses
  `createDefaultRuntime()`. Verify `--help` reads naturally with `--file` in
  step 5.
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
