# 120: Implementation Plan

## Design Decision

Extend the existing `Finder` class in `libraries/libutil/finder.js` with a
`findData(baseName, homeDir)` method. Finder already owns upward path traversal
(`findUpward`) and is used by libstorage for the same pattern. Adding data path
resolution here avoids a new module and reuses existing infrastructure.

The `homeDir` parameter (a string) is passed by callers — composition roots call
`os.homedir()` and inject the result. This avoids adding `os` to Finder's
constructor and changing all existing call sites.

The `--data` CLI flag is handled by each product's bin/ file before calling
`findData` — Finder doesn't need to know about CLI args.

## Changes

### 1. Extend `libraries/libutil/finder.js`

Add `findData` method to the Finder class:

```js
/**
 * Resolve a data directory by upward traversal, with HOME fallback.
 * @param {string} baseName - Directory name to find (e.g. "data")
 * @param {string} homeDir - User home directory path
 * @returns {string} Absolute path to found directory
 */
findData(baseName, homeDir) {
  const cwd = this.#process.cwd();
  const found = this.findUpward(cwd, baseName);
  if (found) return found;

  const homePath = path.join(homeDir, ".fit", baseName);
  if (existsSync(homePath)) return homePath;

  throw new Error(
    `No ${baseName} directory found from ${cwd} or ${homePath}.`,
  );
}
```

Uses `findUpward` from CWD (walks up to 3 parents), then checks
`~/.fit/{baseName}/`.

**Sync fs note:** This method uses `existsSync` for the HOME check, consistent
with `findUpward` which also uses `existsSync` rather than the injected async
`this.#fs`. Both methods are synchronous path-resolution operations where async
I/O adds complexity without benefit.

**Error message:** The error describes the problem without referencing CLI
flags. Each caller adds its own `--data` guidance when catching the error.

### 2. Add tests in `libraries/libutil/test/finder.test.js`

Add `describe("findData", ...)` block with test cases:

- Finds `data/` in CWD via `findUpward`
- Finds `data/` in a parent directory via `findUpward`
- Falls back to `~/.fit/data/` when CWD traversal fails
- Throws when neither CWD traversal nor HOME fallback finds the directory
- CWD takes priority over HOME (even when both exist)

Uses real temp directories (matching the existing test pattern with `tempDir`).

### 3. Modify `products/pathway/bin/fit-pathway.js`

- **Delete** local `resolveDataPath` function (lines 340–381)
- **Remove** `PATHWAY_DATA` env var support
- **Import** `Finder` from `@forwardimpact/libutil`, `homedir` from `os`,
  `createLogger` from `@forwardimpact/libtelemetry`
- **Change** call site (~line 407):

```js
import { Finder } from "@forwardimpact/libutil";
import { homedir } from "os";
import { createLogger } from "@forwardimpact/libtelemetry";
import fs from "fs/promises";

// In main():
let dataDir;
if (options.data) {
  dataDir = resolve(options.data);
} else {
  const logger = createLogger("pathway");
  const finder = new Finder(fs, logger, process);
  try {
    dataDir = join(finder.findData("data", homedir()), "pathway");
  } catch {
    throw new Error(
      "No data directory found. Use --data=<path> to specify location.",
    );
  }
}
```

**Logger:** fit-pathway currently has no logger. Create one via
`createLogger("pathway")` from libtelemetry. The Finder constructor requires it.
The logger instance can be reused if pathway adds logging elsewhere later.

### 4. Modify `products/map/bin/fit-map.js`

- **Delete** `dirExists` helper (lines 54–61) and `findDataDir` (lines 66–91)
- **Import** `Finder` from `@forwardimpact/libutil`, `homedir` from `os`,
  `createLogger` from `@forwardimpact/libtelemetry`
- **Change** call sites:

```js
let dataDir;
if (options.data) {
  const resolved = resolve(options.data);
  try {
    await fs.access(resolved);
  } catch {
    throw new Error(`Data directory not found: ${options.data}`);
  }
  dataDir = resolved;
} else {
  const logger = createLogger("map");
  const finder = new Finder(fs, logger, process);
  try {
    dataDir = join(finder.findData("data", homedir()), "pathway");
  } catch {
    throw new Error(
      "No data directory found. Use --data=<path> to specify location.",
    );
  }
}
```

**Note:** The old `dirExists` helper is replaced with `fs.access` for the
explicit `--data` path check. The auto-discovery path uses Finder directly.

### 5. Modify `products/guide/bin/fit-guide.js`

- **Import** `Finder` from `@forwardimpact/libutil` and `homedir` from `os`
- **Add** `--data` flag to CLI argument parsing
- **Add** data path resolution using the existing `logger` (fit-guide already
  creates one via `createLogger("cli")`):

```js
import { Finder } from "@forwardimpact/libutil";
import { homedir } from "os";

// After existing logger/config setup:
let dataDir;
if (options.data) {
  dataDir = resolve(options.data);
} else {
  const finder = new Finder(fs, logger, process);
  try {
    dataDir = finder.findData("data", homedir());
  } catch {
    throw new Error(
      "No data directory found. Use --data=<path> to specify location.",
    );
  }
}
```

**Consumer:** The resolved `dataDir` is passed to guide's `DataLoader` for
loading framework YAML files (disciplines, capabilities, behaviours) directly
from disk, enabling guide to interpret artifacts against skill markers without
requiring the gRPC agent service to be running.

### 6. Change `fit-universe` output to `data/`

The generation pipeline currently writes to `examples/` subdirectories. Change
all output paths to write to `data/` instead:

#### `libraries/libuniverse/pipeline.js`

Replace output path prefixes:

| Before                     | After             |
| -------------------------- | ----------------- |
| `examples/organizational/` | `data/knowledge/` |
| `examples/pathway/`        | `data/pathway/`   |
| `examples/activity/`       | `data/activity/`  |
| `examples/personal/`       | `data/personal/`  |

#### `libraries/libuniverse/bin/fit-universe.js`

Update hardcoded `examples/activity/raw/` and `examples/activity/evidence.json`
paths to `data/activity/raw/` and `data/activity/evidence.json`.

#### `Makefile`

- **`data-init`**: Remove the conditional copy from `examples/organizational/`
  to `data/knowledge/`. The `generate` targets now write directly to `data/`.
  Keep the directory creation step.
- **`generate` targets**: No command changes needed — the pipeline code handles
  the new paths.

#### `examples/universe.dsl`

Stays at `examples/universe.dsl`. This is an input file, not output.

## Files

| File                                        | Action                                                |
| ------------------------------------------- | ----------------------------------------------------- |
| `libraries/libutil/finder.js`               | Add `findData` method                                 |
| `libraries/libutil/test/finder.test.js`     | Add `findData` test cases                             |
| `products/pathway/bin/fit-pathway.js`       | Replace local resolution, add logger                  |
| `products/map/bin/fit-map.js`               | Replace local resolution                              |
| `products/guide/bin/fit-guide.js`           | Add data path resolution, add `--data` flag           |
| `libraries/libuniverse/pipeline.js`         | Change output paths from `examples/` to `data/`       |
| `libraries/libuniverse/bin/fit-universe.js` | Change output paths from `examples/` to `data/`       |
| `Makefile`                                  | Remove `examples/ → data/` copy step from `data-init` |

## Verification

1. `node --test libraries/libutil/test/finder.test.js` — new + existing tests
   pass
2. `npm test` — all tests pass
3. `make synthetic` — writes to `data/` not `examples/`
4. `npx fit-map validate` — finds `data/pathway/` via upward traversal
5. `npx fit-pathway skill --list` — works from monorepo root
6. `npx fit-map validate --data=/some/path` — CLI flag override works
7. `npm run lint && npm run format` — clean
