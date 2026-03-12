# Plan 01 — Migrate Non-Conforming Libraries to OO+DI

Three libraries need migration: libuniverse (large), libutil (medium),
libsupervise (small). Each migration is a clean break — old interfaces are
deleted, all call sites update in the same commit, no default fallbacks to real
implementations in constructors. Factory functions are the only place that wires
real dependencies.

## Conformance audit

Current state of all 22 libraries against the standard pattern:

| Library | Status | Notes |
| --- | --- | --- |
| libagent | Compliant | AgentMind, AgentHands — full constructor DI |
| libcodegen | Compliant | CodegenBase hierarchy — injects fs, path, mustache, protoLoader |
| libconfig | Compliant | Config class + createConfig factory |
| libdoc | Compliant | DocsBuilder, DocsServer — comprehensive DI |
| libformat | Compliant | HtmlFormatter, TerminalFormatter + factories |
| libgraph | Compliant | GraphIndex via createGraphIndex factory |
| libharness | N/A | Test infrastructure — mocks and fixtures |
| libindex | Compliant | IndexBase, BufferedIndex — constructor DI |
| libllm | Compliant | LlmApi + createLlmApi factory |
| libmemory | Compliant | MemoryWindow — constructor DI |
| libpolicy | Compliant | Policy + createPolicy factory |
| libprompt | Compliant | PromptLoader + createPromptLoader factory |
| librc | Compliant | ServiceManager — full DI via deps object |
| librepl | Compliant | Repl — injects readline, process, os |
| libresource | Compliant | ResourceIndex + createResourceIndex factory |
| librpc | Compliant | Client, Server, Rpc classes + factories |
| libsecret | Exempt | Pure crypto utilities — stateless, no deps |
| libskill | Exempt | Pure functions by design |
| libstorage | Compliant | LocalStorage, S3Storage, SupabaseStorage + createStorage factory |
| libtelemetry | Compliant | Logger, Observer + factories |
| libtemplate | Compliant | TemplateLoader + createTemplateLoader factory |
| libtype | Exempt | Generated protobuf code |
| libui | Exempt | Functional DOM library |
| libutil | **Non-conforming** | Mixed classes + loose functions |
| libvector | Compliant | VectorProcessor — full constructor DI |
| libweb | Compliant | Middleware classes + factories |
| **libsupervise** | **Non-conforming** | Module-level logger singleton |
| **libuniverse** | **Non-conforming** | Procedural pipeline, module-level deps |

## Migration 1: libsupervise (small — ~1 hour)

### Problem

`SupervisionTree` creates a module-level logger:

```javascript
// libraries/libsupervise/src/tree.js line 11
const logger = createLogger("tree");
```

This logger is shared across all instances and cannot be replaced in tests.

### Changes

**tree.js** — Require logger in constructor, delete module-level singleton:

```javascript
class SupervisionTree {
  constructor(logDir, config) {
    if (!logDir) throw new Error("logDir is required");
    if (!config?.logger) throw new Error("config.logger is required");
    this.logger = config.logger;
    this.logDir = logDir;
    // ...
  }
}
```

Delete the module-level `const logger = createLogger("tree")` line.
Replace all bare `logger.xxx()` calls with `this.logger.xxx()`.

**Add factory function** to index.js:

```javascript
export function createSupervisionTree(logDir, config = {}) {
  const logger = createLogger("tree");
  return new SupervisionTree(logDir, { ...config, logger });
}
```

The factory wires the real logger. Tests pass a mock logger directly to the
constructor — they never call the factory.

**Update all call sites in the same commit** — every file that constructs
`SupervisionTree` directly must pass a logger. Search for `new SupervisionTree`
across services and bin files; update each one.

**Verify**: `npm run check`

## Migration 2: libutil (medium — ~2 hours)

### Problem

Nine loose functions exported alongside five DI-compliant classes. The loose
functions cannot be mocked or replaced, and `createBundleDownloader` uses
dynamic imports to avoid circular dependencies with libtelemetry.

### Current exports

**Classes (already compliant):**
- `Finder(fs, logger, process)`
- `BundleDownloader(createStorageFn, finder, logger, extractor, process)`
- `ProcessorBase(logger, batchSize)`
- `Retry(config)`
- `TarExtractor` (stateless utility)

**Loose functions (non-compliant):**
- `updateEnvFile(filePath, key, value)`
- `generateHash(input)`
- `generateUUID()`
- `countTokens(text)`
- `createTokenizer()`
- `createBundleDownloader(prefix)`
- `execLine(command, args, options)`
- `parseJsonBody(request)`
- `waitFor(fn, options)`

### Changes

Functions that wrap I/O or external processes must accept their dependencies
explicitly — no optional parameters with real defaults. Pure stateless functions
(zero dependencies beyond Node.js built-ins) stay as-is.

**Keep as pure functions (no changes):**
- `generateHash(input)` — stateless, uses only `crypto`
- `generateUUID()` — stateless, uses only `crypto`
- `countTokens(text)` — stateless computation
- `createTokenizer()` — stateless factory
- `parseJsonBody(request)` — stateless transform

**Require dependencies explicitly (no defaults):**

1. **`execLine`** — Wraps `child_process.execSync`. Require the exec function:

   ```javascript
   export function execLine(command, args, options, execFn) {
     if (!execFn) throw new Error("execFn is required");
     return execFn(/* ... */);
   }
   ```

   All call sites must pass `execSync` explicitly. This makes the I/O boundary
   visible and testable.

2. **`waitFor`** — Polling utility. Require a delay function:

   ```javascript
   export function waitFor(fn, options, delayFn) {
     if (!delayFn) throw new Error("delayFn is required");
     // ...
   }
   ```

3. **`updateEnvFile`** — File I/O. Require fs functions:

   ```javascript
   export function updateEnvFile(filePath, key, value, fsFns) {
     if (!fsFns?.readFileSync) throw new Error("fsFns.readFileSync is required");
     if (!fsFns?.writeFileSync) throw new Error("fsFns.writeFileSync is required");
     // ...
   }
   ```

4. **`createBundleDownloader`** — Delete the dynamic import. Require logger:

   ```javascript
   export function createBundleDownloader(prefix, logger) {
     if (!logger) throw new Error("logger is required");
     const finder = new Finder(fs, logger, process);
     // ...
   }
   ```

   The circular dependency with libtelemetry is resolved by requiring the
   caller to create and pass the logger — no dynamic `import()` needed.

**Update all call sites in the same commit.** Every file that calls `execLine`,
`waitFor`, `updateEnvFile`, or `createBundleDownloader` must pass the required
dependencies. No fallback behavior.

**Verify**: `npm run check`

## Migration 3: libuniverse (large — ~6 hours)

### Problem

libuniverse is a procedural pipeline of ~20 exported functions. Key issues:

1. **ProseEngine** creates its own PromptLoader at module scope (line 16 of
   `engine/prose.js`).
2. **pipeline.js** calls functions directly instead of composing injected
   collaborators.
3. **Render functions** import templates and industry data at module scope.
4. **No DI seams** for fs, config, or LLM in most modules.

### Target architecture

```
CLI (fit-universe.js)         ← composition root: wires all deps
  └── Pipeline                ← orchestrator class
        ├── DslParser         ← wraps tokenizer + parser
        ├── EntityGenerator   ← wraps tier0 + entities + activity
        ├── ProseEngine       ← existing class, fix DI
        ├── PathwayGenerator  ← wraps pathway.js
        ├── Renderer          ← wraps html, markdown, raw, pathway renderers
        ├── ContentValidator  ← wraps validate.js
        └── ContentFormatter  ← wraps format.js (prettier)
```

### Phase 1: Fix ProseEngine DI

**engine/prose.js** — Delete module-level PromptLoader. Require all deps in
constructor with validation:

```javascript
class ProseEngine {
  constructor({ cachePath, mode, strict, llmApi, promptLoader, logger }) {
    if (!cachePath) throw new Error("cachePath is required");
    if (!mode) throw new Error("mode is required");
    if (!llmApi) throw new Error("llmApi is required");
    if (!promptLoader) throw new Error("promptLoader is required");
    if (!logger) throw new Error("logger is required");
    this.cachePath = cachePath;
    this.mode = mode;
    this.strict = strict;
    this.llmApi = llmApi;
    this.promptLoader = promptLoader;
    this.logger = logger;
    this.cache = new Map();
    this.dirty = false;
  }
}
```

Delete the module-level `const prompts = createPromptLoader(...)` line entirely.

**Add factory:**

```javascript
export function createProseEngine(options) {
  const logger = createLogger("prose");
  const promptLoader = createPromptLoader(options.promptDir);
  return new ProseEngine({ ...options, promptLoader, logger });
}
```

The factory is the only place that creates real dependencies. Tests construct
`ProseEngine` directly with mocks.

### Phase 2: Extract DslParser

Wrap `tokenizer.js` and `parser.js` into a class. Delete the bare
`parseUniverse()` export.

```javascript
export class DslParser {
  constructor(tokenizer, parser) {
    if (!tokenizer) throw new Error("tokenizer is required");
    if (!parser) throw new Error("parser is required");
    this.tokenizer = tokenizer;
    this.parser = parser;
  }

  parse(source) {
    const tokens = this.tokenizer.tokenize(source);
    return this.parser.parse(tokens);
  }
}

export function createDslParser() {
  return new DslParser(tokenizer, parser);
}
```

### Phase 3: Extract EntityGenerator

Wrap `tier0.js`, `entities.js`, `activity.js`. Delete the bare `generate()`
and `buildEntities()` exports.

```javascript
export class EntityGenerator {
  constructor(rngFactory, logger) {
    if (!rngFactory) throw new Error("rngFactory is required");
    if (!logger) throw new Error("logger is required");
    this.rngFactory = rngFactory;
    this.logger = logger;
  }

  generate(ast) {
    const rng = this.rngFactory(ast.seed);
    const entities = buildEntities(ast, rng);
    const activity = generateActivity(entities, rng);
    return { ...entities, activity };
  }
}

export function createEntityGenerator(logger) {
  return new EntityGenerator(createSeededRNG, logger);
}
```

The internal `buildEntities` and `generateActivity` remain as pure functions
called by the class — they are stateless builders that take data in and return
data out. They are not exported from index.js.

### Phase 4: Extract Renderer

Wrap all render functions behind a single class. Delete the bare `renderHTML()`,
`renderMarkdown()`, `renderRawDocuments()` exports.

```javascript
export class Renderer {
  constructor(templateLoader, logger) {
    if (!templateLoader) throw new Error("templateLoader is required");
    if (!logger) throw new Error("logger is required");
    this.templateLoader = templateLoader;
    this.logger = logger;
  }

  renderHtml(entities, prose) { /* delegates to html.js logic */ }
  renderMarkdown(entities, prose) { /* delegates to markdown.js logic */ }
  renderRaw(entities) { /* delegates to raw.js logic */ }
  renderPathway(pathwayData) { /* delegates to pathway.js render logic */ }
}

export function createRenderer(templateDir, logger) {
  const templateLoader = createTemplateLoader(templateDir);
  return new Renderer(templateLoader, logger);
}
```

### Phase 5: Extract PathwayGenerator

Delete the bare `generatePathwayData()` export.

```javascript
export class PathwayGenerator {
  constructor(proseEngine, promptLoader, logger) {
    if (!proseEngine) throw new Error("proseEngine is required");
    if (!promptLoader) throw new Error("promptLoader is required");
    if (!logger) throw new Error("logger is required");
    this.proseEngine = proseEngine;
    this.promptLoader = promptLoader;
    this.logger = logger;
  }

  async generate(entities, options) {
    // Wraps current generatePathwayData() logic
  }
}
```

### Phase 6: Extract ContentValidator and ContentFormatter

Delete the bare `validateCrossContent()` and `formatFiles()` exports.

```javascript
export class ContentValidator {
  constructor(logger) {
    if (!logger) throw new Error("logger is required");
    this.logger = logger;
  }
  validate(entities) { /* wraps validateCrossContent() */ }
}

export class ContentFormatter {
  constructor(prettierFn, logger) {
    if (!prettierFn) throw new Error("prettierFn is required");
    if (!logger) throw new Error("logger is required");
    this.prettierFn = prettierFn;
    this.logger = logger;
  }
  async format(files) { /* wraps formatFiles() */ }
}
```

### Phase 7: Create Pipeline orchestrator

```javascript
export class Pipeline {
  constructor({
    dslParser,
    entityGenerator,
    proseEngine,
    pathwayGenerator,
    renderer,
    validator,
    formatter,
    logger,
  }) {
    // assign all deps
  }

  async run(source, options) {
    const ast = this.dslParser.parse(source);
    const entities = this.entityGenerator.generate(ast);
    // ... orchestrate stages as current runPipeline() does
    return { files, rawDocuments, entities, validation };
  }
}
```

### Phase 8: Update composition root

**bin/fit-universe.js** becomes the composition root:

```javascript
const logger = createLogger("universe");
const llmApi = createLlmApi();
const promptLoader = createPromptLoader(promptDir);
const templateLoader = createTemplateLoader(templateDir);

const pipeline = new Pipeline({
  dslParser: createDslParser(),
  entityGenerator: createEntityGenerator(logger),
  proseEngine: new ProseEngine({ cachePath, mode, strict, llmApi, promptLoader, logger }),
  pathwayGenerator: new PathwayGenerator(proseEngine, promptLoader, logger),
  renderer: new Renderer(templateLoader, logger),
  validator: new ContentValidator(logger),
  formatter: new ContentFormatter(prettier, logger),
  logger,
});

const result = await pipeline.run(source, options);
```

### Phase 9: Update exports

**index.js** — Export classes and factories only. Delete all bare function
exports (`parseUniverse`, `generate`, `buildEntities`, `renderHTML`,
`renderMarkdown`, `runPipeline`, etc.). There are no external consumers — the
only caller is `bin/fit-universe.js`, which is updated in the same commit.

No aliases, no re-exports of old function names.

### Phase 10: Update tests

Existing tests use function calls. Update to construct classes with mock deps:

```javascript
const parser = new DslParser(mockTokenizer, mockParser);
const result = parser.parse(source);
```

**Verify**: `npm run test --workspace=libraries/libuniverse`

## Migration order

Each migration is a single atomic commit — library changes and all call site
updates together. No intermediate broken states.

| Order | Library | Commit scope |
| --- | --- | --- |
| 1 | libsupervise | Library + all SupervisionTree call sites |
| 2 | libutil | Library + all execLine/waitFor/updateEnvFile/createBundleDownloader call sites |
| 3 | libuniverse | Library + bin/fit-universe.js + all tests |

## Verification

After each migration commit:

```sh
npm run check          # format, lint, test, SHACL across all packages
```

After all migrations are complete:

```sh
npm run test:e2e       # E2E tests
```

**Audit checklist (run after all three migrations):**

- Zero `|| createLogger` or `?? createLogger` patterns in any constructor
- Zero module-level `const logger =` or `const prompts =` in library source
- Zero `await import(` in library source (dynamic imports removed)
- Zero optional dependency parameters with real defaults in constructors
- Every class constructor validates all required dependencies with `throw`
- Every library exports at least one `createXxx` factory function
- Factory functions are the only code that calls `createLogger`,
  `createPromptLoader`, or other real dependency constructors
