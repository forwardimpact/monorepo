---
title: Manage Service Lifecycle from One Interface
description: Services that stay running and problems that surface before they escalate — supervision and observability from one interface.
---

You are running multiple services -- a gRPC server, a vector store, a trace
collector -- and managing them means remembering which command starts each one,
watching for crashes by hand, and wading through unstructured console output
when something goes wrong. Three libraries eliminate that overhead:
`@forwardimpact/librc` gives you a single CLI for starting, stopping, and
checking every service. `@forwardimpact/libsupervise` runs a supervision daemon
that automatically restarts services when they crash.
`@forwardimpact/libtelemetry` adds structured logging and trace spans so
problems surface in context, not buried in stdout.

This guide walks the full arc: define services in a configuration file, manage
them through one interface, and observe their behavior through structured logs
and spans. Each step produces a working result. Two bounded tasks cover the
details:

- [Start, stop, or check a service](/docs/libraries/service-lifecycle/manage-service/)
  -- manage a service without remembering its specific incantation.
- [Add observability](/docs/libraries/service-lifecycle/add-observability/)
  -- add a log line or trace span without configuring a logging framework.

## Prerequisites

- Node.js 22+
- Install the three libraries:

```sh
npm install @forwardimpact/librc @forwardimpact/libsupervise @forwardimpact/libtelemetry
```

Or invoke `fit-rc` ephemerally with `npx`:

```sh
npx fit-rc --help
```

## How the libraries fit together

Each library owns one concern. Together they form a supervision and
observability stack:

```text
config/config.json          (service definitions)
        |
        v
    librc / fit-rc           (lifecycle commands: start, stop, status)
        |
        v
    libsupervise / svscan    (supervision daemon: restart on crash)
        |
        v
    libtelemetry             (structured logs and trace spans)
```

`fit-rc` reads the service configuration and sends commands to the `svscan`
supervision daemon (from `libsupervise`). The daemon manages each process,
restarts it on failure with exponential backoff, and pipes its output through a
log writer that handles rotation. `libtelemetry` provides the structured logging
that both the daemon and your services use to produce machine-readable output.

## Define services

Services are defined in `config/config.json` under the `init` key. Each service
is either a **longrun** (a process that should stay running) or a **oneshot** (a
command that runs once during startup or shutdown):

```json
{
  "init": {
    "log_dir": "data/logs",
    "services": [
      {
        "name": "codegen",
        "type": "oneshot",
        "up": "npx fit-codegen generate --all",
        "down": "echo codegen teardown"
      },
      {
        "name": "trace",
        "command": "npx gemba-trace serve"
      },
      {
        "name": "vector",
        "command": "npx fit-vector serve"
      },
      {
        "name": "graph",
        "command": "npx fit-graph serve",
        "optional": true
      }
    ]
  }
}
```

| Field      | Required | Notes                                                                 |
| ---------- | -------- | --------------------------------------------------------------------- |
| `name`     | yes      | Unique identifier for the service.                                    |
| `type`     | no       | `"oneshot"` for run-once commands. Omit for longrun (the default).    |
| `command`  | longrun  | Shell command to run. The daemon restarts it on crash.                |
| `up`       | oneshot  | Command to run on start.                                              |
| `down`     | oneshot  | Command to run on stop. Optional.                                     |
| `optional` | no       | When `true`, failure is a warning rather than an error. Default `false`. |

Services start in array order. When stopping, the order reverses. This matters
when services depend on each other -- place dependencies earlier in the array.

## Start all services

```sh
npx fit-rc start
```

This command:

1. Spawns the `svscan` supervision daemon (or restarts it if already running).
2. Walks through each service in order.
3. For oneshot services, runs the `up` command and waits for completion.
4. For longrun services, adds them to the supervision tree. The daemon keeps
   each one running.

Expected output (timestamps and process IDs will differ):

```text
INFO 2026-05-04T10:00:01.123Z rc codegen 42001 MSG001 - Running oneshot direction="up" cmd="npx fit-codegen generate --all"
INFO 2026-05-04T10:00:03.456Z rc codegen 42001 MSG002 - Oneshot completed direction="up"
INFO 2026-05-04T10:00:03.789Z rc trace 42001 MSG003 - Service started
INFO 2026-05-04T10:00:04.012Z rc vector 42001 MSG004 - Service started
INFO 2026-05-04T10:00:04.234Z rc graph 42001 MSG005 - Service started
```

To start only up to a specific service (useful when you need only part of the
stack):

```sh
npx fit-rc start trace
```

This starts every service from the beginning of the array through `trace`,
skipping later entries.

## Check service status

```sh
npx fit-rc status
```

Expected output when services are running:

```text
INFO 2026-05-04T10:05:00.123Z rc svscan 42001 MSG001 - Running
INFO 2026-05-04T10:05:00.234Z rc trace 42001 MSG002 - up pid="42010"
INFO 2026-05-04T10:05:00.345Z rc vector 42001 MSG003 - up pid="42011"
INFO 2026-05-04T10:05:00.456Z rc graph 42001 MSG004 - up pid="42012"
```

Expected output when nothing is running:

```text
INFO 2026-05-04T10:05:00.123Z rc svscan 42001 MSG001 - Not running
```

Check a single service by name:

```sh
npx fit-rc status trace
```

## Stop services

```sh
npx fit-rc stop
```

Services stop in reverse order. Longrun services receive `SIGTERM`; if a process
does not exit within the shutdown timeout (default 3 seconds), the daemon sends
`SIGKILL` to the entire process group. Oneshot services run their `down` command
if one is defined. When all services are stopped, the daemon itself shuts down.

To stop from a specific service onward (leaving earlier services running):

```sh
npx fit-rc stop vector
```

This stops `vector` and everything after it in the array (here, `graph`), in
reverse order.

## Restart a service

```sh
npx fit-rc restart trace
```

This stops the named service and everything after it in the array, then starts
that same slice again — dependents that were torn down come back up, and
services before the target are left untouched. Without a name, it restarts all
services.

## Read service logs

Each longrun service writes output to a rotated log directory under the path
configured in `log_dir`. View a service's current log:

```sh
npx fit-rc logs trace
```

The log writer (from `libsupervise`) automatically rotates files at 1 MB and
keeps the 10 most recent archives. Archived files are named with ISO 8601
timestamps, so sorting by filename gives chronological order.

## Supervision behavior

The `svscan` daemon restarts crashed services automatically. When a longrun
service exits unexpectedly, the daemon waits before restarting, using
exponential backoff:

| Parameter          | Default | Effect                                                  |
| ------------------ | ------- | ------------------------------------------------------- |
| Initial delay      | 100 ms  | Wait time after the first crash.                        |
| Backoff multiplier | 2x      | Each subsequent crash doubles the wait.                 |
| Maximum delay      | 5000 ms | The wait never exceeds this value.                      |
| Shutdown timeout   | 3000 ms | Time to wait for `SIGTERM` before escalating to `SIGKILL`. |

A successful restart resets the backoff counter. The daemon does not limit the
total number of restart attempts -- it keeps the service running as long as the
supervision tree is active.

Each supervised process runs in its own process group (`detached: true`). When
the daemon sends a signal, it targets the entire group (shell and child
processes), preventing orphaned subprocesses.

## Fail fast at startup

A service that starts on the wrong Node.js version, or with a required secret
left blank, should refuse to run rather than fail halfway through a request.
`@forwardimpact/libpreflight` makes that refusal happen at the very top of a
service's entry script, before any heavy import resolves.

Import the runtime-floor check as the **first** import in the entry file. It has
no dependencies, so it runs before any sibling import body executes:

```js
#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

// the rest of the service's imports follow
```

Under a supported Node.js version the import returns silently. Under an
unsupported version the process writes a clear instruction to stderr and exits
with code `1`:

```text
Error: This command requires Node.js 22 or later (running 20.11.0).
Install Node.js 22 (LTS) from https://nodejs.org/ and re-run.
```

For required configuration, call `assertNonEmpty` right after loading config so
a missing secret stops the process at startup instead of surfacing as a
confusing runtime error later:

```js
import { assertNonEmpty } from "@forwardimpact/libpreflight/assert-non-empty.js";

const config = createServiceConfig("my-service", loadEnv());
assertNonEmpty(config.session_secret, "session_secret");
```

An empty string, empty array, empty `Set`, or `undefined`/`null` all count as
empty. On failure the process writes
`Error: required configuration "session_secret" is empty.` to stderr and exits
`1`.

## Add structured logging

Services that use `@forwardimpact/libtelemetry` produce RFC 5424-formatted log
lines. This structured format makes logs greppable and parseable by both humans
and agents.

```js
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const logger = createLogger("my-service", createDefaultRuntime());

logger.info("startup", "Server listening", { port: "3000" });
// INFO 2026-05-04T10:00:00.000Z my-service startup 42001 MSG001 [port="3000"] Server listening

logger.error("handler", "Request failed", { status: "500" });
// ERROR 2026-05-04T10:00:01.000Z my-service handler 42001 MSG002 [status="500"] Request failed
```

The log format is:

```text
LEVEL TIMESTAMP DOMAIN APP_ID PROC_ID MSG_ID [ATTRIBUTES] MESSAGE
```

Control verbosity with the `LOG_LEVEL` environment variable:

| `LOG_LEVEL` | What prints                  |
| ----------- | ---------------------------- |
| `error`     | Errors only.                 |
| `info`      | Errors and info (default).   |
| `debug`     | Everything including debug.  |

For domain-specific debug output without changing the global level, set the
`DEBUG` environment variable:

```sh
DEBUG=my-service npx fit-rc start
```

Use `DEBUG=*` to enable debug output for all domains.

For details on logging and trace spans, see
[Add Observability](/docs/libraries/service-lifecycle/add-observability/).

## Programmatic usage

The `ServiceManager` class exposes the same operations as the CLI. Use it when
you need lifecycle control from within a Node.js process:

```js
import { spawn, execSync } from "node:child_process";
import { ServiceManager } from "@forwardimpact/librc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { sendCommand, waitForSocket } from "@forwardimpact/librc";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const runtime = createDefaultRuntime();

const config = {
  rootDir: process.cwd(),
  init: {
    log_dir: "data/logs",
    services: [
      { name: "trace", command: "npx gemba-trace serve" },
      { name: "vector", command: "npx fit-vector serve" },
    ],
  },
};

const logger = createLogger("rc", runtime);
// spawn/execSync are injected by the caller — there is no runtime-level
// equivalent for detached, stdio-redirected daemon spawning.
const manager = new ServiceManager(config, logger, {
  runtime,
  spawn,
  execSync,
  sendCommand,
  waitForSocket,
});

await manager.start();         // Start all services
await manager.status();        // Print status of all services
await manager.status("trace"); // Print status of one service
await manager.logs("trace");   // Print logs to stdout
await manager.stop("vector");  // Stop one service
await manager.stop();          // Stop all services and daemon
```

## What each library provides

| Library          | Package                              | Concern                                             |
| ---------------- | ------------------------------------ | --------------------------------------------------- |
| libpreflight     | `@forwardimpact/libpreflight`        | Fail-fast runtime-floor and required-config checks at startup. |
| librc            | `@forwardimpact/librc`               | Lifecycle CLI (`fit-rc`) and `ServiceManager` class. |
| libsupervise     | `@forwardimpact/libsupervise`        | Supervision daemon (`fit-svscan`), log writer (`fit-logger`), log rotation, process state. |
| libtelemetry     | `@forwardimpact/libtelemetry`        | Structured logging (`Logger`), trace spans (`Tracer`), unified observer (`Observer`), trace query and rendering (`fit-visualize`). |

Keeping instruction files and architecture honest is the fifth concern in this
job. That check is `coaligned`, documented with the
[Co-Aligned standard](https://www.coaligned.team/) rather than here, because it
runs at authoring time against the repository -- not at service runtime against
a process. See [Distribute Skill Packs](/docs/libraries/distribute-skill-packs/)
for the publishing side of keeping shared instructions current.

## What's next

<div class="grid">

<!-- part:card:manage-service -->
<!-- part:card:add-observability -->

</div>
