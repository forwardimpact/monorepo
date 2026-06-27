# Plan 1100: `substrate stage` copies `data/activity/` to the agent workspace

[spec](spec.md) · [design](design-a.md)

## Approach

Add a new `copy-activity` phase between `init` and `reloadConfig` inside
`runStageCommand`, backed by a pure `copyActivity({ source, target })` helper in
`products/map/src/lib/copy-activity.js`. The phase resolves its own
`findDataDir(undefined)` inside its own `runPhase` wrapper (so a missing-source
ENOENT or "No data directory found" attributes to `[substrate stage:
copy-activity]`), `path.dirname`s the result to recover `<root>/data`, then
copies `<root>/data/activity` to `<target>/data/activity` via
`fs.cp(..., { recursive: true, force: false, errorOnExist: false })` — matching
`init.js`'s recursive-copy semantics. The existing `findDataDir` call at the
seed-phase site stays put. Tests extend the phase-ordering assertion and add an
integration check that a missing source throws under the right envelope; the
Landmark row of `.claude/skills/kata-interview/SKILL.md` § Step 3 drops the
supervisor's manual `data/activity/` copy.

## Steps

### 1. Add the `copyActivity` helper

- **Created:** `products/map/src/lib/copy-activity.js`
- **Modified:** none
- **Deleted:** none

```js
/**
 * Copy a source directory into `<target>/data/activity/` recursively.
 *
 * Pure helper — throws raw Error on failure so the caller's runPhase
 * envelope owns the framing. `recursive: true` creates the `data/` parent
 * if absent, matching init.js's semantics.
 *
 * @param {object} params
 * @param {string} params.source - Absolute path to the source activity dir
 *   (e.g. `<monorepo>/data/activity`).
 * @param {string} params.target - Absolute path to the workspace target
 *   (the `--cwd` value).
 */
import { cp } from "node:fs/promises";
import path from "node:path";

export async function copyActivity({ source, target }) {
  const dest = path.join(target, "data", "activity");
  await cp(source, dest, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });
}
```

**Verify:** `bun test products/map/test/activity/copy-activity.test.js` (added
in Step 3).

### 2. Wire the `copy-activity` phase into `runStageCommand`

- **Created:** none
- **Modified:** `products/map/src/commands/substrate-stage.js`
- **Deleted:** none

Add a new injectable `loadCopyActivity` to the deps default (mirrors
`loadInit`), and a new `runPhase("copy-activity", …)` block placed immediately
after the existing `init` phase (line 67) and before the
`reloadConfig`/`stage` block (line 68). The new block resolves `dataDir =
await findDataDir(undefined)` inside its own wrapper, derives `source =
path.join(path.dirname(dataDir), "activity")`, and calls
`copyActivity({ source, target })`. The existing `findDataDir` call at
`substrate-stage.js:89` stays unchanged.

```js
// New default dep (added to the destructured deps block):
loadCopyActivity = () =>
  import("../lib/copy-activity.js").then((m) => m.copyActivity),

// New phase, inserted after `await runPhase("init", …)` and before
// `const stageConfig = (await reloadConfig()) ?? config;`:
const copyActivity = await loadCopyActivity();
await runPhase("copy-activity", async () => {
  const dataDir = await findDataDir(undefined);
  const source = path.join(path.dirname(dataDir), "activity");
  await copyActivity({ source, target });
});
```

**Verify:** `bun test products/map/test/activity/substrate-stage.test.js` passes
after Step 4's test update; `bun run check` clean.

### 3. Add `copy-activity.test.js`

- **Created:** `products/map/test/activity/copy-activity.test.js`
- **Modified:** none
- **Deleted:** none

Three test cases against `copyActivity({ source, target })`, each using
`fs.mkdtemp` + `fs.rm` for isolation:

| Case | Setup | Assertion |
| --- | --- | --- |
| Happy path | Source tree with nested files (`a.txt`, `sub/b.txt`); empty target | `<target>/data/activity/{a.txt,sub/b.txt}` exist; relative-path sets agree |
| Idempotent re-run | Run helper twice against same source/target | Second call resolves without throwing; tree unchanged |
| Missing source | Source path is `<tmp>/does-not-exist` | Helper throws an Error whose `.message` includes the absent source path (raw, no envelope prefix) |

**Verify:** `bun test products/map/test/activity/copy-activity.test.js`
all-green.

### 4. Extend `substrate-stage.test.js`

- **Created:** none
- **Modified:** `products/map/test/activity/substrate-stage.test.js`
- **Deleted:** none

Five edits, all in the existing file:

1. `buildDeps` adds `loadCopyActivity: async () => recorded("copy-activity")`
   to the returned deps object.
2. Phase-ordering test's expected list becomes `["init", "copy-activity",
   "stack", "url-discovery", "migrate", "seed", "provision", "smoke"]`.
3. `SUBSTRATE_FORCE_EMPTY_CORPUS=true` test's expected list grows the
   `"copy-activity"` entry between `"init"` and `"stack"`.
4. Bootstrap-shape parity test's inline deps block adds
   `loadCopyActivity: async () => async () => {}` (no-op — the test isolates
   the `init` phase's filesystem effect, so copy-activity must be a stubbed
   no-op alongside `loadSeed`/`loadProvision`/`loadSmoke`).
5. New test (after "explicit target is plumbed to the init phase"): real
   missing-source ENOENT integration — provide a real (non-stub)
   `loadCopyActivity` that resolves to `copyActivity` from `copy-activity.js`
   and a `findDataDir: async () => "<tmp>/data/pathway"` whose
   `<tmp>/data/activity` does **not** exist. Assert that `runStageCommand`
   rejects with a message matching `/\[substrate stage: copy-activity\]/`.

**Verify:** `bun test products/map/test/activity/substrate-stage.test.js`
passes (all original tests still green; new test green).

### 5. Update Landmark row of `kata-interview` SKILL § Step 3

- **Created:** none
- **Modified:** `.claude/skills/kata-interview/SKILL.md`
- **Deleted:** none

Edit only the Landmark row of the Step 3 table (line 87 today). Before:

```text
| Landmark         | `data/pathway/` and `data/activity/`; substrate (`auth.users` for all humans, schema, seed, smoke) staged by the workflow's `Substrate stage` step |
```

After:

```text
| Landmark         | `data/pathway/`; substrate (`data/activity/`, `auth.users` for all humans, schema, seed, smoke) staged by the workflow's `Substrate stage` step                                |
```

The Map, Pathway, Summit, Guide, and Outpost rows stay byte-identical to
`origin/main`. The `Use cp -r data/pathway "$AGENT_CWD/data/pathway" and
similar.` sentence below the table stays — Map and Summit still rely on it.

**Verify:** `git diff origin/main -- .claude/skills/kata-interview/SKILL.md`
shows changes only to the Landmark row; `bun run check` clean.

## Libraries used

Libraries used: none (Node `fs/promises` and `path` only).

## Risks

- **Bootstrap-shape parity test silently regresses without the no-op
  `loadCopyActivity` stub.** The parity test passes `runInit` as the real
  `loadInit` against a temp dir, but provides its own inline deps block (not
  via `buildDeps`). Without an explicit `loadCopyActivity` stub, the default
  dep would import the real helper, then `findDataDir(undefined)` walks from
  the test's `process.cwd()` (the monorepo root) and copies the real
  `<monorepo>/data/activity` into the temp target — producing a
  `target/data/activity/` tree the `listTree` assertion does not expect.
  Step 4 edit 4 explicitly stubs it to a no-op.
- **Step 2's new `findDataDir(undefined)` call shares no state with the
  seed-phase call.** Both walk upward from `process.cwd()` in the same
  process and resolve the same `<root>/data/pathway`. Confirmed
  deterministic by `data-dir.js:25-48` — but if a future refactor lets
  `cwd` mutate between phases (e.g. a phase chdirs into `target`), the two
  calls would diverge. Out of scope to mitigate today; flagged for future
  readers.

## Execution recommendation

Single engineering agent, sequential. Steps 1–4 form one functional unit
(helper + wiring + tests); Step 5 is a one-line SKILL edit that should land in
the same commit as Step 2 so the SKILL stops mentioning the manual copy at the
same moment automation adopts it. One commit per logical step is fine; a
single commit covering all five is also acceptable given the small surface
area.
