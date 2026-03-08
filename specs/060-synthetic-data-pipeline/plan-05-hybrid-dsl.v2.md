# Plan 05 — Hybrid DSL with Tiered Generation (v2)

> A custom domain-specific language (DSL) defines the data universe
> declaratively; a tiered execution engine uses deterministic generators for
> structure and LLM calls only where natural language is required, with the
> option to run fully offline using cached LLM output.

## Revision Notes

This is v2 of the plan, revised after an implementation attempt that was largely
successful but revealed three architectural problems:

1. **Library underuse.** The monorepo has libraries (`libutil`, `libllm`,
   `libconfig`, `libformat`, `libstorage`) designed for exactly the concerns
   the pipeline reimplemented from scratch (hashing, LLM calls, config loading,
   HTML formatting, file I/O). The result was duplicated logic and missed
   utility (e.g. hand-rolling `process.env` reads instead of using
   `createScriptConfig`, reimplementing YAML serialization instead of using the
   `yaml` package, building a custom RNG instead of using `seedrandom`).

2. **CLI overload.** The `generate` command was bolted onto `fit-map` with 12+
   flags (`--token`, `--model`, `--base-url`, `--temperature`, `--cached`,
   `--strict`, `--only`, `--dry-run`, `--validate-only`, `--universe`,
   `--no-prose`, `--llm`). The `fit-map` CLI is a data validation tool — it
   should not also be an LLM orchestrator. The flags created a combinatorial
   surface area that was hard to test and hard to document.

3. **Dynamic imports.** The pipeline used `await import(...)` to lazily load
   `libllm` and the pipeline module itself from the `fit-map` CLI. This added
   fragile non-determinism (import paths break when files move), made
   dependencies invisible to static analysis, and complicated error messages.

### Design Principles for v2

- **Use the libraries.** Every cross-cutting concern maps to an existing
  library. The plan specifies which library handles which concern.
- **Separate the library from the CLI.** All DSL parsing, entity generation,
  prose generation, rendering, and validation logic lives in
  `libraries/libuniverse/`. The CLI in `scripts/generate/` is a thin wrapper.
- **No dynamic imports.** All dependencies are static ESM imports. If a module
  is needed, it is declared in `package.json` and imported at the top of the
  file.
- **Config via libconfig.** LLM tokens, model names, base URLs, and pipeline
  settings come from `createScriptConfig()` and environment variables — not
  CLI flags.
- **fit-map stays simple.** The `fit-map` CLI gains zero new commands or flags.
  Generation is its own script: `node scripts/generate/cli.js`.

## Approach

Define a DSL that captures the full data universe — entities, relationships,
scenarios, signal parameters — in a single composable specification. A tiered
execution engine processes this specification:

- **Tier 0 (deterministic):** Entity graphs, relationships, activity data,
  signal curves — pure functions, seeded PRNG, no LLM
- **Tier 1 (LLM-assisted):** Prose fields (descriptions, evidence, articles)
  — generated via `libllm` (any OpenAI-compatible endpoint) or cached
- **Tier 2 (cached):** Previously generated Tier 1 output stored in a cache
  file, enabling fully offline/deterministic runs after initial generation

The key insight: separate what *must* be natural language from what can be
computed. Only ~15% of output tokens require LLM generation; the rest is
structural.

## Architecture

```
universe.dsl ──► libuniverse
                    │
                    ├── dsl/        DSL Parser (tokenizer + recursive-descent)
                    │
                    ├── engine/     Tiered Execution
                    │    ├── tier0.js    Deterministic entity & activity generation
                    │    ├── prose.js    LLM prose via libllm + cache
                    │    ├── rng.js      Seeded PRNG (seedrandom)
                    │    └── names.js    Greek mythology name pool
                    │
                    ├── render/     Output Renderers
                    │    ├── html.js       HTML microdata (uses libformat)
                    │    ├── yaml.js       Framework YAML (uses yaml package)
                    │    ├── table.js      Activity JSON
                    │    └── markdown.js   Personal knowledge Markdown
                    │
                    └── validate.js Cross-content validation
                    │
                    ▼
            scripts/generate/
                    │
                    ├── cli.js      Thin CLI wrapper (parseArgs → libuniverse)
                    └── universe.dsl  BioNova universe definition
```

### Library Dependency Map

Every cross-cutting concern maps to an existing library:

| Concern                | Library      | API                                        |
| ---------------------- | ------------ | ------------------------------------------ |
| Configuration          | libconfig    | `createScriptConfig('generate', defaults)` |
| LLM completions        | libllm       | `createLlmApi()` → `createCompletions()`   |
| Token budgeting        | libutil      | `countTokens()`, `createTokenizer()`       |
| Deterministic hashing  | libutil      | `generateHash()`                           |
| HTML sanitization      | libformat    | `createHtmlFormatter()`                    |
| Project root discovery | libutil      | `Finder`                                   |
| YAML serialization     | yaml (npm)   | `YAML.stringify()`                         |
| Seeded PRNG            | seedrandom   | `seedrandom()`                             |

**No new utility code** should be written for concerns already handled by these
libraries. If a library is missing functionality, extend the library — do not
inline a workaround.

## The DSL

### Universe Definition

```
// universe.dsl — Complete synthetic data specification

universe BioNova {
  domain "bionova.example"
  industry "pharmaceutical"
  seed 42

  // ─── Organization ───────────────────────────────

  org headquarters {
    name "BioNova Global Headquarters"
    location "Cambridge, MA"
  }

  department rd {
    name "BioNova R&D"
    parent headquarters
    headcount 55

    team drug_discovery {
      name "Drug Discovery Team"
      size 12
      manager @thoth
      repos ["oncology-pipelines", "cell-assay-lib", "molecular-screening"]
    }

    team clinical_development {
      name "Clinical Development Team"
      size 10
      manager @chronos
      repos ["clinical-stream", "trial-data-manager"]
    }

    // ... more teams
  }

  department it {
    name "BioNova IT"
    parent headquarters
    headcount 65

    team platform_engineering {
      name "Platform Engineering Team"
      size 15
      manager @athena
      repos ["molecularforge", "data-lake-infra", "api-gateway"]
    }

    // ... more teams
  }

  // ... more departments

  // ─── People ─────────────────────────────────────

  people {
    count 211
    names "greek_mythology"
    distribution {
      L1 40%
      L2 25%
      L3 20%
      L4 10%
      L5 5%
    }
    disciplines {
      software_engineering 60%
      data_engineering 25%
      engineering_management 15%
    }
  }

  // ─── Projects ───────────────────────────────────

  project oncora {
    name "Oncora"
    type "drug"
    phase "clinical_trial_phase_3"
    teams [drug_discovery, clinical_development]
    timeline_start 2024-01
    timeline_end 2026-06
    prose_topic "oncology drug in Phase 3 clinical trials"
    prose_tone "technical, optimistic"
  }

  project molecularforge {
    name "MolecularForge"
    type "platform"
    teams [platform_engineering, data_science_ai]
    timeline_start 2023-06
    timeline_end 2026-12
    prose_topic "AI-powered drug discovery platform rewrite"
    prose_tone "technical"
  }

  // ─── Scenarios ──────────────────────────────────

  // GetDX survey snapshots — quarterly cycles matching GetDX snapshots.list API
  snapshots {
    quarterly_from 2024-07
    quarterly_to 2026-01
    account_id "acct_bionova_001"
    // Generates one getdx_snapshots record per quarter with fields:
    //   snapshot_id, account_id, scheduled_for, completed_at,
    //   completed_count, total_count, last_result_change_at, raw
  }

  scenario oncora_push {
    name "Oncora Drug Discovery Push"
    timerange_start 2025-03
    timerange_end 2025-09

    affect drug_discovery {
      github_commits "spike"
      github_prs "elevated"
      // dx_drivers uses driver IDs from drivers.yaml (= item_id in
      // getdx_snapshot_team_scores). Each driver gets a trajectory shape
      // and magnitude delta applied to the team's baseline score.
      dx_drivers {
        clear_direction  { trajectory "rising" magnitude 5 }
        learning_culture { trajectory "rising" magnitude 3 }
        connectedness    { trajectory "rising" magnitude 4 }
      }
      evidence_skills [data_integration, data_modeling]
      evidence_floor "working"
    }

    affect clinical_development {
      github_commits "elevated"
      github_prs "moderate"
      dx_drivers {
        clear_direction       { trajectory "rising" magnitude 4 }
        efficient_processes   { trajectory "rising" magnitude 3 }
        requirements_quality  { trajectory "rising" magnitude 2 }
      }
      evidence_skills [stakeholder_management]
      evidence_floor "foundational"
    }
  }

  scenario molecularforge_release {
    name "MolecularForge Major Release"
    timerange_start 2025-06
    timerange_end 2025-12

    affect platform_engineering {
      github_commits "sustained_spike"
      github_prs "very_high"
      // Burnout signals show up as declining scores on specific drivers
      dx_drivers {
        deep_work           { trajectory "declining" magnitude -8 }
        managing_tech_debt  { trajectory "declining" magnitude -5 }
        ease_of_release     { trajectory "declining" magnitude -6 }
        code_review         { trajectory "declining" magnitude -3 }
      }
      evidence_skills [architecture_design, sre_practices]
      evidence_floor "practitioner"
    }
  }

  // ... more scenarios

  // ─── Framework ──────────────────────────────────

  framework {
    proficiencies [awareness, foundational, working, practitioner, expert]
    maturities [emerging, developing, practicing, role_modeling, exemplifying]
    capabilities [delivery, scale, reliability, business, people]
  }

  // ─── Content Types ──────────────────────────────

  content guide_html {
    articles 4
    article_topics [clinical, data_ai, drug_discovery, manufacturing]
    blogs 15
    faqs 20
    howtos 2
    howto_topics [clinical_data, gmp_procedures]
    reviews 30
    comments 50
    courses 15
    events 10
  }

  content basecamp_markdown {
    personas 5
    persona_levels [L1, L2, L3, L4, L5]
    briefings_per_persona 8
    notes_per_persona 15
  }
}
```

### DSL Parser

The DSL parser is a simple recursive-descent parser that produces an AST.
It lives in `libraries/libuniverse/dsl/`:

```javascript
// libraries/libuniverse/dsl/index.js

import { tokenize } from './tokenizer.js'
import { parse } from './parser.js'

/**
 * Parse universe DSL source into an AST.
 * @param {string} source - DSL source text
 * @returns {UniverseAST}
 */
export function parseUniverse(source) {
  const tokens = tokenize(source)
  return parse(tokens)
}
```

The tokenizer and parser are the same recursive-descent approach as v1.
AST node types:

```
UniverseAST { name, domain, industry, seed, orgs, departments, teams,
              people, projects, scenarios, snapshots, framework, content }
DepartmentNode { id, name, parent, headcount, _children }
TeamNode { id, name, size, manager, repos, department }
SnapshotsNode { quarterly_from, quarterly_to, account_id }
ScenarioNode { id, name, timerange_start, timerange_end, affects }
AffectNode { team_id, github_commits, github_prs, dx_drivers, evidence_skills, evidence_floor }
DxDriverNode { driver_id, trajectory, magnitude }
```

## libuniverse Package

### Package Structure

```
libraries/libuniverse/
  package.json
  index.js              Re-exports public API
  pipeline.js           Orchestrator: parse → generate → render → validate
  dsl/
    index.js            parseUniverse(source)
    tokenizer.js        Tokenize DSL source into token stream
    parser.js           Recursive-descent parser → UniverseAST
  engine/
    tier0.js            Deterministic entity & activity generation
    prose.js            LLM prose generation with cache (uses libllm)
    rng.js              Seeded PRNG wrapper around seedrandom
    names.js            Greek mythology name pool + stable people
    prose-keys.js       Collects all prose keys from entity graph
  render/
    html.js             HTML microdata renderer (uses libformat)
    yaml.js             Framework YAML renderer (uses yaml npm package)
    table.js            Activity data JSON renderer
    markdown.js         Personal knowledge Markdown renderer
  validate.js           Cross-content validation suite
```

### package.json

```json
{
  "name": "@forwardimpact/libuniverse",
  "version": "0.1.0",
  "description": "Synthetic data universe DSL and generation engine",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/forwardimpact/monorepo",
    "directory": "libraries/libuniverse"
  },
  "type": "module",
  "main": "index.js",
  "exports": {
    ".": "./index.js",
    "./dsl": "./dsl/index.js",
    "./engine": "./engine/tier0.js",
    "./prose": "./engine/prose.js",
    "./render/html": "./render/html.js",
    "./render/yaml": "./render/yaml.js",
    "./render/table": "./render/table.js",
    "./render/markdown": "./render/markdown.js",
    "./validate": "./validate.js",
    "./pipeline": "./pipeline.js"
  },
  "dependencies": {
    "@forwardimpact/libconfig": "^0.1.59",
    "@forwardimpact/libformat": "^0.1.1",
    "@forwardimpact/libllm": "^0.1.72",
    "@forwardimpact/libutil": "^0.1.61",
    "seedrandom": "^3.0.5",
    "yaml": "^2.3.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

### Public API (index.js)

```javascript
// libraries/libuniverse/index.js

export { parseUniverse } from './dsl/index.js'
export { generate } from './engine/tier0.js'
export { ProseEngine } from './engine/prose.js'
export { collectProseKeys } from './engine/prose-keys.js'
export { renderHTML, renderREADME, renderONTOLOGY } from './render/html.js'
export { renderYAML } from './render/yaml.js'
export { renderTables } from './render/table.js'
export { renderMarkdown } from './render/markdown.js'
export { validateCrossContent } from './validate.js'
export { runPipeline } from './pipeline.js'
```

### Pipeline Orchestrator

The pipeline is a pure function that takes a parsed config and returns results.
It has no CLI concerns, no argument parsing, no `process.env` reads:

```javascript
// libraries/libuniverse/pipeline.js

import { readFileSync } from 'fs'
import { parseUniverse } from './dsl/index.js'
import { generate } from './engine/tier0.js'
import { ProseEngine } from './engine/prose.js'
import { collectProseKeys } from './engine/prose-keys.js'
import { renderHTML, renderREADME, renderONTOLOGY } from './render/html.js'
import { renderYAML } from './render/yaml.js'
import { renderTables } from './render/table.js'
import { renderMarkdown } from './render/markdown.js'
import { validateCrossContent } from './validate.js'

/**
 * Run the full synthetic data pipeline.
 *
 * @param {object} options
 * @param {string} options.universePath     Path to universe.dsl
 * @param {string} options.dataDir          Path to existing examples/ for YAML copy
 * @param {string} options.mode             "cached" | "generate" | "no-prose"
 * @param {boolean} [options.strict]        Fail on cache miss in cached mode
 * @param {string} [options.only]           Only run specific renderer
 * @param {object} [options.llmApi]         Pre-configured LlmApi instance (from libllm)
 * @param {string} [options.cachePath]      Path to .prose-cache.json
 * @returns {Promise<PipelineResult>}
 */
export async function runPipeline(options) {
  const { universePath, dataDir, mode = 'no-prose', strict = false,
          only = null, llmApi = null, cachePath } = options

  // Step 1: Parse DSL
  const source = readFileSync(universePath, 'utf-8')
  const ast = parseUniverse(source)

  // Step 2: Tier 0 — Deterministic generation
  const entities = generate(ast)

  // Step 3: Prose generation (Tier 1 or Tier 2)
  const proseEngine = new ProseEngine({ cachePath, mode, strict, llmApi })
  if (mode !== 'no-prose') {
    const proseKeys = collectProseKeys(entities)
    for (const [key, context] of proseKeys) {
      await proseEngine.generateProse(key, context)
    }
  }
  const prose = proseEngine.getProseMap()

  // Step 4: Render outputs
  const files = new Map()

  if (!only || only === 'yaml') {
    for (const [name, content] of renderYAML(entities, dataDir)) {
      files.set(`products/map/examples/${name}`, content)
    }
  }
  if (!only || only === 'html') {
    for (const [name, content] of renderHTML(entities, prose)) {
      files.set(`products/guide/examples/knowledge/${name}`, content)
    }
    files.set('products/guide/examples/knowledge/README.md',
      renderREADME(entities, prose))
    files.set('products/guide/examples/knowledge/ONTOLOGY.md',
      renderONTOLOGY(entities))
  }
  if (!only || only === 'activity') {
    // Renders: organization_people.json, github_events.json,
    // github_artifacts.json, getdx_snapshots.json, getdx_teams.json,
    // getdx_snapshot_team_scores.json, evidence.json
    for (const [name, content] of renderTables(entities.activity)) {
      files.set(`products/map/examples/activity/${name}`, content)
    }
  }
  if (!only || only === 'personal') {
    for (const [name, content] of renderMarkdown(entities, prose)) {
      files.set(`products/basecamp/template/knowledge/${name}`, content)
    }
  }

  // Step 5: Cross-content validation
  const validation = validateCrossContent(entities)

  return { ast, entities, prose, files, validation }
}
```

**Key difference from v1:** The pipeline receives a pre-configured `llmApi`
instance — it does not construct one from raw tokens and URLs. Configuration
is the CLI's responsibility. The pipeline is a pure data transformation.

## Tiered Execution

### Tier 0 — Deterministic Engine

Generates all structural data without any LLM calls. Uses `seedrandom` (npm
package) instead of a hand-rolled Mulberry32 PRNG:

```javascript
// libraries/libuniverse/engine/tier0.js

import seedrandom from 'seedrandom'

export function generate(ast) {
  const rng = seedrandom(String(ast.seed))
  const domain = `https://${ast.domain}`

  const orgs = buildOrganizations(ast, domain)
  const teams = buildTeams(ast, domain)
  const people = generatePeople(ast, rng, teams, domain)
  const projects = buildProjects(ast, teams, people, domain)
  const activity = generateActivity(ast, rng, people, teams, ast.scenarios)
  // activity contains: { roster, github, artifacts, teams, snapshots, scores, evidence }

  return { orgs, teams, people, projects, scenarios: ast.scenarios,
           activity, domain }
}
```

The RNG wrapper is a thin module around `seedrandom`:

```javascript
// libraries/libuniverse/engine/rng.js

import seedrandom from 'seedrandom'

/**
 * Create a seeded RNG with convenience methods.
 * @param {number|string} seed
 * @returns {{ random, randomInt, pick, shuffle, weightedPick, gaussian }}
 */
export function createSeededRNG(seed) {
  const rng = seedrandom(String(seed))

  const random = () => rng()
  const randomInt = (min, max) => Math.floor(random() * (max - min + 1)) + min
  const pick = (arr) => arr[Math.floor(random() * arr.length)]
  // ... shuffle, weightedPick, gaussian
  return { random, randomInt, pick, shuffle, weightedPick, gaussian }
}
```

#### Activity Generation Algorithm

The `generateActivity()` function in `tier0.js` produces seven data arrays:

1. **`roster`** — One record per person from `generatePeople()`. Assigns
   `email`, `github_username`, `discipline`, `level`, `track`, `manager_email`.

2. **`teams`** — One `getdx_teams` record per DSL `team` block, plus parent
   `department` and `org` entries. Each team's `manager_email` is resolved from
   the DSL `manager @name` reference. The `raw` field mirrors the GetDX
   `teams.list` API response shape (includes `manager_name` for the bridging
   lookup).

3. **`snapshots`** — One `getdx_snapshots` record per quarter between
   `snapshots.quarterly_from` and `snapshots.quarterly_to`. Each snapshot gets
   `completed_count` derived from `people.count` × response rate (RNG jitter
   around 85%), and `total_count` = `people.count`.

4. **`scores`** — For each snapshot × each team × each driver (from
   `drivers.yaml`), generate one `getdx_snapshot_team_scores` record:
   - **Baseline score**: Seeded PRNG gaussian around 65 (σ=10), clamped 0–100.
   - **Scenario delta**: If a scenario's `dx_drivers` block names this
     `driver_id` for this team and the snapshot falls within `timerange_start`
     to `timerange_end`, apply the `magnitude` delta scaled by the trajectory
     curve (linear ramp for `"rising"`, inverse ramp for `"declining"`,
     bell curve for `"spike"`).
   - **Comparative metrics**: `vs_prev` = score − previous snapshot score (null
     for first snapshot). `vs_org` = score − mean score across all teams for
     same driver/snapshot. `vs_50th/75th/90th` = score − percentile cutoffs
     across all teams.
   - **`snapshot_team`**: Nested JSONB with `{ id, name, team_id, parent,
     parent_id, ancestors }` matching the GetDX `snapshots.info` API shape.

5. **`github`** / **`artifacts`** — GitHub events and normalized artifacts
   generated per person per week, scaled by scenario `github_commits` and
   `github_prs` curves. Each event's `raw` field contains a realistic webhook
   payload matching the GitHub webhook schema for the event type.

6. **`evidence`** — For each artifact belonging to a person in a scenario-
   affected team, generate evidence records for the scenario's
   `evidence_skills`. Each evidence row links to the artifact via `artifact_id`
   and references a skill marker at or above the `evidence_floor` proficiency.

### Tier 1 — LLM-Assisted Prose

Uses `libllm` directly via a pre-configured `LlmApi` instance passed in. Uses
`generateHash` from `libutil` for cache keys. No `process.env` reads, no
dynamic imports:

```javascript
// libraries/libuniverse/engine/prose.js

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { generateHash } from '@forwardimpact/libutil'

const SYSTEM_PROMPT = 'You are a technical writer for a pharmaceutical company. '
  + 'Generate concise, realistic content. Output the text only, no explanations '
  + 'or markdown formatting.'

export class ProseEngine {
  /**
   * @param {object} options
   * @param {string} options.cachePath      Path to .prose-cache.json
   * @param {string} options.mode           "cached" | "generate" | "no-prose"
   * @param {boolean} [options.strict]      Fail on cache miss
   * @param {import('@forwardimpact/libllm').LlmApi} [options.llmApi]
   *        Pre-configured LLM client — required when mode is "generate"
   */
  constructor({ cachePath, mode, strict = false, llmApi = null }) {
    this.cachePath = cachePath
    this.mode = mode
    this.strict = strict
    this.llmApi = llmApi
    this.cache = this.#loadCache()
    this.dirty = false
  }

  async generateProse(key, context) {
    if (this.mode === 'no-prose') return null

    const cacheKey = generateHash(key, JSON.stringify(context))

    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)

    if (this.mode === 'cached') {
      if (this.strict) throw new Error(`Cache miss: '${key}'`)
      return null
    }

    // Tier 1: generate via libllm
    const prose = await this.#callLlm(key, context)
    if (prose) {
      this.cache.set(cacheKey, prose)
      this.dirty = true
    }
    return prose
  }

  async #callLlm(key, context) {
    const prompt = buildPrompt(key, context)
    const response = await this.llmApi.createCompletions({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: context.maxTokens || 500,
    })
    return response.choices?.[0]?.message?.content?.trim() || null
  }

  getProseMap() { return this.cache }

  saveCache() {
    if (!this.dirty) return
    writeFileSync(this.cachePath, JSON.stringify(Object.fromEntries(this.cache), null, 2))
  }

  #loadCache() {
    try {
      if (existsSync(this.cachePath)) {
        return new Map(Object.entries(JSON.parse(readFileSync(this.cachePath, 'utf-8'))))
      }
    } catch { /* cache corrupt or missing */ }
    return new Map()
  }
}

function buildPrompt(key, context) {
  const topic = context.topic || key.replace(/_/g, ' ').replace(/-/g, ' ')
  const tone = context.tone || 'technical'
  const length = context.length || '2-3 paragraphs'
  const parts = [`Write ${length} of ${tone} prose about: ${topic}.`]
  if (context.domain) parts.push(`Company domain: ${context.domain}.`)
  if (context.role) parts.push(`Written from the perspective of: ${context.role}.`)
  if (context.audience) parts.push(`Target audience: ${context.audience}.`)
  parts.push('Output the text only, no explanations.')
  return parts.join('\n')
}
```

### Tier 2 — Cache-Only Mode

Same as v1 — a committed `.prose-cache.json` file keyed by content hash.
The CLI controls which mode is active:

```sh
# First run: generates prose via LLM, populates cache
node scripts/generate/cli.js --generate

# Subsequent runs: fully deterministic from cache
node scripts/generate/cli.js --cached

# CI runs: fail if cache is stale
node scripts/generate/cli.js --cached --strict
```

## Renderers

### HTML Renderer

Uses `createHtmlFormatter()` from `libformat` to sanitize any LLM-generated
markdown embedded in HTML microdata:

```javascript
// libraries/libuniverse/render/html.js

import { createHtmlFormatter } from '@forwardimpact/libformat'

const formatter = createHtmlFormatter()

export function renderHTML(entities, prose) {
  const files = new Map()
  const domain = entities.domain

  files.set('organization-leadership.html', renderLeadership(entities, domain))
  files.set('organization-departments-teams.html', renderDepts(entities, domain))
  files.set('roles.html', renderRoles(entities, domain))

  // Articles — prose content sanitized via formatter.format()
  for (const article of articleTopics) {
    const proseContent = prose.get(`article_${article.slug}`) || ''
    const safeHtml = formatter.format(proseContent)
    files.set(`articles-${article.slug}.html`,
      renderArticle(article, entities, safeHtml, domain))
  }

  // ... blogs, comments, reviews, courses, events, FAQs, HowTos

  return files
}
```

### YAML Renderer

Uses the `yaml` npm package for serialization instead of hand-building YAML
strings. Reads existing validated framework YAML from the data directory and
only generates synthetic content (self-assessments, activity data):

```javascript
// libraries/libuniverse/render/yaml.js

import YAML from 'yaml'
import { readFileSync, readdirSync } from 'fs'

export function renderYAML(entities, existingDataDir) {
  const files = new Map()

  // Copy existing validated framework files as-is
  copyExistingFiles(existingDataDir, files)

  // Generate self-assessments from synthetic people using yaml library
  files.set('self-assessments.yaml', YAML.stringify(buildSelfAssessments(entities)))

  return files
}
```

### Table Renderer

Pure JSON serialization — no library needed:

```javascript
// libraries/libuniverse/render/table.js

export function renderTables(activity) {
  const files = new Map()
  files.set('organization_people.json', JSON.stringify(activity.roster, null, 2))
  files.set('github_events.json', JSON.stringify(activity.github, null, 2))
  files.set('github_artifacts.json', JSON.stringify(activity.artifacts, null, 2))
  files.set('getdx_snapshots.json', JSON.stringify(activity.snapshots, null, 2))
  files.set('getdx_teams.json', JSON.stringify(activity.teams, null, 2))
  files.set('getdx_snapshot_team_scores.json', JSON.stringify(activity.scores, null, 2))
  files.set('evidence.json', JSON.stringify(activity.evidence, null, 2))
  return files
}
```

### Activity Record Schemas

Each activity JSON file must produce records matching the SQL column definitions
in `products/map/activity/migrations/001_activity_schema.sql`. The generated
data lands as local files; the existing ingestion pipeline loads them into
Supabase. Records must be structurally identical to what the ingestion code
produces.

#### organization_people.json

Each record matches the `activity.organization_people` table:

```json
{
  "email": "athena@bionova.example",
  "name": "Athena",
  "github_username": "athena-bio",
  "discipline": "software_engineering",
  "level": "L3",
  "track": "platform",
  "manager_email": "zeus@bionova.example",
  "updated_at": "2025-06-15T00:00:00.000Z"
}
```

- `email` — Primary key. Format: `{greek_name}@{domain}`.
- `discipline`, `level`, `track` — Must be valid framework IDs from
  `products/map/examples/`. Validated by `fit-map validate`.
- `manager_email` — References another `organization_people.email`. Team
  managers reference their department head; department heads reference null.
- `github_username` — Unique. Format: `{greek_name}-bio`. Used to join
  `github_artifacts.github_username` → `organization_people.email`.

#### github_events.json

Each record matches the `activity.github_events` table. The `raw` field must
contain a realistic GitHub webhook payload matching the well-known webhook
schemas for `push`, `pull_request`, and `pull_request_review` events:

```json
{
  "delivery_id": "evt-00000001-0001",
  "event_type": "pull_request",
  "action": "opened",
  "repository": "bionova/oncology-pipelines",
  "sender_github_username": "athena-bio",
  "occurred_at": "2025-06-15T14:30:00.000Z",
  "raw": {
    "action": "opened",
    "number": 42,
    "pull_request": {
      "number": 42,
      "title": "Add cell viability scoring endpoint",
      "state": "open",
      "user": { "login": "athena-bio" },
      "created_at": "2025-06-15T14:30:00.000Z",
      "updated_at": "2025-06-15T14:30:00.000Z",
      "additions": 145,
      "deletions": 23,
      "changed_files": 4,
      "merged": false,
      "base": { "ref": "main" },
      "head": { "ref": "feature/cell-viability" }
    },
    "repository": { "full_name": "bionova/oncology-pipelines" },
    "sender": { "login": "athena-bio" }
  }
}
```

- `delivery_id` — Primary key. Synthetic UUID-like format.
- `event_type` — One of: `push`, `pull_request`, `pull_request_review`.
- `action` — Webhook action: `opened`, `closed`, `submitted`, etc. Null for
  `push` events.
- `raw` — Must include the nested structures that the `extractArtifacts()`
  ingestion function reads: `payload.pull_request`, `payload.review`,
  `payload.commits`, `payload.repository.full_name`, `payload.sender.login`.

#### github_artifacts.json

Each record matches the `activity.github_artifacts` table. Artifacts are the
normalized output of `extractArtifacts()` from `github.js`:

```json
{
  "artifact_id": "a0000001-0001-0001-0001-000000000001",
  "artifact_type": "pull_request",
  "external_id": "pr:bionova/oncology-pipelines#42",
  "repository": "bionova/oncology-pipelines",
  "github_username": "athena-bio",
  "email": "athena@bionova.example",
  "occurred_at": "2025-06-15T14:30:00.000Z",
  "metadata": {
    "number": 42,
    "title": "Add cell viability scoring endpoint",
    "state": "open",
    "additions": 145,
    "deletions": 23,
    "changed_files": 4,
    "merged": false,
    "base_branch": "main",
    "head_branch": "feature/cell-viability"
  },
  "raw": null
}
```

Three `artifact_type` values with specific `external_id` formats and `metadata`
shapes:

| Type             | `external_id` format                        | `metadata` fields                                                                     |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pull_request`   | `pr:{repo}#{number}`                        | `number`, `title`, `state`, `additions`, `deletions`, `changed_files`, `merged`, `base_branch`, `head_branch` |
| `review`         | `review:{repo}#{pr_number}:{review_id}`     | `pr_number`, `state` (approved/changes_requested/commented), `body_length`            |
| `commit`         | `commit:{repo}:{sha}`                       | `sha`, `message`, `added` (count), `removed` (count), `modified` (count)             |

- `email` — Resolved from `github_username` via `organization_people`. Every
  artifact must link to a valid person.
- `raw` — Can be null in synthetic data (the normalized `metadata` is what
  consumers read).

#### getdx_snapshots.json

Each record matches the `activity.getdx_snapshots` table. Fields mirror the
GetDX `snapshots.list` API response:

```json
{
  "snapshot_id": "snap_2025_Q1",
  "account_id": "acct_bionova_001",
  "scheduled_for": "2025-01-15",
  "completed_at": "2025-02-01T00:00:00.000Z",
  "completed_count": 180,
  "total_count": 211,
  "last_result_change_at": "2025-02-01T12:00:00.000Z",
  "raw": {
    "id": "snap_2025_Q1",
    "account_id": "acct_bionova_001",
    "scheduled_for": "2025-01-15",
    "completed_at": "2025-02-01T00:00:00.000Z",
    "completed_count": 180,
    "total_count": 211,
    "last_result_change_at": "2025-02-01T12:00:00.000Z",
    "deleted_at": null
  }
}
```

- `raw` — The full GetDX API response object (includes `deleted_at` which the
  ingestion code uses for filtering but does not store as a column).
- One record per quarterly snapshot cycle defined in the DSL `snapshots` block.

#### getdx_teams.json

Each record matches the `activity.getdx_teams` table. Fields mirror the GetDX
`teams.list` API response, bridged to the org model via `manager_email`:

```json
{
  "getdx_team_id": "gdx_team_drug_discovery",
  "name": "Drug Discovery Team",
  "parent_id": "gdx_team_rd",
  "manager_id": "gdx_mgr_thoth",
  "reference_id": null,
  "manager_email": "thoth@bionova.example",
  "ancestors": ["gdx_team_rd", "gdx_team_headquarters"],
  "contributors": 12,
  "last_changed_at": "2025-06-01T00:00:00.000Z",
  "raw": {
    "id": "gdx_team_drug_discovery",
    "name": "Drug Discovery Team",
    "parent_id": "gdx_team_rd",
    "manager_id": "gdx_mgr_thoth",
    "manager_name": "Thoth",
    "reference_id": null,
    "ancestors": ["gdx_team_rd", "gdx_team_headquarters"],
    "contributors": 12,
    "last_changed_at": "2025-06-01T00:00:00.000Z"
  }
}
```

- One record per DSL `team` block, plus parent department/org entries.
- `manager_email` — Resolved from the DSL `manager @name` via
  `organization_people.email`. Mirrors the ingestion code's
  `manager_name → email` lookup.
- `raw` — The GetDX `teams.list` API response object (includes `manager_name`
  which the ingestion code uses for the email lookup).

#### getdx_snapshot_team_scores.json

Each record matches the `activity.getdx_snapshot_team_scores` table. Fields
mirror the GetDX `snapshots.info` API `team_scores` array entries:

```json
{
  "snapshot_id": "snap_2025_Q1",
  "getdx_team_id": "gdx_team_drug_discovery",
  "item_id": "clear_direction",
  "item_type": "driver",
  "item_name": "Clear Direction",
  "response_count": 10,
  "contributor_count": 12,
  "score": 72.5,
  "vs_prev": 3.2,
  "vs_org": 1.8,
  "vs_50th": 5.1,
  "vs_75th": -2.3,
  "vs_90th": -8.7,
  "snapshot_team": {
    "id": "snapteam_2025Q1_drug_discovery",
    "name": "Drug Discovery Team",
    "team_id": "gdx_team_drug_discovery",
    "parent": false,
    "parent_id": "gdx_team_rd",
    "ancestors": ["gdx_team_rd", "gdx_team_headquarters"]
  },
  "raw": {
    "snapshot_team": {
      "id": "snapteam_2025Q1_drug_discovery",
      "name": "Drug Discovery Team",
      "team_id": "gdx_team_drug_discovery",
      "parent": false,
      "parent_id": "gdx_team_rd",
      "ancestors": ["gdx_team_rd", "gdx_team_headquarters"]
    },
    "item_id": "clear_direction",
    "item_type": "driver",
    "item_name": "Clear Direction",
    "response_count": 10,
    "score": 72.5,
    "contributor_count": 12,
    "vs_prev": 3.2,
    "vs_org": 1.8,
    "vs_50th": 5.1,
    "vs_75th": -2.3,
    "vs_90th": -8.7
  }
}
```

- `item_id` — Must match a `driver.id` from `products/map/examples/drivers.yaml`
  (the shared ID namespace between GetDX and the framework).
- `item_type` — Always `"driver"` for framework-aligned items.
- `snapshot_team` — Nested JSONB matching the GetDX `snapshots.info` API
  response structure: `{ id, name, team_id, parent, parent_id, ancestors }`.
- `raw` — The complete GetDX `team_scores` entry as returned by the API.
- Scores are generated per team × per driver × per snapshot. Scenario
  `dx_drivers` blocks apply trajectory deltas to baseline scores for affected
  teams during active time ranges.
- Comparative metrics (`vs_prev`, `vs_org`, `vs_50th`, `vs_75th`, `vs_90th`)
  are computed from the generated score distributions across teams and
  snapshots.

#### evidence.json

Each record matches the `activity.evidence` table:

```json
{
  "evidence_id": "e0000001-0001-0001-0001-000000000001",
  "artifact_id": "a0000001-0001-0001-0001-000000000001",
  "skill_id": "data_integration",
  "level_id": "working",
  "marker_text": "Authored a design doc accepted without requiring senior rewrite",
  "matched": true,
  "rationale": null
}
```

- `artifact_id` — **Foreign key** referencing a valid `github_artifacts`
  record. Every evidence row must link to an artifact produced by the same
  person.
- `skill_id` — Must match a skill ID from capability YAML files.
- `level_id` — One of the framework proficiency levels (`awareness`,
  `foundational`, `working`, `practitioner`, `expert`). Must meet or exceed the
  scenario-defined `evidence_floor`.
- `marker_text` — A marker string from the corresponding capability YAML's
  `markers` section. If markers are not yet defined for the skill, use a
  placeholder that describes observable behaviour.
- `matched` — Whether the artifact demonstrates the marker. Synthetic data
  should generate a realistic mix (~70% matched, ~30% unmatched).
- `rationale` — LLM-generated (Tier 1) explanation of why the marker was or
  was not matched. Null in no-prose mode.

### Markdown Renderer

Generates personal knowledge base files for Basecamp personas:

```javascript
// libraries/libuniverse/render/markdown.js

export function renderMarkdown(entities, prose) {
  const files = new Map()
  const personas = selectPersonas(entities)

  for (const persona of personas) {
    const dir = `persona-${persona.name.toLowerCase()}`
    for (const briefing of persona.briefings) {
      files.set(`${dir}/Briefings/${briefing.date}.md`,
        renderBriefing(briefing, persona, prose))
    }
    for (const note of persona.notes) {
      files.set(`${dir}/${note.category}/${note.title}.md`,
        renderNote(note, persona, prose))
    }
  }

  return files
}
```

## Cross-Content Validation

A pure function over the entity graph. It does **not** shell out to
`npx fit-map validate` — that is a separate step the CLI can run after writing
files.

```javascript
// libraries/libuniverse/validate.js

export function validateCrossContent(entities) {
  const checks = [
    // Organization integrity
    checkPeopleCoverage(entities),         // Every person in org HTML exists in roster
    checkFrameworkValidity(entities),       // Every discipline/level/track is valid
    checkRosterCompleteness(entities),      // Roster has required fields (email, name, etc.)
    checkTeamAssignments(entities),         // Every person belongs to a valid team
    checkManagerReferences(entities),       // Every manager_email references a valid person
    checkGithubUsernames(entities),         // Every github_username is unique and non-null

    // GitHub artifact integrity
    checkArtifactExternalIds(entities),     // external_id format matches artifact_type
    checkArtifactEmailResolution(entities), // Every artifact.email exists in roster
    checkArtifactRepoValidity(entities),    // Every artifact.repository is a known team repo
    checkEventArtifactConsistency(entities),// Every artifact traces to a github_event

    // GetDX integrity
    checkGetDXTeamsCoverage(entities),      // Every DSL team has a getdx_teams record
    checkGetDXTeamManagerEmails(entities),  // Every getdx_teams.manager_email is in roster
    checkSnapshotScoreDriverIds(entities),  // Every score.item_id is a valid driver from drivers.yaml
    checkSnapshotTeamReferences(entities),  // Every score.getdx_team_id references a getdx_teams record
    checkSnapshotTeamNesting(entities),     // Every score.snapshot_team has required fields
    checkScoreTrajectories(entities),       // Scenario dx_drivers trajectories correlate (r > 0.6)

    // Evidence integrity
    checkEvidenceArtifactLinks(entities),   // Every evidence.artifact_id references a valid artifact
    checkEvidenceProficiency(entities),     // Evidence levels meet scenario evidence_floor
    checkEvidenceSkillIds(entities),        // Every evidence.skill_id is a valid framework skill
  ]

  const failures = checks.filter(c => !c.passed)
  return { passed: failures.length === 0, total: checks.length,
           failures: failures.length, checks }
}
```

## Output File Mapping

| Generated Content              | File                                         | Target Location                              |
| ------------------------------ | -------------------------------------------- | -------------------------------------------- |
| ONTOLOGY.md                    | `ONTOLOGY.md`                                | `products/guide/examples/knowledge/`         |
| README.md                      | `README.md`                                  | `products/guide/examples/knowledge/`         |
| HTML microdata files           | `*.html`                                     | `products/guide/examples/knowledge/`         |
| Framework YAML                 | `*.yaml`                                     | `products/map/examples/`                     |
| Organization people            | `organization_people.json`                   | `products/map/examples/activity/`            |
| GitHub events                  | `github_events.json`                         | `products/map/examples/activity/`            |
| GitHub artifacts               | `github_artifacts.json`                      | `products/map/examples/activity/`            |
| GetDX snapshots                | `getdx_snapshots.json`                       | `products/map/examples/activity/`            |
| GetDX teams                    | `getdx_teams.json`                           | `products/map/examples/activity/`            |
| GetDX snapshot team scores     | `getdx_snapshot_team_scores.json`            | `products/map/examples/activity/`            |
| Evidence records               | `evidence.json`                              | `products/map/examples/activity/`            |
| Personal knowledge base        | `*.md`                                       | `products/basecamp/template/knowledge/`      |

## CLI — Thin Wrapper

The CLI lives in `scripts/generate/cli.js` and does exactly three things:

1. Parse CLI arguments (6 flags)
2. Build configuration (LLM client via `libconfig` + `libllm`)
3. Call `runPipeline()` from `libuniverse` and write output files

```javascript
// scripts/generate/cli.js

import { resolve, join, dirname } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { createScriptConfig } from '@forwardimpact/libconfig'
import { createLlmApi } from '@forwardimpact/libllm'
import { runPipeline } from '@forwardimpact/libuniverse/pipeline'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const args = parseArgs(process.argv.slice(2))

  // Config from environment via libconfig
  const config = await createScriptConfig('generate', {
    LLM_TOKEN: null,
    LLM_MODEL: 'openai/gpt-4.1-mini',
    LLM_BASE_URL: null,
  })

  // Determine prose mode from CLI flags
  const mode = args.cached ? 'cached'
    : args.generate ? 'generate'
    : 'no-prose'

  // Build LLM client only when needed
  let llmApi = null
  if (mode === 'generate') {
    llmApi = createLlmApi(config.LLM_TOKEN, config.LLM_MODEL, config.LLM_BASE_URL)
  }

  const monorepoRoot = resolve(__dirname, '../..')
  const result = await runPipeline({
    universePath: args.universe || join(__dirname, 'universe.dsl'),
    dataDir: join(monorepoRoot, 'products/map/examples'),
    mode,
    strict: !!args.strict,
    only: args.only || null,
    llmApi,
    cachePath: join(__dirname, '.prose-cache.json'),
  })

  // Write files (or dry-run)
  if (args.dryRun) {
    for (const [path] of result.files) console.log(`  ${path}`)
    console.log(`\n  ${result.files.size} files (dry run)`)
  } else {
    for (const [relPath, content] of result.files) {
      const fullPath = join(monorepoRoot, relPath)
      await mkdir(dirname(fullPath), { recursive: true })
      await writeFile(fullPath, content)
    }
    console.log(`${result.files.size} files written`)
  }

  // Report validation
  for (const check of result.validation.checks) {
    const icon = check.passed ? '✓' : '✗'
    console.log(`  ${icon} ${check.name}`)
  }
}

function parseArgs(argv) {
  const args = {}
  for (const arg of argv) {
    if (arg === '--cached') args.cached = true
    else if (arg === '--generate') args.generate = true
    else if (arg === '--strict') args.strict = true
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg.startsWith('--only=')) args.only = arg.slice(7)
    else if (arg.startsWith('--universe=')) args.universe = arg.slice(11)
  }
  return args
}

main().catch(err => { console.error(err.message); process.exit(1) })
```

### CLI Flags (6 total — down from 12+)

```sh
# Default: structural generation only (no prose)
node scripts/generate/cli.js

# Use cached prose
node scripts/generate/cli.js --cached

# Generate prose via LLM (reads LLM_TOKEN, LLM_MODEL, LLM_BASE_URL from env)
node scripts/generate/cli.js --generate

# Strict: fail on cache miss
node scripts/generate/cli.js --cached --strict

# Render only one content type
node scripts/generate/cli.js --only=yaml

# Dry run: show what would be written
node scripts/generate/cli.js --dry-run

# Custom universe file
node scripts/generate/cli.js --universe=path/to/custom.dsl
```

**LLM configuration is entirely via environment variables** (handled by
`libconfig`): `LLM_TOKEN`, `LLM_MODEL`, `LLM_BASE_URL`. No `--token`,
`--model`, or `--base-url` flags. This follows the same pattern as every
other service in the monorepo.

### npm script (root package.json)

```json
{
  "scripts": {
    "generate": "node scripts/generate/cli.js"
  }
}
```

Usage: `npm run generate`, `npm run generate -- --cached`, etc.

## Dependencies

### libuniverse (library)

```json
{
  "@forwardimpact/libconfig": "^0.1.59",
  "@forwardimpact/libformat": "^0.1.1",
  "@forwardimpact/libllm": "^0.1.72",
  "@forwardimpact/libutil": "^0.1.61",
  "seedrandom": "^3.0.5",
  "yaml": "^2.3.0"
}
```

### scripts/generate (CLI wrapper)

No additional dependencies — uses `libuniverse`, `libconfig`, and `libllm`
from the workspace.

## Implementation Phases

### Phase A — libuniverse Package Setup

- Create `libraries/libuniverse/` with `package.json`, `index.js`
- Add to root `package.json` workspaces
- Wire up npm workspace dependencies
- Import and re-use DSL code from v1 (tokenizer, parser)

### Phase B — DSL & Engine (in libuniverse)

- Move DSL tokenizer and parser into `libuniverse/dsl/`
- Move Tier 0 engine into `libuniverse/engine/tier0.js`
- Replace hand-rolled Mulberry32 PRNG with `seedrandom`
- Move name pool into `libuniverse/engine/names.js`
- Move prose key registry into `libuniverse/engine/prose-keys.js`
- Write `universe.dsl` in `scripts/generate/`

### Phase C — Prose Engine (in libuniverse)

- Implement `ProseEngine` in `libuniverse/engine/prose.js`
- Use `libllm.createLlmApi()` via injected instance (no dynamic import)
- Use `libutil.generateHash()` for cache keys
- Cache read/write from a file path passed in by the caller

### Phase D — Renderers (in libuniverse)

- HTML renderer using `libformat.createHtmlFormatter()` for sanitization
- YAML renderer using `yaml` package for serialization
- Table renderer (JSON.stringify)
- Markdown renderer for Basecamp content
- All renderers return `Map<string, string>` (relative path → content)

### Phase E — Validation & Pipeline (in libuniverse)

- Cross-content validation (pure function, no subprocess calls)
- Pipeline orchestrator `runPipeline()` wiring parse → generate → render →
  validate
- Unit tests for DSL parser, entity generation, validation

### Phase F — CLI Wrapper & Integration

- Write `scripts/generate/cli.js` — thin wrapper around `runPipeline()`
- Use `libconfig.createScriptConfig()` for environment-based configuration
- Add `npm run generate` script to root `package.json`
- `fit-map` CLI unchanged — no new commands or flags
- Remove old hand-crafted content in the same commit as adding generated content

## Strengths

- **Best of both worlds**: Deterministic structure + LLM prose quality
- **Cache makes it deterministic**: After first LLM run, all subsequent runs
  are fully reproducible from cache
- **CI-friendly**: Cached mode runs in seconds, fails fast on stale cache
- **DSL is self-documenting**: The universe file is a readable specification
  of the entire synthetic data universe
- **LLM-agnostic**: Tier 1 works with any LLM backend via libllm
- **Minimal LLM usage**: Only ~15% of output requires LLM generation
- **Pure Node.js**: No Python dependency (unlike Plans 02, 03)
- **Composable**: New entities/scenarios extend the DSL file, not code
- **Library-first**: Uses existing monorepo libraries for every cross-cutting
  concern — no duplicated logic
- **Simple CLI**: 6 flags (down from 12+), no LLM tokens on the command line,
  configuration via environment variables
- **Testable**: `libuniverse` is a pure library with no CLI or environment
  coupling — every module can be unit tested in isolation
- **Clean separation**: Library (logic) vs CLI (I/O) boundary is explicit

## Weaknesses

- **Custom DSL maintenance**: The DSL parser is bespoke code that must be
  maintained; changes to the data model require DSL grammar updates
- **Two-run workflow**: First run requires LLM access; only subsequent runs
  are fully offline — new content additions always need an LLM run
- **Cache staleness**: If the DSL changes, cache keys change, requiring
  regeneration of affected prose
- **DSL learning curve**: Contributors must learn the DSL syntax to modify
  the universe definition
- **Parser complexity**: A recursive-descent parser, while simple, is still
  ~500 lines of code to maintain
