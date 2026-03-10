# Plan — Synthetic Pathway Data

Implementation plan for generating pathway data from the universe DSL.

## Overview

Seven work phases, each independently shippable:

1. Extend DSL grammar and parser
2. Build pathway prompt templates
3. Build pathway engine and renderer
4. Wire into pipeline
5. Update validation
6. Update default/example DSL files
7. Clean up old framework output

## Phase 1 — DSL Grammar Extension

**Files:** `dsl/tokenizer.js`, `dsl/parser.js`

The existing `parseFramework()` (lines 260–271 in `parser.js`) accepts three
flat arrays (`proficiencies`, `maturities`, `capabilities`). Replace it with a
richer block that declares the full pathway entity graph.

### Parser changes

Replace `parseFramework()` with a new implementation that delegates to
sub-parsers for each entity type:

```javascript
function parseFramework() {
  expect('LBRACE')
  const fw = {
    proficiencies: [], maturities: [],
    levels: [], capabilities: [], behaviours: [],
    disciplines: [], tracks: [], drivers: [],
    stages: [],
  }
  while (peek().type !== 'RBRACE') {
    const kw = advance()
    if (kw.value === 'proficiencies') fw.proficiencies = parseArray()
    else if (kw.value === 'maturities') fw.maturities = parseArray()
    else if (kw.value === 'stages') fw.stages = parseArray()
    else if (kw.value === 'levels') fw.levels = parseFrameworkLevels()
    else if (kw.value === 'capabilities') fw.capabilities = parseFrameworkCapabilities()
    else if (kw.value === 'behaviours') fw.behaviours = parseFrameworkBehaviours()
    else if (kw.value === 'disciplines') fw.disciplines = parseFrameworkDisciplines()
    else if (kw.value === 'tracks') fw.tracks = parseFrameworkTracks()
    else if (kw.value === 'drivers') fw.drivers = parseFrameworkDrivers()
    else throw new Error(`Unexpected '${kw.value}' in framework`)
  }
  expect('RBRACE')
  return fw
}
```

Each sub-parser follows the existing pattern (advance tokens, expect braces,
parse key-value pairs). The shapes match the spec's DSL examples:

**`parseFrameworkLevels()`** — Map of level IDs to
`{ professionalTitle, managementTitle, rank, experience }`. The real schema
uses `professionalTitle` / `managementTitle`, not a single `title`.

**`parseFrameworkCapabilities()`** — Array of `{ id, name, skills: string[] }`.
Each capability declares skill IDs; skill names/prose come from the LLM.

**`parseFrameworkBehaviours()`** — Array of `{ id, name }`. Note: the
actual YAML files use `name` as the top-level key (no explicit `id` field).
The filename serves as the ID. The DSL uses the block key as the ID.

**`parseFrameworkDisciplines()`** — Each has `{ id, roleTitle, specialization,
isProfessional, core, supporting, broad, validTracks }`. The real schema uses
`specialization` (not `name`), and `isProfessional` is a boolean distinguishing
professional from management disciplines.

**`parseFrameworkTracks()`** — Each has `{ id, name }`. Track YAML files
use `name` at the top level (no `id` field — filename is the ID). Skill
modifiers and behaviour modifiers are populated by the LLM, not declared in
the DSL.

**`parseFrameworkDrivers()`** — Each has `{ id, name, skills, behaviours }`.
The real schema uses `contributingSkills` and `contributingBehaviours`; the DSL
uses shorter aliases `skills` and `behaviours` for brevity.

### Backward compatibility

The `capabilities` keyword currently accepts a flat array (`parseArray()`). The
new parser peeks at the next token — if it's `LBRACKET`, delegate to
`parseArray()` for backward compatibility; if `LBRACE`, delegate to
`parseFrameworkCapabilities()`. Same for `behaviours` and `drivers`.

### Tokenizer

No new token **types** needed. The existing token types (`KEYWORD`, `IDENT`,
`STRING`, `NUMBER`, `PERCENT`, `DATE`, `LBRACE`, `RBRACE`, `LBRACKET`,
`RBRACKET`, `COMMA`, `AT_IDENT`) cover all new syntax. However, new keywords
must be added to the KEYWORDS list (currently 42 entries):
`levels`, `behaviours`, `disciplines`, `tracks`, `drivers`, `stages`,
`skills`, `name`, `title`, `rank`, `experience`, `roleTitle`, `core`,
`supporting`, `broad`, `validTracks`. This ensures they tokenize as `KEYWORD`
rather than `IDENT`.

## Phase 2 — Prompt Templates

**New directory:** `libraries/libuniverse/prompts/pathway/`

One prompt template per entity type. Each template is a JS module exporting a
function that takes the entity skeleton (from the DSL) and returns a prompt
object `{ system, user, schema }`.

Note: the existing codebase has **no prompts directory** — prose prompts are
currently built inline in `ProseEngine.buildPrompt()`. This phase introduces
the first externalized prompt templates.

### Design principle: JSON schema as context

Each prompt includes the relevant JSON schema file verbatim. The LLM sees the
exact constraints it must satisfy. The prompt instructs the LLM to output valid
JSON conforming to the schema.

```
prompts/pathway/
  capability.js     One prompt per capability (generates full YAML file content)
  behaviour.js      One prompt per behaviour
  discipline.js     One prompt per discipline
  track.js          One prompt per track
  level.js          One prompt for all levels (single file)
  driver.js         One prompt for all drivers (single file)
  framework.js      One prompt for framework.yaml metadata
  stage.js          One prompt for all stages (single file)
```

### Prompt structure (example: capability)

```javascript
export function buildCapabilityPrompt(skeleton, universeContext, schema) {
  return {
    system: [
      'You are an expert career framework author.',
      'Output ONLY valid JSON. No markdown fences, no explanations.',
      `The organization domain is: ${universeContext.domain}.`,
      `Industry: ${universeContext.industry}.`,
    ].join(' '),

    user: [
      'Generate a capability definition for a career framework.',
      '',
      '## JSON Schema (you MUST conform to this exactly)',
      '```json',
      JSON.stringify(schema, null, 2),
      '```',
      '',
      '## Skeleton',
      `Capability ID: ${skeleton.id}`,
      `Capability name: ${skeleton.name}`,
      `Skills to define: ${skeleton.skills.join(', ')}`,
      '',
      '## Instructions',
      '- description: 1-2 sentences describing this capability area.',
      '- professionalResponsibilities: One sentence per proficiency level',
      '  (awareness through expert) describing IC expectations.',
      '- managementResponsibilities: Same for management track.',
      '- skills: For each skill ID listed above, generate:',
      '  - name: Human-readable name (title case)',
      '  - human.description: 2-3 sentences.',
      '  - human.proficiencyDescriptions: One paragraph per level',
      '    (awareness, foundational, working, practitioner, expert).',
      '    Use second-person ("You..."). Each level must show clear',
      '    progression in scope, autonomy, and complexity.',
      '- Do NOT include agent sections — human only.',
      '- emojiIcon: A single emoji representing this capability.',
      '- ordinalRank: Use the position in the list (1-based).',
      '',
      'Output the JSON object for this single capability file.',
    ].join('\n'),
  }
}
```

### Capability and behaviour prompts — the heavy lifters

Capabilities are the most prose-dense entity. Each capability with 4 skills
requires:
- 1 description + 5 professional + 5 management responsibilities = 11 strings
- Per skill: 1 description + 5 proficiency descriptions = 6 strings
- 4 skills × 6 = 24 strings
- Total: ~35 prose strings per capability

To keep prompt size manageable and output quality high, each capability is
prompted independently (one LLM call per capability). Behaviours are similarly
one call each (1 description + 5 maturity descriptions = ~7 prose strings).
Behaviour files in `data/pathway/` have both `human:` and `agent:` sections,
but the spec explicitly scopes this to `human:` sections only.

Simpler entities (levels, stages, drivers, framework) can be batched into a
single prompt each since their prose density is lower.

Levels are richer than they appear — each level has `professionalTitle`,
`managementTitle`, `qualificationSummary`, `baseSkillProficiencies` (with
primary/secondary/broad), `baseBehaviourMaturity`, and `expectations` (with
`impactScope`, `autonomyExpectation`, `influenceScope`, `complexityHandled`).
The prompt must guide the LLM to produce all of these.

### Token budget

Estimated token counts per call (including schema context):

| Entity       | Input tokens | Output tokens | Calls |
| ------------ | ------------ | ------------- | ----- |
| Framework    | ~2,000       | ~500          | 1     |
| Levels       | ~3,000       | ~2,000        | 1     |
| Stages       | ~3,000       | ~3,000        | 1     |
| Behaviours   | ~2,500       | ~1,500        | N (5) |
| Capabilities | ~4,000       | ~4,000        | N (11)|
| Drivers      | ~2,500       | ~1,000        | 1     |
| Disciplines  | ~3,000       | ~1,500        | N (5) |
| Tracks       | ~2,500       | ~800          | N (4) |

Total for BioNova-scale universe: ~25 LLM calls, ~80K input + ~40K output
tokens.

## Phase 3 — Pathway Engine and Renderer

**New files:** `libraries/libuniverse/engine/pathway.js`,
`libraries/libuniverse/render/pathway.js`

The engine orchestrates LLM calls in dependency order. The renderer takes the
LLM-generated JSON, validates it, and converts to YAML files.

```javascript
/**
 * Render pathway YAML files from LLM-generated entity data.
 *
 * @param {object} pathwayData — keyed by entity type
 * @returns {Map<string,string>} path → YAML content
 */
export function renderPathway(pathwayData) {
  const files = new Map()

  // Single-file entities
  files.set('framework.yaml', toYaml(pathwayData.framework, 'framework'))
  files.set('levels.yaml', toYaml(pathwayData.levels, 'levels'))
  files.set('stages.yaml', toYaml(pathwayData.stages, 'stages'))
  files.set('drivers.yaml', toYaml(pathwayData.drivers, 'drivers'))
  files.set('self-assessments.yaml', toYaml(pathwayData.selfAssessments, 'self-assessments'))

  // Multi-file entities (one YAML per entity)
  for (const cap of pathwayData.capabilities) {
    files.set(`capabilities/${cap.id}.yaml`, toYaml(cap, 'capability'))
  }

  for (const beh of pathwayData.behaviours) {
    files.set(`behaviours/${beh.id}.yaml`, toYaml(beh, 'behaviour'))
  }

  for (const disc of pathwayData.disciplines) {
    files.set(`disciplines/${disc.id}.yaml`, toYaml(disc, 'discipline'))
  }

  for (const track of pathwayData.tracks) {
    files.set(`tracks/${track.id}.yaml`, toYaml(track, 'track'))
  }

  return files
}
```

### Schema validation

Before writing YAML, each entity is validated against its JSON schema using
`ajv`. Note: `ajv` and `ajv-formats` are dependencies of `@forwardimpact/map`
but **not** of `libuniverse` — they must be added to
`libraries/libuniverse/package.json`. If validation fails, the error is logged
and the entity is retried once with the validation errors appended to the
prompt (self-healing loop).

```javascript
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
const ajv = new Ajv({ allErrors: true })
addFormats(ajv)

function validateEntity(data, schemaPath) {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'))
  const validate = ajv.compile(schema)
  const valid = validate(data)
  return { valid, errors: validate.errors }
}
```

### YAML conversion

Use the `yaml` package (already a dependency) with a schema comment header:

```javascript
function toYaml(data, schemaName) {
  const schemaComment = `# yaml-language-server: $schema=https://www.forwardimpact.team/schema/json/${schemaName}.schema.json\n\n`
  return schemaComment + YAML.stringify(data, { lineWidth: 80 })
}
```

### Index files

`_index.yaml` files are not generated by libuniverse. Run
`npx fit-map generate-index` on the output directory after generation.

## Phase 4 — Pipeline Integration

**File:** `libraries/libuniverse/pipeline.js`

### New generation step

Insert a pathway generation step. The existing pipeline has five steps:
parse → tier 0 → prose → render → validate. Pathway generation is a new
render type (like `html`, `yaml`, `raw`, `markdown`) that also needs LLM
calls. It slots in as both a generation and render step:

1. Reads JSON schemas from `products/map/schema/json/`.
2. Builds prompts for each entity type using the DSL skeleton +
   schema + universe context.
3. Calls `ProseEngine.generateStructured()` (new method from Phase 2) with
   cache key `pathway:{type}:{id}` for each entity.
4. Parses JSON responses.
5. Validates against schemas.
6. Retries on validation failure (once, with errors in prompt).
7. Collects results into a `pathwayData` object.

```javascript
if (shouldRender('pathway')) {
  const pathwayData = await generatePathwayData({
    framework: entities.framework,
    domain: entities.domain,
    schemas: loadSchemas(schemaDir),
    proseEngine,
  })
  const pathwayFiles = renderPathway(pathwayData)
  for (const [name, content] of pathwayFiles) {
    files.set(`examples/pathway/${name}`, content)
  }
}
```

The `runPipeline()` function signature must be extended to accept a `schemaDir`
option (path to `products/map/schema/json/`). The CLI in `bin/fit-universe.js`
resolves this relative to the monorepo root.

### New module: `engine/pathway.js`

Orchestrates the entity generation order from the spec:

```javascript
export async function generatePathwayData({ framework, domain, schemas, proseEngine }) {
  const ctx = { domain, industry: domain }

  // 1. Framework metadata
  const fw = await generateEntity('framework', framework, schemas.framework, ctx, proseEngine)

  // 2. Levels
  const levels = await generateEntity('levels', framework.levels, schemas.levels, ctx, proseEngine)

  // 3. Stages
  const stages = await generateEntity('stages', framework.stages, schemas.stages, ctx, proseEngine)

  // 4. Behaviours (parallel — no cross-references)
  const behaviours = await Promise.all(
    framework.behaviours.map(b =>
      generateEntity('behaviour', b, schemas.behaviour, ctx, proseEngine)
    )
  )

  // 5. Capabilities with skills (parallel)
  const capabilities = await Promise.all(
    framework.capabilities.map((c, i) =>
      generateEntity('capability', { ...c, ordinalRank: i + 1 }, schemas.capability, ctx, proseEngine)
    )
  )

  // Collect all skill IDs and behaviour IDs for downstream references
  const skillIds = capabilities.flatMap(c => (c.skills || []).map(s => s.id))
  const behaviourIds = behaviours.map(b => b.id)

  // 6. Drivers (reference skills + behaviours)
  const drivers = await generateEntity('drivers', framework.drivers,
    schemas.drivers, { ...ctx, skillIds, behaviourIds }, proseEngine)

  // 7. Disciplines (reference skills, behaviours, track IDs from DSL)
  // Note: validTracks uses DSL-declared track IDs, not LLM-generated data,
  // so disciplines and tracks have no ordering dependency.
  const trackIds = framework.tracks.map(t => t.id)
  const disciplines = await Promise.all(
    framework.disciplines.map(d =>
      generateEntity('discipline', d, schemas.discipline,
        { ...ctx, skillIds, behaviourIds, trackIds }, proseEngine)
    )
  )

  // 8. Tracks (reference capability IDs for skillModifiers)
  const capabilityIds = capabilities.map(c => c.id)
  const tracks = await Promise.all(
    framework.tracks.map(t =>
      generateEntity('track', t, schemas.track,
        { ...ctx, capabilityIds, skillIds, behaviourIds }, proseEngine)
    )
  )

  // 9. Self-assessments (deterministic — no LLM)
  const selfAssessments = generateSelfAssessments(
    framework, skillIds, behaviourIds
  )

  return { framework: fw, levels, stages, behaviours, capabilities,
           drivers, disciplines, tracks, selfAssessments }
}
```

### Self-assessments (deterministic)

Self-assessments reference actual skill and behaviour IDs from the generated
data. They are generated deterministically using the seeded RNG — no LLM call
needed. This replaces the current `generateSkillAssessments()` /
`generateBehaviourAssessments()` in `render/yaml.js` which map person levels
to hardcoded proficiency/maturity constants (`PROFICIENCY_LEVELS`,
`MATURITY_LEVELS`).

### ProseEngine extension

The existing `ProseEngine` supports string-valued cache entries. For pathway
generation, the cache stores JSON strings (the LLM's raw JSON output).

The existing cache key is a SHA-256 hash of `(key, JSON.stringify(context))`
via `generateHash()` from libutil. The logical key prefix
`pathway:{entity_type}:{entity_id}` is the `key` argument — the hash makes
it deterministic for cache hits.

`generateProse()` currently builds prompts inline via `buildPrompt()` using
fields like `topic`, `tone`, `length`, `domain`. Pathway generation needs
structured prompts (system + user with schema context), which `buildPrompt()`
does not support. Two options:

1. **Bypass `generateProse()`** — Call `llmApi.createCompletions()` directly
   from the pathway engine and manage caching separately.
2. **Extend `ProseEngine`** — Add a `generateStructured(key, messages)`
   method that accepts pre-built messages and handles caching.

Option 2 is cleaner — it reuses the cache and mode (`no-prose`, `cached`,
`generate`) logic:

```javascript
async generateStructured(key, messages) {
  const cacheKey = generateHash(key, JSON.stringify(messages))
  if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)
  if (this.mode === 'no-prose' || this.mode === 'cached') return null
  const response = await this.llmApi.createCompletions(messages)
  this.cache.set(cacheKey, response)
  return response
}
```

A convenience wrapper for JSON parsing:

```javascript
async generateJson(key, messages) {
  const raw = await this.generateStructured(key, messages)
  if (!raw) return null
  return JSON.parse(raw)
}
```

### Schema loading

Schemas use `$ref` to reference shared definitions in `defs.schema.json`.
When compiling with AJV, either load `defs.schema.json` first via
`ajv.addSchema()` or resolve `$ref` URIs manually.

```javascript
function loadSchemas(schemaDir) {
  const names = [
    'framework', 'levels', 'stages', 'behaviour', 'capability',
    'discipline', 'track', 'drivers', 'self-assessments', 'defs',
  ]
  const schemas = {}
  for (const name of names) {
    schemas[name] = JSON.parse(
      readFileSync(join(schemaDir, `${name}.schema.json`), 'utf-8')
    )
  }
  return schemas
}
```

## Phase 5 — Validation Update

**File:** `libraries/libuniverse/validate.js`

Replace `checkFrameworkValidity()` (currently check #2 out of 16, which only
verifies the framework object exists with non-empty proficiencies) with
`checkPathwayValidity()`:

```javascript
function checkPathwayValidity(entities, pathwayFiles) {
  // 1. Check all expected files were generated
  const expectedDirs = ['capabilities', 'behaviours', 'disciplines', 'tracks']
  const expectedRoots = ['framework.yaml', 'levels.yaml', 'stages.yaml',
                         'drivers.yaml', 'self-assessments.yaml']

  const missingRoots = expectedRoots.filter(f =>
    !pathwayFiles.has(f)
  )

  // 2. Cross-reference integrity
  const errors = []
  // Check that discipline.coreSkills reference skills that exist in capabilities
  // Check that drivers.contributingSkills reference existing skills
  // Check that drivers.contributingBehaviours reference existing behaviours
  // Check that tracks.skillModifiers reference existing capability IDs
  // Check that self-assessment skill/behaviour IDs exist

  return {
    name: 'pathway_validity',
    passed: missingRoots.length === 0 && errors.length === 0,
    message: missingRoots.length === 0 && errors.length === 0
      ? 'Pathway data generated and cross-referenced'
      : `Missing: ${missingRoots.join(', ')}. Errors: ${errors.join('; ')}`,
  }
}
```

Additionally, run `npx fit-map validate --data=examples/pathway` as a
post-generation check from the CLI.

## Phase 6 — DSL File Updates

**Files:** `examples/universe.dsl`, `libraries/libuniverse/data/default.dsl`

### universe.dsl (BioNova) — full pathway skeleton

Replace the minimal `framework { ... }` block with the extended syntax
declaring levels, capabilities with skills, behaviours, disciplines, tracks,
drivers, and stages. The entity graph should reflect a pharma-oriented
organization with ~11 capabilities, ~40 skills, 5 behaviours, 5 disciplines,
4 tracks.

### default.dsl (minimal test) — small pathway skeleton

A minimal framework with 2 capabilities (3 skills each), 2 behaviours,
2 levels, 1 discipline, 1 track, 2 drivers. Enough to exercise the pipeline
without heavy LLM usage.

## Phase 7 — Cleanup

### Remove old framework output path

In `pipeline.js`, remove the `examples/framework/` output path. The `yaml`
content type is replaced by `pathway`:

```javascript
// Before
if (shouldRender('yaml')) {
  const yaml = renderYAML(entities)
  for (const [name, content] of yaml) {
    files.set(join('examples/framework', name), content)
  }
}

// After — deleted. Replaced by the 'pathway' block.
```

### Retain roster/teams in activity output

The current `renderYAML()` in `render/yaml.js` generates three files:
`self-assessments.yaml`, `roster.yaml`, and `teams.yaml`. Roster and teams
are activity data, not pathway data. Move roster and teams rendering to
`render/raw.js` (which already exists and exports `renderRawDocuments()`).
Output them under `examples/activity/`:

```javascript
if (shouldRender('raw')) {
  // ... existing raw documents (GitHub webhooks, GetDX payloads, people YAML) ...
  files.set('examples/activity/roster.yaml', renderRoster(entities))
  files.set('examples/activity/teams.yaml', renderTeams(entities))
}
```

Note: `renderRawDocuments()` currently returns a Map fed into `rawDocuments`
(for storage loading), not `files`. Roster/teams should go into `files`
instead since they are filesystem outputs, not storage documents. This may
require a small refactor of the raw render block.

### Delete render/yaml.js

After moving roster/teams, `render/yaml.js` has no remaining exports. Delete
it.

### Update CLI `--only` flag

In `bin/fit-universe.js`, add `pathway` as a valid value for `--only` (parsed
via `arg.startsWith('--only=')`). Remove `yaml` or alias it to `pathway` for
backward compatibility.

## Testing

### Unit tests

- DSL parser tests for the extended `framework` block.
- Prompt template tests — verify prompt output includes schema, skeleton, and
  domain context.
- Pathway renderer tests — verify YAML output structure and file paths.
- Self-assessment tests — verify generated IDs match skill/behaviour IDs.
- Validation tests — verify cross-reference checks catch broken references.

### Integration test

Run the full pipeline with `default.dsl` (minimal universe) in `--generate`
mode. Verify:

1. All expected files are created under `examples/pathway/`.
2. `npx fit-map validate --data=examples/pathway` passes.
3. Cross-reference integrity holds.

Use a mock LLM client (from libharness) that returns canned JSON responses
for deterministic testing without actual LLM calls.

### Cached mode test

After one successful generation, run again with `--cached`. Verify identical
output, zero LLM calls.

## Dependency changes

| Package           | Change                       | Reason                      |
| ----------------- | ---------------------------- | --------------------------- |
| `ajv`             | Add to libuniverse           | JSON Schema validation      |
| `ajv-formats`     | Add to libuniverse           | Format validators (uri, etc)|
| `yaml`            | Already present              | YAML serialization          |
| `@forwardimpact/libllm` | Already present        | LLM calls                   |

## File inventory

| Action  | Path                                         |
| ------- | -------------------------------------------- |
| Modify  | `libraries/libuniverse/dsl/tokenizer.js`     |
| Modify  | `libraries/libuniverse/dsl/parser.js`        |
| Modify  | `libraries/libuniverse/pipeline.js`          |
| Modify  | `libraries/libuniverse/validate.js`          |
| Modify  | `libraries/libuniverse/engine/prose.js`      |
| Modify  | `libraries/libuniverse/engine/prose-keys.js` |
| Modify  | `libraries/libuniverse/render/raw.js`        |
| Modify  | `libraries/libuniverse/bin/fit-universe.js`  |
| Modify  | `libraries/libuniverse/index.js`             |
| Modify  | `libraries/libuniverse/package.json`         |
| Modify  | `examples/universe.dsl`                      |
| Modify  | `libraries/libuniverse/data/default.dsl`     |
| Create  | `libraries/libuniverse/engine/pathway.js`    |
| Create  | `libraries/libuniverse/render/pathway.js`    |
| Create  | `libraries/libuniverse/prompts/pathway/capability.js` |
| Create  | `libraries/libuniverse/prompts/pathway/behaviour.js`  |
| Create  | `libraries/libuniverse/prompts/pathway/discipline.js` |
| Create  | `libraries/libuniverse/prompts/pathway/track.js`      |
| Create  | `libraries/libuniverse/prompts/pathway/level.js`      |
| Create  | `libraries/libuniverse/prompts/pathway/driver.js`     |
| Create  | `libraries/libuniverse/prompts/pathway/framework.js`  |
| Create  | `libraries/libuniverse/prompts/pathway/stage.js`      |
| Delete  | `libraries/libuniverse/render/yaml.js`       |
