# Plan 2270-a — Part 01: Shared trace core

Identity grammar and split implementation become single-owner libharness
modules; discovery and the `gemba-trace` CLI adopt them. Design refs:
[design-a.md](design-a.md) §§ Components, Key Decisions 1–5 and 9–12.

## Step 1 — Create the trace identity module

One module owns building, validating, and parsing case ids and lane
filenames.

Files: created `libraries/libharness/src/trace-identity.js`.

Exports:

```js
/** Task ids must not contain "--" or start/end with "-": the "--"
 *  delimiter and the terminal "-r<digits>" suffix then parse unambiguously. */
export function isValidTaskId(id) // boolean
/** `<taskId>-r<runIndex>`; throws when isValidTaskId(taskId) is false
 *  or runIndex is not a non-negative integer. */
export function buildCaseId(taskId, runIndex)
/** `trace--<caseId>.raw.ndjson` */
export function rawTraceFilename(caseId)
/** `trace--<caseId>--<participant>.<role>.ndjson` */
export function laneFilename(caseId, participant, role)
/** Moved verbatim from trace-multi.js (same regex, same fallback). */
export function parseIdentity(file)
/** Moved verbatim from trace-github.js (same segment-delimiter rule). */
export function participantInNames(names, participant)
/** Decision 10 key rule for one name: true when key equals the exact
 *  basename, the parsed case segment, or the parsed participant segment. */
export function nameMatchesKey(name, key)
```

`nameMatchesKey` derives case/participant via `parseIdentity` on the
basename and reuses the `participantInNames` single-name check; no second
grammar. `parseIdentity` (member filenames, regex) and
`participantInNames` (also artifact names with no extension) keep their
distinct shapes deliberately — one matches bare artifact names the other
cannot — now colocated under one owner.

Verification: `bun test libraries/libharness/test/trace-identity.test.js`
(step 7).

## Step 2 — Create the shared split module

One split implementation serves both the CLI and the benchmark runner.

Files: created `libraries/libharness/src/trace-split.js`.

```js
/**
 * Split a combined `{source, seq, event}` NDJSON trace into per-source
 * lane files named by laneFilename(caseId, source, role).
 * Classification: sources in STRUCTURAL_ROLES ("agent", "supervisor",
 * "facilitator", "judge") take their own name as role; any other valid
 * source name classifies as role "agent" with the source as participant.
 * Skips empty/malformed/non-envelope lines and orchestrator events;
 * drops sources failing /^[a-z][a-z0-9-]*$/. Lane files carry unwrapped
 * event JSON, one per line.
 * Async streaming: runtime.fs.createReadStream + node:readline in,
 * runtime.fs.createWriteStream out (lazily opened per source).
 * @returns {Promise<string[]>} paths written, resolved against outputDir
 *   (absolute iff outputDir is absolute)
 */
export async function splitTrace(runtime, inputPath, { caseId, outputDir })
```

The bucket-parsing and classification logic moves from
`commands/trace.js` (`parseBuckets`, `STRUCTURAL_ROLES`,
`VALID_SOURCE_NAME`); `judge` joins the structural-role set (decision 3 —
no current producer feeds judge-source envelopes through split, so kata
split output is unchanged).

Verification: `bun test libraries/libharness/test/trace-split.test.js`
(step 7).

## Step 3 — Rewire the CLI split and download commands

`split` keeps CLI concerns only; `download` narrows its auto-convert.

Files: modified `libraries/libharness/src/commands/trace.js`.

- `runSplitCommand`: keep input/`--mode` validation (`--mode` stays
  required-but-inert per design), `--case` default `"default"`,
  `--output-dir` default `dirname(file)`, `mkdirSync`; then
  `await splitTrace(runtime, file, { caseId, outputDir })`. Delete the
  local `parseBuckets`, `STRUCTURAL_ROLES`, and `VALID_SOURCE_NAME`.
- `runDownloadCommand`: extract the auto-convert decision into an exported
  pure helper so it is unit-testable:

  ```js
  /** The single `.ndjson` member to auto-convert, or null when the
   *  artifact carries zero or several (decision 12). */
  export function structuredConvertTarget(files)
  ```

  The handler converts only when the helper returns a member; the
  multi-member case writes no `structured.json`.
- `runFindCommand`: positional renames to `key` (`ctx.args.key`), matching
  step 6's CLI definition.

Verification: `bun test libraries/libharness/test/trace-split.test.js
libraries/libharness/test/trace-resolve-files.test.js` plus the
`structuredConvertTarget` units in step 7.

## Step 4 — Re-point trace-multi at the identity module

Files: modified `libraries/libharness/src/trace-multi.js`.

- Delete the local `parseIdentity`; import it from `./trace-identity.js`
  (used by `compareTwo`). No re-export from this module.

Verification: `bun test libraries/libharness/test/trace-multi.test.js`.

## Step 5 — Discovery: pattern, recursive listing, keyed find

Files: modified `libraries/libharness/src/trace-github.js`,
`libraries/libharness/src/index.js`.

- Delete the local `participantInNames`; import `participantInNames` and
  `nameMatchesKey` from `./trace-identity.js`. `index.js` re-points its
  `participantInNames` export to `./trace-identity.js`; no alias stays in
  `trace-github.js` (design § Clean break).
- `listRuns`: default `pattern` becomes `"kata|agent|eval|benchmark"`
  (decision 11); update the JSDoc default note.
- `downloadTrace`: list extracted members recursively via a new exported
  helper `listExtractedFiles(runtime, dir)` — `fs.readdir(dir,
  { recursive: true, withFileTypes: true })`, regular files only, paths
  relative to `dir`, `*.zip` excluded (decision 9).
- **Name matching keys on basenames at every member call site**
  (decision 9): members are now nested relative paths
  (`runs/<taskId>/<idx>/trace--*`), so `runMatchesParticipant` and
  `findByKey` map member paths through `basename()` before
  `participantInNames` / `nameMatchesKey` — otherwise `runs
  --participant` would silently omit every eval run (the
  `startsWith("trace--")` check never matches a nested path).
- `findByKey(runId, key, opts)`: matrix branch keeps its artifact-name
  match; the result field `participant` renames to `key` on both
  branches (the generalized contract — the key may be a case or exact
  filename). Dispatch branch: download each `trace--*` artifact, collect
  every member with `nameMatchesKey(basename(member), key)` across all
  artifacts; exactly one match returns `{runId, key, host: "dispatch",
  artifact, path}`; zero matches keeps the existing not-found error;
  several matches throw an error listing the matching member names so the
  caller narrows the key (decision 10 — deliberately replaces silent
  first-match).
- `runMatchesParticipant`: matching rule unchanged, now via the imported
  `participantInNames` over basenames.

Verification: `bun test libraries/libharness/test/trace-github.test.js`.

## Step 6 — gemba-trace CLI definition and goldens

Files: modified `products/gemba/bin/gemba-trace.js`,
`products/gemba/test/golden/gemba-trace/help.stdout.txt`.

- `runs`: description default-pattern text →
  `(default pattern: kata|agent|eval|benchmark)`.
- `find`: `args: ["run-id", "key"]`, `argsUsage: "<run-id> <key>"`,
  description generalized to keyed lane lookup (exact filename, case, or
  participant; ambiguous keys error with candidates).
- `download`: description notes `structured.json` is produced only for
  single-`.ndjson`-member artifacts.
- Refresh the help golden: lines 6–8 (runs/find/download descriptions),
  the usage column for `find <run-id> <key>`, and the examples block
  (`find 27401632821 release-engineer` keeps working as a participant key
  — reword its comment if one exists). The refresh is unconditional; the
  examples block does surface in the golden.

Verification: `cd products/gemba && bun test test/golden.test.js`.

## Step 7 — Tests for the shared core

Files: created `libraries/libharness/test/trace-identity.test.js`;
modified `libraries/libharness/test/trace-split.test.js`,
`libraries/libharness/test/trace-multi.test.js`,
`libraries/libharness/test/trace-github.test.js`.

- `trace-identity.test.js`: build→parse round-trip across ≥2 task ids ×
  ≥2 run indexes (spec criterion 4 — grid uniqueness of
  `buildCaseId`); `isValidTaskId` rejects `a--b`, `-a`, `a-`, accepts
  `a-b`; `buildCaseId` throws on invalid ids; `parseIdentity` cases moved
  from `trace-multi.test.js`; `participantInNames` cases moved from
  `trace-github.test.js`; `nameMatchesKey` for basename/case/participant
  keys and non-matches.
- `trace-split.test.js`: retarget the split assertions at `splitTrace`.
  `createMockFs().createReadStream` returns a real `Readable`
  (`libmock/src/mock/fs.js:274`), so the mock composes with
  `node:readline` — no real-fs fallback needed here. Add judge-source
  envelopes classifying to `trace--<case>--judge.judge.ndjson` (spec
  criterion 2's benchmark shape); keep `runSplitCommand`-level tests for
  `--mode` validation and `--case`/`--output-dir` defaults.
- `trace-github.test.js`: new default-pattern expectations (an
  `eval-kata`- or `benchmark`-named run matches); `findByKey` dispatch
  cases over nested member paths — participant key, case-segment key,
  exact-basename key, ambiguity error listing candidates;
  `runMatchesParticipant` confirms a lane from nested member paths.
  libmock's `readdir` ignores `recursive: true`, so test
  `listExtractedFiles` against the real-fs runtime
  (`test/real-runtime.js` + `mkdtemp`) with a nested
  `runs/task/0/trace--*` tree; the `findByKey`/`runMatchesParticipant`
  tests keep stubbing `downloadTrace` with nested relative member paths,
  which needs no recursive mock.
- New units for `structuredConvertTarget`: single `.ndjson` member →
  that member; zero or several → null (covers the deliberate
  cross-surface `download` narrowing).
- `trace-multi.test.js`: `parseIdentity` moves out; keep `compareTwo`
  identity-threading coverage against the imported function.

Verification: `bun test libraries/libharness`.
