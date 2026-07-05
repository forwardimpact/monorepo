# Plan 2170 — Part 01: CLI verbs

Extract the two untested inline-bash blocks into tested verbs on the CLIs that
own their domain. Independently landable; lands before part 02.

Libraries used: libcli, libutil (`runtime`), and the archive download/unzip
pattern in `libraries/libharness/src/trace-github.js`.

## Step 1 — `fit-map substrate stage --emit-env`

Emit `SUPABASE_URL`/`SUPABASE_ANON_KEY` as env-file lines after the
`url-discovery` phase, reusing the URL already parsed there.

Files:

- Modified: `products/map/src/commands/substrate-stage.js`
- Modified: `products/map/bin/fit-map.js`
- Modified: `products/map/bin/dispatch-substrate.js`
- Modified: `products/map/test/activity/substrate-stage.test.js`

Change:

- `runStageCommand` gains an `emitEnv` param (the caller-named path). In the
  `url-discovery` phase, after `runtime.proc.env.SUPABASE_URL`/`SUPABASE_ANON_KEY`
  are set, when `emitEnv` is set append these two lines to that path via
  `runtime.fs.appendFile` (create-if-absent):

  ```text
  SUPABASE_URL=<API_URL>
  SUPABASE_ANON_KEY=<ANON_KEY>
  ```

- **Declare the flag on the CLI.** The `substrate stage` command in
  `products/map/bin/fit-map.js` currently declares only `cwd` (lines 95–100);
  add an `"emit-env": { type: "string", description: "…" }` option beside it.
  Without this, libcli's strict `parseArgs` throws `ERR_PARSE_ARGS_UNKNOWN_OPTION`
  on the action's `bunx fit-map substrate stage --emit-env …` and the substrate
  leg crashes before staging.
- `dispatchSubstrate` threads `values["emit-env"]` into the `stage` case:
  `runStageCommand({ config, target: values.cwd, emitEnv: values["emit-env"], runtime })`.

Verification: `bunx fit-map substrate stage --emit-env /tmp/env.out --cwd /tmp/x`
parses without an unknown-option error (exercises the real `fit-map` libcli path,
not the `dispatch-substrate.js` USAGE string); the unit test below passes.

## Step 2 — `fit-map` emit unit test

Assert `--emit-env <tmp>` writes exactly the two `KEY=value` lines from the
stubbed status source, and that omitting it writes nothing.

Files:

- Modified: `products/map/test/activity/substrate-stage.test.js`

Change: add a `describe("substrate-stage --emit-env")` block. With the existing
`buildDeps` stub (`API_URL: http://supabase.local`, `ANON_KEY: anon-key`), pass
`emitEnv` = a path in an injected in-memory fs (or a real `mkdtemp`), run
`runStageCommand`, and assert the file contains
`SUPABASE_URL=http://supabase.local\nSUPABASE_ANON_KEY=anon-key\n`. A second case
asserts no file is written when `emitEnv` is unset.

Verification: `bun test products/map/test/activity/substrate-stage.test.js`
passes.

## Step 3 — `fit-harness scan-logs` verb

Scan a run's log archive for a set of secret literals and exit non-zero on any
hit; fail closed if the archive cannot be read.

Files:

- Created: `libraries/libharness/src/commands/scan-logs.js`
- Modified: `libraries/libharness/bin/fit-harness.js`

Change:

- New `runScanLogsCommand(ctx)` returning the standard `{ok, code, error}`
  envelope. Options: `--archive <zip>` (a resolved archive) **or**
  `--run-id <id> --repo <owner/repo>` (download the run's log archive), plus
  repeatable `--secret <label>=<literal>` declared with **`multiple: true`** (a
  repeated flag is collected into an array only when the option declares
  `multiple: true`; without it `parseArgs` keeps only the last `--secret`, so the
  scan would silently check one literal instead of three). Parse each
  `label=literal` and skip empties.
- Resolution: with `--archive`, read it directly. With `--run-id`, download the
  **run-log** archive from `/repos/{repo}/actions/runs/{runId}/logs` (a direct
  302-to-zip — not the `/artifacts` listing API `downloadTrace` uses). Reuse only
  the fetch → `pipeline` → `runtime.subprocess.run("unzip", …)` mechanics from
  `trace-github.js:238–265` (bearer-token fetch, stream to a temp zip, unzip),
  driven by `GH_TOKEN`. Fail closed (`{ok:false}`) if download or unzip fails.
- Scan every extracted file for each non-empty literal; print
  `FAIL: <label> literal in run logs` per hit to stderr; return `{ok:false}` if
  any hit, `{ok:true}` if none. `scan-logs` never reads a fixed secret env name —
  `GH_TOKEN` is auth only, not a scanned value.
- Wire the command into `fit-harness.js`: import `runScanLogsCommand`, add a
  `{ name: "scan-logs", args: [], handler: runScanLogsCommand, description, options }`
  entry with the three options, and add an `examples` line.

Verification: `fit-harness scan-logs --help` lists `--archive`, `--run-id`,
`--repo`, `--secret`; the unit test below passes.

## Step 4 — `fit-harness scan-logs` unit test

Assert the hit, clean, and fail-closed paths against a fixture archive.

Files:

- Created: `libraries/libharness/test/scan-logs.test.js`

Change: build a fixture zip in a `mkdtemp` dir (write a log file, zip it with
`runtime.subprocess.run("zip", …)` — CI carries `zip`/`unzip`). Assert:
(a) a planted literal ⇒ non-zero envelope + `FAIL:` on stderr;
(b) a clean archive ⇒ zero envelope, no `FAIL:`;
(c) a non-existent/unreadable `--archive` path ⇒ non-zero envelope (fail closed).

Verification: `bun test libraries/libharness/test/scan-logs.test.js` passes.
