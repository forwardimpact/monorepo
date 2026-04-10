# 360 Part 04 — Documentation

Create the libcli internals documentation page and update cross-references.

**Depends on:** Part 01 (libcli library must exist).

## Files

| File                                     | Change                                           |
| ---------------------------------------- | ------------------------------------------------ |
| `website/docs/internals/libcli/index.md` | **New** — CLI development internals page         |
| `website/docs/internals/index.md`        | Add libcli card to the grid                      |
| `CLAUDE.md`                              | Add libcli to Structure section and skill groups |

## Steps

### 1. Create `website/docs/internals/libcli/index.md`

The spec (§ Internal documentation) prescribes the following sections. The page
is the single reference for CLI development conventions.

**Front matter:**

```yaml
---
title: libcli — CLI Development
description: Standard patterns for building CLI programs in the Forward Impact monorepo.
layout: product
---
```

**Sections:**

#### Logger conventions

Document the decision matrix from the spec (§ When to use libtelemetry Logger):

| Output type           | Use Logger? | Why                                  |
| --------------------- | ----------- | ------------------------------------ |
| Progress updates      | Yes         | Structured attributes beat free text |
| Errors and exceptions | Yes         | Preserves trace context              |
| Help text             | No          | Rendered by libcli                   |
| Pure data output      | No          | Primary result for piping            |
| Version string        | No          | Single value, rendered by libcli     |

Include the full table from the spec. Document:

- How to create a Logger: `const logger = createLogger("domain")`
- Domain naming: use the package name without `lib` prefix (e.g., `"codegen"`,
  `"rc"`, `"pathway"`)
- When to use each level: `debug` for internal tracing, `info` for operational
  output, `error` for errors with context, `exception` for caught errors with
  stack traces
- How to structure attributes for agent parseability:
  `logger.info("step", "Generated types", { files: "12" })`
- The `--silent`/`--quiet` suppression pattern (from fit-rc)
- RFC 5424 output format reference:
  `{level} {timestamp} {domain} {appId} {procId} {msgId} [{attrs}] {message}`

#### Help text

Document:

- How to declare commands and options as structured data (the definition object)
- The one-line-per-command property and why it matters for agents
- Human mode vs machine mode (`--help --json`)
- How `cli.parse()` handles `--help` and `--version` automatically

Include a minimal definition example.

#### Error handling

Document:

- Standard error format: `cli-name: error: message`
- Exit codes: 1 for runtime errors, 2 for usage errors
- Why `cli.error()` and `cli.usageError()` exist
- Why `logger.exception()` should be used in catch blocks for operational errors
- No ANSI color on stderr

#### Summary output

Document:

- `SummaryRenderer` usage for post-command output
- The `{ title, items: [{ label, description }] }` data structure
- The fit-codegen example as the reference pattern

#### Argument parsing

Document:

- How definition options serve both parsing and help generation
- `cli.parse()` wraps `node:util parseArgs`
- `allowPositionals: true` is always set
- How to validate positionals in the CLI entry point

#### Composition with other libraries

Document when to use each:

- **libcli** — CLI chrome: help, errors, summaries, argument parsing, colors
- **libformat** — Content rendering: markdown → HTML or ANSI terminal output
- **librepl** — Interactive sessions: command loops, state, history
- **libtelemetry** — Operational diagnostics: Logger, Tracer, Observer

A CLI that renders markdown (fit-guide) uses libformat for content and libcli
for chrome. A Repl-based CLI uses libcli for initial parsing and librepl for the
session.

#### Minimal CLI example

A complete, runnable example showing the standard pattern:

```js
#!/usr/bin/env node

import { createCli } from "@forwardimpact/libcli";
import { createLogger } from "@forwardimpact/libtelemetry";

const definition = {
  name: "fit-example",
  version: "0.1.0",
  description: "Example CLI showing standard pattern",
  usage: "fit-example <input>",
  options: {
    output: { type: "string", description: "Output path" },
    json:   { type: "boolean", description: "Output as JSON" },
    help:   { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
  },
  examples: [
    "fit-example data.yaml",
    "fit-example data.yaml --json",
  ],
};

const logger = createLogger("example");
const cli = createCli(definition);

async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const { values, positionals } = parsed;
  const [input] = positionals;

  if (!input) {
    cli.usageError("missing required argument <input>");
    process.exit(2);
  }

  // ... do work, using logger for operational output
  logger.info("main", "Processing complete", { file: input });
}

main().catch((error) => {
  logger.exception("main", error);
  cli.error(error.message);
  process.exit(1);
});
```

This example demonstrates: shebang, imports, definition as data, Logger
creation, `cli.parse()`, positional validation, error handling, and the catch
pattern.

### 2. Update `website/docs/internals/index.md`

Add a card to the grid, after the Codegen card (maintaining alphabetical-ish
order by topic):

```html
<a href="/docs/internals/libcli/">

### libcli

CLI development patterns — help text, argument parsing, error handling, summary
rendering, Logger conventions, and composition with other libraries.

</a>
```

Insert between the existing "Codegen" card and the "Operations" card (or after
the library cards, before Operations — match the existing grouping where product
internals come first, then library internals, then operations).

### 3. Update `CLAUDE.md`

#### Structure section

Add `libcli` to the libraries listing:

```
libraries/
  libcli/              # CLI infrastructure, help, arg parsing, formatting
  libskill/            # derivation logic, job/agent models
  ...
```

#### Skill groups section

Add libcli to the `libs-web-presentation` group (it provides CLI presentation
utilities, analogous to libui for web and libformat for content):

```
- **`libs-web-presentation`** — libui, libformat, libweb, libdoc, libtemplate,
  libcli, librepl
```

Alternatively, if libcli feels more like system infrastructure than
presentation, add it to `libs-system-utilities`. The choice is a judgment call —
libcli provides formatting and output (presentation-adjacent) but also argument
parsing (utility-adjacent). Follow the existing grouping logic: libformat is in
web-presentation and does terminal formatting, so libcli fits there too.

## Verification

```sh
# Build docs locally
bunx fit-doc build

# Verify the new page renders
bunx fit-doc serve
# Browse to /docs/internals/libcli/

# Verify the index card links correctly
# Browse to /docs/internals/
```

Check that CLAUDE.md changes are consistent with the existing format.
