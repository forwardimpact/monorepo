---
name: libs-cli-and-tooling
description: >
  Use when building a CLI binary, parsing command-line arguments, rendering
  help or summary output, colorizing terminal text, running an interactive REPL
  session, hashing content, generating UUIDs, counting LLM tokens, retrying
  flaky network calls with backoff, downloading or extracting tarballs, reading
  or writing .env files, generating cryptographic secrets or JWTs, supervising
  long-running daemons, managing service lifecycles via Unix socket, generating
  code from Protocol Buffer definitions, or collecting and processing Claude
  Code trace output.
---

# CLI and Tooling

## When to Use

- Building or modifying a CLI entry point, argument parser, or help renderer
- Running an interactive REPL session with command handlers and state
- Supervising long-running daemon processes with automatic restarts
- Managing service lifecycles (start/stop/status/restart) via Unix sockets
- Generating code from Protocol Buffer definitions
- Creating cryptographic secrets, JWTs, or managing `.env` files
- Counting tokens, generating hashes, retrying a flaky fetch, or running child
  processes
- Collecting, inspecting, or replaying Claude Code trace output

## Libraries

| Library      | Capabilities                                                                                                              | Key Exports                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| libcli       | Parse CLI arguments, render help text, print summary output, format tables, colorize terminal text                        | `Cli`, `createCli`, `HelpRenderer`, `SummaryRenderer`, `formatTable`, `colorize`                                                                                    |
| librepl      | Run an interactive REPL with command handlers, stateful sessions, and storage-backed persistence                          | `Repl`                                                                                                                                                              |
| libutil      | Hash content, generate UUIDs, count tokens, retry flaky operations with backoff, wait for conditions, extract tarballs    | `generateHash`, `generateUUID`, `countTokens`, `createTokenizer`, `Retry`, `createRetry`, `waitFor`, `Finder`, `BundleDownloader`, `parseJsonBody`, `updateEnvFile` |
| libsecret    | Generate cryptographic secrets and JWTs, read or write .env file entries, reuse existing secrets from .env                | `generateSecret`, `generateBase64Secret`, `generateJWT`, `generateUUID`, `readEnvFile`, `getOrGenerateSecret`, `updateEnvFile`                                      |
| libsupervise | Supervise long-running daemons with restart policies, capture stdout/stderr, manage a supervision tree                    | `SupervisionTree`, `createSupervisionTree`, `LongrunProcess`, `OneshotProcess`, `LogWriter`, `ProcessState`                                                         |
| librc        | Manage service lifecycles through a svscan daemon over Unix sockets; wait for socket availability                         | `ServiceManager`, `sendCommand`, `waitForSocket`                                                                                                                    |
| libcodegen   | Generate types, services, clients, and definitions from Protocol Buffer source files                                      | `CodegenBase`, `CodegenTypes`, `CodegenServices`, `CodegenDefinitions`                                                                                              |
| libeval      | Collect Claude Code traces, run an agent with a supervisor loop, tee output to storage, detect completion or intervention | `TraceCollector`, `createTraceCollector`, `AgentRunner`, `createAgentRunner`, `Supervisor`, `createSupervisor`, `TeeWriter`, `createTeeWriter`                      |

## Decision Guide

- **libcli vs hand-rolled argv parsing** — Always use `Cli` and
  `HelpRenderer`/`SummaryRenderer` for any new CLI tool. `libcli` is the
  canonical CLI infrastructure for the monorepo (spec 360). Do not hand-roll
  argv parsing or help text.
- **libcli vs librepl** — `Cli` for one-shot command-line invocations
  (`bunx fit-pathway job`). `Repl` for interactive sessions with multi-turn
  state and command handlers (`fit-guide chat`).
- **libsupervise vs librc** — `libsupervise` for direct process supervision
  (`LongrunProcess`, `OneshotProcess` with restart policies and log rotation).
  `librc` for managing services through the svscan daemon via Unix socket
  commands (start/stop/status).
- **libutil `generateHash` vs libsecret `generateSecret`** — `generateHash` for
  deterministic content hashing (SHA256 of input data). `generateSecret` for
  cryptographic random secrets (API keys, tokens). Both libraries also export
  `generateUUID` and `updateEnvFile`; prefer `libsecret` for secrets-related
  work and `libutil` for general utilities.
- **libcodegen** — Run once after .proto file changes (`just codegen`). Not used
  at runtime. Output consumed by libtype and librpc.
- **libutil pure functions** — `countTokens`, `generateHash`, `generateUUID` are
  stateless with zero dependencies beyond Node.js built-ins.
- **libeval** — Use `TraceCollector` to capture Claude Code trace output during
  evaluation runs, and `Supervisor` + `AgentRunner` to run agents under a
  completion-detection loop.

## Composition Recipes

### Recipe 1: Create a CLI entry point

```javascript
import { createCli, HelpRenderer } from "@forwardimpact/libcli";

const cli = createCli({
  name: "fit-example",
  usage: "fit-example <command>",
  commands: {
    build: async (args) => {
      /* ... */
    },
    list: async (args) => {
      /* ... */
    },
  },
});

await cli.run(process.argv.slice(2));
```

### Recipe 2: Run an interactive REPL

```javascript
import { Repl } from "@forwardimpact/librepl";

const repl = new Repl({
  prompt: "guide> ",
  state: { conversationId: null },
  onLine: async (line, state, output) => {
    output.write(`You said: ${line}\n`);
  },
});

await repl.start();
```

### Recipe 3: Supervise a service

```javascript
import {
  createSupervisionTree,
  LongrunProcess,
} from "@forwardimpact/libsupervise";

const tree = createSupervisionTree("/var/log/services");
await tree.start();
await tree.add("db", "node db-service.js");
await tree.add("api", "node api-service.js");
const status = tree.getStatus();
await tree.stop();
```

### Recipe 4: Generate secrets for environment

```javascript
import {
  generateSecret,
  generateJWT,
  updateEnvFile,
} from "@forwardimpact/libsecret";

const secret = generateSecret();
await updateEnvFile("SERVICE_SECRET", secret);

const jwt = generateJWT({ userId: "123" }, secret);
await updateEnvFile("JWT_TOKEN", jwt);
```

### Recipe 5: Generate code from proto definitions

```javascript
import {
  CodegenTypes,
  CodegenServices,
} from "@forwardimpact/libcodegen";

const typeGen = new CodegenTypes("./proto");
await typeGen.generate("./generated/types");

const serviceGen = new CodegenServices("./proto");
await serviceGen.generate("./generated/services");

// CLI: just codegen
```

### Recipe 6: Retry a flaky fetch with backoff

```javascript
import { createRetry } from "@forwardimpact/libutil";

const retry = createRetry({ maxAttempts: 4, backoffMs: 2000 });
const response = await retry.execute(() => fetch(url));
```

### Recipe 7: Run an agent under a supervisor

```javascript
import {
  createAgentRunner,
  createSupervisor,
  createTraceCollector,
} from "@forwardimpact/libeval";

const collector = createTraceCollector({ traceDir });
const supervisor = createSupervisor({ llmApi });
const runner = createAgentRunner({ supervisor, collector });

const result = await runner.run({ prompt, maxTurns: 20 });
```

## DI Wiring

### libcli

```javascript
// Cli — accepts app definition object
const cli = new Cli({ name, usage, commands });

// createCli — convenience factory
const cli = createCli({ name, usage, commands });

// Renderers — thin wrappers over format helpers
const help = new HelpRenderer();
const summary = new SummaryRenderer();
```

### librepl

```javascript
// Repl — accepts app definition, formatter factory, and runtime modules
const repl = new Repl(app, createTerminalFormatter, readline, process, os);
```

### libutil

```javascript
// Pure functions — no DI, no classes
import { countTokens, createTokenizer } from "@forwardimpact/libutil";
import { generateHash, generateUUID } from "@forwardimpact/libutil";
import { Finder, BundleDownloader, TarExtractor } from "@forwardimpact/libutil";
import { Retry, createRetry, waitFor } from "@forwardimpact/libutil";
```

### libsecret

```javascript
// Pure functions — no DI, no classes
import {
  generateSecret,
  generateBase64Secret,
} from "@forwardimpact/libsecret";
import { generateJWT } from "@forwardimpact/libsecret";
import { readEnvFile, updateEnvFile } from "@forwardimpact/libsecret";
import { getOrGenerateSecret } from "@forwardimpact/libsecret";
```

### libsupervise

```javascript
// LongrunProcess — accepts name, command, options
const proc = new LongrunProcess("api", "node server.js", {
  stdout: process.stdout,
  stderr: process.stderr,
});

// createSupervisionTree — factory accepts log directory
const tree = createSupervisionTree("/var/log/services");

// LogWriter — accepts log directory and options
const writer = new LogWriter("/var/log/api", {
  maxFileSize: 1_000_000,
  maxFiles: 10,
});
```

### librc

```javascript
// ServiceManager — accepts config and logger
const manager = new ServiceManager(config, logger);
await manager.start();
await manager.status();

// Socket utilities — pure functions
import { sendCommand, waitForSocket } from "@forwardimpact/librc";
await waitForSocket("/tmp/svscan.sock", 5000);
const response = await sendCommand("/tmp/svscan.sock", { command: "status" });
```

### libcodegen

```javascript
// CodegenTypes — accepts proto directory
const generator = new CodegenTypes("./proto");

// CodegenServices — accepts proto directory
const generator = new CodegenServices("./proto");

// CodegenDefinitions — accepts proto directory
const generator = new CodegenDefinitions("./proto");
```

### libeval

```javascript
// Factory functions return instances with default wiring
const collector = createTraceCollector({ traceDir });
const supervisor = createSupervisor({ llmApi });
const runner = createAgentRunner({ supervisor, collector });
const tee = createTeeWriter({ destination });
```

## Cross-references

- For structured logging from CLI tools, see `libs-grpc-services` —
  `libtelemetry.createLogger` is the repository-wide logger. `logger.info` sends
  to stderr (keeps stdout clean for data), `logger.debug` only prints when
  `DEBUG=<domain>` is set.
- For web presentation and markdown rendering, see `libs-content`.

## Security

- **Secret generation** — Always use `libsecret` for generating secrets and
  tokens. Never hardcode secrets in source code.
- **Audit** — Run `just audit` for combined npm audit and gitleaks secret
  scanning.
