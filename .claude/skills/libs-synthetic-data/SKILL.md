---
name: libs-synthetic-data
description: >
  Use when parsing the universe DSL, generating deterministic entity graphs,
  generating LLM prose or pathway framework content, rendering synthetic
  entities to HTML, Markdown, YAML, or raw documents, validating cross-content
  integrity and link density, running the full parse → generate → render →
  validate pipeline, or loading generated content to Supabase.
---

# Synthetic Data Libraries

## When to Use

- Parsing or extending the universe DSL grammar
- Generating deterministic entity graphs (orgs, teams, people, projects)
- Adding LLM-generated prose or pathway framework content
- Rendering synthetic data to HTML, Markdown, YAML, or raw documents
- Validating generated content (cross-content integrity, link density, HTML)
- Modifying the generation pipeline stages

## Libraries

| Library            | Capabilities                                                                                                                            | Key Exports                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| libsyntheticgen    | Parse the universe DSL, generate deterministic entity graphs, seed RNG for reproducibility, share proficiency/maturity/stage vocabulary | `DslParser`, `createDslParser`, `EntityGenerator`, `createEntityGenerator`, `createSeededRNG`, `collectProseKeys`, `PROFICIENCY_LEVELS`, `MATURITY_LEVELS`, `STAGE_NAMES`           |
| libsyntheticprose  | Generate LLM prose content with a stable cache key; produce pathway framework data across levels, behaviours, and capabilities          | `ProseEngine`, `createProseEngine`, `PathwayGenerator`, `loadSchemas`                                                                                                               |
| libsyntheticrender | Render entities to HTML, Markdown, YAML, or raw documents; validate cross-content integrity and link density                            | `Renderer`, `createRenderer`, `ContentValidator`, `ContentFormatter`, `validateCrossContent`, `formatContent`, `generateDrugs`, `generatePlatforms`, `assignLinks`, `validateLinks` |
| libuniverse        | Run the full parse → generate → render → validate pipeline; load generated content to Supabase                                          | `Pipeline`, `loadToSupabase`                                                                                                                                                        |

## Decision Guide

- **DSL files** — libsyntheticgen ships a minimal reference DSL
  (`libraries/libsyntheticgen/data/default.dsl`) for quick testing. Projects
  provide their own DSL file; this monorepo's is at `data/synthetic/story.dsl`.
- **libsyntheticgen vs libuniverse** — Use `libsyntheticgen` directly when you
  only need DSL parsing or entity generation without rendering. Use
  `libuniverse` (Pipeline) when you want the full parse-generate-render-validate
  flow.
- **libsyntheticprose** — Only needed when LLM-generated content is required.
  The pipeline works without it in "no-prose" mode. Prose is injected via DI,
  never imported directly by the renderer.
- **libsyntheticrender** — Use directly when you have entities and want to
  render specific formats. The `Renderer` class delegates to format-specific
  renderers (HTML, Markdown, Pathway YAML, raw documents).
- **Pure functions** — `createSeededRNG`, `collectProseKeys`,
  `validateCrossContent`, `formatContent` are stateless and can be used
  standalone.
- **Shared vocabulary** — `PROFICIENCY_LEVELS`, `MATURITY_LEVELS`, and
  `STAGE_NAMES` are exported from `libsyntheticgen/vocabulary.js` (re-exported
  from the package index). All prompt builders, validators, and renderers import
  from this single source — never hardcode these values.
- **Prose caching** — `ProseEngine.generateStructured` uses a stable cache key
  derived from the entity key alone (e.g. `pathway:track:platform`), not from
  the prompt content. Prompt changes do not invalidate the cache. Use
  `--generate` to regenerate with updated prompts.
- **Prior output forwarding** — `PathwayGenerator` threads generated data from
  earlier steps into downstream prompts: levels → behaviours → capabilities →
  disciplines/tracks. A shared voice preamble (`buildPreamble`) enforces
  consistent terminology across all entity builders.
- **Null safety** — `generateEntity` returns `null` on cache miss; callers
  propagate `null` rather than spreading into empty objects. The pathway
  renderer skips null entries.
- **Output cleanup** — The CLI cleans output directories before writing to
  prevent stale files from prior runs persisting.
- **CLI logging** — Use `createLogger` from libtelemetry for operational output.
  `logger.info` sends to stderr (keeps stdout clean for data), `logger.debug`
  only prints when `DEBUG=<domain>` is set.

## Composition Recipes

### Recipe 1: Parse DSL and generate entities

```javascript
import { createDslParser, createEntityGenerator } from "@forwardimpact/libsyntheticgen";
import { createLogger } from "@forwardimpact/libtelemetry";
import { readFile } from "fs/promises";

const logger = createLogger("gen");
const parser = createDslParser();
const generator = createEntityGenerator(logger);

const source = await readFile("universe.dsl", "utf-8");
const ast = parser.parse(source);
const entities = generator.generate(ast);
```

### Recipe 2: Render entities to HTML

```javascript
import { Renderer } from "@forwardimpact/libsyntheticrender";
import { TemplateLoader } from "@forwardimpact/libtemplate/loader";

const templateLoader = new TemplateLoader("path/to/templates");
const renderer = new Renderer(templateLoader, logger);
const { files, linked } = renderer.renderHtml(entities, prose);
```

### Recipe 3: Full pipeline wiring

```javascript
import { createDslParser, createEntityGenerator } from "@forwardimpact/libsyntheticgen";
import { ProseEngine, PathwayGenerator } from "@forwardimpact/libsyntheticprose";
import { Renderer, ContentValidator, ContentFormatter } from "@forwardimpact/libsyntheticrender";
import { Pipeline } from "@forwardimpact/libuniverse/pipeline";

const pipeline = new Pipeline({
  dslParser: createDslParser(),
  entityGenerator: createEntityGenerator(logger),
  proseEngine: new ProseEngine({ cachePath, mode, llmApi, promptLoader, logger }),
  pathwayGenerator: new PathwayGenerator(proseEngine, logger),
  renderer: new Renderer(templateLoader, logger),
  validator: new ContentValidator(logger),
  formatter: new ContentFormatter(prettierFormat, logger),
  logger,
});

const result = await pipeline.run({ universePath, schemaDir });
```

## DI Wiring

### libsyntheticgen

```javascript
// DslParser — wraps tokenizer + parser, factory available
import { DslParser, createDslParser } from "@forwardimpact/libsyntheticgen";
const parser = createDslParser(); // or: new DslParser(tokenizeFn, parseFn)

// EntityGenerator — accepts RNG factory and logger
import { EntityGenerator, createEntityGenerator } from "@forwardimpact/libsyntheticgen";
const generator = createEntityGenerator(logger); // or: new EntityGenerator(rngFactory, logger)

// Pure functions — no DI
import { createSeededRNG, collectProseKeys } from "@forwardimpact/libsyntheticgen";

// Shared vocabulary — single source of truth for all libraries
import { PROFICIENCY_LEVELS, MATURITY_LEVELS, STAGE_NAMES } from "@forwardimpact/libsyntheticgen";
```

### libsyntheticprose

```javascript
// ProseEngine — accepts cache path, mode, LLM API, prompt loader, logger
import { ProseEngine } from "@forwardimpact/libsyntheticprose";
const prose = new ProseEngine({ cachePath, mode, strict, llmApi, promptLoader, logger });

// PathwayGenerator — accepts prose engine and logger
import { PathwayGenerator } from "@forwardimpact/libsyntheticprose";
const pathway = new PathwayGenerator(proseEngine, logger);
```

### libsyntheticrender

```javascript
// Renderer — accepts template loader and logger
import { Renderer, createRenderer } from "@forwardimpact/libsyntheticrender";
const renderer = new Renderer(templateLoader, logger);

// ContentValidator — accepts logger
import { ContentValidator } from "@forwardimpact/libsyntheticrender";
const validator = new ContentValidator(logger);

// ContentFormatter — accepts prettier format function and logger
import { ContentFormatter } from "@forwardimpact/libsyntheticrender";
const formatter = new ContentFormatter(prettierFormat, logger);
```

## GetDX API References

Synthetic data payloads conform to these GetDX Web API response schemas:

- [teams.list](https://docs.getdx.com/webapi/methods/teams.list/) — team
  hierarchy
- [snapshots.list](https://docs.getdx.com/webapi/methods/snapshots.list/) —
  survey snapshots
- [snapshots.info](https://docs.getdx.com/webapi/methods/snapshots.info/) —
  snapshot team scores
- [snapshots.comments.list](https://docs.getdx.com/webapi/methods/snapshots.comments.list/)
  — snapshot comments
- [initiatives.list](https://docs.getdx.com/webapi/methods/initiatives.list/) —
  initiatives
- [initiatives.info](https://docs.getdx.com/webapi/methods/initiatives.info/) —
  initiative detail
- [initiatives.progressReport](https://docs.getdx.com/webapi/methods/initiatives.progressReport/)
  — progress reports
- [scorecards.list](https://docs.getdx.com/webapi/methods/scorecards.list/) —
  scorecards
- [scorecards.info](https://docs.getdx.com/webapi/methods/scorecards.info/) —
  scorecard detail
- [All methods](https://docs.getdx.com/webapi/methods/) — full API reference

## Verification

```sh
node --test libraries/libsyntheticgen/test/    # DSL + entity generation tests
node --test libraries/libsyntheticprose/test/  # Prose engine + prompt builder tests
node --test libraries/libsyntheticrender/test/ # Validation + rendering tests
node --test libraries/libuniverse/test/        # Pipeline integration tests
bunx fit-universe --dry-run                    # Full pipeline dry run
bunx fit-universe --dry-run --only=html        # Single content type
bunx fit-map validate                          # Validate generated pathway data
```
