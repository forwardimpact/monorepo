# 360 Part 01 — Create libcli library

Create the `libraries/libcli/` package with all core classes, factory functions,
and tests.

## Files created

| File                                    | Purpose                                         |
| --------------------------------------- | ----------------------------------------------- |
| `libraries/libcli/package.json`         | Package manifest                                |
| `libraries/libcli/index.js`             | Public exports                                  |
| `libraries/libcli/cli.js`               | Cli class + createCli factory                   |
| `libraries/libcli/help.js`              | HelpRenderer class                              |
| `libraries/libcli/summary.js`           | SummaryRenderer class                           |
| `libraries/libcli/color.js`             | Color constants, supportsColor, colorize        |
| `libraries/libcli/format.js`            | formatTable, formatHeader, and other formatting |
| `libraries/libcli/test/cli.test.js`     | Cli class tests                                 |
| `libraries/libcli/test/help.test.js`    | HelpRenderer tests                              |
| `libraries/libcli/test/summary.test.js` | SummaryRenderer tests                           |
| `libraries/libcli/test/color.test.js`   | Color utility tests                             |
| `libraries/libcli/test/format.test.js`  | Formatting utility tests                        |

## Steps

### 1. Create package.json

```json
{
  "name": "@forwardimpact/libcli",
  "version": "0.1.0",
  "description": "Shared CLI infrastructure for the Forward Impact monorepo",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "test": "bun run node --test test/*.test.js"
  },
  "devDependencies": {
    "@forwardimpact/libharness": "workspace:*"
  }
}
```

No runtime dependencies. libcli uses only `node:util` (for `parseArgs`).
libharness is a devDependency for test mocking.

Run `bun install` after creating this file to register the workspace package.

### 2. Create color.js

Migrate the generic color infrastructure from
`products/pathway/src/lib/cli-output.js` (lines 9–44).

**Key change:** `supportsColor` and `colorize` accept a `process` parameter
instead of reading the global. This enables test injection.

```js
// ANSI color constants — same object as pathway's cli-output.js lines 9-23
export const colors = { reset, bold, dim, italic, underline, red, green,
  yellow, blue, magenta, cyan, white, gray };

// Check if output supports colors.
// @param {object} proc — process-like object with env and stdout
export function supportsColor(proc = process) {
  if (proc.env.NO_COLOR) return false;
  if (proc.env.FORCE_COLOR) return true;
  return proc.stdout?.isTTY ?? false;
}

// Wrap text with ANSI color if supported.
export function colorize(text, color, proc = process) {
  if (!supportsColor(proc)) return text;
  return `${color}${text}${colors.reset}`;
}
```

The `proc` parameter defaults to the global `process` for ergonomic use in
production code while enabling test injection.

### 3. Create format.js

Migrate the generic formatting functions from pathway's `cli-output.js`. Each
function gains a `proc` parameter (defaulting to `process`) for its internal
`colorize` calls.

Functions to migrate (pathway source lines → libcli):

| Function                                     | Pathway lines | Notes                           |
| -------------------------------------------- | ------------- | ------------------------------- |
| `formatHeader(text, proc)`                   | 51–53         | Bold + cyan                     |
| `formatSubheader(text, proc)`                | 60–62         | Bold                            |
| `formatListItem(label, value, indent, proc)` | 71–75         | Bullet + label:value            |
| `formatBullet(text, indent, proc)`           | 83–87         | Bullet only                     |
| `formatTable(headers, rows, options, proc)`  | 97–126        | Aligned columns                 |
| `formatError(message, proc)`                 | 214–216       | Red "Error: msg"                |
| `formatSuccess(message, proc)`               | 223–225       | Green text                      |
| `formatWarning(message, proc)`               | 235–237       | Yellow "Warning: msg"           |
| `horizontalRule(width, proc)`                | 244–246       | Dim dashes                      |
| `formatSection(title, content, proc)`        | 254–256       | Header + content                |
| `indent(text, spaces)`                       | 264–270       | Indentation (no color, no proc) |

All functions import `colorize` and `colors` from `./color.js`.

### 4. Create help.js — HelpRenderer class

The HelpRenderer renders a CLI definition into formatted help text.

```js
export class HelpRenderer {
  #proc;

  constructor({ process }) {
    this.#proc = process;
  }

  render(definition, stream) {
    // Build help text from definition, write to stream
  }

  renderJson(definition, stream) {
    // Write JSON.stringify of definition to stream
  }
}
```

**`render()` output format:**

```
fit-pathway 1.2.0 — Career progression for engineering frameworks

Usage: fit-pathway <command> [options]

Commands:
  discipline <id>             Show discipline details
  capability <id>             Show capability details
  job <discipline> [options]  Derive a job definition

Options:
  --level=<string>  Target level (default: mid)
  --track=<string>  Apply track modifier
  --json            Output as JSON
  --help, -h        Show this help
  --version         Show version

Examples:
  fit-pathway job backend --level=senior --track=lead
  fit-pathway interview backend --level=mid --json
```

Implementation details:

- **Header line:** `{name} {version} — {description}`. Version is omitted if not
  provided. Description is omitted if not provided.
- **Usage line:** If `definition.usage` is set, use it directly. Otherwise,
  generate `{name} <command> [options]` when commands exist, or
  `{name} [options]` when they don't.
- **Commands section:** Only rendered if `definition.commands` is non-empty.
  Each command on one line: 2-space indent, `{name} {args}` left-padded to the
  widest command, then description. Compute column width from the longest
  `name + args` string.
- **Options section:** Each option on one line. Format: `--{name}=<{type}>` for
  string options, `--{name}` for boolean options. Append `, -{short}` if short
  alias exists. Left-pad to widest option string, then description.
- **Examples section:** Only rendered if `definition.examples` is non-empty.
  Each example on one line with 2-space indent.
- **Color:** Section headers ("Commands:", "Options:", "Examples:") use
  `formatSubheader`. Header line name uses `formatHeader`. Color is conditional
  on `supportsColor(this.#proc)`.

**`renderJson()` output:**

Write the definition object as-is via `JSON.stringify(definition, null, 2)`.
This gives agents a structured representation of all commands, options, and
descriptions.

### 5. Create summary.js — SummaryRenderer class

```js
export class SummaryRenderer {
  #proc;

  constructor({ process }) {
    this.#proc = process;
  }

  render({ title, items }, stream) {
    // Write title line, then indented items with aligned labels
  }
}
```

**Output format:**

```
Generated 38 files in ./generated/
  definitions/  — Service definitions
  proto/        — Proto source files
  services/     — Service bases and clients
  types/        — Protocol Buffer types
```

Implementation:

- Write `title` followed by newline.
- For each item in `items`: compute the max label width, pad each label, write
  `  {label}  — {description}`.
- If `items` is empty, just write the title.

### 6. Create cli.js — Cli class + createCli factory

```js
import { parseArgs } from "node:util";
import { HelpRenderer } from "./help.js";

export class Cli {
  #definition;
  #proc;
  #helpRenderer;

  constructor(definition, { process, helpRenderer }) {
    this.#definition = definition;
    this.#proc = process;
    this.#helpRenderer = helpRenderer;
  }

  get name() { return this.#definition.name; }

  parse(argv) {
    // Build parseArgs-compatible options from definition.options
    const options = {};
    for (const [name, opt] of Object.entries(this.#definition.options || {})) {
      options[name] = { type: opt.type };
      if (opt.short) options[name].short = opt.short;
      if (opt.default !== undefined) options[name].default = opt.default;
    }

    const { values, positionals } = parseArgs({
      options,
      allowPositionals: true,
      args: argv,
    });

    // Handle --help
    if (values.help) {
      if (values.json) {
        this.#helpRenderer.renderJson(this.#definition, this.#proc.stdout);
      } else {
        this.#helpRenderer.render(this.#definition, this.#proc.stdout);
      }
      return null;
    }

    // Handle --version
    if (values.version && this.#definition.version) {
      this.#proc.stdout.write(this.#definition.version + "\n");
      return null;
    }

    return { values, positionals };
  }

  error(message) {
    this.#proc.stderr.write(`${this.#definition.name}: error: ${message}\n`);
    this.#proc.exitCode = 1;
  }

  usageError(message) {
    this.#proc.stderr.write(`${this.#definition.name}: error: ${message}\n`);
    this.#proc.exitCode = 2;
  }
}

export function createCli(definition) {
  const helpRenderer = new HelpRenderer({ process });
  return new Cli(definition, { process, helpRenderer });
}
```

**Design decisions:**

- `parse()` returns `null` when it handles the request (help/version), signaling
  the caller to exit. This avoids libcli calling `process.exit()` directly,
  which would make testing harder.
- `error()` and `usageError()` set `exitCode` but don't call `process.exit()`.
  The caller decides when to exit. This follows the pattern of setting exitCode
  seen in fit-codegen (line 291: `process.exitCode = 1`).
- The factory `createCli()` wires the real `process` and a real `HelpRenderer`.
  Tests bypass the factory and inject mocks.
- `allowPositionals: true` is always set — CLIs that don't want positionals can
  validate themselves. This keeps the API simple.

### 7. Create index.js

```js
export { Cli, createCli } from "./cli.js";
export { HelpRenderer } from "./help.js";
export { SummaryRenderer } from "./summary.js";
export { colors, supportsColor, colorize } from "./color.js";
export {
  formatHeader, formatSubheader, formatListItem, formatBullet,
  formatTable, formatError, formatSuccess, formatWarning,
  horizontalRule, formatSection, indent,
} from "./format.js";
```

### 8. Write tests

#### test/color.test.js

- `supportsColor` returns false when `proc.env.NO_COLOR` is set
- `supportsColor` returns true when `proc.env.FORCE_COLOR` is set
- `supportsColor` returns true when `proc.stdout.isTTY` is true
- `supportsColor` returns false when `proc.stdout.isTTY` is false/undefined
- `colorize` wraps text with ANSI codes when color is supported
- `colorize` returns plain text when color is not supported

Mock process object:

```js
const proc = { env: {}, stdout: { isTTY: true } };
```

#### test/format.test.js

- `formatTable` aligns columns correctly
- `formatTable` with compact option omits separator
- `formatHeader` returns bold+cyan text when color supported, plain when not
- `formatError` returns red "Error: msg" when color supported, plain when not
- `indent` adds correct padding to all lines
- `horizontalRule` returns correct-width dashed line

#### test/help.test.js

- `render` includes header line with name, version, description
- `render` includes one-line-per-command with aligned descriptions
- `render` includes options with type hints and descriptions
- `render` includes examples section
- `render` omits commands section when definition has no commands
- `render` uses custom usage string when provided
- `renderJson` produces valid JSON matching the definition

Use a mock stream (`{ write(data) { this.output += data; } }`) to capture
output.

#### test/cli.test.js

- `parse` returns values and positionals for normal input
- `parse` returns null and writes help when `--help` is passed
- `parse` returns null and writes JSON when `--help --json` is passed
- `parse` returns null and writes version when `--version` is passed
- `error` writes prefixed message to stderr and sets exitCode to 1
- `usageError` writes prefixed message to stderr and sets exitCode to 2
- `parse` throws on unknown flags (default parseArgs behavior)

Mock process:

```js
const proc = {
  env: {},
  stdout: { write: spy(), isTTY: false },
  stderr: { write: spy() },
  exitCode: 0,
};
```

#### test/summary.test.js

- `render` writes title and aligned items
- `render` writes only title when items is empty
- Labels are right-padded to the longest label width

### 9. Run verification

```sh
bun install
bun run node --test libraries/libcli/test/*.test.js
bun run check
```

All tests pass, lint and format clean.
