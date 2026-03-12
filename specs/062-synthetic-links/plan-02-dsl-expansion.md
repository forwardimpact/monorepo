# Plan 02 — DSL Expansion with New Entity Blocks

> Add `drug`, `platform`, and enriched `content` blocks to the DSL so that all
> entity types and their relationships are declared in the universe file.
> Rendering remains deterministic (no LLM calls for linking).

**Clean break.** This plan fully replaces the current templates, renderer, and
DSL grammar for organizational content. There are no consumers of the existing
output format or DSL syntax — old code is deleted and replaced, not wrapped or
shimmed. No backward compatibility with the old content blocks.

## Approach

Extend the DSL grammar, parser, and entity builder to support three new
top-level block types: `drug`, `platform`, and expanded `course`/`event`
properties within `content`. All cross-links are declared explicitly in the DSL
file, making the universe file the single source of truth for the entire
knowledge graph topology.

The renderer reads the fully resolved entity graph and stamps it into enriched
templates. Prose fields remain optional (Tier 1 LLM or cache, as today).

## Architecture

```
universe.dsl (extended)
    │
    ├── drug oncora { ... }
    ├── platform molecularforge { deps [...] }
    ├── project alpha { drugs [...] platforms [...] members [...] }
    ├── content guide_html { course_tracks [...] event_links [...] }
    │
    ▼
DSL Parser (extended grammar)
    │
    ▼
Entity Builder (new: buildDrugs, buildPlatforms, enrichProjects)
    │
    ▼
HTML Renderer + Enriched Templates
    │
    ▼
examples/organizational/
```

## DSL Extensions

### Drug block

```dsl
drug oncora {
  name "Oncora"
  class "Targeted kinase inhibitor"
  ingredient "Oncora Compound A"
  phase "phase_3"
  identifier "ONC-BASE-001"
  projects [oncora]
  platforms [molecularforge, clinicalstream, datalake]
  events [project_alpha_kickoff]
}

drug oncora_xr {
  name "Oncora-XR"
  class "Extended-release targeted inhibitor"
  phase "phase_2"
  identifier "ONC-XR-002"
  parent oncora
  projects [delta]
  platforms [molecularforge, compliancemonitor]
}
```

### Platform block

```dsl
platform datalake {
  name "DataLake"
  category "Data Infrastructure"
  version "2.4"
  deps []
  projects [beta, epsilon, eta, lambda]
}

platform molecularforge {
  name "MolecularForge"
  category "Computational Discovery"
  version "5.1"
  deps [bioanalyzer, drugdesignstudio, analyticshub]
  projects [alpha, kappa]
  drugs [oncora, immunex_plus]
}
```

### Enriched project block

```dsl
project alpha {
  name "Project Alpha: Oncology Discovery Integration"
  type "drug"
  teams [drug_discovery, clinical_development]
  timeline_start 2025-01
  timeline_end 2025-09
  lead @thoth
  members [@chronos, @athena, @pontus, @thalassa, @minerva, @gaia]
  drugs [oncora]
  platforms [molecularforge, bioanalyzer]
}
```

### Enriched content block

```dsl
content guide_html {
  // ... existing fields ...

  course_tracks {
    pharmacology {
      courses [pharm_101, pharm_201, pharm_301]
      provider rd
      drugs [oncora, cardiozen]
      platforms [molecularforge, bioanalyzer]
    }
    data_ai {
      courses [data_101, data_201, data_301, data_401]
      provider it
      platforms [datalake, analyticshub, mlflow]
    }
  }

  event_links {
    project_alpha_kickoff {
      project alpha
      organizer @thoth
      attendees [@minerva, @chronos, @athena, @pontus, @thalassa, @gaia]
      drugs [oncora]
      platforms [molecularforge]
    }
  }
}
```

## Parser Changes

Extend `libraries/libuniverse/dsl/parser.js`:

- New block handlers: `parseDrug()`, `parsePlatform()`
- Extended `parseProject()` with `lead`, `members`, `drugs`, `platforms`
- Extended `parseContent()` with `course_tracks`, `event_links`
- AST additions: `ast.drugs[]`, `ast.platforms[]`

Extend `libraries/libuniverse/dsl/tokenizer.js`:

- New keywords: `drug`, `platform`, `parent`, `deps`, `lead`, `members`,
  `drugs`, `platforms`, `course_tracks`, `event_links`, `provider`,
  `organizer`, `attendees`

## Entity Builder Changes

New functions in `engine/entities.js`:

```js
function buildDrugs(ast, domain) { ... }
function buildPlatforms(ast, domain) { ... }
function enrichProjects(projects, people, ast) { ... }
```

Each produces entities with stable IRIs:
- `https://{domain}/id/drug/{id}`
- `https://{domain}/id/platform/{id}`
- `https://{domain}/id/course/{id}`

## Template Changes

Same new/enriched templates as Plan 01, but data comes from resolved DSL
entities instead of hard-coded arrays.

## Pros

- DSL is the single source of truth for all entities and relationships
- No hard-coded industry data — works for any domain
- Explicitly declared relationships make the graph topology auditable
- DAG validation can run at parse time (cycle detection for platform deps)
- Composable — different DSL files produce different graph topologies
- Prose still optional (no LLM required for structure)

## Cons

- Significant DSL grammar expansion — parser complexity increases
- Large DSL files (BioNova DSL would grow from ~600 to ~1000+ lines)
- Manual relationship maintenance — every link must be typed in the DSL
- No natural language enrichment for descriptions/article bodies
- Blog post inline mentions (`<span itemprop="about">`) still use template
  slots, not contextual prose

## Effort

- `dsl/tokenizer.js`: ~30 lines (new keywords)
- `dsl/parser.js`: ~200 lines (3 new block parsers, 2 extended)
- `engine/entities.js`: ~150 lines (3 new builders)
- `render/html.js`: ~120 lines (new/enriched rendering)
- 3 new templates + 3 enriched templates: ~300 lines
- DSL file updates: ~400 lines
- Tests: ~200 lines
- **Total: ~1400 lines, 4–5 days**

## Risk

Medium. Parser changes could introduce regressions in existing DSL parsing.
Mitigation: comprehensive parser tests for old and new syntax. The larger risk
is DSL sprawl — as entity types grow, the file becomes unwieldy. Mitigation:
support `@include` directives in a future iteration.
