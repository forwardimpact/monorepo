# 360 Part 02 — Migrate product CLIs

Migrate three product CLIs to use libcli. These are the most complex CLIs and
the most visible to external users. Basecamp is handled separately in
[part 05](plan-a-05.md) because it also requires a structural refactor from
flag-based commands to positional subcommands.

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

## Order

1. Migrate pathway first (it's the source of the formatting code)
2. Map, guide in any order

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

**Update other pathway files** that import from `cli-output.js`. The following
13 files import generic formatters that move to libcli — redirect their imports
to `@forwardimpact/libcli`:

| File                                           | Functions imported                                     |
| ---------------------------------------------- | ------------------------------------------------------ |
| `products/pathway/bin/fit-pathway.js`          | `formatError`                                          |
| `products/pathway/src/commands/skill.js`       | `formatTable`, `formatError`                           |
| `products/pathway/src/commands/track.js`       | `formatTable`                                          |
| `products/pathway/src/commands/agent.js`       | `formatError`, `formatSuccess`                         |
| `products/pathway/src/commands/behaviour.js`   | `formatTable`                                          |
| `products/pathway/src/commands/level.js`       | `formatTable`                                          |
| `products/pathway/src/commands/driver.js`      | `formatTable`, `formatHeader`, `formatSubheader`, `formatBullet` |
| `products/pathway/src/commands/discipline.js`  | `formatTable`                                          |
| `products/pathway/src/commands/job.js`         | `formatTable`                                          |
| `products/pathway/src/commands/agent-io.js`    | `formatSuccess`                                        |
| `products/pathway/src/commands/questions.js`   | `formatTable`                                          |
| `products/pathway/src/commands/stage.js`       | `formatTable`, `formatHeader`, `formatSubheader`, `formatBullet` |
| `products/pathway/src/commands/tool.js`        | `formatTable`, `formatHeader`, `formatSubheader`       |

Each file switches from `import { fn } from "../lib/cli-output.js"` to
`import { fn } from "@forwardimpact/libcli"`. Domain-specific formatters
(`formatSkillProficiency`, etc.) continue to import from the local
`cli-output.js`.

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
`parseArgs` call (line 375), and `console.error` for error output. Has no
`VERSION` constant — add one by reading `package.json` (same pattern as
fit-pathway lines 66–68):

```js
const { version: VERSION } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
```

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

#### 3b. Rewrite `products/guide/bin/fit-guide.js`

**Current state:** Repl-based interactive CLI (280 lines). The Repl's
`commands` config (lines 231–261) handles `--version`, `--init`, `--data`, and
`--streaming` as CLI flags parsed during `repl.start()`. These are CLI-time
concerns, not interactive Repl commands.

**The change:** Move all CLI flags out of the Repl and into a libcli definition.
The CLI entry point handles them before starting the Repl. The Repl becomes
purely interactive.

```js
import { createCli } from "@forwardimpact/libcli";

const definition = {
  name: "fit-guide",
  version: VERSION,
  description: "Conversational agent for the Guide knowledge platform",
  options: {
    init:      { type: "boolean", description: "Generate secrets, .env, and config" },
    data:      { type: "string",  description: "Path to framework data directory" },
    streaming: { type: "boolean", description: "Use streaming agent endpoint" },
    help:      { type: "boolean", short: "h", description: "Show this help" },
    version:   { type: "boolean", description: "Show version" },
  },
  examples: [
    'echo "Tell me about the company" | npx fit-guide',
    "npx fit-guide --init",
  ],
};

const cli = createCli(definition);
const parsed = cli.parse(process.argv.slice(2));
if (!parsed) process.exit(0);

const { values } = parsed;

// Handle one-shot CLI commands before entering Repl
if (values.init) { await runInit(); process.exit(0); }
if (values.data) dataDir = resolve(values.data);
if (values.streaming) useStreaming = true;

// Repl is now purely interactive — no CLI flag parsing
const repl = new Repl({
  prompt: "> ",
  usage,
  storage,
  state: { resource_id: null },
  commands: {},
  setup: setupServices,
  onLine: handlePrompt,
});
await repl.start();
```

**What's deleted:**

- The `commands` object passed to the Repl (lines 231–261) — `version`,
  `init`, `data`, `streaming` entries all move to the libcli definition
- The `showVersion()` function (lines 42–47) — `cli.parse()` handles
  `--version` directly

**What's kept:**

- `runInit()` function (lines 53–123) — called by the CLI entry point
- `setupServices()` function (lines 130–166) — called by Repl setup
- `handlePrompt()` function (lines 176–219) — Repl onLine handler
- All service wiring and imports

Replace `console.error()` in the catch block (line 269) with `cli.error()`.

### 4. Add Logger where missing

The spec requires every CLI to create a Logger. Check each product CLI:

- **fit-pathway**: Already creates `createLogger("pathway")` (line 385) but only
  for Finder. Keep as-is — Logger is already wired.
- **fit-map**: Already creates `createLogger()` for Finder (line 37). Keep.
- **fit-guide**: Already creates `createLogger("cli")` (line 150). Keep.
### 5. Verification

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
```

Run full test suite: `bun run check && bun run test`
