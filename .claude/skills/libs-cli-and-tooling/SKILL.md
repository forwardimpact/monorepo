---
name: libs-system-utilities
description: >
  System utilities for infrastructure tasks. libutil provides hashing, token
  counting, and process execution. libsecret generates secrets and JWTs.
  libsupervise provides process supervision with restart policies. librc manages
  service lifecycles via Unix sockets. libcodegen generates code from Protocol
  Buffer definitions. Use for infrastructure automation, service management, or
  code generation.
---

# System Utilities

## When to Use

- Supervising long-running daemon processes with automatic restarts
- Managing service lifecycles (start/stop/status/restart)
- Generating code from Protocol Buffer definitions
- Creating cryptographic secrets, JWTs, or managing .env files
- Counting tokens, generating hashes, or running child processes

## Libraries

| Library      | Main API                                         | Purpose                                       |
| ------------ | ------------------------------------------------ | --------------------------------------------- |
| libutil      | `countTokens`, `generateHash`, `generateUuid`    | Token counting, hashing, UUIDs, project utils |
| libsecret    | `generateSecret`, `createJwt`, `setEnvVar`       | Cryptographic secrets, JWTs, .env management  |
| libsupervise | `LongrunProcess`, `SupervisionTree`, `LogWriter` | Process supervision with restart and logging  |
| librc        | `ServiceManager`, `sendCommand`                  | Service lifecycle via svscan daemon           |
| libcodegen   | `TypeGenerator`, `ServiceGenerator`              | Code generation from .proto files             |

## Decision Guide

- **libsupervise vs librc** — `libsupervise` for direct process supervision
  (LongrunProcess, OneshotProcess with restart policies and log rotation).
  `librc` for managing services through the svscan daemon via Unix socket
  commands (start/stop/status).
- **libutil `generateHash` vs libsecret `generateSecret`** — `generateHash` for
  deterministic content hashing (SHA256 of input data). `generateSecret` for
  cryptographic random secrets (API keys, tokens). `libsecret.hashValues` for
  deterministic hashes of multiple values.
- **libcodegen** — Run once after .proto file changes (`just codegen`). Not used
  at runtime. Output consumed by libtype and librpc.
- **libutil pure functions** — `countTokens`, `generateHash`, `generateUuid` are
  stateless with zero dependencies beyond Node.js built-ins.
- **libsecret pure functions** — `generateSecret`, `createJwt`, `getEnvVar`,
  `setEnvVar` are stateless cryptographic utilities.

## Composition Recipes

### Recipe 1: Supervise a service

```javascript
import { LongrunProcess } from "@forwardimpact/libsupervise";
import { SupervisionTree } from "@forwardimpact/libsupervise";

const tree = new SupervisionTree("/var/log/services");
await tree.start();
await tree.add("db", "node db-service.js");
await tree.add("api", "node api-service.js");
const status = tree.getStatus();
await tree.stop();
```

### Recipe 2: Generate secrets for environment

```javascript
import { generateSecret, generateSecretB64 } from "@forwardimpact/libsecret";
import { createJwt, setEnvVar } from "@forwardimpact/libsecret";

const secret = generateSecret();
await setEnvVar(".env", "SERVICE_SECRET", secret);

const jwt = createJwt({ userId: "123" }, secret, { expiresIn: "1h" });
await setEnvVar(".env", "JWT_TOKEN", jwt);
```

### Recipe 3: Generate code from proto definitions

```javascript
import { TypeGenerator } from "@forwardimpact/libcodegen";
import { ServiceGenerator } from "@forwardimpact/libcodegen";

const typeGen = new TypeGenerator("./proto");
await typeGen.generate("./generated/types");

const serviceGen = new ServiceGenerator("./proto");
await serviceGen.generate("./generated/services");

// CLI: just codegen
```

## DI Wiring

### libutil

```javascript
// Pure functions — no DI, no classes
import { countTokens, estimateTokens } from "@forwardimpact/libutil";
import { generateHash, generateUuid } from "@forwardimpact/libutil";
import { findProjectRoot } from "@forwardimpact/libutil";
```

### libsecret

```javascript
// Pure functions — no DI, no classes
import { generateSecret, generateSecretB64 } from "@forwardimpact/libsecret";
import { createJwt } from "@forwardimpact/libsecret";
import { getEnvVar, setEnvVar } from "@forwardimpact/libsecret";
import { hashValues } from "@forwardimpact/libsecret";
```

### libsupervise

```javascript
// LongrunProcess — accepts name, command, options
const proc = new LongrunProcess("api", "node server.js", {
  stdout: process.stdout,
  stderr: process.stderr,
});

// SupervisionTree — accepts log directory
const tree = new SupervisionTree("/var/log/services");

// LogWriter — accepts log directory and options
const writer = new LogWriter("/var/log/api", { maxFileSize: 1_000_000, maxFiles: 10 });
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
// TypeGenerator — accepts proto directory
const generator = new TypeGenerator("./proto");

// ServiceGenerator — accepts proto directory
const generator = new ServiceGenerator("./proto");

// DefinitionGenerator — accepts proto directory
const generator = new DefinitionGenerator("./proto");
```

## Security

- **Secret generation** — Always use `libsecret` for generating secrets and
  tokens. Never hardcode secrets in source code.
- **Audit** — Run `just audit` for combined npm audit and gitleaks secret
  scanning.
