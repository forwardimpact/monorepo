---
title: Start, Stop, or Check a Service
description: Start, stop, restart, check status, and read logs through one interface — without remembering each service's specific incantation.
---

You need to start a service, check whether it is running, or stop it cleanly.
Rather than remembering the specific command, port, and flags for each service,
`fit-rc` provides a single interface for all of them. This page covers the
bounded task of managing one or more services. For the full setup including
supervision and observability, see
[Service Lifecycle](/docs/libraries/service-lifecycle/).

## Prerequisites

- Node.js 18+
- Services defined in `config/config.json` under the `init` key (see
  [Service Lifecycle](/docs/libraries/service-lifecycle/) for the configuration
  format)

## Start a service

Start all configured services in order:

```sh
npx fit-rc start
```

Expected output (timestamps and process IDs will differ):

```
INFO 2026-05-04T10:00:01.123Z rc svscan 42001 MSG001 - Socket ready socket="data/svscan.sock"
INFO 2026-05-04T10:00:01.456Z rc trace 42001 MSG002 - Service started
INFO 2026-05-04T10:00:01.789Z rc vector 42001 MSG003 - Service started
```

Start up to a specific service (useful when you only need part of the stack):

```sh
npx fit-rc start trace
```

This starts every service from the beginning of the configuration array through
the named service. Services listed after `trace` are not started.

## Check status

```sh
npx fit-rc status
```

Expected output when services are running:

```
INFO 2026-05-04T10:05:00.123Z rc svscan 42001 MSG001 - Running
INFO 2026-05-04T10:05:00.234Z rc trace 42001 MSG002 - up pid="42010"
INFO 2026-05-04T10:05:00.345Z rc vector 42001 MSG003 - up pid="42011"
```

Expected output when the supervision daemon is not running:

```
INFO 2026-05-04T10:05:00.123Z rc svscan 42001 MSG001 - Not running
```

Check a single service:

```sh
npx fit-rc status trace
```

If the named service is not in the configuration, `fit-rc` exits with an error:

```
Error: Unknown service: nonexistent
```

## Stop a service

Stop all services in reverse order and shut down the daemon:

```sh
npx fit-rc stop
```

Stop from a specific service onward, leaving earlier services running:

```sh
npx fit-rc stop vector
```

This stops `vector` and every service after it in the configuration array, in
reverse order. Services listed before `vector` remain running, and the daemon
stays active.

Longrun services receive `SIGTERM` first. If the process does not exit within
the shutdown timeout (default 3 seconds), `SIGKILL` is sent to the entire
process group. Oneshot services run their `down` command if one is defined.

## Restart a service

```sh
npx fit-rc restart trace
```

Equivalent to stopping and then starting the named service. Without a name, all
services restart.

## Read logs

View the current log for a named service:

```sh
npx fit-rc logs trace
```

The service name is required. Each longrun service writes output to a dedicated
directory under the configured `log_dir`. The log writer rotates files at 1 MB
and retains the 10 most recent archives.

If no log file exists yet (the service has not produced output), the command
returns silently.

## Suppress output

All commands accept the `--silent` flag to suppress informational output:

```sh
npx fit-rc start --silent
```

Errors still print. This is useful in scripts where you only want to see
failures.

## Programmatic usage

The same operations are available from the `ServiceManager` class:

```js
import { spawn, execSync } from "node:child_process";
import { ServiceManager, sendCommand, waitForSocket } from "@forwardimpact/librc";
import { createLogger } from "@forwardimpact/libtelemetry";

const config = {
  rootDir: process.cwd(),
  init: {
    log_dir: "data/logs",
    services: [
      { name: "trace", command: "npx fit-trace serve" },
    ],
  },
};

const logger = createLogger("rc");
// spawn/execSync are injected by the caller — there is no runtime-level
// equivalent for detached, stdio-redirected daemon spawning.
const manager = new ServiceManager(config, logger, {
  spawn,
  execSync,
  sendCommand,
  waitForSocket,
});

await manager.start("trace");  // Start up to and including "trace"
await manager.status("trace"); // Check one service
await manager.logs("trace");   // Print log to stdout
await manager.stop("trace");   // Stop from "trace" onward
```

Each method maps directly to the CLI command. `start` and `stop` accept an
optional service name with the same slicing behavior as the CLI: `start` takes
everything up to and including the named service; `stop` takes the named service
and everything after it.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../add-observability -->

</div>
