# Plan A · Part 01 — Scaffolding and foundational views

Parent plan: [plan-a.md](./plan-a.md). Spec: [spec.md](./spec.md).

This part creates the `@forwardimpact/landmark` package, wires the
`fit-landmark` CLI through libcli, and ships three commands whose data sources
already exist in Map: `org`, `snapshot`, and `marker`.

No other part of the plan depends on anything except Part 01 being merged, so
this is the strict foundation.

## Scope

**In scope**

- Create `products/landmark/` with the standard per-package layout (spec 390).
- Declare dependencies and add Landmark to the monorepo workspace.
- Implement the CLI bootstrap (`bin/fit-landmark.js`), shared helpers
  (`src/lib/*`), and formatter infrastructure (`src/formatters/*`).
- Implement commands: `org show`, `org team`, `snapshot list`, `snapshot show`,
  `snapshot trend`, `snapshot compare`, `marker`.
- Implement the standard empty-state system shared by all future commands.
- Tests for each command using `node:test` and stub clients.
- `bun run check` clean.

**Out of scope**

- Evidence-based views (Part 02).
- Health view (Part 03).
- Voice, initiative commands (Parts 04, 05).
- Documentation updates (Part 06).
- Changes to Map, Summit, or any existing product source.
- Adding markers to starter data (Part 02).

## Files

### Created

```
products/landmark/
  package.json
  bin/
    fit-landmark.js
  src/
    index.js
    lib/
      cli.js
      supabase.js
      context.js
      empty-state.js
    commands/
      org.js
      snapshot.js
      marker.js
    formatters/
      index.js
      shared.js
      org.js
      snapshot.js
      marker.js
  test/
    cli-command.test.js
    org.test.js
    snapshot.test.js
    marker.test.js
    empty-state.test.js
```

### Modified

- `package.json` (monorepo root) — add `"products/landmark"` to `workspaces`.
- `justfile` — if other products have per-product `just` targets (e.g.
  `just pathway ...`), add an equivalent `landmark` recipe delegating to
  `bunx fit-landmark`. If no per-product recipes exist, skip this change.
- `specs/STATUS` — do **not** change in this part; status changes are a reviewer
  action, not an implementation step.

## Implementation details

### `products/landmark/package.json`

Mirror Summit's shape. Declare only the dependencies this part actually needs;
later parts will extend this list.

```json
{
  "name": "@forwardimpact/landmark",
  "version": "0.1.0",
  "description": "Analysis and recommendation layer on top of Map activity data.",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/forwardimpact/monorepo",
    "directory": "products/landmark"
  },
  "homepage": "https://www.forwardimpact.team/landmark",
  "keywords": [
    "engineering",
    "analytics",
    "framework",
    "skills",
    "team",
    "getdx",
    "github"
  ],
  "type": "module",
  "main": "./src/index.js",
  "bin": {
    "fit-landmark": "./bin/fit-landmark.js"
  },
  "files": ["bin/", "src/"],
  "exports": {
    ".": "./src/index.js"
  },
  "dependencies": {
    "@forwardimpact/libcli": "^0.1.0",
    "@forwardimpact/libtelemetry": "^0.1.33",
    "@forwardimpact/libutil": "^0.1.72",
    "@forwardimpact/libskill": "^4.1.7",
    "@forwardimpact/map": "^0.15.18",
    "@supabase/supabase-js": "^2.103.0"
  },
  "engines": {
    "bun": ">=1.2.0",
    "node": ">=18.0.0"
  },
  "publishConfig": { "access": "public" }
}
```

Do not add `@forwardimpact/summit` yet — that dependency is owned by Part 03. Do
not add `yaml` — Landmark loads framework data through Map's loader, which
already owns YAML parsing.

### `products/landmark/bin/fit-landmark.js`

Follow Summit's bin pattern verbatim where possible. Node-compatible shebang
(`#!/usr/bin/env node`), version read from `package.json`, dispatcher using
`libcli.createCli`.

Command set for Part 01:

```js
const COMMANDS = {
  org: runOrgCommand,
  snapshot: runSnapshotCommand,
  marker: runMarkerCommand,
};
```

The `createCli` definition lists the full spec-080 command set from the
beginning (so `fit-landmark --help` prints the correct usage even though Parts
02–05 are not yet implemented). Unimplemented commands in Part 01 dispatch to a
shared `runNotYetImplementedCommand` stub that prints "`<command>` lands in spec
080 Part <NN>" and exits with code **64** (`EX_USAGE`-adjacent — clearly
distinct from libcli's code 2 "usage error" so shell automation can tell
"unknown command" apart from "command not yet implemented"). This keeps
`fit-landmark --help` honest and gives downstream parts a fixed insertion point.

Global options (shared with Summit's pattern):

```js
options: {
  data: { type: "string", description: "Path to Map data directory" },
  format: { type: "string", default: "text", description: "Output format (text|json|markdown)" },
  manager: { type: "string", description: "Filter by manager email" },
  email: { type: "string", description: "Filter by person email" },
  skill: { type: "string", description: "Filter by skill id" },
  level: { type: "string", description: "Target or filter level" },
  target: { type: "string", description: "Readiness target level" },
  snapshot: { type: "string", description: "Snapshot id" },
  item: { type: "string", description: "Driver/item id for trend" },
  id: { type: "string", description: "Entity id (initiative, etc.)" },
  help: { type: "boolean", short: "h", description: "Show help" },
  version: { type: "boolean", short: "v", description: "Show version" },
}
```

`main()` resolves `dataDir` via `resolveDataDir(values)` (from
`src/lib/cli.js`), loads Map data via `loadMapData(dataDir)`, creates a Supabase
client lazily inside commands that need it, and dispatches to the handler with
the shape described in plan-a § Cross-part conventions.

Error handling: wrap the handler in try/catch. On `SupabaseUnavailableError`,
print the message, exit code 3. On any other error, print via
`cli.error(err.message)`, exit code 1.

### `products/landmark/src/lib/cli.js`

Copy Summit's `src/lib/cli.js` (`resolveDataDir`, `loadMapData`,
`resolveFormat`, `Format` constant) verbatim, changing only the logger name
(`"landmark"`) and the error-message prefix. The two files should be kept in
sync going forward; if either diverges, the divergence must be justified.

Rationale: duplicating Summit's helper avoids cross-product coupling from a
shared library change while both products' needs are still evolving. A future
refactor can extract this into `libmap-cli` if a third consumer appears.

**Data directory subpath:** Summit's `resolveDataDir` hard-codes the `"pathway"`
subdirectory under the contributor data finder root
(`join(finder .findData("data", homedir()), "pathway")`). This is intentional —
Pathway, Summit, and Landmark all read the same Map data directory, which lives
under `data/pathway/` for historical reasons. Landmark copies the literal
`"pathway"` verbatim; do not rename.

### `products/landmark/src/lib/supabase.js`

Copy Summit's `src/lib/supabase.js`, renaming the factory to
`createLandmarkClient` and the error class to `SupabaseUnavailableError` (reuse
the name; scoping is via `code: "LANDMARK_SUPABASE_UNAVAILABLE"`). Environment
contract is identical: `MAP_SUPABASE_URL` and `MAP_SUPABASE_SERVICE_ROLE_KEY`.

### `products/landmark/src/lib/context.js`

Builds the command context. Signature:

```js
export async function buildContext({ dataDir, options, needsSupabase }) {
  const mapData = await loadMapData(dataDir);
  const supabase = needsSupabase ? createLandmarkClient() : null;
  const format = resolveFormat(options);
  return { mapData, supabase, format, options };
}
```

Commands declare `needsSupabase` via a flag on the handler module (see below) so
the dispatcher can open a client only when necessary. `marker` declares
`needsSupabase: false`; everything else declares `true`.

### `products/landmark/src/lib/empty-state.js`

Central registry of the spec's empty-state messages (spec § Empty States and
Error Behavior). Export a `describeEmptyState(kind, context)` function and named
constants for each row in the spec table. Tests assert each kind maps to the
expected message.

```js
export const EMPTY_STATES = {
  NO_EVIDENCE: "No evidence data available. Guide has not yet interpreted artifacts for this scope.",
  NO_MARKERS_FOR_SKILL: (skill) => `No markers defined for ${skill}. Add markers to the capability YAML.`,
  NO_MARKERS_AT_TARGET: "No markers defined at target level — cannot generate checklist.",
  NO_SNAPSHOTS: "No GetDX snapshot data available. Run `fit-map getdx sync` (or `fit-map activity seed` for synthetic data) to ingest.",
  NO_COMMENTS: "Snapshot comments not available. The getdx_snapshot_comments table has not been created.",
  NO_INITIATIVES: "Initiative data not available. The getdx_initiatives table has not been created.",
  PERSON_NOT_FOUND: (email) => `No person found with email ${email} in organization_people.`,
  MANAGER_NOT_FOUND: (email) => `No team found for manager ${email}.`,
  NO_HIGHER_LEVEL: (id) => `No higher level defined in levels.yaml. Current level (${id}) is the highest.`,
};
```

Parts 02–05 add their own entries without modifying existing ones.

### Command: `org` — `products/landmark/src/commands/org.js`

Subcommand dispatch inside the module:

```js
export const needsSupabase = true;

export async function runOrgCommand({ args, options, mapData, supabase, format }) {
  const [sub] = args;
  switch (sub) {
    case "show":
      return showOrganization({ supabase, format });
    case "team":
      return showTeam({ supabase, managerEmail: options.manager, format });
    default:
      throw new UsageError("org: expected `show` or `team` subcommand");
  }
}
```

`showOrganization` calls `getOrganization(supabase)` from
`@forwardimpact/map/activity/queries/org` and returns
`{ view: people, meta: { format } }`. The `org team` path calls
`getTeam(supabase, managerEmail)`; if the result is empty, set
`meta.emptyState = EMPTY_STATES.MANAGER_NOT_FOUND(email)`.

### Command: `snapshot` — `products/landmark/src/commands/snapshot.js`

Dispatches `list`, `show`, `trend`, `compare`:

- `list` → `listSnapshots(supabase)`. Empty → `EMPTY_STATES.NO_SNAPSHOTS`.
- `show` → requires `--snapshot <id>`. Calls
  `getSnapshotScores(supabase, id, { managerEmail: options.manager })`. Empty →
  `EMPTY_STATES.NO_SNAPSHOTS` or `MANAGER_NOT_FOUND`.
- `trend` → requires `--item <id>`. Calls
  `getItemTrend(supabase, itemId, { managerEmail })`. Empty →
  `EMPTY_STATES.NO_SNAPSHOTS`.
- `compare` → requires `--snapshot <id>`. Calls **`getSnapshotComparison`**
  directly from `@forwardimpact/map/activity/queries/snapshots` — the module
  already exports it as its own function (internal implementation may wrap
  `getSnapshotScores`, but Landmark must depend on the public contract). Columns
  in text/markdown formatters use `vs_prev`, `vs_org`, `vs_50th`, `vs_75th`,
  `vs_90th`.

Cross-reference unknown `item_id` values against `mapData.drivers` to collect
warnings: any score row whose `item_id` has no matching driver adds a warning
message to `meta.warnings`. Part 03's `health` command relies on this mapping
being solid; exercising it here ensures regressions surface early.

### Command: `marker` — `products/landmark/src/commands/marker.js`

```js
export const needsSupabase = false;

export async function runMarkerCommand({ args, options, mapData, format }) {
  const [skillId] = args;
  if (!skillId) throw new UsageError("marker: skill id is required");
  const skill = findSkill(mapData, skillId);
  if (!skill) return { view: null, meta: { format, emptyState: `Skill not found: ${skillId}` } };
  const markers = skill.markers ?? null;
  if (!markers || Object.keys(markers).length === 0) {
    return { view: null, meta: { format, emptyState: EMPTY_STATES.NO_MARKERS_FOR_SKILL(skillId) } };
  }
  const levelFilter = options.level ?? null;
  const filtered = levelFilter ? { [levelFilter]: markers[levelFilter] ?? [] } : markers;
  return { view: { skill: skill.id, name: skill.name, markers: filtered }, meta: { format } };
}
```

`findSkill` walks `mapData.skills` (or the capabilities-to-skills map Map
already exposes). Skills come from `createDataLoader().loadAllData()` which
preserves the `markers` field per research.

Explicitly calls out that no capability in the starter data currently defines
markers. Part 02 will add them, at which point
`fit-landmark marker task_completion` will produce real output. Until Part 02
merges, this command always returns the "No markers defined" empty state — and
the test asserts exactly that path.

### Formatters

`src/formatters/index.js` re-exports one formatter per command and a
`formatResult(result)` dispatcher that picks the formatter by command name and
by `meta.format`. Each formatter module exports:

- `toText(view, meta)` — returns a string for the `text` format.
- `toJson(view, meta)` — returns a JSON string (always includes `meta`).
- `toMarkdown(view, meta)` — returns a markdown string.

Empty-state rule: if `meta.emptyState` is set, every format prints only the
empty-state message (JSON includes it as `{ emptyState: "...", view: null }`).

`src/formatters/shared.js` hosts `formatTable`, `formatKeyValue`, and a thin
wrapper around libcli formatting helpers already used by Summit.

## Tests

Every test runs against in-memory fixtures. No network, no actual Supabase.

- `test/cli-command.test.js` — parses arg strings, confirms each declared
  command routes to the correct handler, confirms `--format` defaults to `text`,
  confirms unknown commands exit with code 2.
- `test/org.test.js` — stub `supabase` with a controlled
  `from('organization_people').select()` path. Verify `getOrganization` is
  called, verify `org team --manager` filters, verify empty manager returns the
  correct empty state.
- `test/snapshot.test.js` — four cases: `list`, `show`, `trend`, `compare`. Mock
  the snapshot query module by passing an injected query object into the command
  handler rather than going through `createLandmarkClient`. Tests exercise the
  `item_id`↔driver warning path explicitly.
- `test/marker.test.js` — uses a hand-built `mapData` fixture with one skill
  that has markers and one that doesn't. Covers `--level` filtering and the
  empty-state path.
- `test/empty-state.test.js` — every entry in `EMPTY_STATES` is reachable from
  at least one command path. This is a regression test against the spec's
  empty-state table.

Mocking pattern for commands: command handlers accept an optional `queries`
parameter (default: module imports from `@forwardimpact/map/activity/...`) that
tests override to inject stubs. This keeps `createLandmarkClient` untouched by
tests while still exercising the handler end-to-end.

## Verification

After all files are written and tests pass locally:

1. `cd products/landmark && bun install` — confirms workspace graph is correct.
2. `bun run layout` at the repo root — asserts Landmark's `src/`-rooted package
   layout passes `scripts/check-package-layout.js`.
3. `bun run check:exports` at the repo root — asserts every published `main`,
   `bin`, `exports` target resolves to a real file
   (`scripts/check-exports-resolve.js`). This catches invented exports entries
   before they reach CI.
4. `bun run check` at the repo root — full lint/format/layout/exports.
5. `bun test products/landmark/test` — runs Part 01 tests in isolation.
6. Smoke test: `bunx fit-landmark --help` prints the full command set with Part
   01 commands implemented and Parts 02–05 listed (dispatching to the "not yet
   implemented" stub, exit code 64).
7. `bunx fit-landmark marker task_completion` against the starter data returns
   the "No markers defined" empty state, proving the command hits the
   spec-documented empty path.
8. With a running `just activity` Supabase, `bunx fit-landmark org show` returns
   the seeded `organization_people` rows.

## Deliverable

A merged PR that leaves `main` with a working `fit-landmark` CLI exposing `org`,
`snapshot`, and `marker` commands. No changes to Map, Summit, or any other
product. No status change to `specs/STATUS`.
