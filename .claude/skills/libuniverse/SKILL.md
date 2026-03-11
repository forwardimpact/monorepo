---
name: libuniverse
description: >
  libuniverse - Synthetic data DSL and generation engine. parseUniverse parses
  .dsl files into ASTs. generate builds entity graphs. ProseEngine generates
  LLM-powered prose. runPipeline orchestrates the full pipeline. Use for
  developing the generation engine, DSL parser, renderers, or templates.
---

# libuniverse Skill

## When to Use

- Modifying the universe DSL parser (tokenizer, parser, AST)
- Adding or changing entity generation logic (Tier 0)
- Working with prose generation (Tier 1/2, LLM prompts)
- Adding or modifying renderers (HTML, pathway, markdown, raw)
- Updating Mustache templates for generated output
- Changing the pipeline orchestrator
- Adding validation checks for cross-content consistency

## Package Structure

```
libraries/libuniverse/
  index.js              # Public API exports
  pipeline.js           # Orchestrator: parse -> generate -> prose -> render -> validate
  validate.js           # Cross-content validation
  load.js               # Supabase Storage loader
  dsl/
    tokenizer.js        # DSL tokenizer
    parser.js           # DSL parser -> AST
    index.js            # parseUniverse entry point
  engine/
    tier0.js            # Structural entity generation from AST
    entities.js         # Entity builder helpers
    activity.js         # Activity data generation (GitHub, GetDX, evidence)
    prose.js            # ProseEngine: LLM prose with caching
    prose-keys.js       # Prose key collection from entities
    pathway.js          # Pathway framework data generation
  render/
    html.js             # HTML renderer (organizational docs)
    pathway.js          # Pathway YAML renderer
    raw.js              # Raw document renderer (activity data)
    markdown.js         # Markdown renderer (personal KB)
  templates/            # Mustache templates for all content types
  prompts/pathway/      # LLM prompts for framework generation
  data/
    default.dsl         # Minimal test universe
  bin/
    fit-universe.js     # CLI entry point
```

## Key Modules

### DSL Parser

```javascript
import { parseUniverse } from "@forwardimpact/libuniverse/dsl";

const ast = parseUniverse(dslSource);
```

The DSL defines universes with organizations, departments, teams, people,
projects, scenarios, framework definitions, and content blocks.

### Entity Generation (Tier 0)

```javascript
import { generate } from "@forwardimpact/libuniverse/engine";

const entities = generate(ast);
```

Deterministic structural generation from the AST. Uses seeded random for
reproducibility.

### Prose Engine (Tier 1/2)

```javascript
import { ProseEngine } from "@forwardimpact/libuniverse/prose";

const engine = new ProseEngine({ llmApi, cachePath, mode, strict });
const result = await engine.generateProse(key, context);
```

Three modes: `no-prose` (skip), `cached` (read from cache), `generate` (call
LLM and cache result).

### Pipeline

```javascript
import { runPipeline } from "@forwardimpact/libuniverse/pipeline";

const result = await runPipeline({
  universePath: "path/to/universe.dsl",
  dataDir: "examples",
  mode: "cached",
  schemaDir: "products/map/schema/json",
});
// result.files, result.rawDocuments, result.entities, result.validation
```

### Renderers

Each renderer transforms entities into output files:

- **html** -> `examples/organizational/` (articles, guides, FAQs)
- **pathway** -> `examples/pathway/` (YAML framework files)
- **raw** -> `examples/activity/` (roster, events, evidence)
- **markdown** -> `examples/personal/` (briefings, notes)

## Generation Tiers

| Tier | Description                    | Engine       |
| ---- | ------------------------------ | ------------ |
| 0    | Structural (deterministic)     | `tier0.js`   |
| 1    | Prose from templates + LLM     | `prose.js`   |
| 2    | Deep prose (pathway framework) | `pathway.js` |

## Adding a New Content Type

1. Add content block syntax to the DSL parser
2. Add entity generation in `engine/`
3. Create a renderer in `render/`
4. Add Mustache templates in `templates/`
5. Wire into `pipeline.js` with a `shouldRender` check
6. Add validation in `validate.js`

## Verification

```sh
npx fit-universe --dry-run     # Show what would be generated
npx fit-universe               # Generate structural data
npm run test                   # Unit tests
```
