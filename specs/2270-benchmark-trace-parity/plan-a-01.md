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
grammar.

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
 * @returns {Promise<string[]>} absolute paths written
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
- `runDownloadCommand`: produce `structured.json` only when the extracted
  artifact carries exactly one `.ndjson` member
  (`files.filter((f) => f.endsWith(".ndjson")).length === 1`); the
  multi-member case writes no `structured.json` (decision 12).
- `runFindCommand`: positional renames to `key`
  (`ctx.args.key`), matching step 6's CLI definition.

Verification: `bun test libraries/libharness/test/trace-split.test.js
libraries/libharness/test/trace-resolve-files.test.js`.

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
- `downloadTrace`: list extracted members recursively — `await
  fs.readdir(dir, { recursive: true, withFileTypes: true })`, keep regular
  files only, return paths relative to `dir`, still excluding `*.zip`
  (decision 9). Basename-level name matching stays with callers via the
  identity module.
- `findByKey(runId, key, opts)`: matrix branch unchanged (artifact name
  `trace--<key>` via `participantInNames`). Dispatch branch: download each
  `trace--*` artifact, collect every member with
  `nameMatchesKey(basename(member), key)` across all artifacts; exactly
  one match returns `{runId, participant: key, host: "dispatch", artifact,
  path}`; zero matches keeps the existing not-found error; several matches
  throw an error listing the matching member names so the caller narrows
  the key (decision 10 — deliberately replaces silent first-match).
- `runMatchesParticipant`: unchanged rule, now via the imported
  `participantInNames`.

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
- Refresh the help golden to match (`cases.json` runner regenerates or
  hand-edit lines 6–8 and the examples block if `find` example needs the
  key wording).

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
- `trace-split.test.js`: retarget the split assertions at `splitTrace`
  (async runtime seeded via `createMockFs`; fall back to
  `test/real-runtime.js` + `mkdtemp` if the mock read stream does not
  compose with readline); add judge-source envelopes classifying to
  `trace--<case>--judge.judge.ndjson` (spec criterion 2's benchmark
  shape); keep `runSplitCommand`-level tests for `--mode` validation and
  `--case`/`--output-dir` defaults.
- `trace-github.test.js`: new default-pattern expectations (an
  `eval-kata`- or `benchmark`-named run matches); `findByKey` dispatch
  cases — case-segment key, exact-basename key, ambiguity error listing
  candidates; recursive member listing (a member under
  `runs/task/0/`).
- `trace-multi.test.js`: `parseIdentity` moves out; keep `compareTwo`
  identity-threading coverage against the imported function.

Verification: `bun test libraries/libharness`.
