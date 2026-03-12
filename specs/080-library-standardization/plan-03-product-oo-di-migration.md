# Plan 03 — Migrate Products to OO+DI and Integrate Libraries

Plans 01 and 02 standardized libraries. This plan extends the same OO+DI pattern
into products — **map**, **pathway**, and **basecamp** — and integrates monorepo
libraries where products currently duplicate functionality or bypass the library
layer.

Three categories of work:

1. **Module-level singletons and mutable state** — the same violations fixed in
   libraries, now in product code.
2. **Missing library integration** — products that hand-roll logging, config, or
   template loading instead of using libtelemetry, libconfig, or libtemplate.
3. **Monolithic files without DI seams** — large procedural files that cannot be
   unit-tested because they mix concerns and hard-code dependencies.

## Product conformance audit

| Product      | Module                         | Status             | Issue                                                                                                    |
| ------------ | ------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------- |
| **map**      | `src/loader.js`                | Non-conforming     | Hard-codes `fs/promises` at module scope; `loadAllData` mixes loading + validation; no DI seams          |
| **map**      | `src/schema-validation.js`     | Non-conforming     | Module-level `schemaDir` via `__dirname`; `createValidator()` inlines Ajv creation; no injectable fs     |
| **map**      | `src/index-generator.js`       | Non-conforming     | Hard-codes `fs/promises`; `writeFile` called inline with no DI seam                                      |
| **map**      | `src/validation.js`            | Exempt             | Pure validation functions — stateless, data in → result out                                              |
| **map**      | `src/levels.js`                | Exempt             | Type constants and pure helpers                                                                          |
| **map**      | `src/modifiers.js`             | Exempt             | Pure predicate function                                                                                  |
| **pathway**  | `src/lib/template-loader.js`   | **Non-conforming** | Module-level singleton: `const loader = createTemplateLoader(...)` at line 14                            |
| **pathway**  | `src/lib/state.js`             | Exempt             | Browser-side global store via libui — standard pattern for client-side apps                              |
| **pathway**  | `src/lib/yaml-loader.js`       | Exempt             | Browser-side data loading via libui — fetch-based, no Node.js fs                                        |
| **pathway**  | `src/formatters/**`            | Exempt             | Pure functions — data in → string/DOM out. Same exemption as libskill.                                  |
| **pathway**  | `src/commands/**`              | Partially conform. | Commands are pure handlers but receive all deps via `{ data, args, options }` — no singleton issues     |
| **pathway**  | `bin/fit-pathway.js`           | Non-conforming     | Composition root that hard-codes `loadAllData` inline; no library integration for config or logging     |
| **basecamp** | `src/basecamp.js`              | **Non-conforming** | 970-line monolith; module-level mutable state (`activeChildren`, `daemonStartedAt`); inline fs + logging |

### What is exempt

The following are intentionally left unchanged:

- **Pathway formatters** (`src/formatters/**`) — Pure functions, same exemption
  as libskill. Data in → formatted output. No state, no deps beyond utility
  helpers.
- **Pathway browser code** (`src/main.js`, `src/lib/state.js`,
  `src/lib/yaml-loader.js`, `src/pages/**`, `src/components/**`) — Browser-side
  code uses libui's functional DOM and reactive store. This is the standard
  client-side pattern; OO+DI applies to Node.js library/service/CLI code.
- **Map pure functions** (`src/validation.js`, `src/levels.js`,
  `src/modifiers.js`) — Stateless validation and type constants.
- **Pathway command handlers** (`src/commands/**`) — Already receive deps via
  function parameters. The command-factory pattern is a functional DI approach
  that works well for CLI dispatch.

## Migration 1: map (medium — loader + schema validation + index generator)

### Problem

Map's source files hard-code `fs/promises` at module scope and mix I/O with
business logic. `schema-validation.js` has a module-level `schemaDir` computed
from `__dirname`, making it impossible to test with alternate schema locations.
`loader.js` mixes data loading with validation in `loadAllData`. None of these
modules accept their I/O dependencies through parameters.

### 1A: Extract DataLoader class from loader.js

The current `loadAllData` function hard-codes `readFile`, `readdir`, and `stat`
from `fs/promises`. Extract a class that accepts fs operations.

```javascript
export class DataLoader {
  /**
   * @param {{ readFile: Function, readdir: Function, stat: Function }} fs
   * @param {{ parseYaml: Function }} parser
   */
  constructor(fs, parser) {
    if (!fs) throw new Error("fs is required");
    if (!parser) throw new Error("parser is required");
    this.#fs = fs;
    this.#parser = parser;
  }

  async loadYamlFile(filePath) {
    const content = await this.#fs.readFile(filePath, "utf-8");
    return this.#parser.parseYaml(content);
  }

  async loadAllData(dataDir, options = {}) {
    // Uses this.#fs and this.#parser instead of module-level imports
    // Delegates validation to the caller (separate concern)
  }

  async loadAgentData(dataDir) { /* ... */ }
  async loadSkillsWithAgentData(dataDir) { /* ... */ }
  async loadQuestionFolder(questionsDir) { /* ... */ }
  async loadFrameworkConfig(dataDir) { /* ... */ }
}

export function createDataLoader(dataDir) {
  const fs = await import("fs/promises");
  const { parse: parseYaml } = await import("yaml");
  return new DataLoader(fs, { parseYaml });
}
```

All internal helper functions (`loadSkillsFromCapabilities`,
`loadDisciplinesFromDir`, `loadTracksFromDir`, `loadBehavioursFromDir`,
`loadCapabilitiesFromDir`, `loadQuestionsFromDir`, `loadRepoFile`) become
private methods on `DataLoader`. They use `this.#fs` and `this.loadYamlFile()`
instead of module-scope imports.

The existing `createDataLoader(dataDir)` function currently returns a plain
object with bound methods. Replace it: the factory now creates a real
`DataLoader` instance. The returned API stays the same (methods like `loadAll`,
`loadQuestions`, etc.) — they become methods on the class.

**Separate loading from validation.** `loadAllData` currently calls
`validateAllData` inline. Remove this coupling. The caller (CLI or test) decides
whether to validate after loading. The `loadAndValidate` convenience function
stays as a standalone export for callers that want both steps — it receives a
`DataLoader` and calls `loadAllData` then `validateAllData`.

### 1B: Extract SchemaValidator class from schema-validation.js

The current code computes `schemaDir` from `__dirname` at module scope and
creates an Ajv instance inline in `createValidator()`.

```javascript
export class SchemaValidator {
  /**
   * @param {{ readFile: Function, readdir: Function, stat: Function }} fs
   * @param {string} schemaDir - Path to JSON schema directory
   * @param {{ Ajv: Function, addFormats: Function }} ajvFactory
   */
  constructor(fs, schemaDir, ajvFactory) {
    if (!fs) throw new Error("fs is required");
    if (!schemaDir) throw new Error("schemaDir is required");
    if (!ajvFactory) throw new Error("ajvFactory is required");
    this.#fs = fs;
    this.#schemaDir = schemaDir;
    this.#ajvFactory = ajvFactory;
  }

  async validateDataDirectory(dataDir) { /* ... */ }
  async validateFile(filePath, schemaId) { /* ... */ }
  validateReferentialIntegrity(data) { /* ... */ }
  async runFullValidation(dataDir, loadedData) { /* ... */ }
}

export function createSchemaValidator() {
  const fs = await import("fs/promises");
  const schemaDir = join(dirname(fileURLToPath(import.meta.url)), "../schema/json");
  return new SchemaValidator(fs, schemaDir, { Ajv, addFormats });
}
```

`SCHEMA_MAPPINGS` stays as a module-level constant — it is pure configuration
data with no dependencies. `createValidationResult`, `createError`,
`createWarning`, and `formatAjvErrors` stay as module-level pure helper
functions (stateless transforms).

### 1C: Extract IndexGenerator class from index-generator.js

```javascript
export class IndexGenerator {
  /**
   * @param {{ readdir: Function, writeFile: Function }} fs
   * @param {{ stringify: Function }} yamlSerializer
   */
  constructor(fs, yamlSerializer) {
    if (!fs) throw new Error("fs is required");
    if (!yamlSerializer) throw new Error("yamlSerializer is required");
    this.#fs = fs;
    this.#yaml = yamlSerializer;
  }

  async generateDirIndex(dir) { /* ... */ }
  async generateAllIndexes(dataDir) { /* ... */ }
}

export function createIndexGenerator() {
  const { readdir, writeFile } = await import("fs/promises");
  const { stringify } = await import("yaml");
  return new IndexGenerator({ readdir, writeFile }, { stringify });
}
```

### 1D: Update index.js exports

```javascript
// Classes
export { DataLoader } from "./loader.js";
export { SchemaValidator } from "./schema-validation.js";
export { IndexGenerator } from "./index-generator.js";

// Factory functions
export { createDataLoader } from "./loader.js";
export { createSchemaValidator } from "./schema-validation.js";
export { createIndexGenerator } from "./index-generator.js";

// Pure functions (unchanged)
export { validateAllData, validateQuestionBank, /* ... */ } from "./validation.js";
export * from "./levels.js";
export { isCapability } from "./modifiers.js";

// Convenience function (composes loader + validator)
export { loadAndValidate } from "./loader.js";
```

Delete bare function exports that are now class methods: `loadAllData`,
`loadYamlFile`, `loadFrameworkConfig`, `loadQuestionFolder`,
`loadQuestionBankFromFolder`, `loadSelfAssessments`, `loadExampleData`,
`loadAgentData`, `loadSkillsWithAgentData`, `validateDataDirectory`,
`validateReferentialIntegrity`, `runSchemaValidation`, `generateAllIndexes`,
`generateDirIndex`.

### 1E: Update all call sites

Every file that imports from `@forwardimpact/map` must update. Search for:

- `import { loadAllData }` — replace with `createDataLoader` factory, then
  `loader.loadAllData(dataDir)`
- `import { runSchemaValidation }` — replace with `createSchemaValidator`, then
  `validator.runFullValidation(dataDir, data)`
- `import { generateAllIndexes }` — replace with `createIndexGenerator`, then
  `generator.generateAllIndexes(dataDir)`

**Key call sites:**

1. `products/map/bin/fit-map.js` — CLI becomes composition root: creates loader,
   validator, generator instances. Passes them to command functions.
2. `products/pathway/bin/fit-pathway.js` — Replace `loadAllData(dataDir, opts)`
   with loader instance.
3. `products/pathway/src/commands/agent.js` — Replace `loadAgentData`,
   `loadSkillsWithAgentData` imports.
4. Any service or test that imports map functions.

**Verify**: `npm run check`

## Migration 2: pathway template-loader (small — singleton removal)

### Problem

`src/lib/template-loader.js` creates a module-level singleton:

```javascript
const loader = createTemplateLoader(join(__dirname, "..", "..", "templates"));
```

This singleton is created at import time, cannot be replaced in tests, and
hard-codes the template directory path.

### Changes

Delete the module-level singleton. Accept the template loader as a parameter or
create it lazily.

**Option: Lazy factory with injectable override.**

```javascript
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createTemplateLoader } from "@forwardimpact/libtemplate";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultTemplateDir = join(__dirname, "..", "..", "templates");

/**
 * Create a template loader for pathway templates
 * @param {string} [templateDir] - Override template directory
 * @returns {Object} Template loader instance
 */
export function createPathwayTemplateLoader(templateDir = defaultTemplateDir) {
  return createTemplateLoader(templateDir);
}

/**
 * Load a template file with fallback to package defaults
 * @param {Object} loader - Template loader instance
 * @param {string} templateName - Template filename
 * @param {string} dataDir - Path to data directory
 * @returns {string}
 */
export function loadTemplate(loader, templateName, dataDir) {
  return loader.load(templateName, dataDir);
}

export function loadAgentTemplate(loader, dataDir) {
  return loader.load("agent.template.md", dataDir);
}

export function loadSkillTemplate(loader, dataDir) {
  return loader.load("skill.template.md", dataDir);
}

export function loadSkillInstallTemplate(loader, dataDir) {
  return loader.load("skill-install.template.sh", dataDir);
}

export function loadSkillReferenceTemplate(loader, dataDir) {
  return loader.load("skill-reference.template.md", dataDir);
}

export function loadJobTemplate(loader, dataDir) {
  return loader.load("job.template.md", dataDir);
}
```

Every function now requires the loader as its first parameter. The module-level
singleton is deleted.

**Update call sites:** The pathway CLI (`bin/fit-pathway.js`) creates the
template loader once and passes it through to commands that need it. Commands
that call `loadAgentTemplate(dataDir)` become
`loadAgentTemplate(templateLoader, dataDir)`.

**Files to update:**

- `products/pathway/src/commands/agent.js` — imports `loadAgentTemplate`,
  `loadSkillTemplate`, `loadSkillInstallTemplate`, `loadSkillReferenceTemplate`
- `products/pathway/src/commands/job.js` — likely imports `loadJobTemplate`
- `products/pathway/src/commands/skill.js` — imports `loadSkillTemplate`
- `products/pathway/src/formatters/agent/profile.js` — if it uses templates
- Any other file importing from `../lib/template-loader.js`

Search: `grep -r "template-loader" products/pathway/src/`

**Verify**: `npm run check`

## Migration 3: pathway CLI composition root (small — wiring cleanup)

### Problem

`bin/fit-pathway.js` imports `loadAllData` directly from `@forwardimpact/map`
and calls it inline. After Migration 1, this import no longer exists as a bare
function. The CLI also has no logging — errors are caught and formatted but
there is no structured logging.

### Changes

Make `bin/fit-pathway.js` a proper composition root:

```javascript
import { createDataLoader } from "@forwardimpact/map";
import { createPathwayTemplateLoader } from "../src/lib/template-loader.js";

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // ... help, init, dev, build, update handling ...

  const dataDir = resolveDataPath(options);
  const loader = createDataLoader();
  const templateLoader = createPathwayTemplateLoader();

  const data = await loader.loadAllData(dataDir, {
    validate: true,
    throwOnError: true,
  });

  // Pass loader and templateLoader to commands that need them
  await handler({ data, args: options.args, options, dataDir, templateLoader });
}
```

Commands that need the template loader receive it via their context object. This
is the same pattern the commands already use for `data`, `args`, and `options` —
extending the context bag with `templateLoader`.

**Do not add libtelemetry logging to the CLI.** The pathway CLI is a user-facing
tool that outputs formatted content to stdout. Adding structured logging would
pollute the output. The current `console.error` for errors is appropriate.

**Verify**: `npm run check`

## Migration 4: basecamp extraction (large — monolith decomposition)

### Problem

`src/basecamp.js` is a 970-line monolithic file with:

1. **Module-level mutable state** — `daemonStartedAt`, `activeChildren` Set,
   `const args = process.argv.slice(2)`.
2. **Inline I/O everywhere** — `readFileSync`, `writeFileSync`, `existsSync`,
   `mkdirSync`, `cpSync`, `copyFileSync`, `readdirSync` called directly.
3. **No library integration** — Hand-rolled `log()` function instead of
   libtelemetry; hard-coded paths instead of libconfig; inline cron matching
   that could be a tested utility.
4. **No DI seams** — Functions call each other and share module-level state.
   Cannot test the scheduler without the daemon, cannot test agent waking
   without the file system.

### Target architecture

```
bin/fit-basecamp.js          ← composition root: parse args, wire deps, dispatch
  ├── Scheduler              ← cron matching, shouldWake logic, wake orchestration
  ├── AgentRunner            ← spawn agent process, capture output, update state
  ├── StateManager           ← load/save state.json, reset stale agents
  ├── ConfigManager          ← load/save scheduler.json, template resolution
  ├── KBManager              ← init, update, copyBundledFiles, mergeSettings
  └── SocketServer           ← Unix socket IPC for status/wake/shutdown
```

### Phase 1: Extract StateManager

Wraps state file I/O. Accepts fs operations and paths through constructor.

```javascript
export class StateManager {
  /**
   * @param {string} statePath - Path to state.json
   * @param {{ readFileSync: Function, writeFileSync: Function, mkdirSync: Function }} fs
   */
  constructor(statePath, fs) {
    if (!statePath) throw new Error("statePath is required");
    if (!fs) throw new Error("fs is required");
    this.#statePath = statePath;
    this.#fs = fs;
  }

  load() { /* readJSON logic */ }
  save(state) { /* writeJSON logic */ }
  resetStaleAgents(state, { reason, maxAge }) { /* returns count */ }
  updateAgentState(agentState, stdout, agentName) { /* ... */ }
}

export function createStateManager(statePath) {
  return new StateManager(statePath, { readFileSync, writeFileSync, mkdirSync });
}
```

Move `readJSON`, `writeJSON`, `resetStaleAgents`, and `updateAgentState` into
this class. The `activeChildren` set moves to `AgentRunner` (Phase 2).

### Phase 2: Extract AgentRunner

Wraps posix-spawn process management. Accepts spawn functions and state manager.

```javascript
export class AgentRunner {
  /**
   * @param {Object} spawn - posix-spawn module
   * @param {StateManager} stateManager
   * @param {Function} logFn - Logging function
   */
  constructor(spawn, stateManager, logFn) {
    if (!spawn) throw new Error("spawn is required");
    if (!stateManager) throw new Error("stateManager is required");
    if (!logFn) throw new Error("logFn is required");
    this.#spawn = spawn;
    this.#stateManager = stateManager;
    this.#log = logFn;
    this.#activeChildren = new Set();
  }

  async wake(agentName, agent, state) { /* wakeAgent logic */ }
  killActiveChildren() { /* killActiveChildren logic */ }
  get activeChildren() { return this.#activeChildren; }
}
```

Move `wakeAgent`, `findClaude`, `failAgent`, and `killActiveChildren` into this
class. The `activeChildren` module-level Set becomes a private field.

### Phase 3: Extract Scheduler

Pure scheduling logic. Accepts config loader and state manager.

```javascript
export class Scheduler {
  /**
   * @param {Function} loadConfig - Returns scheduler config
   * @param {StateManager} stateManager
   * @param {AgentRunner} agentRunner
   * @param {Function} logFn
   */
  constructor(loadConfig, stateManager, agentRunner, logFn) {
    if (!loadConfig) throw new Error("loadConfig is required");
    if (!stateManager) throw new Error("stateManager is required");
    if (!agentRunner) throw new Error("agentRunner is required");
    if (!logFn) throw new Error("logFn is required");
    this.#loadConfig = loadConfig;
    this.#stateManager = stateManager;
    this.#agentRunner = agentRunner;
    this.#log = logFn;
  }

  async wakeDueAgents() { /* ... */ }
  shouldWake(agent, agentState, now) { /* ... */ }
  computeNextWakeAt(agent, agentState, now) { /* ... */ }
}
```

Move `shouldWake`, `wakeDueAgents`, `computeNextWakeAt`, `cronMatches`,
`matchField`, and `floorToMinute` into this class. The cron helpers
(`matchField`, `cronMatches`, `floorToMinute`) can be private methods or
module-level pure functions (they are stateless).

### Phase 4: Extract KBManager

Wraps knowledge base init/update operations.

```javascript
export class KBManager {
  /**
   * @param {{ existsSync, mkdirSync, cpSync, copyFileSync, readFileSync, writeFileSync, readdirSync }} fs
   * @param {Function} logFn
   */
  constructor(fs, logFn) {
    if (!fs) throw new Error("fs is required");
    if (!logFn) throw new Error("logFn is required");
    this.#fs = fs;
    this.#log = logFn;
  }

  init(targetPath, templateDir) { /* initKB logic */ }
  update(targetPath, templateDir) { /* updateKB logic */ }
  copyBundledFiles(tpl, dest) { /* ... */ }
  mergeSettings(tpl, dest) { /* ... */ }
}
```

Move `initKB`, `updateKB`, `copyBundledFiles`, `mergeSettings`,
`requireTemplateDir`, and `getBundlePath` into this class.

### Phase 5: Extract SocketServer

Wraps the Unix socket IPC for daemon communication.

```javascript
export class SocketServer {
  /**
   * @param {string} socketPath
   * @param {Scheduler} scheduler
   * @param {AgentRunner} agentRunner
   * @param {Function} logFn
   */
  constructor(socketPath, scheduler, agentRunner, logFn) {
    if (!socketPath) throw new Error("socketPath is required");
    if (!scheduler) throw new Error("scheduler is required");
    if (!agentRunner) throw new Error("agentRunner is required");
    if (!logFn) throw new Error("logFn is required");
    this.#socketPath = socketPath;
    this.#scheduler = scheduler;
    this.#agentRunner = agentRunner;
    this.#log = logFn;
  }

  start() { /* startSocketServer logic */ }
  stop() { /* cleanup logic */ }
}
```

Move `startSocketServer`, `handleMessage`, `handleStatusRequest`, `send`, and
`requestShutdown` into this class.

### Phase 6: Update composition root

`src/basecamp.js` (or a new `bin/fit-basecamp.js` entry point) becomes the
composition root that wires all classes:

```javascript
import { readFileSync, writeFileSync, existsSync, mkdirSync, /* ... */ } from "node:fs";
import * as posixSpawn from "./posix-spawn.js";

// Paths
const HOME = homedir();
const BASECAMP_HOME = join(HOME, ".fit", "basecamp");
const CONFIG_PATH = join(BASECAMP_HOME, "scheduler.json");
const STATE_PATH = join(BASECAMP_HOME, "state.json");
const LOG_DIR = join(BASECAMP_HOME, "logs");
const SOCKET_PATH = join(BASECAMP_HOME, "basecamp.sock");

// Logging
function log(msg) { /* same log function */ }

// Wire dependencies
const fs = { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, copyFileSync, readdirSync, statSync, chmodSync, unlinkSync };
const stateManager = new StateManager(STATE_PATH, fs);
const agentRunner = new AgentRunner(posixSpawn, stateManager, log);
const scheduler = new Scheduler(() => loadConfig(), stateManager, agentRunner, log);
const kbManager = new KBManager(fs, log);
const socketServer = new SocketServer(SOCKET_PATH, scheduler, agentRunner, log);

function loadConfig() {
  return readJSON(CONFIG_PATH, { agents: {} });
}

// CLI dispatch (same switch as current code)
const commands = {
  "--daemon": () => daemon(scheduler, socketServer, stateManager),
  "--init": () => kbManager.init(args[1], requireTemplateDir()),
  "--update": () => runUpdate(kbManager),
  "--status": () => showStatus(scheduler),
  "--stop": () => requestShutdown(SOCKET_PATH),
  "--wake": () => wakeByName(scheduler, agentRunner),
  "--validate": () => validate(loadConfig),
  "--help": showHelp,
};
```

Module-level mutable state (`daemonStartedAt`, `activeChildren`) is eliminated.
`daemonStartedAt` becomes a field on a `Daemon` object or is passed as a
parameter. `activeChildren` is now inside `AgentRunner`.

### Phase 7: Add logging via console (not libtelemetry)

Basecamp runs on user machines, not in the service cluster. The current `log()`
function writes to both stdout and a log file — this is appropriate for a
user-facing daemon. **Do not replace with libtelemetry.** Instead, make the log
function injectable:

```javascript
function createLogger(logDir) {
  return function log(msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${msg}`;
    console.log(line);
    try {
      mkdirSync(logDir, { recursive: true });
      writeFileSync(join(logDir, `scheduler-${ts.slice(0, 10)}.log`), line + "\n", { flag: "a" });
    } catch { /* best effort */ }
  };
}
```

The composition root creates the logger and passes it to all classes. Tests
inject a no-op logger.

### Phase 8: Update tests

`test/scheduler.test.js` currently tests... (read to understand scope). After
extraction, tests can construct individual classes with mocks:

```javascript
// Test scheduler logic without filesystem
const stateManager = { load: () => ({ agents: {} }), save: () => {} };
const agentRunner = { wake: () => {}, killActiveChildren: () => {} };
const scheduler = new Scheduler(() => config, stateManager, agentRunner, () => {});
assert(scheduler.shouldWake(agent, agentState, now));
```

**Verify**: `npm run check`

## Migration order

Each migration is a single atomic commit. Products depend on map, so map
migrates first.

| Order | Target           | Commit scope                                                             |
| ----- | ---------------- | ------------------------------------------------------------------------ |
| 1     | map              | DataLoader + SchemaValidator + IndexGenerator + all call sites           |
| 2     | pathway template | Singleton removal + all template-loader call sites                       |
| 3     | pathway CLI      | Composition root wiring (depends on map migration landing)               |
| 4     | basecamp         | Full decomposition into 5 classes + composition root + tests             |

Migrations 2 and 3 can land in a single commit since they both touch pathway.

## Verification

After each migration commit:

```sh
npm run check          # format, lint, test, SHACL across all packages
```

After all migrations are complete:

```sh
npm run test:e2e       # E2E tests
```

**Audit checklist (run after all four migrations):**

- Zero module-level `const loader = createTemplateLoader(...)` in product source
- Zero module-level mutable state (`let`, `const` with mutation) in product
  source outside of browser code
- Zero hard-coded `fs/promises` imports in classes — fs is always injected
- Every class constructor validates all required dependencies with `throw`
- Every product module exports at least one `createXxx` factory or class
- Factory functions are the only code that creates real I/O dependencies
- `bin/` entry points serve as composition roots — they create instances and
  wire dependencies, nothing else
- All existing tests pass after migration
- Browser-side code (`src/main.js`, `src/pages/**`, `src/components/**`) is
  unchanged
