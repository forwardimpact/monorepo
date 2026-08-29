---
title: Start, Stop, or Check a Service
description: Start, stop, restart, check status, and read logs through one interface. You do not need to remember each service's specific command.
---

You need to start a service, check whether it runs, or stop it cleanly.
`fit-rc` provides a single interface for all of them. You do not need to
remember the specific command, port, and flags for each service. This page
covers one bounded task. It shows how to manage one or more services. For the
full setup with supervision and observability, see
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

The expected output follows. Your timestamps and process IDs differ:

```text
INFO 2026-05-04T10:00:01.123Z rc svscan 42001 MSG001 - Socket ready socket="data/svscan.sock"
INFO 2026-05-04T10:00:01.456Z rc span 42001 MSG002 - Service started
INFO 2026-05-04T10:00:01.789Z rc vector 42001 MSG003 - Service started
```

Start up to a specific service. This helps when you need only part of the
stack:

```sh
npx fit-rc start span
```

This starts every service from the beginning of the configuration array through
the named service. `fit-rc` does not start the services after `span`.

## Check status

```sh
npx fit-rc status
```

Expected output when the services run:

```text
INFO 2026-05-04T10:05:00.123Z rc svscan 42001 MSG001 - Running
INFO 2026-05-04T10:05:00.234Z rc span 42001 MSG002 - up pid="42010"
INFO 2026-05-04T10:05:00.345Z rc vector 42001 MSG003 - up pid="42011"
```

Expected output when the supervision daemon does not run:

```text
INFO 2026-05-04T10:05:00.123Z rc svscan 42001 MSG001 - Not running
```

Check a single service:

```sh
npx fit-rc status span
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

Stop from a specific service onward and leave the earlier services up:

```sh
npx fit-rc stop vector
```

This stops `vector` and every service after it in the configuration array, in
reverse order. The services before `vector` stay up. The daemon stays active.

Longrun services receive `SIGTERM` first. If the process does not exit within
the shutdown timeout (default 3 seconds), the daemon sends `SIGKILL` to the
entire process group. Oneshot services run their `down` command if the
configuration defines one.

## Restart a service

```sh
npx fit-rc restart span
```

This stops the named service and everything after it in the configuration
array. It then starts that same slice again. The dependents that it stopped
start again. The services before the target stay untouched. Without a name,
all services restart.

## Read logs

View the current log for a named service:

```sh
npx fit-rc logs span
```

The service name is required. Each longrun service writes output to a dedicated
directory under the configured `log_dir`. The log writer rotates files at 1 MB
and keeps the 10 most recent archives.

A service that produced no output has no log file yet. If no log file exists,
the command returns silently.

## Tune log rotation

`fit-rc` pipes each longrun service's output through `fit-logger`, the log
writer from `@forwardimpact/libsupervise`. It reads lines on stdin and prepends
an ISO 8601 timestamp. It writes to a file named `current`. It rotates that
file to a timestamped archive once the file grows past a size limit. You can
run `fit-logger` directly to capture any command's output, or to test rotation
settings:

```sh
my-service | npx fit-logger --dir data/logs/my-service
```

Two options tune rotation:

| Option           | Short | Default     | Effect                                       |
| ---------------- | ----- | ----------- | -------------------------------------------- |
| `--dir`          | `-d`  | required    | Directory that `fit-logger` writes logs to.  |
| `--maxFileSize`  | `-s`  | `1000000`   | Bytes before `current` rotates to an archive. |
| `--maxFiles`     | `-n`  | `10`        | Archives to keep. `fit-logger` deletes the oldest. |

```sh
my-service | npx fit-logger -d data/logs/my-service -s 1048576 -n 5
```

`fit-logger` names each archive `@YYYY-MM-DD_HH-mm-ss-SSS.s`. The trailing
`-SSS` is the millisecond segment. So when you sort the filenames, you get
chronological order. When the count exceeds `--maxFiles`, `fit-logger` deletes
the oldest archives on the next rotation.

## Supervise processes directly

`fit-rc` drives a supervision daemon, `fit-svscan`, over a Unix domain socket.
You normally never call the daemon yourself. `fit-rc start` spawns it. But when
you debug a stuck service, it helps to know its control interface. Start
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

You send control commands to the socket as newline-delimited JSON objects. Each
command has a `command` field. The `add` and `remove` commands also carry a
service name:

| Command    | Fields              | Response                                  |
| ---------- | ------------------- | ----------------------------------------- |
| `ping`     |                     | `{"ok":true,"message":"pong"}`            |
| `add`      | `name`, `cmd`, `cwd`| Starts and supervises a process.          |
| `remove`   | `name`              | Stops and removes a supervised process.   |
| `status`   |                     | State, PID, and restart count per service. |
| `shutdown` |                     | Stops every service and exits the daemon.  |

The daemon answers each command with a single JSON line and closes the
connection. `shutdown` is the exception. The daemon exits before it replies, so
a client sees the connection close with no response line. The daemon is a pure
supervisor. It knows nothing about service order or oneshot commands. `fit-rc`
handles the order and the oneshot commands. So `fit-rc` is the interface you
use day to day.

## Suppress output

All commands accept the `--silent` flag to suppress informational output:

```sh
npx fit-rc start --silent
```

Errors still print. This helps in scripts where you want to see only
failures.

## Programmatic usage

The `ServiceManager` class gives you the same operations:

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
      { name: "span", command: "npx @forwardimpact/svcspan" },
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

await manager.start("span");  // Start up to and including "span"
await manager.status("span"); // Check one service
await manager.logs("span");   // Print log to stdout
await manager.stop("span");   // Stop from "span" onward
```

Each method maps directly to the CLI command. `start` and `stop` accept an
optional service name. They slice the service list the same way as the CLI.
`start` takes everything up to and including the named service. `stop` takes
the named service and everything after it.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../add-observability -->

</div>
