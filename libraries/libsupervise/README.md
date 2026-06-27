# libsupervise

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Process supervision driven by JSON daemon manifests — services stay running and
recoverable without manual intervention.

<!-- END:description -->

## Daemons

**`fit-svscan`** — supervision daemon. Manages a `SupervisionTree` of
longrun processes and exposes a JSON-over-Unix-socket control interface.

```sh
fit-svscan --socket data/svscan.sock --pid data/svscan.pid --logdir data/logs
```

**`fit-logger`** — log writer subprocess. Reads stdin, prepends ISO 8601
timestamps, writes to `current`, and rotates to `@YYYY-MM-DD_HH-mm-ss.s`
archives.

```sh
fit-logger --dir data/logs/myservice --maxFileSize 1000000 --maxFiles 10
```

## Socket protocol

Commands are newline-delimited JSON sent to the `fit-svscan` socket.

| Command    | Payload fields        | Effect                          |
| ---------- | --------------------- | ------------------------------- |
| `add`      | `name`, `cmd`, `cwd`  | Start and supervise a process   |
| `remove`   | `name`                | Stop and remove a process       |
| `status`   |                       | Return state/PID of all services|
| `ping`     |                       | Health check (`pong`)           |
| `shutdown` |                       | Graceful stop of all services   |

## Programmatic usage

```js
import { createSupervisionTree } from "@forwardimpact/libsupervise";

const tree = createSupervisionTree("data/logs");
await tree.start();
await tree.add("api", "node server.js");
tree.getStatus();   // { api: { state: "up", pid: 1234, ... } }
await tree.stop();
```

### Process types

**LongrunProcess** — auto-restarts on crash with exponential backoff
(100 ms → 5 s, 2x multiplier). Each process is paired with a `LogWriter`
subprocess. Killed via process group (`-pid`) to clean up child shells.

**OneshotProcess** — async `up(command)`/`down(command)` that spawn a
child process and resolve on exit.

### Log rotation

`LogWriter` writes to `current` and rotates at 1,000,000 bytes
(default), keeping the 10 most recent archives. Timestamps are prepended
by default.

## Relationship to librc

`libsupervise` is the low-level engine — it supervises individual
processes. `librc` is the high-level interface — it reads the service
list from `config.json` and drives `fit-svscan` over the socket.

## Documentation

- [Start, Stop, or Check a Service](https://www.forwardimpact.team/docs/libraries/service-lifecycle/manage-service/index.md)
  — manage services through one interface, including the `fit-svscan`
  supervision daemon and `fit-logger` log rotation.
- [Manage Service Lifecycle from One Interface](https://www.forwardimpact.team/docs/libraries/service-lifecycle/index.md)
  — the full lifecycle setup, including supervision and observability.
