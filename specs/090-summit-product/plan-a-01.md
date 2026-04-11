# Plan A — Part 01: Package scaffold, roster loading, `roster` & `validate`

## Goal

Create the `@forwardimpact/summit` package with the spec 390 layout, wire up
a libcli-based `fit-summit` binary, and implement the two "what can Summit
see?" commands:

- `fit-summit roster` — show current roster as Summit sees it.
- `fit-summit validate` — validate roster against Map framework data.

After this part lands, a contributor can author a `summit.yaml`, run
`bunx fit-summit roster`, and get a clean printout of teams, members,
and project allocations. No analytical commands exist yet.

## Inputs

- Spec 090 sections: "Team Roster" (spec.md:94–172), "Roster Management"
  (spec.md:542–566), "Empty States" (spec.md:704–725), "CLI" outer shape
  (spec.md:726–754).
- Pathway `bin/fit-pathway.js` as CLI template.
- Map `createDataLoader` for loading framework data.
- Map `getOrganization`/`getTeam` for the Map-sourced roster path.
- Map `parseYamlPeople` for reference only — Summit's YAML is a superset
  (teams + projects), so Summit writes its own parser.

## Files Created

### `products/summit/package.json`

```json
{
  "name": "@forwardimpact/summit",
  "version": "0.1.0",
  "description": "Team capability planning from skill data.",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/forwardimpact/monorepo",
    "directory": "products/summit"
  },
  "homepage": "https://www.forwardimpact.team/summit",
  "keywords": ["team", "capability", "planning", "skills", "framework", "engineering"],
  "type": "module",
  "main": "./src/index.js",
  "bin": { "fit-summit": "./bin/fit-summit.js" },
  "files": ["bin/", "src/", "starter/"],
  "exports": {
    ".": "./src/index.js",
    "./aggregation": "./src/aggregation/index.js",
    "./roster": "./src/roster/index.js"
  },
  "dependencies": {
    "@forwardimpact/map": "^0.15.18",
    "@forwardimpact/libskill": "^4.0.0",
    "@forwardimpact/libcli": "^0.1.0",
    "@forwardimpact/libutil": "^0.1.64",
    "@forwardimpact/libtelemetry": "^0.1.0",
    "@supabase/supabase-js": "^2.103.0",
    "yaml": "^2.8.3"
  },
  "engines": { "bun": ">=1.2.0", "node": ">=18.0.0" },
  "publishConfig": { "access": "public" }
}
```

Resolve exact version ranges at implementation time against the current
`bun.lock`. Do not hardcode versions that might drift.

### `products/summit/src/index.js`

```js
// Public API re-exports. Grown across parts.
export { loadRoster, parseRosterYaml } from "./roster/index.js";
```

### `products/summit/src/roster/index.js`

Barrel file that re-exports the roster surface:

```js
export { parseRosterYaml } from "./yaml.js";
export { loadRosterFromMap } from "./map.js";
export { validateRosterAgainstFramework } from "./schema.js";
export { loadRoster } from "./loader.js";
```

Note: `src/roster/loader.js` is the only non-trivial orchestrator
here and is listed separately below. The four files `yaml.js`,
`map.js`, `schema.js`, `loader.js` all live under `src/roster/` in
this part.

### `products/summit/src/roster/yaml.js`

- Exports `parseRosterYaml(content: string): Roster`.
- Uses `parse` from the `yaml` package.
- Accepts the structure from spec.md:111–154:
  - `teams: { [teamId]: Array<PersonEntry> }`
  - `projects: { [projectId]: Array<ProjectMemberEntry> }`
- Normalises `allocation` to 1.0 when missing and only for project
  entries. Rejects `allocation` on reporting-team entries with a clear
  error.
- Supports the `email`-only reference form for project members (spec.md:
  144–149): when a project entry only carries `email`, resolve the
  person from a reporting team by email and merge in `job`, `name`.
  External/hypothetical members must carry their own `name` and `job`.
- Returns a `Roster` object with populated `teams` and `projects` Maps.

### `products/summit/src/roster/schema.js`

- Exports `validateRosterAgainstFramework(roster, data): ValidationResult`.
- Checks every person's `job.discipline`, `job.level`, and optional
  `job.track` against the loaded Map framework data (`data.disciplines`,
  `data.levels`, `data.tracks`).
- Returns `{ errors: Issue[], warnings: Issue[] }` where `Issue = { code,
  message, context }`.
- Does not throw — callers decide whether an error is fatal. The
  `validate` command reports them; other commands warn and proceed with
  what they can resolve (spec.md:713).

### `products/summit/src/roster/map.js`

- Exports `loadRosterFromMap(supabase, options?): Promise<Roster>`.
- Calls `getOrganization(supabase)` from
  `@forwardimpact/map/activity/queries/org`.
- Groups people by `manager_email` to produce one reporting team per
  manager. **Team id derivation:** use the full manager email as team
  id (lowercased). This is less friendly than the email local-part
  but is unambiguous across domains and requires no collision
  handling. A future plan variant can add a human-friendly alias
  layer if that matters.
- No project teams — those only exist in YAML.
- Maps each Map person to the `RosterPerson` shape by reading
  `discipline`, `level`, `track`, `name`, `email`, and `manager_email`
  fields from the `organization_people` row.
- Populates the roster's per-team `managerEmail` field (see
  `src/lib/supabase.js` for where this is consumed in later parts).

### `products/summit/src/lib/supabase.js`

Mirrors `products/map/src/lib/client.js` (which is not exported).
Introduced in Part 01 because `loadRosterFromMap` needs a Supabase
client from day one — the Map-sourced roster is a core feature, not
an evidence-layer feature.

```js
import { createClient } from "@supabase/supabase-js";

export class SupabaseUnavailableError extends Error {
  constructor(reason) {
    super(`Supabase connection unavailable: ${reason}`);
    this.code = "SUMMIT_SUPABASE_UNAVAILABLE";
  }
}

export function createSummitClient(opts = {}) {
  const url = opts.url ?? process.env.MAP_SUPABASE_URL;
  const key = opts.serviceRoleKey ?? process.env.MAP_SUPABASE_SERVICE_ROLE_KEY;
  const schema = opts.schema ?? "activity";

  if (!url || !key) {
    throw new SupabaseUnavailableError(
      "MAP_SUPABASE_URL / MAP_SUPABASE_SERVICE_ROLE_KEY not set. " +
        "Run `fit-map activity start` and export the URL + key it prints, " +
        "or use --roster <path> to load from a local YAML file instead.",
    );
  }

  return createClient(url, key, { db: { schema } });
}
```

The factory accepts an explicit `opts` so tests can inject fakes.
Part 07's evidence and outcomes code reuses the same factory — it
only adds new callers, not a new client.

### `products/summit/src/roster/loader.js`

- Exports `loadRoster({ rosterPath, supabase }): Promise<Roster>`.
- Dispatches:
  - If `rosterPath` is provided, read the file and call
    `parseRosterYaml`.
  - Otherwise construct a Supabase client via `createSummitClient()`
    (injected `supabase` overrides the factory for tests) and call
    `loadRosterFromMap(supabase)`.
- `SupabaseUnavailableError` is caught and re-thrown with the
  spec.md:712 message ("No roster found. Provide --roster path or
  configure Map's organization_people table.") so the caller prints
  an actionable error rather than an env-var diagnostic.

### `products/summit/src/lib/cli.js`

Shared CLI helpers used across all parts:

- `createDataFromOptions(options): Promise<{ data, dataDir }>` — locates
  the Map data directory (`--data` or, when unset, a `new Finder(fs,
  logger, process)` instance whose `findData("data", homedir())`
  method returns the discovered path — see
  `products/pathway/bin/fit-pathway.js:185–194` for the instance
  pattern), invokes `createDataLoader().loadAllData(dataDir)`, returns
  the parsed data.
- `getRosterSource(options): { rosterPath?: string }` — normalises
  `--roster` vs. Map-sourced.
- Re-exports a `TEXT`/`JSON`/`MARKDOWN` constant for format selection.

### `products/summit/src/commands/roster.js`

- Exports `runRosterCommand({ data, options })`.
- Loads roster via `loadRoster()`.
- When `options.format === "json"`, prints JSON matching the shape in
  spec.md:552–562.
- Otherwise renders a text view:
  - Source line (`Source: summit.yaml` or `Source: Map`).
  - Teams table (id, member count, level distribution).
  - Projects table (id, member count, effective FTE).
- Does not run any analytical aggregation — this is a display command.

### `products/summit/src/commands/validate.js`

- Exports `runValidateCommand({ data, options })`.
- Loads roster via `loadRoster()`.
- Runs `validateRosterAgainstFramework(roster, data)`.
- Prints each error in the form `{file} {pointer}: {value} is not defined
  in {reference}.` as shown in spec.md:713.
- Exits `1` on any errors, `0` on success (warnings do not fail).

### `products/summit/bin/fit-summit.js`

Modelled on `products/pathway/bin/fit-pathway.js`. Initial commands table:

```js
const COMMANDS = {
  roster: runRosterCommand,
  validate: runValidateCommand,
};

const definition = {
  name: "fit-summit",
  version: VERSION,
  description: "Team capability planning from skill data.",
  commands: [
    { name: "roster", args: "", description: "Show current roster" },
    { name: "validate", args: "", description: "Validate roster file" },
  ],
  options: {
    roster: { type: "string", description: "Path to summit.yaml" },
    data: { type: "string", description: "Path to Map data" },
    format: { type: "string", default: "text", description: "Output format: text, json, markdown" },
    help: { type: "boolean", short: "h", description: "Show help" },
    version: { type: "boolean", short: "v", description: "Show version" },
  },
  examples: [
    "fit-summit roster",
    "fit-summit roster --roster ./summit.yaml",
    "fit-summit validate --roster ./summit.yaml",
  ],
};
```

The dispatch block mirrors `fit-pathway.js:168–237`: `createCli(definition)`,
parse argv, locate data dir via `Finder`, load data via `createDataLoader`,
invoke `validateAllData(data)`, call the selected handler.

### `products/summit/starter/summit.example.yaml`

A minimal example roster using starter framework entities
(`software_engineering` discipline, `J040`/`J060` levels, `platform`
track). This is the file `npx fit-summit roster` hits by default when a
contributor runs Summit against a fresh starter install.

```yaml
# Example Summit roster — copy to your data dir as summit.yaml.
# All disciplines/levels/tracks must be defined in your Map framework.
teams:
  platform:
    - name: Alice
      email: alice@example.com
      job: { discipline: software_engineering, level: J060, track: platform }
    - name: Bob
      email: bob@example.com
      job: { discipline: software_engineering, level: J040 }

projects:
  migration-q2:
    - email: alice@example.com
      allocation: 0.6
    - name: External Consultant
      job: { discipline: software_engineering, level: J060, track: platform }
      allocation: 1.0
```

### `products/summit/test/roster.test.js`

Coverage for Part 01 behaviour. Tests use Bun's `node:test`:

- Parses a minimal YAML file and returns the expected `Roster` shape.
- Rejects unknown discipline/level/track with error codes from schema.js.
- Normalises project `allocation` default.
- Rejects `allocation` on reporting-team entries.
- Resolves project members by `email` against reporting team data.
- Rejects project members with only `email` when no matching person exists.
- `loadRosterFromMap` groups people by manager_email (uses a fake
  Supabase client injected through DI).
- `validateRosterAgainstFramework` produces issues for each invalid field
  with line pointers.

### `products/summit/test/cli.test.js`

- Shells out to `bin/fit-summit.js roster --roster test/fixtures/roster.yaml`
  via `node` and asserts stdout matches snapshots.
- Shells out to `bin/fit-summit.js validate --roster
  test/fixtures/bad-roster.yaml` and asserts exit code 1.
- Shells out to `bin/fit-summit.js --help` and asserts the `roster` and
  `validate` commands appear.

## Files Modified

### `CLAUDE.md`

No change in this part. The Summit reference already exists at lines
59–64.

### `package.json` (root)

No change — `products/*` workspace wildcard picks Summit up automatically.

### `website/summit/index.md`

No change in this part. Part 08 does the full rewrite against the shipped
behaviour.

## Verification

Each of these must pass before Part 01 is considered done:

1. `bun install` succeeds (new package resolves).
2. `bun run layout` passes (package follows spec 390 allowed-subdirs).
3. `bun run check:exports` passes (every `exports` target resolves).
4. `bun run format` and `bun run lint` clean.
5. `bun run test` includes Summit's new tests and all pass.
6. Running `bunx fit-summit --help` from a clean checkout lists both
   commands and the options table.
7. Running `bunx fit-summit roster --roster
   products/summit/starter/summit.example.yaml --data
   products/map/starter` prints a two-team + one-project view.
8. Running `bunx fit-summit validate --roster
   products/summit/starter/summit.example.yaml --data
   products/map/starter` exits 0.
9. Piping a deliberately invalid roster through `validate` exits 1 with
   actionable error messages.

## Commit

Single commit titled:

```
feat(summit): scaffold package, roster loading, roster and validate commands
```

## Risks

- **YAML format ambiguity.** The spec shows both `teams:` and `projects:`
  top-level keys but does not define whether a standalone list of people
  is valid. Explicitly reject it — reporters must use the `teams:`
  wrapper. Document the decision in `schema.js` JSDoc.
- **Manager-hierarchy team derivation.** Map's `organization_people`
  table may have managers who themselves report to other managers. Part
  01 creates one reporting team per manager who has direct reports; a
  person whose own report count is zero does not get their own team.
  Document this in `map.js` JSDoc and add a fixture-driven test.
- **Team id shape for Map-sourced rosters.** The plan uses the full
  manager email (lowercased) as the team id — e.g. `alice@eng.co`
  rather than `alice`. This avoids collisions across domains and
  requires zero collision-handling logic at the cost of more verbose
  command lines (`fit-summit coverage alice@eng.co`). A human-friendly
  alias layer (for example, `fit-summit roster --alias platform=alice@eng.co`)
  is intentionally out of scope — revisit if the verbosity becomes a
  pain point. Document the chosen scheme in `src/roster/map.js` JSDoc
  so contributors do not accidentally reinvent local-part parsing.
- **Dependency version drift.** Summit pins `@forwardimpact/map`
  at `^0.15.18`. If Map's activity query exports change between drafting
  the plan and implementing it, update the caret range first and re-run
  the checks.

## Notes for the implementer

- Do **not** touch `bin/fit-summit.js` in later parts without revisiting
  the commands list; keep the shape the same to minimise churn across
  parts.
- Do **not** pre-build the aggregation surface in Part 01. Part 02 owns
  the first iteration and is where design time pays off.
- If a decision about the YAML schema turns out to block Part 02 or Part
  04 (what-if), return here and revise Part 01 before continuing — it's
  cheaper to redo a small part than to carry a bad schema forward.
