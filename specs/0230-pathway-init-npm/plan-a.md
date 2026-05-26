# 230 — Plan: Pathway Init for npm Installs

## Approach

Option A from the spec: ship a minimal `starter/` directory inside the Pathway
package containing valid YAML files for every required entity type. The init
command copies this directory to the target path instead of resolving monorepo
paths. This is the simplest approach — the starter data is independently
validatable, easy to maintain, and ships as plain files.

As part of this work, remove all remaining references to the legacy `examples/`
directory. The `examples/` directory was the original output location for
`fit-universe` before spec 0120 moved generated data to `data/`. It is
gitignored, untracked, and every code reference to it is stale. Synthetic data
is just data — it flows through the same `data/` path as everything else, so
there is no need for a separate loader or directory convention.

The work breaks into four phases: create the starter data, rewrite the init
command, update package configuration, and clean up `examples/` references.

## Phase 1: Create Starter Data

### 1.1 Create the starter directory

Create `products/pathway/starter/` with the minimal set of files required by the
spec. Files live directly in `starter/` — no nested subdirectory. The init
command handles copying them into `data/pathway/` at the target.

```
products/pathway/starter/
├── framework.yaml
├── levels.yaml
├── stages.yaml
├── drivers.yaml
├── disciplines/
│   └── software_engineering.yaml
├── capabilities/
│   ├── delivery.yaml
│   └── reliability.yaml
├── behaviours/
│   └── systems_thinking.yaml
└── tracks/
    ├── forward_deployed.yaml
    └── platform.yaml
```

Each file includes the `yaml-language-server` schema comment pointing to the
published schema URL (e.g.
`# yaml-language-server: $schema=https://www.forwardimpact.team/schema/json/framework.schema.json`).

**Files created:** 10 YAML files under `products/pathway/starter/`

### 1.2 Write framework.yaml

Minimal framework metadata with a generic title and description. Includes
`entityDefinitions` for all entity types since formatters reference them.

```yaml
# yaml-language-server: $schema=https://www.forwardimpact.team/schema/json/framework.schema.json

title: Engineering Pathway
emojiIcon: "🧭"
description: |
  Define what good engineering looks like for your organization.
  Edit these files to match your skills, levels, and expectations.

entityDefinitions:
  driver:
    title: Drivers
    emojiIcon: "🎯"
    description: Organizational outcomes that productive teams achieve.
  skill:
    title: Skills
    emojiIcon: "💡"
    description: Capabilities required to perform work effectively.
  behaviour:
    title: Behaviours
    emojiIcon: "🧠"
    description: Mindsets and ways of working.
  discipline:
    title: Disciplines
    emojiIcon: "🔬"
    description: Engineering specializations that define skill profiles.
  level:
    title: Levels
    emojiIcon: "📊"
    description: Career levels that define expectations.
  track:
    title: Tracks
    emojiIcon: "🛤️"
    description: Work contexts that modify expectations.
  job:
    title: Jobs
    emojiIcon: "📋"
    description: Role specifications combining discipline, track, and level.
  agent:
    title: Agents
    emojiIcon: "🤖"
    description: AI agent configurations generated from the framework.
  stage:
    title: Stages
    emojiIcon: "🔄"
    description: Phases of the engineering lifecycle.
  tool:
    title: Tools
    emojiIcon: "🔧"
    description: Recommended tools referenced by skills.
```

### 1.3 Write levels.yaml

Two levels — enough to demonstrate progression. Use the same `id`, field
structure, and `baseSkillProficiencies`/`baseBehaviourMaturity` pattern as the
existing data.

```yaml
# yaml-language-server: $schema=https://www.forwardimpact.team/schema/json/levels.schema.json

- id: J040
  professionalTitle: Level I
  managementTitle: Associate
  typicalExperienceRange: "0-2 years"
  ordinalRank: 1
  qualificationSummary: Entry-level position.
  baseSkillProficiencies:
    primary: foundational
    secondary: awareness
    broad: awareness
  baseBehaviourMaturity: emerging
  expectations:
    impactScope: Individual tasks with guidance
    autonomyExpectation: Work with supervision
    influenceScope: Contribute to team discussions
    complexityHandled: Standard tasks with established patterns

- id: J060
  professionalTitle: Level II
  managementTitle: Senior Associate
  typicalExperienceRange: "2-5 years"
  ordinalRank: 2
  qualificationSummary: Mid-level position.
  baseSkillProficiencies:
    primary: working
    secondary: foundational
    broad: awareness
  baseBehaviourMaturity: developing
  expectations:
    impactScope: Features and small projects
    autonomyExpectation: Work independently on familiar problems
    influenceScope: Mentor junior team members
    complexityHandled: Moderate complexity with some ambiguity
```

### 1.4 Write stages.yaml and drivers.yaml

Minimal single-entry files. These are referenced by the schema but the init
experience doesn't depend on rich content. Both schemas require only `id` and
`name` per entry. Stage `id` values must come from the enum: `specify`, `plan`,
`scaffold`, `code`, `review`, `deploy`.

**stages.yaml** — one stage:

```yaml
# yaml-language-server: $schema=https://www.forwardimpact.team/schema/json/stages.schema.json

- id: code
  name: Code
  description: Build the solution.
```

**drivers.yaml** — one driver:

```yaml
# yaml-language-server: $schema=https://www.forwardimpact.team/schema/json/drivers.schema.json

- id: quality
  name: Quality
  description: Deliver work that meets expectations consistently.
```

### 1.5 Write the entity files

One file per subdirectory. Each must conform to its schema and reference only
IDs defined in the other starter files.

**capabilities/delivery.yaml** — defines one capability with two skills (e.g.
`task_completion`, `planning`) that have both `human:` and `agent:` sections.
Includes `professionalResponsibilities` and `managementResponsibilities` at all
five proficiency levels.

**capabilities/reliability.yaml** — defines a second capability with one skill
(e.g. `incident_response`) with both `human:` and `agent:` sections. Two
capabilities are needed so each track can emphasize a different capability via
`skillModifiers`.

**disciplines/software_engineering.yaml** — references one skill per tier:
`coreSkills` (1 skill from `delivery`), `supportingSkills` (1 skill from
`delivery`), `broadSkills` (1 skill from `reliability`). `validTracks` lists
both `platform` and `forward_deployed`. All three tiers are included so the
starter data serves as a complete example of discipline structure.

**behaviours/systems_thinking.yaml** — one behaviour with `human:` and `agent:`
sections, maturity descriptions at all five levels.

**tracks/platform.yaml** — `skillModifiers` emphasize the `reliability`
capability (e.g. boost `incident_response`), reflecting a platform team's focus
on operational concerns.

**tracks/forward_deployed.yaml** — `skillModifiers` emphasize the `delivery`
capability (e.g. boost `task_completion`), reflecting a forward-deployed team's
focus on shipping to customer needs.

Two tracks with different capability emphasis demonstrate that tracks are
relative modifiers — a single track in isolation doesn't convey the concept, and
identical modifiers wouldn't show why tracks exist.

**Decision:** Use `delivery` and `reliability` as the two starter capabilities.
Every engineering team delivers software (delivery) and keeps it running
(reliability). Use `software_engineering` as the discipline, and `platform` /
`forward_deployed` as tracks — they naturally emphasize different capabilities.

**Decision:** Three skills across two capabilities. The discipline references
skills from both capabilities across its three tiers, and each track's
`skillModifiers` emphasize a different capability.

### 1.6 Validate starter data

Run `bunx fit-map validate` against the starter directory to confirm schema
compliance before committing. Fix any validation errors.

`fit-map validate` accepts `--data=PATH` and appends `/pathway` to the given
path internally. To validate the starter data, create a temporary symlink so the
path resolves correctly:

```sh
ln -s "$(pwd)/products/pathway/starter" /tmp/starter-validate/pathway
bunx fit-map validate --data=/tmp/starter-validate
rm -rf /tmp/starter-validate
```

**Files modified:** none (validation only)

## Phase 2: Rewrite the Init Command

### 2.1 Update path resolution in init.js

Replace the monorepo-relative path resolution with package-relative resolution.
The starter data lives at `../../starter/` relative to `src/commands/init.js`.

**Note:** The current primary path resolves to `examples/framework/` but the
actual generated data has always lived at `examples/pathway/`. This means the
init command was already broken in the monorepo — the primary path never matched
the real data location, and the fallback path (`products/pathway/examples/`)
also does not exist. Both code paths fail. This rewrite replaces both with a
single correct path.

```js
// Before (both paths broken — examples/framework/ never existed,
// products/pathway/examples/ also does not exist)
const monorepoExamplesDir = join(__dirname, "..", "..", "..", "..", "examples", "framework");
const legacyExamplesDir = join(__dirname, "..", "..", "examples");

// After
const starterDir = join(__dirname, "..", "..", "starter");
```

Remove the two-path fallback logic. There is now exactly one source path,
resolved relative to the package.

**Files modified:** `products/pathway/src/commands/init.js`

### 2.2 Update target path and copy logic

The spec requires creating `./data/pathway/`. The current code creates
`./data/`. Update to create `./data/pathway/` and copy `starter/` contents into
it.

```js
// Before
const dataDir = join(targetPath, "data");
await cp(examplesDir, dataDir, { recursive: true });

// After
const dataDir = join(targetPath, "data", "pathway");
await cp(starterDir, dataDir, { recursive: true });
```

The existence check remains on `dataDir`.

**Files modified:** `products/pathway/src/commands/init.js`

### 2.3 Preserve --path support

The current init command accepts `--path` to specify a custom target directory.
This must continue to work. The existing `options.path` handling is correct —
just ensure the updated target path logic applies on top of it:

```js
const targetPath = options.path || process.cwd();
const dataDir = join(targetPath, "data", "pathway");
```

No new code needed — just verify the existing `options.path` plumbing is not
removed during the rewrite.

**Files modified:** `products/pathway/src/commands/init.js` (already listed)

### 2.4 Update output messages

Update the success message to reflect the actual directory structure produced by
the starter data (not the old examples structure which listed
`capabilities.yaml` as a single file rather than a directory).

Update the "Next steps" to use correct commands:

```
Next steps:
  1. Edit data files to match your organization
  2. bunx fit-map validate
  3. bunx fit-pathway dev
```

**Files modified:** `products/pathway/src/commands/init.js`

### 2.5 Remove dead code

Delete the `monorepoExamplesDir` and `legacyExamplesDir` constants and the
fallback `access()` checks. The command now has a single code path.

**Files modified:** `products/pathway/src/commands/init.js`

## Phase 3: Package Configuration

### 3.1 Add starter/ to the files field

Add `"starter/"` to the `files` array in `products/pathway/package.json` so that
`npm pack` includes the starter data in the published package.

```jsonc
// Before
"files": ["bin/", "src/", "templates/"]

// After
"files": ["bin/", "src/", "starter/", "templates/"]
```

**Files modified:** `products/pathway/package.json`

### 3.2 Verify package contents

Run `npm pack --dry-run` (or `bun pm pack --dry-run` if available) in
`products/pathway/` to confirm the starter files appear in the tarball listing.

```sh
cd products/pathway && npm pack --dry-run 2>&1 | grep starter
```

**Files modified:** none (verification only)

## Phase 4: Remove Legacy examples/ References

The `examples/` directory is a leftover from before spec 0120 moved synthetic
data output to `data/`. It is gitignored, untracked, and every remaining code
reference points at paths that no longer exist or duplicates what `data/`
provides. Synthetic data is just data — one code path, one directory.

### 4.1 Delete load-examples.js and its Makefile target

`products/map/scripts/load-examples.js` reads from `examples/activity/raw/` but
`fit-universe` now writes to `data/activity/raw/`. Rather than updating the
path, delete the script entirely. The standard data loading pipeline handles
synthetic data the same as real data — there is no need for a separate loader.

Remove the `supabase-seed` Makefile target (line 344–346) and update
`supabase-setup` to remove the `supabase-seed` dependency.

```makefile
# Before
supabase-seed:  ## Load example data into Supabase
	@bun products/map/scripts/load-examples.js

supabase-setup: supabase-up supabase-seed  ## Start + migrate + seed

# After
supabase-setup: supabase-up  ## Start Supabase and run migrations
```

**Files deleted:** `products/map/scripts/load-examples.js` **Files modified:**
`Makefile`

### 4.2 Remove examples/ from .gitignore

Remove the `examples/` entry from `.gitignore`. The directory is no longer a
known output location — `fit-universe` writes to `data/`.

**Files modified:** `.gitignore`

### 4.3 Update stale references

Update remaining mentions of `examples/` in live code and documentation:

| File                                  | Line | Change                               |
| ------------------------------------- | ---- | ------------------------------------ |
| `products/pathway/bin/fit-pathway.js` | 96   | Remove `or examples/` from help text |
| `scripts/schema-definitions.js`       | 5    | Update comment to reference `data/`  |
| `.claude/skills/fit-guide/SKILL.md`   | 212  | Remove `examples/` row from table    |
| `tests/job-builder.spec.js`           | 22   | Update comment to reference `data/`  |

**Decision:** Spec documents (`specs/`) are historical records and are not
updated. Only live code, help text, and active documentation are changed.

**Files modified:** 4 files (see table)

### 4.4 Delete the examples/ directory from disk

The directory is untracked and gitignored, so this is a local cleanup step only.
It does not produce a git change.

```sh
rm -rf examples/
```

## Phase 5: Validation

### 5.1 End-to-end test from package

Simulate the npm install experience:

```sh
# Create a temp directory
tmp=$(mktemp -d)
cd "$tmp"

# Pack and install the local package
npm pack /path/to/products/pathway
npm install forwardimpact-pathway-*.tgz

# Run init
npx fit-pathway init

# Verify
ls data/pathway/
npx fit-pathway discipline --list
```

### 5.2 Verify success criteria

1. `bunx fit-pathway init` completes without errors and creates
   `./data/pathway/`
2. `bunx fit-pathway discipline --list` returns at least one discipline
3. `bunx fit-map validate` passes against the scaffolded data
4. No monorepo-relative paths remain in `init.js` — grep for `"..", "..", ".."`
5. `npm pack --dry-run` includes all starter files
6. No live code references to `examples/` remain (grep confirms)

### 5.3 Run existing tests

```sh
bun run check
```

Confirm no regressions in formatting, linting, or existing tests.

## File Change Summary

| Category         | Files                                           | Action |
| ---------------- | ----------------------------------------------- | ------ |
| Starter data     | 10 YAML files under `products/pathway/starter/` | Create |
| Init command     | `products/pathway/src/commands/init.js`         | Modify |
| Package config   | `products/pathway/package.json`                 | Modify |
| CLI help text    | `products/pathway/bin/fit-pathway.js`           | Modify |
| Legacy loader    | `products/map/scripts/load-examples.js`         | Delete |
| Build config     | `Makefile`                                      | Modify |
| Gitignore        | `.gitignore`                                    | Modify |
| Stale references | 3 files (comments, docs)                        | Modify |
| **Total**        | **~16 files**                                   |        |
