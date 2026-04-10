# 360 Part 02 — Migrate product CLIs

Migrate the four product CLIs to use libcli. These are the most complex CLIs and
the most visible to external users.

**Depends on:** Part 01 (libcli library must exist).

## Files modified

| File                                     | Change                                          |
| ---------------------------------------- | ----------------------------------------------- |
| `products/pathway/package.json`          | Add `@forwardimpact/libcli` dependency          |
| `products/pathway/src/lib/cli-output.js` | Remove generic formatters, keep domain-specific |
| `products/pathway/bin/fit-pathway.js`    | Rewrite to use Cli class                        |
| `products/map/package.json`              | Add `@forwardimpact/libcli` dependency          |
| `products/map/bin/fit-map.js`            | Rewrite to use Cli class                        |
| `products/guide/package.json`            | Add `@forwardimpact/libcli` dependency          |
| `products/guide/bin/fit-guide.js`        | Use Cli for initial parsing                     |
| `products/basecamp/package.json`         | Add `@forwardimpact/libcli` dependency          |
| `products/basecamp/src/basecamp.js`      | Rewrite CLI entry to use Cli class              |

## Order

1. Migrate pathway first (it's the source of the formatting code)
2. Map, guide, basecamp in any order

## Steps

### 1. Migrate pathway

#### 1a. Update `products/pathway/package.json`

Add to `dependencies`:

```json
"@forwardimpact/libcli": "workspace:*"
```

#### 1b. Trim `products/pathway/src/lib/cli-output.js`

Remove all generic functions that now live in libcli. Keep only the
domain-specific formatters that pathway needs for its own output:

**Remove** (now in libcli):

- `colors` object (lines 9–23)
- `supportsColor()` (lines 29–33)
- `colorize()` (lines 41–44) — was not exported but was used internally
- `formatHeader()` (lines 51–53)
- `formatSubheader()` (lines 60–62)
- `formatListItem()` (lines 71–75)
- `formatBullet()` (lines 83–87)
- `formatTable()` (lines 97–126)
- `formatError()` (lines 214–216)
- `formatSuccess()` (lines 223–225)
- `formatWarning()` (lines 235–237)
- `horizontalRule()` (lines 244–246)
- `formatSection()` (lines 254–256)
- `indent()` (lines 264–270)

**Keep** (domain-specific, stays in pathway):

- `formatSkillProficiency()` (lines 133–143)
- `formatBehaviourMaturity()` (lines 150–161)
- `formatModifier()` (lines 168–175)
- `formatPercent()` (lines 182–193)
- `formatChange()` (lines 200–207)

**Update kept functions** to import `colorize` and `colors` from libcli:

```js
import { colorize, colors } from "@forwardimpact/libcli";
```

The kept functions currently call the local `colorize()` — they switch to the
libcli import. Behavior is identical (the default `proc` parameter handles
production use).

**Update other pathway files** that import from `cli-output.js`. Search for
imports of the removed functions across `products/pathway/src/` and update them
to import from `@forwardimpact/libcli` instead. Common imports to redirect:

- `formatTable` — used in command handlers for tabular output
- `formatHeader`, `formatSubheader` — used in command handlers for section
  titles
- `formatError` — used in `bin/fit-pathway.js` (line 41) and command handlers
- `formatSection`, `formatBullet`, `formatListItem` — used in command handlers
- `horizontalRule`, `indent` — used in command handlers

#### 1c. Rewrite `products/pathway/bin/fit-pathway.js`

**Current state:** 440 lines with a 150-line `HELP_TEXT` const, custom
`parseArgs()` function (lines 297–348), `BOOLEAN_FLAGS`/`VALUE_FLAGS` tables,
and manual `--help`/`--version` handling.

**Target state:** ~80 lines using the Cli class.

Create a definition object capturing pathway's commands and options:

```js
import { createCli } from "@forwardimpact/libcli";

const definition = {
  name: "fit-pathway",
  version: VERSION,
  description: "Career progression for engineering frameworks",
  commands: [
    { name: "discipline", args: "[<id>]", description: "Show disciplines" },
    { name: "level", args: "[<id>]", description: "Show levels" },
    { name: "track", args: "[<id>]", description: "Show tracks" },
    { name: "behaviour", args: "[<id>]", description: "Show behaviours" },
    { name: "skill", args: "[<id>]", description: "Show skills" },
    { name: "driver", args: "[<id>]", description: "Show drivers" },
    { name: "stage", args: "[<id>]", description: "Show stages" },
    { name: "tool", args: "[<name>]", description: "Show tools" },
    { name: "job", args: "[<discipline> <level>]", description: "Generate job definition" },
    { name: "interview", args: "<discipline> <level>", description: "Generate interview questions" },
    { name: "progress", args: "<discipline> <level>", description: "Career progression analysis" },
    { name: "questions", args: "[options]", description: "Browse interview questions" },
    { name: "agent", args: "[<discipline>]", description: "Generate AI agent profile" },
    { name: "dev", args: "[--port=PORT]", description: "Run live development server" },
    { name: "build", args: "[--output=PATH]", description: "Generate static site" },
    { name: "update", args: "[--url=URL]", description: "Update local installation" },
  ],
  options: {
    list:       { type: "boolean", short: "l", description: "Output IDs only (for piping)" },
    json:       { type: "boolean", description: "Output as JSON" },
    data:       { type: "string", description: "Path to data directory" },
    track:      { type: "string", description: "Track specialization" },
    level:      { type: "string", description: "Target level" },
    type:       { type: "string", description: "Interview type", default: "full" },
    compare:    { type: "string", description: "Compare to level" },
    format:     { type: "string", description: "Output format" },
    output:     { type: "string", description: "Output path" },
    stage:      { type: "string", description: "Lifecycle stage" },
    checklist:  { type: "string", description: "Handoff checklist stage" },
    maturity:   { type: "string", description: "Filter by behaviour maturity" },
    skill:      { type: "string", description: "Filter by skill ID" },
    behaviour:  { type: "string", description: "Filter by behaviour ID" },
    capability: { type: "string", description: "Filter by capability" },
    port:       { type: "string", description: "Dev server port" },
    path:       { type: "string", description: "File path" },
    url:        { type: "string", description: "URL for update" },
    role:       { type: "string", description: "Role filter" },
    stats:      { type: "boolean", description: "Show detailed statistics" },
    "all-stages": { type: "boolean", description: "Show all stages" },
    agent:      { type: "boolean", description: "Output as agent format" },
    skills:     { type: "boolean", description: "Output skill IDs" },
    tools:      { type: "boolean", description: "Output tool names" },
    help:       { type: "boolean", short: "h", description: "Show this help" },
    version:    { type: "boolean", short: "v", description: "Show version" },
  },
  examples: [
    "fit-pathway discipline backend",
    "fit-pathway job software_engineering J060 --track=platform",
    "fit-pathway interview software_engineering J060 --json",
    "fit-pathway agent software_engineering --track=platform",
  ],
};
```

**Replace the main() function:**

```js
async function main() {
  const cli = createCli(definition);
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const { values, positionals } = parsed;
  const [command, ...args] = positionals;

  if (!command) {
    cli.parse(["--help"]); // show help when no command given
    process.exit(0);
  }

  // data directory resolution (keep existing Finder logic)
  let dataDir;
  if (values.data) {
    dataDir = resolve(values.data);
  } else {
    const logger = createLogger("pathway");
    const finder = new Finder(fs, logger, process);
    try {
      dataDir = join(finder.findData("data", homedir()), "pathway");
    } catch {
      cli.error("No data directory found. Use --data=<path> to specify location.");
      process.exit(1);
    }
  }

  // Special commands (dev, build, update)
  if (command === "dev") { await runDevCommand({ dataDir, options: values }); return; }
  if (command === "build") { await runBuildCommand({ dataDir, options: values }); process.exit(0); }
  if (command === "update") { await runUpdateCommand({ dataDir, options: values }); process.exit(0); }

  const handler = COMMANDS[command];
  if (!handler) {
    cli.usageError(`unknown command "${command}"`);
    process.exit(2);
  }

  try {
    const loader = createDataLoader();
    const templateLoader = createTemplateLoader(TEMPLATE_DIR);
    const data = await loader.loadAllData(dataDir);
    validateAllData(data);
    await handler({ data, args, options: values, dataDir, templateLoader, loader });
  } catch (error) {
    cli.error(error.message);
    process.exit(1);
  }
}
```

**What's deleted:**

- `HELP_TEXT` const (lines 86–234) — replaced by definition
- `BOOLEAN_FLAGS`, `NEGATION_FLAGS`, `VALUE_FLAGS` objects (lines 237–274)
- `parseValueFlag()` function (lines 282–290)
- `parseArgs()` function (lines 297–348) — replaced by `cli.parse()`
- `printHelp()` function (lines 353–355)

**What's kept:**

- `COMMANDS` dispatch table (lines 70–84)
- Command handler imports (lines 45–59)
- Data directory resolution logic
- Special command handling (dev, build, update)

**Compatibility note:** The current custom `parseArgs` accepts `--no-clean` as a
negation flag. `node:util parseArgs` supports `--no-` prefixed negation for
boolean flags natively. Add `clean: { type: "boolean", default: true }` to the
options and it will work.

### 2. Migrate map

#### 2a. Update `products/map/package.json`

Add `@forwardimpact/libcli` dependency.

#### 2b. Rewrite `products/map/bin/fit-map.js`

**Current state:** 448 lines with `showHelp()` function (line 235), inline
`parseArgs` call (line 375), and `console.error` for error output.

Create a definition object. Map has subcommands with sub-subcommands
(`people validate`, `activity start`). Since libcli doesn't do nested subcommand
routing, represent the top-level commands in the definition and keep the
existing dispatcher functions:

```js
const definition = {
  name: "fit-map",
  version: VERSION,
  description: "Data validation and management for Engineering Pathway",
  commands: [
    { name: "init", description: "Create ./data/pathway/ with starter framework data" },
    { name: "validate", description: "Run validation (default: JSON schema)" },
    { name: "generate-index", description: "Generate _index.yaml files" },
    { name: "export", description: "Render base entities to HTML microdata" },
    { name: "people", args: "<validate|push> <file>", description: "Validate or push people files" },
    { name: "activity", args: "<start|stop|status|migrate|transform|verify>", description: "Manage activity stack" },
    { name: "getdx", args: "sync", description: "Extract + transform GetDX snapshots" },
  ],
  options: {
    data:       { type: "string", description: "Path to data directory" },
    output:     { type: "string", description: "Output directory for export" },
    url:        { type: "string", description: "Supabase URL" },
    "base-url": { type: "string", description: "GetDX API base URL" },
    json:       { type: "boolean", description: "Output as JSON" },
    shacl:      { type: "boolean", description: "SHACL schema validation" },
    help:       { type: "boolean", short: "h", description: "Show this help" },
    version:    { type: "boolean", description: "Show version" },
  },
  examples: [
    "fit-map init",
    "fit-map validate",
    "fit-map validate --shacl",
    "fit-map people validate ./org/people.yaml",
    "fit-map activity start",
  ],
};
```

Replace the `showHelp()` function and manual `--help` check with `cli.parse()`.
Replace `console.error` in error paths with `cli.error()` and
`cli.usageError()`. Keep the dispatcher functions (`dispatchPeople`,
`dispatchActivity`, etc.) — these handle sub-subcommand routing which libcli
doesn't own.

### 3. Migrate guide

#### 3a. Update `products/guide/package.json`

Add `@forwardimpact/libcli` dependency.

#### 3b. Update `products/guide/bin/fit-guide.js`

**Current state:** Repl-based interactive CLI (279 lines). The `usage` variable
(line 18) is a string passed to Repl configuration.

Guide is a Repl-based CLI — the migration is minimal:

- Add a definition object with `name`, `version`, `description`, and a `usage`
  string
- Use `createCli(definition)` to handle `--help` and `--version` before entering
  the Repl session
- The Repl session itself is unchanged
- Replace `console.error()` in the catch block (line 269) with `cli.error()` or
  `logger.exception()`

```js
const cli = createCli(definition);
const parsed = cli.parse(process.argv.slice(2));
if (!parsed) process.exit(0);

// Existing Repl setup continues from here
```

### 4. Migrate basecamp

#### 4a. Update `products/basecamp/package.json`

Add `@forwardimpact/libcli` dependency.

#### 4b. Rewrite `products/basecamp/src/basecamp.js`

**Current state:** 348 lines with `showHelp()` function (line 281), manual
`args[0]` command dispatch (lines 304–347), and `console.error` for errors.

Create a definition object:

```js
const definition = {
  name: "fit-basecamp",
  version: VERSION,
  description: "Schedule autonomous agents across knowledge bases",
  commands: [
    { name: "--daemon", description: "Run continuously (poll every 60s)" },
    { name: "--wake", args: "<agent>", description: "Wake a specific agent immediately" },
    { name: "--init", args: "<path>", description: "Initialize a new knowledge base" },
    { name: "--update", args: "[path]", description: "Update KB with latest CLAUDE.md, agents and skills" },
    { name: "--stop", description: "Gracefully stop daemon and all running agents" },
    { name: "--validate", description: "Validate agent definitions exist" },
    { name: "--status", description: "Show agent status" },
  ],
  options: {
    daemon:   { type: "boolean", description: "Run as daemon" },
    wake:     { type: "string", description: "Agent to wake" },
    init:     { type: "string", description: "KB path to initialize" },
    update:   { type: "string", description: "KB path to update" },
    stop:     { type: "boolean", description: "Stop daemon" },
    validate: { type: "boolean", description: "Validate definitions" },
    status:   { type: "boolean", description: "Show agent status" },
    help:     { type: "boolean", short: "h", description: "Show this help" },
  },
};
```

**Note:** Basecamp uses flags as commands (`--daemon`, `--wake <name>`, etc.)
rather than positional subcommands. The `commands` array in the definition is
**cosmetic only** — it populates the "Commands:" section of help output so users
see the familiar flag-based interface. Actual dispatch goes through the
`options` values (`values.daemon`, `values.wake`, etc.), not positional command
routing. Do not attempt to match positionals against the commands array for
basecamp.

Replace `showHelp()` and the command dispatch block with:

```js
const cli = createCli(definition);
const parsed = cli.parse(process.argv.slice(2));
if (!parsed) process.exit(0);

const { values } = parsed;
if (values.daemon) { daemon(); }
else if (values.wake) { /* wake logic */ }
else if (values.init) { /* init logic */ }
else if (values.update !== undefined) { /* update logic */ }
else if (values.stop) { /* stop logic */ }
else if (values.validate) { validate(); }
else if (values.status) { showStatus(); }
else { await scheduler.wakeDueAgents(); }
```

Replace `console.error` calls with `cli.error()` where the error should carry
the CLI name prefix. Keep the custom `log()` function for daemon operational
output — that's internal logging, not CLI error output.

### 5. Add Logger where missing

The spec requires every CLI to create a Logger. Check each product CLI:

- **fit-pathway**: Already creates `createLogger("pathway")` (line 385) but only
  for Finder. Keep as-is — Logger is already wired.
- **fit-map**: Already creates `createLogger()` for Finder (line 37). Keep.
- **fit-guide**: Already creates `createLogger("cli")` (line 150). Keep.
- **fit-basecamp**: Has a custom `createLogger` (line 51) that writes to files.
  This is intentional for daemon logging. Add a libtelemetry Logger for error
  output alongside the existing file logger, or leave as-is since basecamp's
  logging model is deliberately different (file-based).

### 6. Verification

For each product CLI:

```sh
bunx fit-pathway --help           # One-line-per-command format
bunx fit-pathway --help --json    # JSON output
bunx fit-pathway --version        # Version number
bunx fit-pathway badcommand       # "fit-pathway: error: unknown command..."
bunx fit-pathway job software_engineering J060  # Normal operation unchanged

bunx fit-map --help
bunx fit-map --help --json
bunx fit-map validate             # Normal operation unchanged

bunx fit-guide --help
bunx fit-guide --help --json

bunx fit-basecamp --help
bunx fit-basecamp --help --json
bunx fit-basecamp --status        # Normal operation unchanged
```

Run full test suite: `bun run check && bun run test`
