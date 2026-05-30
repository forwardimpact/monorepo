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

`fit-rc` reads the `init` block from `config/config.json` via
`createInitConfig()`. Services are declared in dependency order.

```json
{
  "init": {
    "log_dir": "data/logs",
    "shutdown_timeout": 3000,
    "services": [
      { "name": "trace", "command": "node -e \"import('@forwardimpact/svctrace/server.js')\"" }
    ]
  }
}
```

### Service types

**Longrun** (default) — continuously running, supervised by `svscan`,
auto-restarted on crash. Defined with `command`.

**Oneshot** — runs once on start/stop. Defined with `type: "oneshot"`,
`up`, and optionally `down`. Add `"optional": true` to skip with a
warning instead of failing.

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
actual process supervision to `libsupervise` — spawning the `fit-svscan`
daemon and communicating with it over a Unix socket.
