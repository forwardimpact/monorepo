# Plan 2090-b, Part 04: Harness tracker selection

Add `--work-tracker` to `fit-eval` and `fit-benchmark`, setting
`LIBEVAL_WORK_TRACKER` on the agent environment, mirroring the existing
`--agent-profile` → `LIBEVAL_AGENT_PROFILE` path. No dependency on Parts 01–03.
Conventions: [plan-b.md](plan-b.md).

Libraries used: libeval (run, supervise, benchmark-run, benchmark-definition),
libcli (option definitions), libutil (runtime). Tests use libmock.

## Step 1 — Set the env var on the `fit-eval` agent-running commands

Intent: realize the selection at every site that already sets
`LIBEVAL_AGENT_PROFILE` on the harness env.

Files: modify `libraries/libeval/src/commands/run.js`,
`libraries/libeval/src/commands/supervise.js`,
`libraries/libeval/src/commands/discuss.js`,
`libraries/libeval/src/commands/facilitate.js`.

Change: parse `--work-tracker` (resolving to `"github"` when absent) in each
option parser, then **unconditionally** set
`runtime.proc.env.LIBEVAL_WORK_TRACKER = workTracker`
**after the closing `}` of** the `if (…Profile)` block that holds the existing
`LIBEVAL_AGENT_PROFILE` write (run.js:108-110, supervise.js:100-102,
discuss.js:95-97, facilitate.js:91-93). Do **not** place it inside that block or
copy the conditional guard — the write must always land so the default
`"github"` is observable. The redaction env snapshot already freezes before
these writes (run.js:64-67); keep the new write after it.

Verification: a unit test sets `--work-tracker filesystem` and asserts
`runtime.proc.env.LIBEVAL_WORK_TRACKER === "filesystem"`; with the flag absent
the same env var reads `"github"`.

## Step 2 — Set the env var on the `fit-benchmark` run path

Intent: the benchmark agent never goes through `runSuperviseCommand` — it runs
via `createBenchmarkRunner` — so the Step 1 writes do not cover it; the write
must land in the benchmark command itself.

Files: modify `libraries/libeval/src/commands/benchmark-run.js`.

Change: add `workTracker` (default `"github"`) to `parseRunOptions`'s return
(benchmark-run.js:50-76), then in `runBenchmarkRunCommand` set
`runtime.proc.env.LIBEVAL_WORK_TRACKER = opts.workTracker` alongside the
existing `runtime.proc.env.ANTHROPIC_API_KEY` write (benchmark-run.js:30-37),
**before** `createBenchmarkRunner` so the spawned agent subprocess inherits it.
This is the write criterion 4's offline filesystem run depends on.

Verification: a unit test asserts `LIBEVAL_WORK_TRACKER` is set from
`--work-tracker` before the runner starts.

## Step 3 — Declare the option on both CLIs

Intent: expose `--work-tracker` on every command whose handler now reads it.

Files: modify `libraries/libeval/bin/fit-eval.js`,
`libraries/libeval/src/commands/benchmark-definition.js`.

Change: add `"work-tracker": { type: "string", description: "Active work-item
tracker (github|filesystem, default: github)" }` to the `run`, `supervise`,
`discuss`, and `facilitate` command `options` in `fit-eval.js`, and to the `run`
command `options` in `benchmark-definition.js` (the declarer; benchmark-run.js
Step 2 is the consumer). Add one `examples` entry per CLI using
`--work-tracker=filesystem` so it renders in the captured top-level help.

Verification: `node libraries/libeval/bin/fit-eval.js run --help` and
`node libraries/libeval/bin/fit-benchmark.js run --help` each show the option.

## Step 4 — Golden help and tests

Intent: lock the flag into golden help (criterion 4) and cover the env wiring.

Files: modify `libraries/libeval/test/golden/fit-eval/help.stdout.txt`,
`libraries/libeval/test/golden/fit-benchmark/help.stdout.txt`, and the
respective `cases.json`; add/extend unit tests under `libraries/libeval/test/`
for the env writes (Steps 1-2).

Change: regenerate the two `help.stdout.txt` to include the new example lines;
add a `run --help` golden case to each `cases.json` (capturing the
`--work-tracker` option text), since current cases cover only top-level
`--help`. Add the env assertions from Steps 1-2.

Verification: `bun run test` (golden + unit) passes; `--work-tracker` appears in
each CLI's golden help output.
