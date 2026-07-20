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

- Node.js 22+
- Services defined in `config/config.json` under the `init` key (see
  [Service Lifecycle](/docs/libraries/service-lifecycle/) for the configuration
  format)

## Start a service

Start all configured services in order:

```sh
npx fit-rc start
```

Expected output (timestamps and process IDs will differ):

```text
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

```text
INFO 2026-05-04T10:05:00.123Z rc svscan 42001 MSG001 - Running
INFO 2026-05-04T10:05:00.234Z rc trace 42001 MSG002 - up pid="42010"
INFO 2026-05-04T10:05:00.345Z rc vector 42001 MSG003 - up pid="42011"
```

Expected output when the supervision daemon is not running:

```text
INFO 2026-05-04T10:05:00.123Z rc svscan 42001 MSG001 - Not running
```

Check a single service:

```sh
npx fit-rc status trace
```

If the named service is not in the configuration, `fit-rc` exits with an error:

```text
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

This stops the named service and everything after it in the configuration
array, then starts that same slice again — dependents that were torn down come
back up, and services before the target are left untouched. Without a name,
all services restart.

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

## Tune log rotation

`fit-rc` pipes each longrun service's output through `fit-logger`, the log
writer from `@forwardimpact/libsupervise`. It reads lines on stdin, prepends an
ISO 8601 timestamp, writes to a file named `current`, and rotates that file to a
timestamped archive once it grows past a size limit. You can run `fit-logger`
directly to capture any command's output, or to test rotation settings:

```sh
my-service | npx fit-logger --dir data/logs/my-service
```

Two options tune rotation:

| Option           | Short | Default     | Effect                                       |
| ---------------- | ----- | ----------- | -------------------------------------------- |
| `--dir`          | `-d`  | required    | Directory the log files are written to.      |
| `--maxFileSize`  | `-s`  | `1000000`   | Bytes before `current` rotates to an archive. |
| `--maxFiles`     | `-n`  | `10`        | Archives retained; the oldest are pruned.    |

```sh
my-service | npx fit-logger -d data/logs/my-service -s 1048576 -n 5
```

Archives are named `@YYYY-MM-DD_HH-mm-ss-SSS.s` (the trailing `-SSS` is the
millisecond segment), so sorting filenames gives chronological order. When the
count exceeds `--maxFiles`, the oldest archives are deleted on the next
rotation.

## Supervise processes directly

`fit-rc` drives a supervision daemon, `fit-svscan`, over a Unix domain socket.
You normally never call the daemon yourself -- `fit-rc start` spawns it -- but
understanding its control interface helps when debugging a stuck service. Start
the daemon with a socket path, a PID file, and a log directory:

```sh
npx fit-svscan --socket data/svscan.sock --pid data/svscan.pid --logdir data/logs
```

| Option      | Short | Default | Effect                                          |
| ----------- | ----- | ------- | ----------------------------------------------- |
| `--socket`  | `-s`  | required| Path to the Unix socket the daemon listens on.  |
| `--pid`     | `-p`  | required| Path to the PID file the daemon writes.         |
| `--logdir`  | `-l`  | required| Directory each supervised process logs to.      |
| `--timeout` | `-t`  | `3000`  | Milliseconds to wait for `SIGTERM` before `SIGKILL`. |

Control commands are newline-delimited JSON objects sent to the socket. Each
command has a `command` field; `add` and `remove` also carry a service name:

| Command    | Fields              | Response                                  |
| ---------- | ------------------- | ----------------------------------------- |
| `ping`     |                     | `{"ok":true,"message":"pong"}`            |
| `add`      | `name`, `cmd`, `cwd`| Starts and supervises a process.          |
| `remove`   | `name`              | Stops and removes a supervised process.   |
| `status`   |                     | State, PID, and restart count per service. |
| `shutdown` |                     | Stops every service and exits the daemon.  |

The daemon answers each command with a single JSON line and closes the
connection. `shutdown` is the exception: the daemon exits before replying, so a
client sees the connection close with no response line. The daemon is a pure
supervisor -- it knows nothing about service order or oneshot commands. Ordering
and oneshot handling live in `fit-rc`, which is why `fit-rc` is the interface
you reach for day to day.

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
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

const runtime = createDefaultRuntime();

const config = {
  rootDir: process.cwd(),
  init: {
    log_dir: "data/logs",
    services: [
      { name: "trace", command: "npx gemba-trace serve" },
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
