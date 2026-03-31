# 240 — Plan: Publish @forwardimpact/guide on npm

## Approach

Option B from the spec: full product publish. Remove `"private": true`, add the
metadata fields that every published package in this monorepo carries, and make
`fit-guide` fail gracefully when the service stack is not running. All seven
library dependencies are already published — no upstream work is needed.

The key challenge is that Guide is a service client, not a standalone tool. Map
validates YAML files locally; Pathway derives job definitions from data files.
Guide connects to gRPC services (agent, llm, memory, graph, vector, tool, trace,
web) and cannot do anything without them. The CLI currently hard-exits on
missing `SERVICE_SECRET` with a monorepo-specific error message. This plan
replaces that hard exit with a helpful onboarding experience.

The work breaks into five phases: package metadata, CLI error handling, README,
help output, and validation.

## Phase 1: Package Metadata

### 1.1 Remove private flag and add publishing fields

Update `products/guide/package.json` to match the pattern established by Pathway
and Map.

```jsonc
// Remove
"private": true,

// Add
"files": ["bin/"],
"repository": {
  "type": "git",
  "url": "https://github.com/nicholasgriffintn/monorepo",
  "directory": "products/guide"
},
"homepage": "https://www.forwardimpact.team/guide",
"keywords": [
  "engineering-framework",
  "career-development",
  "ai-agent",
  "skill-assessment",
  "knowledge-platform",
  "conversational-agent",
  "engineering-excellence",
  "rag"
],
"publishConfig": {
  "access": "public"
}
```

Guide has no `src/` directory and no programmatic exports — it is CLI-only. The
`files` field includes only `bin/` since that is all the package ships. No
`main` or `exports` fields are needed.

**Decision:** No `main` or `exports` field. Unlike Pathway (3 export paths) and
Map (13 export paths), Guide exposes no programmatic API. Adding empty exports
would be misleading. The package is a CLI tool.

**Files modified:** `products/guide/package.json`

### 1.2 Verify dependency versions are current

Check that the pinned dependency versions in `package.json` resolve to published
versions on npm. The current pins are:

| Dependency                    | Pinned    | Latest tag |
| ----------------------------- | --------- | ---------- |
| `@forwardimpact/libconfig`    | `^0.1.58` | Verify     |
| `@forwardimpact/librepl`      | `^0.1.0`  | Verify     |
| `@forwardimpact/libutil`      | `^0.1.64` | Verify     |
| `@forwardimpact/librpc`       | `^0.1.77` | Verify     |
| `@forwardimpact/libstorage`   | `^0.1.53` | Verify     |
| `@forwardimpact/libtelemetry` | `^0.1.22` | Verify     |
| `@forwardimpact/libtype`      | `^0.1.63` | Verify     |

All are already published with `"publishConfig": { "access": "public" }`. Use
`npm view @forwardimpact/<pkg> version` to confirm each resolves. If any pin is
behind the latest published version, update it — stale pins may pull in versions
with known issues.

**Files modified:** `products/guide/package.json` (if pins need updating)

## Phase 2: Graceful CLI Error Handling

This is the critical phase. The current `fit-guide` exits immediately with a
monorepo-developer message when `SERVICE_SECRET` is not set. An npm user will
always hit this on first run. The CLI must instead provide a useful onboarding
experience.

### 2.1 Replace hard exit with service availability check

Rewrite the top of `products/guide/bin/fit-guide.js` to replace the immediate
`process.exit(1)` with a structured check that prints helpful output.

When `SERVICE_SECRET` is not set, instead of:

```
Error: SERVICE_SECRET is not set. For local development, use: make cli-chat
```

Print a formatted message explaining:

1. What Guide is and what it needs
2. That Guide requires a running service stack
3. Which services are needed (agent, llm, memory, graph, vector, tool, trace,
   web)
4. How to set `SERVICE_SECRET`
5. Links to documentation for setting up the service stack
6. A pointer to `--help` for CLI options

```
fit-guide — Conversational agent for the Guide knowledge platform

Guide requires a running service stack to function. The following
services must be available:

  agent, llm, memory, graph, vector, tool, trace, web

To get started:

  1. Clone the monorepo and run: make services
  2. Set SERVICE_SECRET in your environment
  3. Run: bunx fit-guide

Documentation: https://www.forwardimpact.team/guide
Run bunx fit-guide --help for CLI options.
```

Exit with code 1 after printing. This satisfies the spec requirement that
`bunx fit-guide` produces helpful output.

**Files modified:** `products/guide/bin/fit-guide.js`

### 2.2 Add --help flag support

The spec requires that `bunx fit-guide --help` shows available commands and
options. The current CLI has no `--help` handling — it relies on the REPL's
built-in usage display.

Add an early argument check before the `SERVICE_SECRET` gate:

```js
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`fit-guide — Conversational agent for the Guide knowledge platform

Usage:
  bunx fit-guide                   Start interactive conversation
  bunx fit-guide --data=<path>     Specify framework data directory
  echo "question" | bunx fit-guide Pipe a question directly

Options:
  --data=<path>   Path to framework data directory
  --help, -h      Show this help message
  --version, -v   Show version

Guide connects to the Forward Impact service stack to provide
AI-powered guidance grounded in your engineering framework.

Documentation: https://www.forwardimpact.team/guide`);
  process.exit(0);
}
```

**Decision:** `--help` is checked before `SERVICE_SECRET` so it works even
without a running service stack. This is important — a user who just installed
the package should be able to discover what it does.

**Files modified:** `products/guide/bin/fit-guide.js`

### 2.3 Add --version flag support

Add a `--version` / `-v` check that reads the version from `package.json`. This
is standard CLI behaviour and helps users verify which version they have
installed.

```js
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  const { version } = JSON.parse(
    await fs.readFile(new URL("../package.json", import.meta.url), "utf8")
  );
  console.log(version);
  process.exit(0);
}
```

Place this after `--help` and before `SERVICE_SECRET` check.

**Files modified:** `products/guide/bin/fit-guide.js`

### 2.4 Improve service connection error handling

When `SERVICE_SECRET` is set but services are unreachable (e.g. user set the
variable but didn't start the stack), the current code will throw an unhandled
gRPC connection error. Wrap the client creation and REPL startup in a try/catch
that provides a meaningful message:

```js
try {
  const agentClient = await createClient("agent", logger, tracer);
  // ... rest of setup and repl.start()
} catch (err) {
  console.error(`Failed to connect to the Guide service stack.

Error: ${err.message}

Ensure all required services are running:
  agent, llm, memory, graph, vector, tool, trace, web

For local development: make services
Documentation: https://www.forwardimpact.team/guide`);
  process.exit(1);
}
```

**Files modified:** `products/guide/bin/fit-guide.js`

## Phase 3: README

### 3.1 Create products/guide/README.md

Every published package in this monorepo has a README. Create one for Guide that
covers the spec requirements:

- What Guide is (the "How do I find my bearing?" product)
- That it is part of the Forward Impact suite
- Installation instructions (`bun install @forwardimpact/guide`)
- Service stack requirements — be explicit about what must be running
- Quick start steps (clone monorepo, start services, set secret, run CLI)
- CLI usage examples (interactive mode, piped input, `--data` flag)
- Links to documentation, related packages (Map, Pathway), and the repository

The README should be honest about the service dependency. Don't hide it — frame
it as "Guide is a client for the Forward Impact knowledge platform" rather than
treating the service requirement as a limitation.

**Files created:** `products/guide/README.md`

### 3.2 Add README to files field

Update the `files` array to include the README:

```jsonc
"files": ["bin/", "README.md"]
```

Note: npm includes `README.md` automatically even without listing it in `files`,
but being explicit matches the convention in this repo.

**Files modified:** `products/guide/package.json`

## Phase 4: Help Text Consistency

### 4.1 Update the REPL usage string

The existing `usage` constant in `fit-guide.js` references `bunx fit-guide` in
examples, which is correct for npm users. Review and confirm the examples are
accurate for the published package context. The current examples look correct:

```
echo "Tell me about the company" | bunx fit-guide
```

No changes needed unless the examples reference monorepo-specific paths.

**Files modified:** none (verification only)

## Phase 5: Validation

### 5.1 Verify package contents

Run `npm pack --dry-run` in `products/guide/` to confirm only the intended files
are included in the tarball:

```sh
cd products/guide && npm pack --dry-run
```

Expected contents: `bin/fit-guide.js`, `package.json`, `README.md`. No
`data/logs/`, no `node_modules/`.

### 5.2 Test --help without services

```sh
cd /tmp && bunx fit-guide --help
```

Should print help text and exit 0 — no `SERVICE_SECRET` required.

### 5.3 Test default run without SERVICE_SECRET

```sh
cd /tmp && bunx fit-guide
```

Should print the onboarding message explaining service requirements and exit 1.

### 5.4 Test --version

```sh
cd /tmp && bunx fit-guide --version
```

Should print `0.1.4` (or whatever version is current at publish time).

### 5.5 Test with SERVICE_SECRET but no services

```sh
SERVICE_SECRET=test bunx fit-guide
```

Should print a connection error message with setup instructions, not an
unhandled exception.

### 5.6 Run full check suite

```sh
bun run check
```

Confirm no regressions in formatting, linting, or existing tests.

### 5.7 Verify npm search metadata

After publishing, verify that `npm search @forwardimpact/guide` returns the
package with the correct description and keywords.

## File Change Summary

| Category           | Files                             | Action |
| ------------------ | --------------------------------- | ------ |
| Package metadata   | `products/guide/package.json`     | Modify |
| CLI error handling | `products/guide/bin/fit-guide.js` | Modify |
| README             | `products/guide/README.md`        | Create |
| **Total**          | **3 files**                       |        |

## What This Does NOT Change

- Guide's internal architecture or service dependencies
- The service stack setup process
- Any library packages (all already published)
- Website content (spec 170 scope)
- Other products (Map, Pathway, Basecamp)

## Risk

**Low.** The changes are additive — package metadata, a README, and better error
messages. The existing functionality when services are running is untouched. The
publish workflow is generic and already handles all other packages. The only
risk is that an npm user installs Guide expecting standalone functionality and
is disappointed — but the README, `--help`, and onboarding message all set
expectations clearly.
