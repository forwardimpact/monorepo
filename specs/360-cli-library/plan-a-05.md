# 360 Part 05 — Refactor Basecamp CLI

Refactor fit-basecamp from flag-based commands (`--daemon`, `--wake`, `--init`)
to positional subcommands (`daemon`, `wake`, `init`). This is a clean break —
no backwards compatibility with the old flag syntax.

**Depends on:** Part 01 (libcli library must exist).

## Why a separate part

Basecamp is the only CLI that uses flags as pseudo-commands. Every other CLI in
the monorepo uses positional subcommands for dispatch. The current design:

```
fit-basecamp --daemon
fit-basecamp --wake <agent>
fit-basecamp --init <path>
```

This is confusing: `--daemon` appears under "Commands:" in help output, but
it's syntactically an option. Agents and users parsing `--help` output see
"Commands:" and expect positional arguments. The flag-as-command pattern also
prevents basecamp from fitting cleanly into libcli's definition model, where
`commands` are positional and `options` are flags.

The new design:

```
fit-basecamp daemon
fit-basecamp wake <agent>
fit-basecamp init <path>
```

This aligns basecamp with every other CLI in the suite.

## Files modified

| File                                | Change                                        |
| ----------------------------------- | --------------------------------------------- |
| `products/basecamp/package.json`    | Add `@forwardimpact/libcli` dependency        |
| `products/basecamp/src/basecamp.js` | Rewrite CLI entry: flags → positional commands |
| `products/basecamp/test/basecamp-cli.test.js` | **New** — CLI dispatch tests         |

## Steps

### 1. Update `products/basecamp/package.json`

Add to `dependencies`:

```json
"@forwardimpact/libcli": "workspace:*"
```

### 2. Rewrite `products/basecamp/src/basecamp.js`

**Current state:** 348 lines. Flag-based dispatch at lines 304–347 using a
`commands` object keyed by `--flag` strings. `showHelp()` function at line 281.
Custom `createLogger` for file-based daemon logging at line 51.

#### 2a. Create definition

```js
import { createCli } from "@forwardimpact/libcli";

const definition = {
  name: "fit-basecamp",
  version: VERSION,
  description: "Schedule autonomous agents across knowledge bases",
  commands: [
    { name: "daemon", description: "Run continuously (poll every 60s)" },
    { name: "wake", args: "<agent>", description: "Wake a specific agent immediately" },
    { name: "init", args: "<path>", description: "Initialize a new knowledge base" },
    { name: "update", args: "[path]", description: "Update KB with latest CLAUDE.md, agents and skills" },
    { name: "stop", description: "Gracefully stop daemon and all running agents" },
    { name: "validate", description: "Validate agent definitions exist" },
    { name: "status", description: "Show agent status" },
  ],
  options: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
  },
};
```

This is a clean command model — commands are positional, options are flags.
No semantic confusion between "Commands:" and "Options:" in help output.

#### 2b. Replace CLI entry point

**Delete:**

- `showHelp()` function (lines 281–300)
- `requireArg()` function (lines 308–314)
- `commands` dispatch object (lines 316–345)
- The final dispatch line (line 347)

**Replace with:**

```js
const cli = createCli(definition);
const parsed = cli.parse(process.argv.slice(2));
if (!parsed) process.exit(0);

const { positionals } = parsed;
const [command, ...args] = positionals;

mkdirSync(BASECAMP_HOME, { recursive: true });

const COMMANDS = {
  daemon,
  wake: async () => {
    if (!args[0]) {
      cli.usageError("missing required argument <agent>");
      process.exit(2);
    }
    const config = loadConfig();
    const state = stateManager.load();
    const agent = config.agents[args[0]];
    if (!agent) {
      cli.error(
        `agent "${args[0]}" not found. Available: ${Object.keys(config.agents).join(", ") || "(none)"}`,
      );
      process.exit(1);
    }
    await agentRunner.wake(args[0], agent, state);
  },
  init: () => {
    if (!args[0]) {
      cli.usageError("missing required argument <path>");
      process.exit(2);
    }
    kbManager.init(args[0], requireTemplateDir());
  },
  update: () => runUpdate(args),
  stop: async () => {
    const stopped = await requestShutdown(SOCKET_PATH);
    if (!stopped) process.exit(1);
  },
  validate,
  status: showStatus,
};

const handler = COMMANDS[command];
if (command && !handler) {
  cli.usageError(`unknown command "${command}"`);
  process.exit(2);
}

await (handler || (() => scheduler.wakeDueAgents()))();
```

#### 2c. Update `runUpdate()` to accept positional args

The current `runUpdate(cliArgs)` reads `cliArgs[1]` (because `cliArgs[0]` was
`--update`). After refactoring, `args` already has the flag stripped — change
`runUpdate` to read `args[0]` directly:

```js
function runUpdate(args) {
  if (args[0]) {
    kbManager.update(args[0], requireTemplateDir());
    return;
  }
  // ... rest unchanged (iterate configured KBs)
}
```

Update the error message in `runUpdate` to use the new syntax:

```js
console.error(
  "No knowledge bases configured and no path given.\n" +
    "Usage: fit-basecamp update [path]",
);
```

#### 2d. Replace `console.error` with `cli.error()`

All `console.error` calls in the CLI dispatch paths become `cli.error()` for
consistent prefixed error output. The custom file-based `log()` function stays
unchanged — it's daemon operational logging, not CLI error output.

#### 2e. Keep the `#!/usr/bin/env bun` shebang

Basecamp uses bun directly (macOS app bundle, posix-spawn). This is intentional
and unchanged.

### 3. Write CLI dispatch tests

Create `products/basecamp/test/basecamp-cli.test.js` with tests for the new
command dispatch. Since basecamp's `main()` has side effects (file I/O, daemon
loops), test the definition and argument parsing in isolation:

- `cli.parse(["daemon"])` returns `{ positionals: ["daemon"] }`
- `cli.parse(["wake", "my-agent"])` returns correct positionals
- `cli.parse(["--help"])` returns null (help handled)
- `cli.parse(["badcmd"])` returns `{ positionals: ["badcmd"] }` (dispatch
  handles unknown command error)
- `cli.parse([])` returns `{ positionals: [] }` (default: wake due agents)

### 4. Verification

```sh
bun install
bun run check
bun run test

# Smoke tests
bunx fit-basecamp --help           # New positional command format
bunx fit-basecamp --help --json    # JSON output
bunx fit-basecamp --version        # Version number
bunx fit-basecamp status           # Normal operation
bunx fit-basecamp validate         # Normal operation
bunx fit-basecamp badcmd           # "fit-basecamp: error: unknown command..."
bunx fit-basecamp wake             # "fit-basecamp: error: missing required..."
```

### Command mapping reference

Old → new syntax for all docs and skill updates (part 06):

| Old (flag-based)               | New (positional)             |
| ------------------------------ | ---------------------------- |
| `fit-basecamp --daemon`        | `fit-basecamp daemon`        |
| `fit-basecamp --wake <agent>`  | `fit-basecamp wake <agent>`  |
| `fit-basecamp --init <path>`   | `fit-basecamp init <path>`   |
| `fit-basecamp --update [path]` | `fit-basecamp update [path]` |
| `fit-basecamp --stop`          | `fit-basecamp stop`          |
| `fit-basecamp --validate`      | `fit-basecamp validate`      |
| `fit-basecamp --status`        | `fit-basecamp status`        |
| `fit-basecamp --help`          | `fit-basecamp --help`        |
| `fit-basecamp`                 | `fit-basecamp`               |

`--help` and the bare invocation (wake due agents) are unchanged.
