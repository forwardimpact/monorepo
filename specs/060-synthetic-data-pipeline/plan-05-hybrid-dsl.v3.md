# Plan 05 — Hybrid DSL with Tiered Generation (v3)

> A custom domain-specific language (DSL) defines the data universe
> declaratively; a tiered execution engine uses deterministic generators for
> structure and LLM calls only where natural language is required, with the
> option to run fully offline using cached LLM output.

## Revision Notes

This is v3 of the plan, revised after v2 to address two architectural gaps:

1. **CLI location.** v2 placed the CLI in `scripts/generate/cli.js` — a thin
   wrapper outside the library. This broke the monorepo convention where every
   product and library with a CLI ships it as a `bin/` entry in its own package.
   Scripts in `scripts/` are ad-hoc and invisible to `npx`. v3 moves the CLI
   into `libuniverse` itself as `bin/fit-universe.js`, registered in
   `package.json` so it is available as `npx fit-universe`.

2. **Output format mismatch.** v2 generated fully-transformed database rows as
   bulk JSON arrays (e.g., `examples/activity/github_events.json` at ~6 MB). The
   ingestion gap analysis on the implementation branch revealed that this data
   could not be directly loaded by the existing ingestion pipeline and
   duplicated transform logic. v3 aligns with the ELT pattern (spec 051):
   synthetic data is generated as **raw documents** — the same format that the
   Extract step produces — and loaded directly into Supabase Storage. The
   Transform step processes synthetic data identically to real data.

### Design Principles (unchanged from v2 + additions)

- **Use the libraries.** Every cross-cutting concern maps to an existing
  library. The plan specifies which library handles which concern.
- **libuniverse owns the CLI.** All DSL parsing, entity generation, prose
  generation, rendering, validation, and the CLI live in
  `libraries/libuniverse/`. No `scripts/generate/` directory.
- **No dynamic imports.** All dependencies are static ESM imports.
- **Config via libconfig.** LLM tokens, model names, base URLs, and pipeline
  settings come from `createScriptConfig()` and environment variables — not CLI
  flags.
- **fit-map stays simple.** The `fit-map` CLI gains zero new commands or flags.
- **Generate raw documents, not DB rows.** The pipeline produces the same
  document formats as the ELT Extract step (spec 051). Synthetic data enters the
  pipeline at the Load boundary, not at the Transform output.

## Approach

Define a DSL that captures the full data universe — entities, relationships,
scenarios, signal parameters — in a single composable specification. A tiered
execution engine processes this specification:

- **Tier 0 (deterministic):** Entity graphs, relationships, activity data,
  signal curves — pure functions, seeded PRNG, no LLM
- **Tier 1 (LLM-assisted):** Prose fields (descriptions, evidence, articles) —
  generated via `libllm` (any OpenAI-compatible endpoint) or cached
- **Tier 2 (cached):** Previously generated Tier 1 output stored in a cache
  file, enabling fully offline/deterministic runs after initial generation

The key insight: separate what _must_ be natural language from what can be
computed. Only ~15% of output tokens require LLM generation; the rest is
structural.

## Architecture

```
universe.dsl ──► libuniverse
                    │
                    ├── bin/            CLI: fit-universe
                    │
                    ├── dsl/            DSL Parser (tokenizer + recursive-descent)
                    │
                    ├── engine/         Tiered Execution
                    │    ├── tier0.js        Deterministic entity & activity generation
                    │    ├── prose.js        LLM prose via libllm + cache
                    │    ├── rng.js          Seeded PRNG (seedrandom)
                    │    └── names.js        Greek mythology name pool
                    │
                    ├── render/         Output Renderers
                    │    ├── html.js         HTML microdata (uses libformat)
                    │    ├── yaml.js         Framework YAML (uses yaml package)
                    │    ├── raw.js          Raw documents for ELT pipeline
                    │    └── markdown.js     Personal knowledge Markdown
                    │
                    ├── load.js         Supabase Storage loader
                    └── validate.js     Cross-content validation
```

### Library Dependency Map

Every cross-cutting concern maps to an existing library:

| Concern                | Library               | API                                        |
| ---------------------- | --------------------- | ------------------------------------------ |
| Configuration          | libconfig             | `createScriptConfig('universe', defaults)` |
| LLM completions        | libllm                | `createLlmApi()` → `createCompletions()`   |
| Token budgeting        | libutil               | `countTokens()`, `createTokenizer()`       |
| Deterministic hashing  | libutil               | `generateHash()`                           |
| HTML sanitization      | libformat             | `createHtmlFormatter()`                    |
| Project root discovery | libutil               | `Finder`                                   |
| YAML serialization     | yaml (npm)            | `YAML.stringify()`                         |
| Seeded PRNG            | seedrandom            | `seedrandom()`                             |
| Supabase client        | @supabase/supabase-js | `createClient()`                           |

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

  snapshots {
    quarterly_from 2024-07
    quarterly_to 2026-01
    account_id "acct_bionova_001"
  }

  scenario oncora_push {
    name "Oncora Drug Discovery Push"
    timerange_start 2025-03
    timerange_end 2025-09

    affect drug_discovery {
      github_commits "spike"
      github_prs "elevated"
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

The DSL parser is a simple recursive-descent parser that produces an AST. It
lives in `libraries/libuniverse/dsl/`:

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

The tokenizer and parser are the same recursive-descent approach as v1. AST node
types:

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
  load.js               Write raw documents to Supabase Storage
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
    raw.js              Raw document renderer for ELT pipeline
    markdown.js         Personal knowledge Markdown renderer
  bin/
    fit-universe.js     CLI entry point
  data/
    universe.dsl        BioNova universe definition
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
  "bin": {
    "fit-universe": "./bin/fit-universe.js"
  },
  "exports": {
    ".": "./index.js",
    "./dsl": "./dsl/index.js",
    "./engine": "./engine/tier0.js",
    "./prose": "./engine/prose.js",
    "./render/html": "./render/html.js",
    "./render/yaml": "./render/yaml.js",
    "./render/raw": "./render/raw.js",
    "./render/markdown": "./render/markdown.js",
    "./validate": "./validate.js",
    "./pipeline": "./pipeline.js",
    "./load": "./load.js"
  },
  "dependencies": {
    "@forwardimpact/libconfig": "^0.1.59",
    "@forwardimpact/libformat": "^0.1.1",
    "@forwardimpact/libllm": "^0.1.72",
    "@forwardimpact/libutil": "^0.1.61",
    "@supabase/supabase-js": "^2.0.0",
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
export { renderRawDocuments } from './render/raw.js'
export { renderMarkdown } from './render/markdown.js'
export { loadToSupabase } from './load.js'
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
import { renderRawDocuments } from './render/raw.js'
import { renderMarkdown } from './render/markdown.js'
import { validateCrossContent } from './validate.js'

/**
 * Run the full synthetic data pipeline.
 *
 * @param {object} options
 * @param {string} options.universePath     Path to universe.dsl
 * @param {string} options.dataDir          Path to examples/framework/ for YAML copy
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
  const rawDocuments = new Map()

  if (!only || only === 'yaml') {
    for (const [name, content] of renderYAML(entities, dataDir)) {
      files.set(`examples/framework/${name}`, content)
    }
  }
  if (!only || only === 'html') {
    for (const [name, content] of renderHTML(entities, prose)) {
      files.set(`examples/organizational/${name}`, content)
    }
    files.set('examples/organizational/README.md',
      renderREADME(entities, prose))
    files.set('examples/organizational/ONTOLOGY.md',
      renderONTOLOGY(entities))
  }
  if (!only || only === 'activity') {
    // Render raw documents for ELT pipeline (individual files per source)
    for (const [path, content] of renderRawDocuments(entities)) {
      rawDocuments.set(path, content)
    }
  }
  if (!only || only === 'personal') {
    for (const [name, content] of renderMarkdown(entities, prose)) {
      files.set(`examples/personal/${name}`, content)
    }
  }

  // Step 5: Cross-content validation
  const validation = validateCrossContent(entities)

  return { ast, entities, prose, files, rawDocuments, validation }
}
```

**Key differences from v2:**

- The pipeline returns `rawDocuments` (a `Map<string, string>` of storage paths
  → JSON content) separately from `files` (filesystem paths → content).
- Activity data is rendered as raw documents matching the Extract step format,
  not as bulk JSON arrays of database rows.
- The CLI decides whether to write raw documents to local files or load them
  directly into Supabase Storage.

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

The `generateActivity()` function in `tier0.js` produces the same entity data
structures as v2, but the data is rendered into raw documents by the renderer
(not into bulk database-row arrays).

The function produces:

1. **`roster`** — One record per person from `generatePeople()`. Assigns
   `email`, `github_username`, `discipline`, `level`, `track`, `manager_email`.

2. **`teams`** — Team metadata per DSL `team` block, plus parent department and
   org entries. Used to generate the `teams.list` API response document.

3. **`snapshots`** — Snapshot metadata per quarter between
   `snapshots.quarterly_from` and `snapshots.quarterly_to`. Used to generate the
   `snapshots.list` API response document.

4. **`scores`** — Per snapshot × team × driver score records. Used to generate
   `snapshots.info` API response documents (one per snapshot).

5. **`webhooks`** — Individual GitHub webhook payloads generated per person per
   week, scaled by scenario `github_commits` and `github_prs` curves. Each
   webhook is a self-contained JSON document matching the GitHub webhook schema
   for its event type.

6. **`evidence`** — For each artifact belonging to a person in a scenario-
   affected team, generate evidence records for the scenario's
   `evidence_skills`. Evidence is included in the entity model for cross-content
   validation, but is generated as database rows (not raw documents) since
   evidence has no external source system — it is written by Guide at runtime.
   The synthetic pipeline loads evidence directly.

### Tier 1 — LLM-Assisted Prose

Uses `libllm` directly via a pre-configured `LlmApi` instance passed in. Uses
`generateHash` from `libutil` for cache keys. No `process.env` reads, no dynamic
imports:

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

Same as v2 — a committed `.prose-cache.json` file keyed by content hash. The CLI
controls which mode is active:

```sh
# First run: generates prose via LLM, populates cache
npx fit-universe --generate

# Subsequent runs: fully deterministic from cache
npx fit-universe --cached

# CI runs: fail if cache is stale
npx fit-universe --cached --strict
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

Uses the `yaml` npm package for serialization. Copies existing validated
framework YAML and generates any synthetic framework content:

```javascript
// libraries/libuniverse/render/yaml.js

import YAML from 'yaml'
import { readFileSync, readdirSync } from 'fs'

export function renderYAML(entities, existingDataDir) {
  const files = new Map()
  copyExistingFiles(existingDataDir, files)
  files.set('self-assessments.yaml', YAML.stringify(buildSelfAssessments(entities)))
  return files
}
```

### Raw Document Renderer (new in v3)

**Replaces v2's `table.js`** (which produced bulk JSON arrays of DB rows). The
raw document renderer produces individual JSON documents matching the format
that the ELT Extract step (spec 051) writes to Supabase Storage.

The output is a `Map<string, string>` where keys are Supabase Storage paths
(within the `raw` bucket) and values are JSON document strings.

```javascript
// libraries/libuniverse/render/raw.js

/**
 * Render synthetic activity data as raw documents matching the ELT Extract
 * step output format. Each document is the exact shape that the Map ELT
 * Transform step expects to read from Supabase Storage.
 *
 * @param {object} entities - Generated entity graph from tier0
 * @returns {Map<string, string>} Storage path → JSON content
 */
export function renderRawDocuments(entities) {
  const docs = new Map()

  // GitHub webhooks: one document per event
  renderGitHubWebhooks(entities.activity.webhooks, docs)

  // GetDX teams.list: one API response document
  renderGetDXTeamsList(entities, docs)

  // GetDX snapshots.list: one API response document
  renderGetDXSnapshotsList(entities, docs)

  // GetDX snapshots.info: one API response document per snapshot
  renderGetDXSnapshotsInfo(entities, docs)

  // Organization people: one YAML document
  renderPeopleFile(entities, docs)

  return docs
}
```

#### GitHub webhook documents

Each webhook is a self-contained JSON document stored at
`raw/github/{delivery_id}.json`, matching the format the Extract step produces:

```javascript
function renderGitHubWebhooks(webhooks, docs) {
  for (const webhook of webhooks) {
    const path = `github/${webhook.delivery_id}.json`
    docs.set(path, JSON.stringify({
      delivery_id: webhook.delivery_id,
      event_type: webhook.event_type,
      received_at: webhook.occurred_at,
      payload: webhook.payload
    }, null, 2))
  }
}
```

The `payload` field contains a realistic GitHub webhook body matching the
well-known schemas:

**`push` event payload:**

```json
{
  "ref": "refs/heads/main",
  "commits": [
    {
      "id": "abc123def456...",
      "message": "Add cell viability scoring endpoint",
      "timestamp": "2025-06-15T14:30:00.000Z",
      "added": ["src/scoring.js"],
      "removed": [],
      "modified": ["src/index.js"]
    }
  ],
  "repository": { "full_name": "bionova/oncology-pipelines" },
  "sender": { "login": "athena-bio" }
}
```

**`pull_request` event payload:**

```json
{
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
```

**`pull_request_review` event payload:**

```json
{
  "action": "submitted",
  "review": {
    "id": 12345,
    "user": { "login": "zeus-bio" },
    "state": "approved",
    "body": "LGTM, nice work on the scoring logic.",
    "submitted_at": "2025-06-15T16:00:00.000Z"
  },
  "pull_request": { "number": 42 },
  "repository": { "full_name": "bionova/oncology-pipelines" },
  "sender": { "login": "zeus-bio" }
}
```

#### GetDX `teams.list` response document

One document stored at `raw/getdx/teams-list/{timestamp}.json`, matching the
exact GetDX API response format:

```javascript
function renderGetDXTeamsList(entities, docs) {
  const timestamp = new Date().toISOString()
  const teams = entities.activity.teams.map(team => ({
    id: team.getdx_team_id,
    parent_id: team.parent_id || null,
    manager_id: team.manager_id || null,
    name: team.name,
    parent: team.is_parent || false,
    last_changed_at: team.last_changed_at || null,
    contributors: team.contributors ?? 0,
    reference_id: team.reference_id || null,
    ancestors: team.ancestors || []
  }))

  const path = `getdx/teams-list/${timestamp}.json`
  docs.set(path, JSON.stringify({ ok: true, teams }, null, 2))
}
```

Matches the `GET https://api.getdx.com/teams.list` response:

```json
{
  "ok": true,
  "teams": [
    {
      "id": "NTA4Nzc",
      "parent_id": "NTA2MTk",
      "manager_id": "NTEyMDUw",
      "name": "Drug Discovery Team",
      "parent": false,
      "last_changed_at": "2025-06-01T00:00:00.000Z",
      "contributors": 12,
      "reference_id": null,
      "ancestors": ["LTE", "gdx_team_rd", "gdx_team_headquarters"]
    }
  ]
}
```

#### GetDX `snapshots.list` response document

One document stored at `raw/getdx/snapshots-list/{timestamp}.json`:

```javascript
function renderGetDXSnapshotsList(entities, docs) {
  const timestamp = new Date().toISOString()
  const snapshots = entities.activity.snapshots.map(snap => ({
    id: snap.snapshot_id,
    account_id: snap.account_id,
    last_result_change_at: snap.last_result_change_at,
    scheduled_for: snap.scheduled_for,
    completed_at: snap.completed_at,
    completed_count: snap.completed_count,
    deleted_at: null,
    total_count: snap.total_count
  }))

  const path = `getdx/snapshots-list/${timestamp}.json`
  docs.set(path, JSON.stringify({ ok: true, snapshots }, null, 2))
}
```

Matches the `GET https://api.getdx.com/snapshots.list` response:

```json
{
  "ok": true,
  "snapshots": [
    {
      "id": "snap_2025_Q1",
      "account_id": "acct_bionova_001",
      "last_result_change_at": "2025-02-01T12:00:00.000Z",
      "scheduled_for": "2025-01-15",
      "completed_at": "2025-02-01T00:00:00.000Z",
      "completed_count": 180,
      "deleted_at": null,
      "total_count": 211
    }
  ]
}
```

#### GetDX `snapshots.info` response documents

One document per snapshot stored at
`raw/getdx/snapshots-info/{snapshot_id}.json`:

```javascript
function renderGetDXSnapshotsInfo(entities, docs) {
  // Group scores by snapshot_id
  const scoresBySnapshot = new Map()
  for (const score of entities.activity.scores) {
    const key = score.snapshot_id
    if (!scoresBySnapshot.has(key)) scoresBySnapshot.set(key, [])
    scoresBySnapshot.get(key).push(score)
  }

  for (const [snapshotId, scores] of scoresBySnapshot) {
    const teamScores = scores.map(score => ({
      snapshot_team: {
        id: score.snapshot_team_id,
        name: score.team_name,
        team_id: score.getdx_team_id,
        parent: score.is_parent || false,
        parent_id: score.parent_id || null,
        ancestors: score.ancestors || []
      },
      item_id: score.item_id,
      item_type: score.item_type || 'driver',
      item_name: score.item_name,
      response_count: score.response_count,
      score: score.score,
      contributor_count: score.contributor_count,
      vs_prev: score.vs_prev,
      vs_org: score.vs_org,
      vs_50th: score.vs_50th,
      vs_75th: score.vs_75th,
      vs_90th: score.vs_90th
    }))

    const path = `getdx/snapshots-info/${snapshotId}.json`
    docs.set(path, JSON.stringify({
      ok: true,
      snapshot: { team_scores: teamScores }
    }, null, 2))
  }
}
```

Matches the `GET https://api.getdx.com/snapshots.info` response:

```json
{
  "ok": true,
  "snapshot": {
    "team_scores": [
      {
        "snapshot_team": {
          "id": "NTIzMTM",
          "name": "Drug Discovery Team",
          "team_id": "NTA1ODg",
          "parent": false,
          "parent_id": "NTIxNDc",
          "ancestors": ["LTE", "NTIzMTM", "NTIxNDc"]
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
    ]
  }
}
```

#### Organization people YAML document

One document stored at `raw/people/{timestamp}.yaml`:

```javascript
function renderPeopleFile(entities, docs) {
  const timestamp = new Date().toISOString()
  const people = entities.activity.roster.map(p => ({
    email: p.email,
    name: p.name,
    github_username: p.github_username,
    discipline: p.discipline,
    level: p.level,
    track: p.track || null,
    manager_email: p.manager_email || null
  }))

  const path = `people/${timestamp}.yaml`
  docs.set(path, YAML.stringify(people))
}
```

### Markdown Renderer

Generates personal knowledge base files for Basecamp personas (unchanged from
v2):

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

## Supabase Storage Loader (new in v3)

Loads raw documents directly into Supabase Storage as an alternative to writing
local files. This is the integration point with the ELT pipeline (spec 051).

```javascript
// libraries/libuniverse/load.js

/**
 * Load raw documents into Supabase Storage.
 * Each entry in rawDocuments is a storage path → JSON content pair.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Map<string, string>} rawDocuments - Storage path → content
 * @returns {Promise<{loaded: number, errors: Array<string>}>}
 */
export async function loadToSupabase(supabase, rawDocuments) {
  const errors = []
  let loaded = 0

  for (const [path, content] of rawDocuments) {
    const { error } = await supabase.storage
      .from('raw')
      .upload(path, content, {
        contentType: 'application/json',
        upsert: true
      })

    if (error) {
      errors.push(`${path}: ${error.message}`)
    } else {
      loaded++
    }
  }

  return { loaded, errors }
}
```

After loading, the user invokes the Transform step (via the `transform` edge
function from spec 052 or `transformAll()` from spec 051) to process the raw
documents into database tables. The Transform step is identical for synthetic
and real data.

## Cross-Content Validation

A pure function over the entity graph (unchanged from v2). It does **not** shell
out to `npx fit-map validate`:

```javascript
// libraries/libuniverse/validate.js

export function validateCrossContent(entities) {
  const checks = [
    // Organization integrity
    checkPeopleCoverage(entities),
    checkFrameworkValidity(entities),
    checkRosterCompleteness(entities),
    checkTeamAssignments(entities),
    checkManagerReferences(entities),
    checkGithubUsernames(entities),

    // GitHub webhook integrity
    checkWebhookPayloadSchemas(entities),
    checkWebhookDeliveryIds(entities),
    checkWebhookSenderUsernames(entities),

    // GetDX API response integrity
    checkGetDXTeamsResponse(entities),
    checkGetDXSnapshotsListResponse(entities),
    checkGetDXSnapshotsInfoResponses(entities),
    checkSnapshotScoreDriverIds(entities),
    checkScoreTrajectories(entities),

    // Evidence integrity
    checkEvidenceProficiency(entities),
    checkEvidenceSkillIds(entities),
  ]

  const failures = checks.filter(c => !c.passed)
  return { passed: failures.length === 0, total: checks.length,
           failures: failures.length, checks }
}
```

## Output Modes

v3 supports two output modes controlled by CLI flags:

### Local file mode (default)

Writes raw documents as individual local files under `examples/activity/raw/`,
mirroring the Supabase Storage path structure:

```
examples/
  framework/                    Framework YAML
  organizational/               HTML microdata, README, ONTOLOGY
  activity/
    raw/
      github/                   Individual webhook JSON documents
        evt-00000001-0001.json
        evt-00000001-0002.json
        ...
      getdx/
        teams-list/             teams.list API response
          2025-06-15T00:00:00.000Z.json
        snapshots-list/         snapshots.list API response
          2025-06-15T00:00:00.000Z.json
        snapshots-info/         snapshots.info API responses (one per snapshot)
          snap_2024_Q3.json
          snap_2024_Q4.json
          ...
      people/                   Organization people YAML
        2025-06-15T00:00:00.000Z.yaml
    evidence.json               Evidence rows (no raw source — loaded directly)
  personal/                     Personal knowledge base Markdown
```

### Supabase mode (`--load`)

Loads raw documents directly into Supabase Storage and evidence rows directly
into the database. Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
environment variables.

```sh
npx fit-universe --load
```

After loading, run the Transform step to populate the database tables:

```sh
# Via the transform edge function (spec 052)
curl -X POST http://localhost:54321/functions/v1/transform

# Or via the Node.js transform orchestrator (spec 051)
node -e "import { transformAll } from './products/map/activity/transform/index.js'; ..."
```

## CLI — fit-universe

The CLI lives in `libraries/libuniverse/bin/fit-universe.js` and is registered
in `package.json` as the `fit-universe` binary, available via
`npx fit-universe`.

```javascript
#!/usr/bin/env node

// libraries/libuniverse/bin/fit-universe.js

import { resolve, join, dirname } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { createScriptConfig } from '@forwardimpact/libconfig'
import { createLlmApi } from '@forwardimpact/libllm'
import { createClient } from '@supabase/supabase-js'
import { runPipeline } from '../pipeline.js'
import { loadToSupabase } from '../load.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const args = parseArgs(process.argv.slice(2))

  // Config from environment via libconfig
  const config = await createScriptConfig('universe', {
    LLM_TOKEN: null,
    LLM_MODEL: 'openai/gpt-4.1-mini',
    LLM_BASE_URL: null,
    SUPABASE_URL: null,
    SUPABASE_SERVICE_ROLE_KEY: null,
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

  const monorepoRoot = resolve(__dirname, '../../..')
  const result = await runPipeline({
    universePath: args.universe || join(__dirname, '..', 'data', 'universe.dsl'),
    dataDir: join(monorepoRoot, 'examples/framework'),
    mode,
    strict: !!args.strict,
    only: args.only || null,
    llmApi,
    cachePath: join(__dirname, '..', '.prose-cache.json'),
  })

  // Write filesystem files (HTML, YAML, Markdown)
  if (!args.dryRun) {
    for (const [relPath, content] of result.files) {
      const fullPath = join(monorepoRoot, relPath)
      await mkdir(dirname(fullPath), { recursive: true })
      await writeFile(fullPath, content)
    }
    console.log(`${result.files.size} files written`)
  }

  // Handle raw documents (activity data)
  if (result.rawDocuments.size > 0) {
    if (args.load) {
      // Load directly into Supabase Storage
      const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)
      const loadResult = await loadToSupabase(supabase, result.rawDocuments)
      console.log(`${loadResult.loaded} raw documents loaded to Supabase Storage`)
      if (loadResult.errors.length > 0) {
        console.error(`${loadResult.errors.length} errors:`)
        for (const err of loadResult.errors) console.error(`  ${err}`)
      }
    } else if (!args.dryRun) {
      // Write raw documents as local files
      for (const [storagePath, content] of result.rawDocuments) {
        const fullPath = join(monorepoRoot, 'examples/activity/raw', storagePath)
        await mkdir(dirname(fullPath), { recursive: true })
        await writeFile(fullPath, content)
      }
      console.log(`${result.rawDocuments.size} raw documents written to examples/activity/raw/`)
    }

    // Write evidence directly (no raw source system for evidence)
    if (result.entities.activity.evidence && !args.dryRun && !args.load) {
      const evidencePath = join(monorepoRoot, 'examples/activity/evidence.json')
      await mkdir(dirname(evidencePath), { recursive: true })
      await writeFile(evidencePath,
        JSON.stringify(result.entities.activity.evidence, null, 2))
    }
  }

  // Dry run output
  if (args.dryRun) {
    console.log('\nFilesystem files:')
    for (const [path] of result.files) console.log(`  ${path}`)
    console.log(`\nRaw documents (${args.load ? 'Supabase Storage' : 'local'}):`)
    for (const [path] of result.rawDocuments) console.log(`  raw/${path}`)
    console.log(`\n  ${result.files.size + result.rawDocuments.size} total (dry run)`)
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
    else if (arg === '--load') args.load = true
    else if (arg.startsWith('--only=')) args.only = arg.slice(7)
    else if (arg.startsWith('--universe=')) args.universe = arg.slice(11)
  }
  return args
}

main().catch(err => { console.error(err.message); process.exit(1) })
```

### CLI Flags (7 total)

```sh
# Default: structural generation only, write to local files
npx fit-universe

# Use cached prose
npx fit-universe --cached

# Generate prose via LLM (reads LLM_TOKEN, LLM_MODEL, LLM_BASE_URL from env)
npx fit-universe --generate

# Strict: fail on cache miss
npx fit-universe --cached --strict

# Load raw documents into Supabase Storage instead of local files
npx fit-universe --load

# Render only one content type
npx fit-universe --only=yaml

# Dry run: show what would be written
npx fit-universe --dry-run

# Custom universe file
npx fit-universe --universe=path/to/custom.dsl
```

**LLM configuration** is entirely via environment variables (handled by
`libconfig`): `LLM_TOKEN`, `LLM_MODEL`, `LLM_BASE_URL`.

**Supabase configuration** is also via environment variables: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`. Required only when `--load` is used.

### npm script (root package.json)

```json
{
  "scripts": {
    "generate": "fit-universe"
  }
}
```

Usage: `npm run generate`, `npm run generate -- --cached --load`, etc.

## Dependencies

### libuniverse (library)

```json
{
  "@forwardimpact/libconfig": "^0.1.59",
  "@forwardimpact/libformat": "^0.1.1",
  "@forwardimpact/libllm": "^0.1.72",
  "@forwardimpact/libutil": "^0.1.61",
  "@supabase/supabase-js": "^2.0.0",
  "seedrandom": "^3.0.5",
  "yaml": "^2.3.0"
}
```

## Implementation Phases

### Phase A — libuniverse Package Setup

- Create `libraries/libuniverse/` with `package.json`, `index.js`
- Register `bin/fit-universe.js` in `package.json`
- Add to root `package.json` workspaces
- Wire up npm workspace dependencies
- Import and re-use DSL code from v1 (tokenizer, parser)

### Phase B — DSL & Engine (in libuniverse)

- Move DSL tokenizer and parser into `libuniverse/dsl/`
- Move Tier 0 engine into `libuniverse/engine/tier0.js`
- Replace hand-rolled Mulberry32 PRNG with `seedrandom`
- Move name pool into `libuniverse/engine/names.js`
- Move prose key registry into `libuniverse/engine/prose-keys.js`
- Write `universe.dsl` in `libuniverse/data/`
- Ensure Tier 0 engine produces webhook-level activity data (individual events,
  not pre-extracted artifact arrays)

### Phase C — Prose Engine (in libuniverse)

- Implement `ProseEngine` in `libuniverse/engine/prose.js`
- Use `libllm.createLlmApi()` via injected instance (no dynamic import)
- Use `libutil.generateHash()` for cache keys
- Cache read/write from a file path passed in by the caller

### Phase D — Renderers (in libuniverse)

- HTML renderer using `libformat.createHtmlFormatter()` for sanitization
- YAML renderer using `yaml` package for serialization
- **Raw document renderer** producing individual JSON documents matching ELT
  Extract format (GitHub webhooks, GetDX API responses, people YAML)
- Markdown renderer for Basecamp content
- All renderers return `Map<string, string>` (path → content)

### Phase E — Supabase Loader (in libuniverse)

- Implement `load.js` with `loadToSupabase()` function
- Uses `@supabase/supabase-js` to write to the `raw` bucket
- Handles evidence loading directly to the database (no raw document)

### Phase F — Validation & Pipeline (in libuniverse)

- Cross-content validation (pure function, no subprocess calls)
- Update validation checks for raw document format (webhook schemas, API
  response schemas)
- Pipeline orchestrator `runPipeline()` wiring parse → generate → render →
  validate
- Unit tests for DSL parser, entity generation, validation

### Phase G — CLI (in libuniverse)

- Write `bin/fit-universe.js`
- Use `libconfig.createScriptConfig()` for environment-based configuration
- Support both local file output and Supabase Storage loading (`--load`)
- Add `npm run generate` script to root `package.json`
- `fit-map` CLI unchanged — no new commands or flags

### Phase H — Downstream Path Migration

- Update `fit-map` CLI fallback resolution to find `examples/framework/`
- Update `fit-pathway` CLI monorepo fallback to `examples/framework/`
- Update pathway `init` command to copy from `examples/framework/`
- Remove `examples/` entries from `products/map/package.json` files/exports
- Update `AGENTS.md` Key Paths table
- Update all `.claude/skills/` path references
- Update CI scripts and `npm run validate` to pass `--data=examples/framework`
- Delete old `products/map/examples/` and `products/guide/examples/` directories

## End-to-End Data Flow

### Synthetic data path

```
universe.dsl
    │
    ▼
fit-universe (Tier 0 + Tier 1/2)
    │
    ├── examples/framework/*.yaml        (filesystem)
    ├── examples/organizational/*.html   (filesystem)
    ├── examples/personal/*.md           (filesystem)
    │
    └── Raw documents ──► Supabase Storage (raw/ bucket)
         │                    via --load flag
         │
         ▼
    Transform step (spec 051)
         │
         ▼
    Supabase DB tables
    (github_events, github_artifacts, getdx_*, organization_people, evidence)
```

### Real data path

```
GitHub webhook ──► Extract edge function ──► Supabase Storage (raw/ bucket)
GetDX API      ──► Extract edge function ──► Supabase Storage (raw/ bucket)
People CSV     ──► Extract edge function ──► Supabase Storage (raw/ bucket)
                                                    │
                                                    ▼
                                              Transform step (spec 051)
                                                    │
                                                    ▼
                                              Supabase DB tables
```

**The Transform step is identical for both paths.** This is the core design goal
of aligning with the ELT pattern.

## Strengths

- **Best of both worlds**: Deterministic structure + LLM prose quality
- **ELT-aligned**: Synthetic data enters at the same boundary as real data
- **No transform duplication**: v2 duplicated transform logic by generating
  pre-transformed DB rows; v3 generates raw documents that flow through the same
  Transform step as real data
- **Individual documents**: No 6 MB bulk files — each webhook is a separate
  document matching the natural granularity of the data
- **Proper CLI**: `npx fit-universe` follows monorepo conventions — no ad-hoc
  scripts directory
- **Cache makes it deterministic**: After first LLM run, all subsequent runs are
  fully reproducible
- **CI-friendly**: Cached mode runs in seconds, fails fast on stale cache
- **DSL is self-documenting**: The universe file is a readable specification
- **LLM-agnostic**: Tier 1 works with any LLM backend via libllm
- **Minimal LLM usage**: Only ~15% of output requires LLM generation
- **Pure Node.js**: No Python dependency
- **Library-first**: Uses existing monorepo libraries for every cross-cutting
  concern
- **Testable**: `libuniverse` is a pure library — every module can be unit
  tested in isolation
- **Dual output**: Local files for development/CI, Supabase for integration
  testing

## Weaknesses

- **Custom DSL maintenance**: The DSL parser is bespoke code; changes to the
  data model require DSL grammar updates
- **Two-run workflow**: First run requires LLM access; only subsequent runs are
  fully offline
- **Cache staleness**: If the DSL changes, cache keys change, requiring
  regeneration of affected prose
- **Supabase dependency for --load**: The Supabase loader adds an infrastructure
  dependency, though local file mode remains available

## Downstream Changes

Moving example content from product-specific directories to a central
`examples/` root requires updates to every product and configuration that
resolves example data paths. This section enumerates all affected code.

### products/map

**`products/map/bin/fit-map.js`** — The CLI resolves data directories with
fallback candidates `["./data", "./examples", "../examples"]`. Update the
monorepo fallback to resolve `../../examples/framework` (two levels up from
`products/map/`) instead of `./examples`. The `--data=PATH` help text must
reflect the new default.

**`products/map/src/loader.js`** — `loadExampleData(rootDir, options)` loads
from `join(rootDir, "examples")`. Update to load from
`join(rootDir, "examples/framework")` when called from the monorepo context, or
accept the full path directly.

**`products/map/package.json`** — The `files` array includes `"examples/"` and
exports map `"./examples/*": "./examples/*"`. Remove these entries since example
data no longer lives inside the map package. Downstream consumers that
`import("@forwardimpact/map/examples/...")` must be updated.

### products/pathway (fit-pathway)

**`products/pathway/bin/fit-pathway.js`** — Data resolution priority includes
`products/map/examples/` as a monorepo development fallback. Update to resolve
`join(process.cwd(), "examples/framework")` instead.

**`products/pathway/src/commands/init.js`** — The `init` command copies example
data from `join(__dirname, "..", "..", "examples")` (which resolves to
`products/map/examples/` relative to pathway). Update the source path to point
to the monorepo root `examples/framework/` directory.

### products/basecamp

**`products/basecamp/src/basecamp.js`** — The `requireTemplateDir()` function
resolves the template directory for knowledge base initialization. The personal
knowledge example data now lives at `examples/personal/` rather than
`products/basecamp/template/knowledge/`.

### tests

**`tests/job-builder.spec.js`** — Uses hardcoded IDs from example data. The test
data path resolution must be updated if it loads framework files directly.

### AGENTS.md and skill files

**`AGENTS.md`** — The "Key Paths" table lists `Example data` at
`products/map/examples/`. Update to `examples/` with sub-paths for each content
type.

**`.claude/skills/fit-map/SKILL.md`** — Data structure diagram shows `examples/`
under the map product. Update to reference the monorepo root.

**`.claude/skills/fit-pathway/SKILL.md`** — Data resolution priority references
`products/map/examples/`. Update to `examples/framework/`.

### Validation and CI

**`npx fit-map validate`** — Must pass `--data=examples/framework` explicitly,
or the `fit-map` CLI fallback resolution must be updated.

**`npm run check`** — If any step relies on the old example paths, it must be
updated.

### Summary of required changes

| Component            | File(s)                                    | Change                                        |
| -------------------- | ------------------------------------------ | --------------------------------------------- |
| fit-map CLI          | `products/map/bin/fit-map.js`              | Update fallback path to `examples/framework`  |
| Map loader           | `products/map/src/loader.js`               | Update `loadExampleData()` path resolution    |
| Map package.json     | `products/map/package.json`                | Remove `examples/` from files and exports     |
| fit-pathway CLI      | `products/pathway/bin/fit-pathway.js`      | Update monorepo fallback path                 |
| Pathway init command | `products/pathway/src/commands/init.js`    | Update example source directory               |
| Basecamp knowledge   | `products/basecamp/src/basecamp.js`        | Update knowledge example path if bundled      |
| Tests                | `tests/job-builder.spec.js`                | Update data path resolution                   |
| Project instructions | `AGENTS.md`                                | Update Key Paths table                        |
| Skill files          | `.claude/skills/fit-map/SKILL.md` + others | Update all example path references            |
| CI validation        | Root `package.json` scripts                | Pass `--data=examples/framework` to `fit-map` |

## Appendix: GetDX API Response Schemas

### teams.list

`GET https://api.getdx.com/teams.list`

```json
{
  "ok": true,
  "teams": [
    {
      "ancestors": ["LTE", "MTUxODcx", "NTA2MTg", "NTA2MTk", "NTA4Nzc"],
      "id": "NTA4Nzc",
      "parent_id": "NTA2MTk",
      "manager_id": "NTEyMDUw",
      "name": "Core Data",
      "parent": true,
      "last_changed_at": "2024-03-19T22:36:47.448Z",
      "contributors": 0,
      "reference_id": "06BEC4E0-5A61-354E-08A6-C39D756058AB"
    }
  ]
}
```

### snapshots.list

`GET https://api.getdx.com/snapshots.list`

```json
{
  "ok": true,
  "snapshots": [
    {
      "id": "MjUyNbaY",
      "account_id": "ABCD",
      "last_result_change_at": "2024-07-18T15:47:12.080Z",
      "scheduled_for": "2024-06-16",
      "completed_at": "2024-07-01T14:01:51.027Z",
      "completed_count": 3077,
      "deleted_at": null,
      "total_count": 3686
    }
  ]
}
```

### snapshots.info

`GET https://api.getdx.com/snapshots.info?snapshot_id=<ID>`

```json
{
  "ok": true,
  "snapshot": {
    "team_scores": [
      {
        "snapshot_team": {
          "id": "NTIzMTM",
          "name": "Integrations",
          "team_id": "NTA1ODg",
          "parent": false,
          "parent_id": "NTIxNDc",
          "ancestors": ["LTE", "NTIzMTM", "NTIxNDc", "NTIwODI", "NTIwNzE"]
        },
        "item_id": "MTQ2",
        "item_type": "factor",
        "item_name": "Ease of release",
        "response_count": 1,
        "score": 0,
        "contributor_count": 5,
        "vs_prev": 0,
        "vs_org": -68,
        "vs_50th": -54,
        "vs_75th": -68,
        "vs_90th": -83
      }
    ]
  }
}
```
