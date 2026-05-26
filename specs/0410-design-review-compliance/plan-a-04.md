# Part 04 — Basecamp + Libdoc: Logger Migration

## Problem

Two packages use `console.log` for operational output instead of `createLogger`
from `@forwardimpact/libtelemetry`:

- **basecamp:** 23 occurrences across 3 files.
- **libdoc:** 10 occurrences across 2 files.

All calls are operational messages (status, progress, validation output) — none
emit structured data for pipeline consumption.

## Changes

### Basecamp

#### Step 1: Add libtelemetry dependency

**File:** `products/basecamp/package.json`

Add to `dependencies`:

```json
"@forwardimpact/libtelemetry": "^0.1.33"
```

Basecamp currently has only `@forwardimpact/libcli` as a dependency.

#### Step 2: Migrate src/basecamp.js — 12 calls

**File:** `products/basecamp/src/basecamp.js`

Add import:

```javascript
import { createLogger } from "@forwardimpact/libtelemetry";
const logger = createLogger("basecamp");
```

Replace all 12 `console.log` calls with `logger.info()`:

| Line | Current purpose                     |
| ---- | ----------------------------------- |
| 64   | Custom logger output line           |
| 205  | KB update progress                  |
| 215  | Scheduler status header             |
| 219  | No agents configured message        |
| 223  | "Agents:" list header               |
| 228  | Agent status details (multi-line)   |
| 253  | No agents validation message        |
| 257  | Validation header                   |
| 262  | Validation failure (FAIL)           |
| 268  | Validation failure (path not found) |
| 275  | Validation result (multi-line)      |
| 281  | Final validation summary            |

**Note on line 64:** This is inside a custom logger callback. The callback
itself uses `console.log(line)` to emit a line. Replace with
`logger.info(line)`. If the callback is passed to an external consumer, ensure
the signature remains compatible.

#### Step 3: Migrate src/kb-manager.js — 7 calls

**File:** `products/basecamp/src/kb-manager.js`

Add import:

```javascript
import { createLogger } from "@forwardimpact/libtelemetry";
const logger = createLogger("basecamp");
```

Replace all 7 `console.log` calls with `logger.info()`:

| Line | Current purpose                  |
| ---- | -------------------------------- |
| 85   | CLAUDE.md update confirmation    |
| 101  | Subdirectory update confirmation |
| 119  | Settings creation confirmation   |
| 148  | Settings update confirmation     |
| 150  | Settings up-to-date message      |
| 180  | KB update summary (multi-line)   |
| 197  | KB updated final message         |

#### Step 4: Migrate src/socket-server.js — 4 calls

**File:** `products/basecamp/src/socket-server.js`

Add import:

```javascript
import { createLogger } from "@forwardimpact/libtelemetry";
const logger = createLogger("basecamp");
```

Replace all 4 `console.log` calls with `logger.info()`:

| Line | Current purpose                |
| ---- | ------------------------------ |
| 284  | Daemon not running (no socket) |
| 290  | Shutdown timed out             |
| 304  | Daemon stopped                 |
| 312  | Daemon not running (refused)   |

### Libdoc

Libdoc already has `@forwardimpact/libtelemetry` in its dependencies — no
package.json change needed.

#### Step 5: Migrate src/builder.js — 7 calls

**File:** `libraries/libdoc/src/builder.js`

Add import:

```javascript
import { createLogger } from "@forwardimpact/libtelemetry";
const logger = createLogger("libdoc");
```

Replace all 7 `console.log` calls with `logger.info()`:

| Line | Current purpose                     |
| ---- | ----------------------------------- |
| 157  | Asset copy confirmation (✓ assets/) |
| 175  | File copy confirmation (✓ name)     |
| 277  | Sitemap generation (✓ sitemap.xml)  |
| 342  | llms.txt augmentation confirmation  |
| 451  | HTML page write confirmation        |
| 544  | "Building documentation..." start   |
| 591  | "Documentation build complete!"     |

#### Step 6: Migrate src/server.js — 3 calls

**File:** `libraries/libdoc/src/server.js`

Add import:

```javascript
import { createLogger } from "@forwardimpact/libtelemetry";
const logger = createLogger("libdoc");
```

Replace all 3 `console.log` calls with `logger.info()`:

| Line | Current purpose              |
| ---- | ---------------------------- |
| 36   | File watch start message     |
| 48   | Rebuild trigger notification |
| 151  | Server ready URL             |

## Blast radius

| Action   | File                                     |
| -------- | ---------------------------------------- |
| Modified | `products/basecamp/package.json`         |
| Modified | `products/basecamp/src/basecamp.js`      |
| Modified | `products/basecamp/src/kb-manager.js`    |
| Modified | `products/basecamp/src/socket-server.js` |
| Modified | `libraries/libdoc/src/builder.js`        |
| Modified | `libraries/libdoc/src/server.js`         |

## Ordering

1. Add basecamp dependency (Step 1).
2. Steps 2–6 can proceed in any order after Step 1.

Steps 5–6 (libdoc) are fully independent of Steps 1–4 (basecamp) and can run in
parallel.

## Verification

```sh
grep -rn "console\.log(" products/basecamp/src/   # zero hits
grep -rn "console\.log(" libraries/libdoc/src/    # zero hits
bun run test -- products/basecamp                  # tests pass
bun run test -- libraries/libdoc                   # tests pass
```
