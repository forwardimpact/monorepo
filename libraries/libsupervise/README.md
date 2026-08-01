# libsupervise

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Process supervision driven by JSON daemon manifests — services stay running and
recoverable without manual intervention.

<!-- END:description -->

## Daemons

**`fit-svscan`** — supervision daemon. It manages a `SupervisionTree` of
longrun processes. It exposes a JSON-over-Unix-socket control interface.

```sh
fit-svscan --socket data/svscan.sock --pid data/svscan.pid --logdir data/logs
```

**`fit-logger`** — log writer subprocess. It reads stdin. It prepends
ISO 8601 timestamps. It writes to `current`. It rotates to
`@YYYY-MM-DD_HH-mm-ss.s` archives.

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
| `shutdown` |                       | Stop all services gracefully    |

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
(100 ms → 5 s, 2x multiplier). Each process has a `LogWriter` subprocess.
The kill targets the process group (`-pid`) to clean up child shells.

**OneshotProcess** — async `up(command)`/`down(command)` that spawn a
child process and resolve on exit.

### Log rotation

`LogWriter` writes to `current`. It rotates at 1,000,000 bytes (default).
It keeps the 10 most recent archives. By default it prepends timestamps.

## Relationship to librc

`libsupervise` is the low-level engine. It supervises individual
processes. `librc` is the high-level interface. It reads the service
list from `config.json`. It drives `fit-svscan` over the socket.

## Documentation

- [Start, Stop, or Check a Service](https://www.forwardimpact.team/docs/libraries/service-lifecycle/manage-service/index.md)
  — manage services through one interface, with the `fit-svscan`
  supervision daemon and `fit-logger` log rotation.
- [Manage Service Lifecycle from One Interface](https://www.forwardimpact.team/docs/libraries/service-lifecycle/index.md)
  — the full lifecycle setup, with supervision and observability.
