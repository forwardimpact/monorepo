# Part 03 — Pathway: Logger Migration, Dead Exports, Singleton

## Problem

Three violations in `products/pathway`:

1. **72 `console.log` calls across 17 command files.** Operational output and
   data display both go through `console.log`, polluting stdout.
2. **2 dead re-exports** in `src/commands/index.js` reference non-existent
   `serve.js` and `site.js`, causing import failures.
3. **Module-level singleton** in `src/commands/agent-list.js` line 19
   instantiates `SummaryRenderer` at module scope.

## Approach

**Logger migration:** Each `console.log` replacement follows one of two patterns
depending on the call's purpose:

- **Operational output** (progress, status, feedback) → `logger.info(msg)`
  (writes to stderr, keeps stdout clean).
- **Data output** (formatted entities, JSON, markdown) →
  `process.stdout.write(msg + "\n")` (structured data stays on stdout).

The distinction is critical: pathway commands like `fit-pathway job` emit
formatted data that downstream tools may parse. These must remain on stdout.
Build/update progress messages are operational and belong on stderr.

**Dead exports:** Delete the two lines.

**Singleton:** Move `SummaryRenderer` instantiation into the function that uses
it.

## Changes

### Step 1: Add libtelemetry dependency

**File:** `products/pathway/package.json`

Add to `dependencies`:

```json
"@forwardimpact/libtelemetry": "^0.1.33"
```

Pathway currently has no libtelemetry dependency.

### Step 2: Migrate operational files (→ logger.info)

These 6 files emit build/update/creation progress — all `console.log` calls
become `logger.info()`.

For each file: add `import { createLogger } from "@forwardimpact/libtelemetry"`
and create a logger at the top of each exported function (or accept one via
parameter if the function already receives an options object).

**Pattern:**

```javascript
import { createLogger } from "@forwardimpact/libtelemetry";

const logger = createLogger("pathway");

export async function runBuildCommand(options) {
  logger.info("Building site...");
  // ...
}
```

#### `src/commands/build.js` — 20 calls

All 20 `console.log` calls are build progress messages (lines 88, 96, 107, 112,
120, 122, 135, 137, 143, 145, 147, 155, 158, 166, 173, 176, 184, 187, 196, 221).
Replace every one with `logger.info()`.

Example — line 88–90 (welcome header):

```javascript
// Before
console.log(`\n${emoji} ${title}\n`);

// After
logger.info(`\n${emoji} ${title}\n`);
```

Example — line 120 (asset copy success):

```javascript
// Before
console.log(`  ✓ ${file}`);

// After
logger.info(`  ✓ ${file}`);
```

#### `src/commands/update.js` — 10 calls

All 10 `console.log` calls are update progress (lines 56, 65, 72, 75, 85, 104,
107, 114, 122, 126). Replace all with `logger.info()`.

#### `src/commands/build-packs.js` — 6 calls

All 6 `console.log` calls are pack generation progress (lines 470, 498, 541,
553, 560, 565). Replace all with `logger.info()`.

#### `src/commands/build-bundle.js` — 5 calls

All 5 `console.log` calls are bundle generation progress (lines 33, 54, 61, 71,
87). Replace all with `logger.info()`.

#### `src/commands/agent-io.js` — 6 calls

All 6 `console.log` calls are creation feedback messages (lines 50, 64, 79, 98,
106, 115). Replace all with `logger.info()`.

#### `src/commands/dev.js` — 2 calls

Both `console.log` calls are dev server status messages (lines 134, 194).
Replace both with `logger.info()`.

### Step 3: Migrate data-display files (→ process.stdout.write)

These 11 files emit formatted entity data for terminal or pipeline consumption.
All `console.log` calls become `process.stdout.write(msg + "\n")`.

No logger import is needed for these files — they have no operational output.

#### `src/commands/job.js` — 6 calls

Lines 44, 59, 63: markdown/text display of job entities. Lines 404, 410, 415:
JSON output.

Replace all with `process.stdout.write(... + "\n")`.

#### `src/commands/command-factory.js` — 4 calls

Lines 62, 70: formatted list output. Lines 171, 229: JSON output.

Replace all with `process.stdout.write(... + "\n")`.

#### `src/commands/tool.js` — 3 calls

Lines 36, 44, 61: tool listing output. Replace with `process.stdout.write()`.

#### `src/commands/agent-list.js` — 1 call

Line 105 (spanning lines 105–107): piped agent listing (existing comment notes
stable format). Replace with `process.stdout.write()`.

#### `src/commands/questions.js` — 2 calls

Lines 165, 199: question display. Replace with `process.stdout.write()`.

#### `src/commands/agent.js` — 2 calls

Lines 350, 365: agent display. Replace with `process.stdout.write()`.

#### `src/commands/skill.js` — 1 call

Line 68: skill markdown display. Replace with `process.stdout.write()`.

#### `src/commands/track.js` — 1 call

Line 76: track markdown display. Replace with `process.stdout.write()`.

#### `src/commands/behaviour.js` — 1 call

Line 68: behaviour markdown display. Replace with `process.stdout.write()`.

#### `src/commands/level.js` — 1 call

Line 82: level markdown display. Replace with `process.stdout.write()`.

#### `src/commands/discipline.js` — 1 call

Line 70: discipline markdown display. Replace with `process.stdout.write()`.

### Step 4: Remove dead re-exports

**File:** `src/commands/index.js`

Delete lines 19–20:

```javascript
export { runServeCommand } from "./serve.js";
export { runSiteCommand } from "./site.js";
```

Neither `serve.js` nor `site.js` exists. These cause import failures when
`@forwardimpact/pathway/commands` is imported.

### Step 5: Fix module-level singleton

**File:** `src/commands/agent-list.js`

Move `SummaryRenderer` instantiation from module scope (line 19) into the
function that uses it (`showAgentSummary`).

**Before (line 19):**

```javascript
const summary = new SummaryRenderer({ process });
```

**After:** Delete line 19. Inside `showAgentSummary()`, create the instance:

```javascript
export function showAgentSummary(data, agentData, options) {
  const summary = new SummaryRenderer({ process });
  // ... rest of function unchanged
}
```

## Blast radius

| Action   | File                              |
| -------- | --------------------------------- |
| Modified | `package.json`                    |
| Modified | `src/commands/build.js`           |
| Modified | `src/commands/update.js`          |
| Modified | `src/commands/build-packs.js`     |
| Modified | `src/commands/build-bundle.js`    |
| Modified | `src/commands/agent-io.js`        |
| Modified | `src/commands/dev.js`             |
| Modified | `src/commands/job.js`             |
| Modified | `src/commands/command-factory.js` |
| Modified | `src/commands/tool.js`            |
| Modified | `src/commands/agent-list.js`      |
| Modified | `src/commands/questions.js`       |
| Modified | `src/commands/agent.js`           |
| Modified | `src/commands/skill.js`           |
| Modified | `src/commands/track.js`           |
| Modified | `src/commands/behaviour.js`       |
| Modified | `src/commands/level.js`           |
| Modified | `src/commands/discipline.js`      |
| Modified | `src/commands/index.js`           |

All paths relative to `products/pathway/`.

## Ordering

1. Add dependency (Step 1) — must complete before logger imports compile.
2. Migrate operational files (Step 2) — depends on Step 1.
3. Migrate data-display files (Step 3) — independent of Steps 1–2 (no logger
   import needed).
4. Remove dead exports (Step 4) — independent.
5. Fix singleton (Step 5) — independent.

Steps 2–5 can be done in any order after Step 1.

## Risks

- **Data vs. operational misclassification.** If a `console.log` call that
  actually emits parseable data is routed to `logger.info()`, downstream
  consumers will break. When in doubt, read the surrounding code: if the output
  is structured (JSON, markdown for rendering) or explicitly noted as piped
  output, use `process.stdout.write()`.
- **Multi-line console.log calls.** Some calls span multiple lines with template
  literals. Ensure the replacement preserves the full output string, including
  trailing newlines.

## Verification

```sh
grep -rn "console\.log(" products/pathway/src/   # zero hits
bun run check:exports                             # ./commands export resolves
bun run test -- products/pathway                  # all tests pass
node -e "import('@forwardimpact/pathway/commands')"  # no import error
```
