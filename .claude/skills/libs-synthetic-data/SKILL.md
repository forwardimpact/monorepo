---
name: libs-synthetic-data
description: >
  Synthetic data generation for testing and development. libsyntheticgen provides
  DSL parsing and deterministic entity generation. libsyntheticprose generates
  prose content and pathway frameworks via LLM. libsyntheticrender renders
  entities to HTML, Markdown, YAML, and raw formats with validation. Use when
  generating example data, creating synthetic frameworks, or modifying the
  generation pipeline.
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

| Library            | Main API                                           | Purpose                                        |
| ------------------ | -------------------------------------------------- | ---------------------------------------------- |
| libsyntheticgen    | `DslParser`, `EntityGenerator`, `createSeededRNG`  | DSL parsing, deterministic entity generation   |
| libsyntheticprose  | `ProseEngine`, `PathwayGenerator`                  | LLM prose generation, pathway framework data   |
| libsyntheticrender | `Renderer`, `ContentValidator`, `ContentFormatter` | Multi-format rendering, validation, formatting |

## Decision Guide

- **DSL files** — libsyntheticgen ships a minimal reference DSL
  (`libraries/libsyntheticgen/data/default.dsl`) for quick testing. Projects
  provide their own DSL file; this monorepo's is at `examples/universe.dsl`.
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
node --test libraries/libsyntheticrender/test/ # Validation tests
npx fit-universe --dry-run                     # Full pipeline dry run
npx fit-universe --dry-run --only=html         # Single content type
```
