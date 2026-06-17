# Plan 1910 — deterministic per-participant trace harvest

Implements [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Two disjoint tracks land independently. Track A (libxmr CSV keying) extends the
metrics row with a trailing `host_run` column, keeping legacy 7-column rows
valid for every reader. Track B (libeval discovery) teaches `listRuns` a
participant filter and adds `findByKey` plus a `find` subcommand, both matching
on artifact names and shared-artifact member filenames — never trace content.
Track C publishes the keying convention in KATA.md. The CSV-schema steps within
Track A must land together (writer + parser + validator) or validation breaks.

Libraries used: libxmr (csv, constants, record), libeval (trace-github,
commands/trace).

## Track A — metrics CSV keying (libxmr)

### A1. Add the `host_run` column to the schema

Intent: make `host_run` the eighth column and keep the parser reading it
positionally.

Files modified: `libraries/libxmr/src/constants.js`,
`libraries/libxmr/src/csv.js`.

- `constants.js`: append `host_run` to `HEADER` and `COLUMNS`:
  ```js
  export const HEADER = "date,metric,value,unit,run,note,event_type,host_run";
  export const COLUMNS = [
    "date",
    "metric",
    "value",
    "unit",
    "run",
    "note",
    "event_type",
    "host_run",
  ];
  ```
- `csv.js` `parseLine`: add `hostRun: fields[7] || ""` to the returned row
  object (after `eventType`) and add `host_run` to the function's JSDoc field
  roster. `event_type` stays at `fields[6]`; legacy 7-field rows yield
  `hostRun: ""`.

Verify: `node --test libraries/libxmr/test/csv.test.js` — existing parse tests
still pass; add: a 7-field line parses with `hostRun === ""`; an 8-field line
parses with `eventType` still from `fields[6]` and `hostRun` from `fields[7]`.

### A2. Accept both headers in `validateCSV`

Intent: legacy 7-column files stay valid; `host_run` is never required.

Files modified: `libraries/libxmr/src/csv.js`.

- Replace the exact `lines[0].trim() !== HEADER` check with one that accepts the
  header **with or without** the trailing `host_run` column. Concretely: the
  header is valid if its trimmed form equals `HEADER` (8-col) or `HEADER` minus
  the `,host_run` suffix (7-col legacy).
- `validateRow` is unchanged: `host_run` adds no required-field check; the
  `event_type`-non-empty check still reads `fields[6]`.
- `headerMismatchMessage` already diffs against `COLUMNS`; with `host_run` now
  in `COLUMNS`, a truly malformed header still reports correctly.

Note: adding `host_run` to `COLUMNS` changes `headerMismatchMessage` output —
the existing "rejects wrong header" case asserts the message contains
`missing=[event_type]`, which becomes `missing=[event_type,host_run]`. Update
that assertion as part of this step (the rejection still fires; only the
expected `missing=[…]` text changes).

Verify: `node --test libraries/libxmr/test/csv.test.js` — add cases: an 8-col
header validates; a 7-col legacy header validates; a header missing `event_type`
still fails (with the updated `missing=[…]` text).

### A3. Write `host_run` from `record.js`

Intent: a CI row carries `$GITHUB_RUN_ID`; a local row carries `local`.

Files modified: `libraries/libxmr/src/commands/record.js`.

- In `parseRecordOptions`, derive `hostRun`:
  ```js
  const hostRun = runtime.proc.env.GITHUB_RUN_ID || "local";
  ```
  add it to the returned `opts`.
- Append `opts.hostRun` to the `row` array in `runRecordCommand` (the array that
  ends `...opts.note, opts.eventType]` before `.map(csvField).join(",")`), so
  the written row has eight fields in `COLUMNS` order.
- New files already write `HEADER` (now 8-col) at `runRecordCommand`'s
  `writeFileSync(csvPath, HEADER + "\n")` — no extra change.
- **Update existing assertions.** Five existing `record.test.js` cases assert
  `lines[1].endsWith(",<event_type>")`; these run without `GITHUB_RUN_ID`, so
  rows now end `,local`. Update those assertions to expect the trailing
  `,<event_type>,local` (or assert the eighth field directly). This is a
  required edit of the step, not a side effect to discover at test time.

Verify: `node --test libraries/libxmr/test/record.test.js` — existing cases pass
after the assertion update; add cases (label them "spec 1910 criterion N" to
avoid colliding with the file's existing "criterion #3/#4" labels): with
`GITHUB_RUN_ID` set in env (the harness injects env via `makeRuntime({ env })`),
the row's eighth field equals that id (spec 1910 criterion 4); with it unset,
the eighth field is `local` (spec 1910 criterion 5); the new-file header is the
8-col `HEADER`.

### A4. Confirm `fit-xmr analyze` reads a post-change file

Intent: criterion 6 — existing consumers keep working on current-year files.

Files modified: `libraries/libxmr/test/analyze.test.js` (test only).

- Add a case (spec 1910 criterion 6): `analyze` on a CSV mixing legacy 7-col
  rows and new 8-col rows succeeds and yields the expected per-metric
  `value`/`status` for every row — the `host_run` field never feeds analysis.

Verify: `node --test libraries/libxmr/test/analyze.test.js`.

## Track B — participant-keyed discovery (libeval)

### B1. Participant filter on `listRuns`

Intent: `listRuns` returns confirmed lane matches and labeled candidates.

Files modified: `libraries/libeval/src/trace-github.js`.

The GitHub artifacts API (`GET /runs/:id/artifacts`) returns artifact-level
metadata only — it never lists a zip's member files. So matrix-host confirmation
reads the inventory (no download); dispatch-host confirmation downloads the one
shared artifact and lists its extracted member filenames (`fs.readdir`, the
listing `downloadTrace` already produces), matching on names, never on `.ndjson`
bodies.

- Add `participant` to `listRuns(opts)`. When absent, behaviour is unchanged
  (workflow-name filter only).
- When present, for each name-matched run:
  - If artifacts exist, fetch `/runs/:id/artifacts`. Matrix host: confirm when
    the participant matches an **artifact name** (`trace--<participant>`) — no
    download. Dispatch host (a single shared `trace--*` artifact): reuse
    `downloadTrace` to fetch+unzip it, then confirm when the participant matches
    an **extracted member filename**
    (`trace--<case>--<participant>.<role>.ndjson`). Emit confirmed matches with
    `match: "confirmed"`; record the download in the result's disclosed
    retrieval cost.
  - If the run's workflow mints traces but artifacts are absent (in-progress or
    not-yet-uploaded), emit the run with its `status` and
    `match: "unconfirmed-pending-artifacts"` (Decision 2). Never drop it.
- Factor the participant-in-names test into a small helper
  `participantInNames(names, participant)` (matches `trace--<participant>` or
  `trace--<case>--<participant>.<role>.ndjson`) so B2 and the fixtures share one
  grammar; the matrix path passes artifact names, the dispatch path passes
  extracted member filenames.

Test seam: `listRuns` reaches the API through the private `#get` over global
`fetch`, and the dispatch path calls `downloadTrace`. There is no runtime fetch
injection today, so fixtures stub `globalThis.fetch` for the `/actions/runs` and
`/runs/:id/artifacts` responses (the precedent is `inbox-poller.test.js` /
`reply-emitter.test.js`, which save and restore `globalThis.fetch`) and stub the
instance's `downloadTrace` to return a member-file list for the dispatch case.

Verify: `node --test libraries/libeval/test/trace-github.test.js`. Spec 1910
criterion 1: a matrix-host artifact list and a dispatch-host
(download→member-list) fixture each return the participant's run; spec 1910
criterion 2: an in-progress candidate run is present and labeled, not dropped.

### B2. `findByKey` keyed lookup

Intent: (run id, participant) → lane trace path in one operation, no
enumeration, no content read (Decision 5 / criterion 7).

Files modified: `libraries/libeval/src/trace-github.js`.

- Add `findByKey(runId, participant)`: fetch the one run's artifact list. Matrix
  host: resolve the lane from the artifact name (`pickTraceArtifact` +
  `participantInNames`), no download. Dispatch host: download the single shared
  artifact via `downloadTrace`, then resolve from its extracted member filenames
  via `participantInNames`. Return the resolved trace path. Touches exactly one
  run (no enumeration, criterion 7) and reads only filenames (no content,
  criterion 8); the dispatch download is the disclosed cost, not a content read.

Verify: fixture test in `trace-github.test.js`, using the same
`globalThis.fetch` stub (for the `/artifacts` GET) and `downloadTrace` stub seam
as B1. Spec 1910 criterion 7: a matrix fixture (artifact name) and a dispatch
fixture (downloaded member list) each resolve the path. Spec 1910 criterion 8: a
dispatch fixture whose member `.ndjson` **body** quotes a different run id
resolves correctly — matching reads only the member _filename_, never opens the
body.

### B3. CLI surface — `--participant` and `find`

Intent: expose B1/B2 through `fit-trace`.

Files modified: `libraries/libeval/src/commands/trace.js`,
`libraries/libeval/bin/fit-trace.js`.

- `commands/trace.js`: `runRunsCommand` passes
  `participant: ctx.options.participant` into `listRuns` (a flag on `runs`). Add
  `runFindCommand` that constructs `createTraceGitHub` (same as
  `runDownloadCommand`), reads its positionals as `ctx.args["run-id"]` and
  `ctx.args.participant` (the `args` array names bind into `ctx.args`, matching
  the existing bracket access for the hyphenated `run-id`), calls
  `findByKey(...)`, and writes the result via `writeJSON`.
- `bin/fit-trace.js`: add a `participant` string option to the `runs` command;
  register a `find` command with `args: ["run-id", "participant"]`,
  `argsUsage: "<run-id> <participant>"`, the `runFindCommand` handler, and a
  `repo` option; add `find` to the `NEEDS_CONFIG` set (it talks to the GitHub
  API); add a `fit-trace find <run-id> <participant>` usage example.

Verify: the `fit-trace` help golden
(`libraries/libeval/test/golden/fit-trace/help.stdout.txt`, driven by
`cases.json`) changes when the `runs --participant` option and the `find`
command are added. Regenerate it from the `libraries/libeval` package root with
`node ../../scripts/capture-cli-golden.mjs --bin fit-trace --exec bin/fit-trace.js`
(the script requires `--bin`/`--exec`; golden-dir defaults to
`test/golden/fit-trace`), then review the diff so the new surface is intended.
Add a handler-level test asserting `runFindCommand` calls `findByKey` with the
parsed positionals and that `runRunsCommand` forwards `ctx.options.participant`.
Then `node --test libraries/libeval/test/` passes, and re-running the regen with
`--verify` reports no drift.

## Track C — publish the convention

### C1. KATA.md § Metrics keying obligation

Intent: criterion 3 — the recording convention is published where metrics
conventions live.

Files modified: `KATA.md`.

- Under § Metrics (the short section near the end of the file), append one
  sentence after the existing two: every metrics CSV row carries a `host_run`
  field — `$GITHUB_RUN_ID` when written in CI, the literal `local` otherwise —
  so a row resolves to its host workflow run without a forensic sweep; narrative
  log entries are exempt (Decision 3).

Verify: `grep -n host_run KATA.md` shows the convention text. (KATA.md is not in
the `coaligned instructions` layer set — the gated files are CLAUDE.md,
CONTRIBUTING.md, JTBD.md, agent profiles/references, and skill docs — so no
length gate applies; the one-sentence addition needs no further check.)

## Risks

- **A1–A3 coupling.** Header, parser, validator, and writer must change in one
  landing. Push Track A as a unit; a partial Track A reddens `validateCSV` on
  every new file.
- **Dispatch-host confirmation requires a download.** The GitHub artifacts API
  lists artifacts, not their zip members (verified: only `downloadTrace`'s
  download→unzip→`fs.readdir` path sees member names). B1/B2 therefore download
  the single shared dispatch artifact and match on its extracted _filenames_ —
  this is the disclosed retrieval cost Decision 1 permits, never a content read
  (criterion 8 holds). Fixtures must stub the download to return a member-file
  list, not assume the artifacts API yields member names.

## Execution

Single engineering agent. Track A is one atomic unit (steps A1–A3 land together,
A4 is a test addition). Within Track B the steps are sequential: B2's
`findByKey` and B1's dispatch path both reuse the `participantInNames` helper
and `downloadTrace`, so B1 lands the helper first, then B2, then B3 wires the
CLI. Track B shares no files with Track A and can run in parallel by a second
agent. Track C is a one-sentence doc edit suitable for the same engineering
agent or `technical-writer`. Recommended: one `staff-engineer`/engineering agent
implements A then B then C sequentially, since the tracks are small and the
context is shared.

— Staff Engineer 🛠️
