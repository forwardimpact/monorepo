# Plan A — Service CLIs Honour `--help`/`--version`

Plan for [spec 1620](spec.md), implementing [design-a](design-a.md).

## Approach

Add one libcli subpath module (`./server-flags`) exporting
`serverFlagsShortCircuit`, a synchronous strict-first-token guard that prints
help or a version string and returns `true` when it handled `--help`/`-h`/
`--version`/`-V`. Wire it into each of the five gear `server.js` entry points as
the first statement after the `libpreflight/node22` import and before
`createServiceConfig`, wrapping the existing module body in `if (!handled) {
… }`. Delete the two CI carve-outs (`build-binaries.yml` server smoke
exemption, `publish-brew.yml` gear substitute-CLI smoke). Add five
`bin-smoke.integration.test.js` suites that spawn each `server.js` with all four
tokens under a `SERVICE_*`-stripped env and assert exit 0, non-empty output, no
`listening` line.

Libraries used: libcli (resolveVersion), node:fs (default fsSync), node:test +
node:child_process (tests).

## Steps

### Step 1: Add `serverFlagsShortCircuit` to libcli

Intent: create the shared guard module.

Files:

- Created: `libraries/libcli/src/server-flags.js`
- Modified: `libraries/libcli/package.json`

`server-flags.js` exports one function matching the design interface:

```js
import { resolveVersion } from "./version.js";
import nodeFsSync from "node:fs";

const HELP_TOKENS = new Set(["--help", "-h"]);
const VERSION_TOKENS = new Set(["--version", "-V"]);

/**
 * Strict first-token print-and-exit guard for long-running service binaries.
 * Matches only argv[0]; returns true when it printed help/version (caller skips
 * its server-start body and the event loop drains to exit 0), false otherwise.
 *
 * @param {object} args
 * @param {string} args.name - binary name, e.g. "fit-svcgraph"
 * @param {string} args.description - one-line service summary
 * @param {URL|string} args.packageJsonUrl
 * @param {string[]} args.argv - process.argv.slice(2)
 * @param {{ stdout: { write(s: string): unknown } }} [args.proc] - default: process
 * @param {object} [args.fsSync] - default: node:fs; wrapped as { fsSync } for resolveVersion
 * @returns {boolean}
 */
export function serverFlagsShortCircuit({
  name,
  description,
  packageJsonUrl,
  argv,
  proc = process,
  fsSync = nodeFsSync,
}) {
  const token = argv[0];
  if (HELP_TOKENS.has(token)) {
    proc.stdout.write(
      `${name} — ${description}\n\n` +
        `Usage: ${name} [--help|-h] [--version|-V]\n\n` +
        `  --help, -h       Print this help and exit.\n` +
        `  --version, -V    Print the version and exit.\n\n` +
        `Any other invocation starts the service.\n`,
    );
    return true;
  }
  if (VERSION_TOKENS.has(token)) {
    proc.stdout.write(`${resolveVersion({ packageJsonUrl, runtime: { fsSync } })}\n`);
    return true;
  }
  return false;
}
```

Add one line to `package.json` `exports` (the map currently holds only
`"."`, so add a trailing comma after that entry to keep the JSON valid):
`"./server-flags": "./src/server-flags.js"`. Do **not** re-export from
`index.js` — design-a.md Key Decision "Subpath export … rather than re-export
from `.`" rejects pulling the helper into the libcli index surface; the five
`server.js` files import via the subpath only.

Verification: `bun test libraries/libcli/test` still passes (no existing test
regresses); `node -e "import('@forwardimpact/libcli/server-flags')"` resolves.

### Step 2: Add libcli unit tests for the guard

Intent: cover token matching, output, and the no-match path with injected fakes.

Files:

- Created: `libraries/libcli/test/server-flags.test.js`

Cover, with an injected `proc` capturing `stdout.write` and a fake `fsSync`:

- `--help` and `-h` each return `true` and write non-empty output containing the
  name.
- `--version` and `-V` each return `true` and write the resolved version
  (assert via `LIBCLI_PACKAGE_VERSION` env override or fake `fsSync`).
- `--port`, `8080`, empty argv, and `--help` in second position each return
  `false` and write nothing.

Verification: `bun test libraries/libcli/test/server-flags.test.js` passes.

### Step 3: Wire the guard into the five `server.js` entry points

Intent: short-circuit the four tokens before any env-dependent call.

Files (modified):

- `services/graph/server.js`
- `services/mcp/server.js`
- `services/pathway/server.js`
- `services/trace/server.js`
- `services/vector/server.js`

For each file, after `import "@forwardimpact/libpreflight/node22";` add the
import and guard, then indent the existing body inside `if (!handled) { … }`.
Per-service `name`/`description`:

| File | name | description |
| --- | --- | --- |
| graph | `fit-svcgraph` | `Graph index gRPC service` |
| mcp | `fit-svcmcp` | `MCP gateway service` |
| pathway | `fit-svcpathway` | `Pathway data gRPC service` |
| trace | `fit-svctrace` | `Trace index gRPC service` |
| vector | `fit-svcvector` | `Vector index gRPC service` |

Shape (graph shown; the others differ only in name/description and the body):

```js
#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { serverFlagsShortCircuit } from "@forwardimpact/libcli/server-flags";
// …existing imports unchanged…

const handled = serverFlagsShortCircuit({
  name: "fit-svcgraph",
  description: "Graph index gRPC service",
  packageJsonUrl: new URL("./package.json", import.meta.url),
  argv: process.argv.slice(2),
});

if (!handled) {
  const config = await createServiceConfig("graph");
  // …entire existing body, indented one level, unchanged…
}
```

Notes the implementer must honour:

- The guard is the **first statement** of the module body after imports and
  before the first `createServiceConfig`/`createDefaultRuntime` call.
- The existing body moves **byte-for-byte** (only indentation changes) inside
  the `if` block. `mcp`'s trailing `process.on(sig, …)` signal loop moves inside
  too.
- Use `new URL("./package.json", import.meta.url)` — each
  `services/*/package.json` is the version source; confirm the file exists per
  service before wiring.
- Do not pass `fsSync`/`proc` — defaults apply in production.

Verification: `bun test services/{graph,mcp,pathway,trace,vector}/test` still
passes; `node services/graph/server.js --help` exits 0 with output and no port
bind.

### Step 4: Add five service bin-smoke integration suites

Intent: make the four-token short-circuit PR-visible on every run.

Files (created):

- `services/graph/test/bin-smoke.integration.test.js`
- `services/mcp/test/bin-smoke.integration.test.js`
- `services/pathway/test/bin-smoke.integration.test.js`
- `services/trace/test/bin-smoke.integration.test.js`
- `services/vector/test/bin-smoke.integration.test.js`

Each follows the product bin-smoke shape (`node:test` + `node:child_process`),
extended per the design. For every token in `["--help", "-h", "--version",
"-V"]`, spawn `node server.js <token>` with `SERVICE_*` keys removed from the
env and `LIBCLI_PACKAGE_VERSION: "9.9.9-smoke"` set, a per-spawn `timeout`, and
**merged stdout+stderr capture**, then assert: exit 0, non-empty combined
output, and no case-insensitive `listening` line. The `listening` line is
logged via the telemetry logger to **stderr** (`console.error`, confirmed
`libraries/libtelemetry/src/logger.js`; gRPC logs `Listening` via librpc,
`fit-svcmcp` logs `listening` via libhttp) — capturing stdout alone (bare
`execFileSync` default) would make the no-port-bind guard inert, so the capture
must include stderr. For the two version tokens, additionally assert the
combined output contains `9.9.9-smoke` (the injected version), matching the
value-assertion in `products/map/test/bin-smoke.integration.test.js`.

Skeleton (graph):

```js
import { test, describe } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const serverJs = join(dirname(fileURLToPath(import.meta.url)), "..", "server.js");
const TOKENS = ["--help", "-h", "--version", "-V"];

function run(token) {
  const env = { ...process.env, LIBCLI_PACKAGE_VERSION: "9.9.9-smoke" };
  for (const k of Object.keys(env)) if (k.startsWith("SERVICE_")) delete env[k];
  const r = spawnSync("node", [serverJs, token], {
    encoding: "utf8",
    env,
    timeout: 30_000,
  });
  return { code: r.status, signal: r.signal, out: `${r.stdout}${r.stderr}` };
}

describe("fit-svcgraph bin smoke", () => {
  for (const token of TOKENS) {
    test(`${token} exits 0, prints output, binds no port`, () => {
      const { code, signal, out } = run(token);
      assert.equal(signal, null, `${token} timed out / was killed`);
      assert.equal(code, 0, `${token} exited ${code}`);
      assert.ok(out.length > 0, `${token} produced no output`);
      assert.ok(!/listening/i.test(out), `${token} bound a port`);
      if (token === "--version" || token === "-V") {
        assert.ok(out.includes("9.9.9-smoke"), `${token} did not print the version`);
      }
    });
  }
});
```

`spawnSync` with merged stdout+stderr captures the stderr `listening` log; the
`timeout` surfaces a live-handle hang as a non-null `signal` (the design's
invariant-2 guard) rather than a 30-minute CI cell timeout.

Verification: `bun test services/{graph,mcp,pathway,trace,vector}/test` passes,
including the five new suites; the suites are whole-file exempt from
`scripts/check-subprocess-in-tests.mjs` by the `.integration.test.js` name.

### Step 5: Delete the `build-binaries.yml` server smoke exemption

Intent: run the start-and-output gate against every CLI uniformly.

Files (modified): `.github/workflows/build-binaries.yml`

- In the matrix `gen` step: drop the `server: ($c.server // false)` projection
  field from the `jq` cell object and the comment block (lines describing the
  server exemption).
- In the `build` job `Smoke gate` step: delete the `if: ${{ matrix.server !=
  true }}` guard and the comment describing the server exclusion, so the smoke
  gate runs for every matrix cell. Keep the `timeout-minutes: 30` cell bound,
  but the comment above it (build-binaries.yml:56-58) currently cites "a future
  non-server CLI that hangs on --help" as the only stuck-cell case — reword it
  to drop the now-stale "non-server" qualifier so the comment reflects the
  uniform gate (any CLI that hangs fails the cell). Clean break: leave no prose
  describing the deleted exemption (CONTRIBUTING.md § Clean breaks).

Verification: `grep -ni server .github/workflows/build-binaries.yml` returns no
matrix projection, `if:` guard, or comment referencing a server/non-server
smoke distinction.

### Step 6: Delete the `publish-brew.yml` substitute-CLI smoke

Intent: smoke the gear bundle's primary executable, not a substitute.

Files (modified): `.github/workflows/publish-brew.yml`

Replace the `gear)` case in the Smoke test step so it invokes the primary
executable — the first gear manifest entry, matching `build-app-gear.sh`'s
`GEAR[0]`/`--primary-exec`:

```bash
gear)
  PRIMARY=$(jq -r '[.clis[] | select(.bundle == "gear") | .name][0]' build/cli-manifest.json)
  test -n "$PRIMARY" && [ "$PRIMARY" != "null" ] \
    || { echo "::error::no gear CLI in manifest to smoke"; exit 1; }
  "$BUNDLE/Contents/MacOS/$PRIMARY" --help
  ;;
```

Delete the `.server != true` substitution and the three-line deferral comment
(`The gear primary-exec … tracked separately.`).

Verification: `grep -n 'server != true' .github/workflows/publish-brew.yml`
returns nothing; the gear case derives `PRIMARY` as the first gear entry and
runs its `--help`.

## Risks

- **Live handle at import time.** If any current top-level import in a
  `server.js` dependency graph opens a timer/socket/watcher, `--help` would hang
  rather than exit. The design asserts this is false today; the per-spawn
  `timeout` in Step 4 converts any future violation into a test failure. The
  implementer must confirm the four-token spawns exit promptly during Step 4,
  not just that they pass.
- **`services/*/package.json` version field.** `resolveVersion` reads
  `package.json` in source execution; confirm each of the five has a `version`
  field (compiled binaries use the `--define` literal regardless). Step 3
  verification's `--version` run surfaces a missing field as a thrown read.

## Execution

Single engineering agent, sequential. Steps 1→2 (libcli) gate Step 3 (the
import target must exist). Steps 3, 4 land together per service. Steps 5 and 6
(workflow edits) are independent of the code and of each other; do them last so
CI sees the binaries already honour `--help`.

— Staff Engineer 🛠️
