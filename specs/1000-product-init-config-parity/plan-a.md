# Plan 1000-a — Bootstrap writer in libconfig

Implements [design-c](design-c.md). Adds `bootstrapProject` to libconfig
backed by a pure merge classifier; rewires `fit-guide init`, `fit-map init`,
and `fit-map substrate stage` through it; drops the `mkdir` workaround from
the kata-interview workflow.

## Approach

Build libconfig's writer surface bottom-up: a pure classifier (`merge.js`)
with full table coverage in unit tests, a refusal `Error` helper
(`errors.js`), and an orchestrator (`bootstrapProject` in `bootstrap.js`)
that classifies both surfaces before any FS mutation and delegates `.env`
writes to libsecret. Export it from `libraries/libconfig/src/index.js` and
add a direct `@forwardimpact/libsecret` dependency. Then rewire each caller
in turn — `fit-guide init` (materialise secrets before the call so re-runs
classify same-key-same-value), `fit-map init` (idempotent `data/pathway/`
copy + empty-fragment bootstrap call), `fit-map substrate stage` (new
`init` first phase + a fresh `createProductConfig("map")` re-read), and
finally the workflow (drop `mkdir`, pass `--cwd $AGENT_CWD` so substrate
stage bootstraps the agent workspace). Tests land in the same step as the
behavior they cover so each step is independently verifiable.

Libraries used: `@forwardimpact/libsecret` (`updateEnvFile`, `readEnvFile`,
`getOrGenerateSecret`, `generateSecret`).

**Note on the design's dotted-literal interface example.** Design § *Interface*
illustrates fragment with dotted-literal keys `"product.guide"` /
`"service.mcp"`. The on-disk starter (and `Config.#getFileData` at
`libraries/libconfig/src/config.js:484`, which reads `fileData[ns][name]` via
nested key access) uses nested form `{ product: { guide: … }, service: { mcp:
… } }`. This plan preserves the nested form to keep the reader untouched
(Decision #4's invariant) and to satisfy the spec's *first-run preserves
top-level keys* criterion. Top-level ownership is therefore at the literal
first JSON segment (`product`, `service`); the design's example is
illustrative of namespace semantics, not the on-disk encoding. The leaf-path
diagnostic (`product.x.foo`) and the spec's two-starters disjoint-namespace
test are satisfied identically under either encoding.

## Step 1 — Pure merge classifier

**Created:** `libraries/libconfig/src/merge.js`, `libraries/libconfig/test/merge.test.js`

`mergeConfigFragment({ existing, fragment, overwrites })` returns
`{ result, conflicts }` where `conflicts: [{ kind: "config", path }]` (dotted
leaf path, e.g. `product.x.foo`) and `result` is the merged object.

```js
// libraries/libconfig/src/merge.js

// Sorted-key JSON for deep-equal compare. Plain objects → keys sorted then
// stringified; arrays, strings, numbers, booleans, null → JSON.stringify
// (already canonical). undefined → throws (not valid config or .env value).
function canonicalize(value) {
  if (value === undefined) throw new Error("canonicalize: undefined not allowed");
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const sortedKeys = Object.keys(value).sort();
  const parts = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`);
  return `{${parts.join(",")}}`;
}

export function mergeConfigFragment({ existing = {}, fragment = {}, overwrites = [] }) {
  const overwriteSet = new Set(overwrites);
  const conflicts = [];
  const result = { ...existing };
  for (const [topKey, subtree] of Object.entries(fragment)) {
    if (!(topKey in existing)) { result[topKey] = subtree; continue; }
    if (canonicalize(existing[topKey]) === canonicalize(subtree)) continue;
    if (overwriteSet.has(topKey)) { result[topKey] = subtree; continue; }
    walkLeafConflicts(existing[topKey], subtree, topKey, conflicts);
  }
  return { result, conflicts };
}

export function mergeEnvEntries({ existing = {}, fragment = {}, overwrites = [] }) {
  const overwriteSet = new Set(overwrites);
  const conflicts = [];
  const result = { ...existing };
  for (const [key, value] of Object.entries(fragment)) {
    if (!(key in existing)) { result[key] = value; continue; }
    if (existing[key] === value) continue;            // byte-for-byte
    if (overwriteSet.has(key)) { result[key] = value; continue; }
    conflicts.push({ kind: "env", path: key });
  }
  return { result, conflicts };
}
```

`walkLeafConflicts` recurses through plain objects (not arrays) and records
every leaf path where canonical JSON disagrees; arrays and non-object
scalars compare by canonical JSON without descent. If only one side is a
plain object at the same path, the leaf is the parent dotted-path itself.
The env classifier is flat — `overwrites.env` contains bare keys, value
comparison is byte-for-byte after `KEY=` (matching § *Namespace ownership
semantics* row 3 footnote).

**Test coverage** (`merge.test.js`) — one test per row of the design's
namespace-ownership table for both config and env, plus A→B→A→B convergence
on disjoint top-level keys, plus leaf-path diagnostic accuracy
(`product.x.foo` style), plus key-order independence of canonical compare.

**Verification:** `bun test libraries/libconfig/test/merge.test.js` exits 0.

## Step 2 — Refusal Error and orchestrator

**Created:** `libraries/libconfig/src/errors.js`,
`libraries/libconfig/src/bootstrap.js`,
`libraries/libconfig/test/bootstrap.test.js`

**Modified:** `libraries/libconfig/src/index.js` (add `export { bootstrapProject } from "./bootstrap.js"`), `libraries/libconfig/package.json` (add `"@forwardimpact/libsecret": "^0.1.15"` to `dependencies` and patch-bump `version` per repo pre-1.0 release policy — release cut handled by `kata-release-cut` after merge, not by this plan). Run `bun run context:fix` after the package.json edit so `libraries/README.md` and any dependency catalog re-generate to reflect the new edge.

```js
// libraries/libconfig/src/errors.js
export function bootstrapRefusal({ kind, path }) {
  const surface = kind === "config" ? "overwrites.config" : "overwrites.env";
  const err = new Error(
    `bootstrapProject: refused to overwrite ${kind === "config" ? `config key "${path}"` : `.env key "${path}"`}; ` +
    `pass ${surface}: ["${path.split(".")[0]}"] to allow.`,
  );
  err.cause = { kind, path, overwriteSurface: surface };
  return err;
}
```

```js
// libraries/libconfig/src/bootstrap.js
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readEnvFile, updateEnvFile } from "@forwardimpact/libsecret";
import { mergeConfigFragment, mergeEnvEntries } from "./merge.js";
import { bootstrapRefusal } from "./errors.js";

export async function bootstrapProject({
  target = process.cwd(),
  fragment = {},
  env = {},
  overwrites = {},
} = {}) {
  const configDir = path.join(target, "config");
  const configPath = path.join(configDir, "config.json");
  const envPath = path.join(target, ".env");

  const existingConfig = await readJsonOrEmpty(configPath);
  const existingEnv = await readEnvSubset(Object.keys(env), envPath);

  const cfg = mergeConfigFragment({
    existing: existingConfig, fragment, overwrites: overwrites.config ?? [],
  });
  const ev = mergeEnvEntries({
    existing: existingEnv, fragment: env, overwrites: overwrites.env ?? [],
  });
  const conflicts = [...cfg.conflicts, ...ev.conflicts];
  if (conflicts.length) throw bootstrapRefusal(conflicts[0]);

  await mkdir(configDir, { recursive: true });
  await writeFile(configPath, JSON.stringify(cfg.result, null, 2) + "\n");
  for (const [key, value] of Object.entries(env)) {
    await updateEnvFile(key, value, envPath);
  }
}
```

**Helper shapes** —
`readJsonOrEmpty(path) → Promise<object>` returns `{}` on `ENOENT`, rethrows
any other read or parse error.
`readEnvSubset(keys, envPath) → Promise<Record<string,string>>` calls
`readEnvFile(key, envPath)` for each requested key and includes the key in
the returned record only when the call returns a non-`undefined` value;
`ENOENT` on the file itself is handled inside `readEnvFile`. Bounding the
classification surface to caller-named keys means pre-existing disjoint
`.env` entries pass through untouched — `updateEnvFile` preserves them
by design.

**Test coverage** (`bootstrap.test.js`) — covers every success criterion
test from spec § Success Criteria that targets the writer:

- Two-namespace merge writes both contributions (`config.json`).
- Re-invoke same input is byte-stable (`config.json` and `.env`).
- A→B→A→B converges to the post-AB state (byte equality, `config.json`).
- Same-key-different-value refuses with non-zero exit (throws), `config.json`
  unchanged, error message contains both `product.x.foo` and
  `overwrites.config`.
- `.env` ownership: three keys land via the orchestrator, a pre-existing
  disjoint key is preserved (verified after orchestrator returns — the
  preservation comes from `updateEnvFile`'s line-preserving rewrite path,
  not from the orchestrator reading the disjoint key), resulting `.env` is
  mode `0o600`, refusal carries the bare key and `overwrites.env`.
- Empty fragment + absent `config/config.json` → `target/config/config.json`
  exists with `"{}"` content (anchoring criterion).
- Empty `env` against existing `.env` → file untouched (byte equality before
  and after).

**Verification:** `bun test libraries/libconfig/test/` exits 0; running it
from a tmpdir target proves `0o600` mode via `fs.stat`.

## Step 3 — README onboarding contract and stderr-integration surface

**Modified:** `libraries/libconfig/README.md`

**Created:** `libraries/libconfig/test/readme.test.js`,
`libraries/libconfig/test/stderr-integration.test.js`

Append a `## Bootstrap` section to the README that names the three onboarding
artefacts the spec's *New-product onboarding* test asserts:

| Section content | What it covers |
|---|---|
| Entry point: `import { bootstrapProject } from "@forwardimpact/libconfig"` | Names the callable. |
| Namespace declaration: passing top-level keys in `fragment` | How a product declares the slice it owns. |
| Overwrite intent: `overwrites: { config: [...], env: [...] }` parameter | How a caller signals intent and what gets refused. |
| One-line cross-link to libsecret `.env` primitives | Reader knows where the `.env` primitives live. |

`readme.test.js` asserts the README's `## Bootstrap` heading exists and that
the section body contains all four of `bootstrapProject`, `fragment`,
`overwrites`, `libsecret` (substring presence scoped to the new section, not
the whole file, so unrelated mentions elsewhere can't satisfy it).

`stderr-integration.test.js` covers design § *Verification surfaces* row 3
("Stderr diagnostic carries both conflicting key and overwrite-intent
parameter"). It spawns a child Node process that:

1. Writes a tmpdir-scoped `config/config.json` carrying `product.x.foo = "a"`.
2. Invokes `bootstrapProject` against the same target with
   `fragment: { product: { x: { foo: "b" } } }` (no `overwrites`).
3. Catches the thrown Error and writes its message to `stderr` then
   `process.exit(1)` — the same stderr-and-exit shape every product CLI
   uses today (verified against `products/guide/bin/fit-guide.js` and
   `products/map/bin/fit-map.js` error paths).

The test asserts the child exits non-zero and the captured stderr is
greppable for both the leaf path `product.x.foo` and the surface name
`overwrites.config` (the exact two substrings the spec's *Failure surfacing*
row calls out).

## Step 4 — `fit-guide init` adopts bootstrapProject

**Modified:** `products/guide/src/commands/init.js`

Replace the `updateEnvFile` loop and the manual `config/` copy with a single
`bootstrapProject` call. Materialise the two generated secrets *before* the
call via `getOrGenerateSecret(key, generateSecret)` so a re-run reuses the
on-disk value (same-key-same-value no-op).

**Import changes** — drop `updateEnvFile` from the libsecret import (now dead
after the loop is removed); add `getOrGenerateSecret` and the libconfig
`bootstrapProject` import:

```diff
- import { generateSecret, updateEnvFile } from "@forwardimpact/libsecret";
+ import { generateSecret, getOrGenerateSecret } from "@forwardimpact/libsecret";
+ import { bootstrapProject } from "@forwardimpact/libconfig";
```

**Body change** — replace lines 14–32 (the secret generation + `updateEnvFile`
loop) and lines 71–98 (the starter-config copy with the "already exists"
bullet) with a single bootstrap call. The `package.json` materialisation
(current lines 34–53), the `SummaryRenderer.render({ title: "Environment
(.env)"… })` block (lines 55–69), and the `.claude/skills/` copy (lines
100–111) all stay byte-for-byte; only the two blocks named above change.

```js
// products/guide/src/commands/init.js — after change, replacing only
//   (a) the secret-generation + updateEnvFile loop and
//   (b) the manual config/ copy with the "already exists" bullet
const serviceSecret = await getOrGenerateSecret("SERVICE_SECRET", () => generateSecret());
const mcpToken      = await getOrGenerateSecret("MCP_TOKEN",      () => generateSecret());
const starterDir    = new URL("../../starter", import.meta.url).pathname;
const starterConfig = JSON.parse(
  await fs.readFile(resolve(starterDir, "config.json"), "utf8"),
);

await bootstrapProject({
  fragment: starterConfig,                    // nested form — see § note
  env: {
    SERVICE_SECRET: serviceSecret,
    MCP_TOKEN: mcpToken,
    SERVICE_TRACE_URL:    "grpc://localhost:3001",
    SERVICE_VECTOR_URL:   "grpc://localhost:3002",
    SERVICE_GRAPH_URL:    "grpc://localhost:3003",
    SERVICE_PATHWAY_URL:  "grpc://localhost:3004",
    SERVICE_MAP_URL:      "grpc://localhost:3006",
    SERVICE_MCP_URL:      "http://localhost:3005",
    EMBEDDING_BASE_URL:   "http://localhost:8090",
  },
});
// SummaryRenderer.render(...) block continues unchanged below.
// .claude/skills/ copy block continues unchanged below.
```

The pre-spec `"config/ already exists, skipping starter copy."` bullet
disappears (per spec § *Re-run* semantics — silent no-op replaces it).
Pre-spec `"config/ created with starter configuration."` `formatSuccess`
also disappears; the `SummaryRenderer` block stays because it covers the
`.env` summary (orthogonal to the `config/` write).

**Created:** `products/guide/test/init.test.js`

- First run against a fresh tmpdir produces `config/config.json`,
  `.env`, `package.json`, `.claude/skills/` and exits 0; top-level keys
  of the resulting `config.json` match the pre-spec starter's top-level
  keys (`init`, `product`, `service` — the nested form preserved verbatim,
  per the *Note on the design's dotted-literal interface example* above).
- Second run is byte-identical to the first across all four artefacts;
  `SERVICE_SECRET` and `MCP_TOKEN` values are unchanged between runs.

**Verification:** `bun test products/guide/test/init.test.js` + existing
`products/guide/test/cli.test.js` both exit 0.

## Step 5 — `fit-map init` adopts bootstrapProject and becomes idempotent

**Modified:** `products/map/src/commands/init.js`

Two changes:

1. Drop the non-zero exit when `data/pathway/` exists; switch to `cp` with
   `force: false` (`fs.cp(starterDir, dataDir, { recursive: true, force: false, errorOnExist: false })`) so re-runs are no-ops on already-copied
   files.
2. After the `data/pathway/` copy, call `bootstrapProject({ target,
   fragment: {} })`. Empty fragment materialises `target/config/config.json`
   with `"{}"` content (the anchoring criterion — Decision #9). No
   `product.map` fragment is shipped this spec.

The success/next-steps stdout block stays.

**Created:** `products/map/test/init.test.js`

- Fresh tmpdir: `runInit(tmpdir)` produces both `data/pathway/` (non-empty)
  and `config/config.json` (parses to `{}`); exits 0.
- Re-run against the same tmpdir is byte-stable (no
  `./data/pathway/ already exists` error).
- **Anchoring test (spec success criterion):** layout
  `<outer>/config/config.json` (planted as a decoy with a recognisable
  marker) and `<outer>/inner/sub/` (the init target's subdirectory).
  Run `runInit("<outer>/inner")`; from `<outer>/inner/sub`, call
  `createProductConfig("map")` and assert it resolves the locally-planted
  `<outer>/inner/config/config.json` (no marker) rather than the ancestor
  decoy. Then run the same `createProductConfig("map")` from
  `<outer>/inner/sub` *without* having run `runInit` (separate test case)
  and assert it now resolves the ancestor decoy — this two-direction
  assertion catches a broken test setup that would otherwise pass
  vacuously. Use `process.chdir` + restore in `afterEach`; `Finder.findUpward`'s
  `maxDepth=3` covers the two ancestor hops needed.
- **Bootstrap-shape parity test (spec success criterion):** in two fresh
  tmpdirs, run `runInit(tmpA)` and `runStageCommand({ config, target: tmpB }, deps)`
  (with stub deps so the Supabase phases are no-ops). Walk both trees and
  assert the recursive set of files under the project root is identical
  (`config/config.json`, `data/pathway/...`). Strictly satisfies spec
  § Success Criteria row "Bootstrap shape is identical from `fit-map init`
  directly and from the kata-interview Substrate stage."

**Verification:** `bun test products/map/test/init.test.js` exits 0.

## Step 6 — `fit-map substrate stage` delegates to runInit

**Modified:** `products/map/src/commands/substrate-stage.js`,
`products/map/bin/fit-map.js`,
`products/map/test/activity/substrate-stage.test.js`

Add an `init` phase as the first entry in the phase sequence; pass the
target through and re-construct config after the phase runs.

```js
// products/map/src/commands/substrate-stage.js (after change)
import { createProductConfig } from "@forwardimpact/libconfig";

export async function runStageCommand(
  { config, target = process.cwd() },
  {
    loadInit = () => import("./init.js").then((m) => m.runInit),
    createSupabaseCli = defaultCreateCli,
    findDataDir = defaultFindDataDir,
    createMapClient = defaultCreateMapClient,
    loadSeed = ...,
    loadProvision = ...,
    loadSmoke = ...,
    reloadConfig = () => createProductConfig("map"),
  } = {},
) {
  const runInit = await loadInit();
  await runPhase("init", () => runInit(target));
  const liveConfig = await reloadConfig();

  const cli = createSupabaseCli();
  await runPhase("stack", () => cli.run(["start"]));
  // ... existing url-discovery, migrate phases unchanged ...
  const supabase = createMapClient({ config: liveConfig });
  // ... seed, provision, smoke unchanged, all using liveConfig ...
}
```

`findDataDir(undefined)` continues to walk upward from `process.cwd()`; in
production `process.cwd()` is the repo root (workflow invokes from there),
in CI after Step 7 it is the agent workspace where `runInit` just planted
`data/pathway/`. Both resolve correctly.

Add `--cwd` option to the `substrate stage` subcommand definition and
forward it through `dispatchSubstrate`:

```js
// products/map/bin/fit-map.js — subcommand definition (~line 100)
{
  name: "substrate stage",
  description: "Provision a Landmark substrate (init + stack + migrate + seed + provision + self-smoke)",
  options: {
    cwd: { type: "string", description: "Target dir for the bootstrap (default: cwd)" },
  },
},
```

```js
// products/map/bin/fit-map.js — dispatchSubstrate signature + case "stage" (~line 474)
async function dispatchSubstrate(subcommand, _rest, values) {
  switch (subcommand) {
    case "stage": {
      const { runStageCommand } = await import("../src/commands/substrate-stage.js");
      return runStageCommand({ config, target: values.cwd });
    }
    // roster + issue branches unchanged
    ...
  }
}
```

**substrate-stage.test.js changes** (explicit):

- Extend `buildDeps({ failPhase, invocations })` so it returns
  `loadInit: async () => recorded("init")` and
  `reloadConfig: async () => ({ supabaseJwtSecret: () => "secret" })` (a
  stub config object matching what the existing test passes today). This
  makes the new `init` phase recorded in `invocations`, mirroring the
  existing pattern for `stack`/`seed`/`provision`/`smoke`.
- Existing phase-ordering test (`test("invokes phases in stack → … order")`):
  rename to `"invokes phases in init → stack → url-discovery → migrate → seed → provision → smoke order"` and update the `assert.deepEqual(invocations, [...])` array to prepend `"init"`.
- Existing `SUBSTRATE_FORCE_EMPTY_CORPUS` test: prepend `"init"` to the
  `invocations` expectation.
- Existing per-phase-failure test: unchanged (still seeds `failPhase: "seed"`).
- Add `runStageCommand({ config, target: tmpDir }, deps)` — passing an
  explicit `target` — to at least one test case to lock the new
  parameter's plumbing.

**Verification:** `bun test products/map/test/activity/substrate-stage.test.js` exits 0.

## Step 7 — Drop the kata-interview `mkdir` workaround

**Modified:** `.github/workflows/kata-interview.yml`

Drop lines 80–82 (the comment + `mkdir -p` line); change the substrate stage
invocation to pass `--cwd`:

```diff
       - name: Substrate stage
         id: substrate-stage
         if: inputs.product == 'landmark'
         shell: bash
         env: ...
         run: |
-          # Provision $AGENT_CWD/config/ so libconfig's findUpward("config")
-          # resolves uniformly from the agent's cwd.
-          mkdir -p "${{ steps.agent-workspace.outputs.dir }}/config"
-          bunx fit-map substrate stage
+          bunx fit-map substrate stage --cwd "${{ steps.agent-workspace.outputs.dir }}"
```

The Landmark `if:` gate is preserved. The shell-level `supabase status`
invocation later in the step is unchanged (still runs from the repo root,
still finds `products/map/supabase/config.toml`).

**Verification:** kata-interview workflow on the implementation branch runs
green for a Landmark interview, the `agent-workspace` artefact carries
`config/` planted by `fit-map init`, and `grep -nE 'mkdir|install -d'
.github/workflows/kata-interview.yml | grep config` is empty.

## Risks

| Risk | Mitigation |
|---|---|
| `fit-map.js` loads `createProductConfig("map")` at module top — before substrate stage's init phase runs, that config sees no `config/config.json` at the agent workspace. | Design § *fit-map init ↔ fit-map substrate stage* names this tolerance: `createProductConfig` returns empty `#fileData` on an absent file, so module-top load succeeds; substrate-stage's `reloadConfig` (Decision #7) picks up the materialised state. Verify by running `bunx fit-map substrate stage --cwd <fresh-tmpdir>` end-to-end in CI. |
| `findDataDir` upward-walks from `process.cwd()`; if substrate-stage's `--cwd` ever points outside a workspace that has `data/pathway/`, the seed phase fails. | The `init` phase plants `data/pathway/` at `target` before any phase needing it runs. The plan covers this by ordering `init` first and by testing the fresh-tmpdir case in `substrate-stage.test.js`. |
| `updateEnvFile` rewrites `.env` per-key; an intermediate process death between keys leaves a half-written file. | Spec § *Out of scope* explicitly defers cross-file atomicity. No mitigation in this plan. |
| Test for the anchoring criterion (Step 5) needs an ambiguous upward walk; getting the directory layout wrong silently turns the test into a no-op. | Assert *both* directions: the loaded config resolves to `tmpdir/config/` AND, with `runInit` skipped, resolves to the planted ancestor `config/`. Two assertions catch a broken test setup. |

## Execution

Single agent, sequential. Recommend `staff-engineer` (or any engineering
agent) for all seven steps. Steps 1–6 are tightly coupled (Step 6's test
changes ripple into all three deps objects). Step 7 ships in the **same
PR** — spec § *Spec 990 cleanup* lists the `mkdir` removal as in-scope and
explicitly "not deferred"; the end-to-end kata-interview CI run on the
implementation branch is the gating verification for both Step 6 and
Step 7. Verify CI green before requesting merge.
