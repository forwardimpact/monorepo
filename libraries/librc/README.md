# librc

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Service lifecycle management — start, stop, and check services without manual
oversight.

<!-- END:description -->

## CLI

```sh
fit-rc start [service]     # start everything up through <service>
fit-rc stop [service]      # stop <service> and everything after it
fit-rc restart [service]   # stop then start (combined scopes)
fit-rc status [service]    # show state and PID
fit-rc logs <service>      # print current log file
```

Omit `[service]` to operate on all configured services.

## Configuration

`fit-rc` reads the `init` block from `config/config.json` with
`createInitConfig()`. Declare the services in dependency order.

```json
{
  "init": {
    "log_dir": "data/logs",
    "shutdown_timeout": 3000,
    "services": [
      { "name": "span", "command": "node -e \"import('@forwardimpact/svcspan/server.js')\"" }
    ]
  }
}
```

### Service types

**Longrun** (default) — runs continuously. `svscan` supervises it and
restarts it on a crash. Define it with `command`.

**Oneshot** — runs once on start/stop. Define it with `type: "oneshot"`,
`up`, and optionally `down`. Add `"optional": true` to skip with a
warning on failure.

## Programmatic usage

```js
import { spawn, execSync } from "node:child_process";
import { ServiceManager } from "@forwardimpact/librc";

// spawn/execSync are injected by the caller (no runtime-level equivalent
// covers detached, stdio-redirected daemon spawning).
const manager = new ServiceManager(config, logger, { spawn, execSync });
await manager.start();          // spawn svscan, add all services
await manager.status();         // query supervised state
await manager.stop();           // tear down in reverse order
```

## Relationship to libsupervise

`librc` owns the service list and lifecycle commands. It delegates
actual process supervision to `libsupervise`. It spawns the `fit-svscan`
daemon and communicates with it over a Unix socket.

## Documentation

- [Start, Stop, or Check a Service](https://www.forwardimpact.team/docs/libraries/service-lifecycle/manage-service/index.md)
  — start, stop, restart, check status, and read logs through one interface with
  `fit-rc`.
- [Manage Service Lifecycle from One Interface](https://www.forwardimpact.team/docs/libraries/service-lifecycle/index.md)
  — the full lifecycle setup, with supervision and observability.
