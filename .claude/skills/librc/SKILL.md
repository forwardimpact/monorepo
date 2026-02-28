---
name: librc
description: >
  librc - Service manager for Forward Impact. ServiceManager provides
  start/stop/status lifecycle for longrun and oneshot services. sendCommand and
  waitForSocket communicate with svscan daemon via Unix socket. CLI via fit-rc.
  Use for managing service lifecycles, orchestrating startup order, and
  controlling the supervision daemon.
---

# librc Skill

## When to Use

- Managing service lifecycle (start, stop, status, restart)
- Communicating with svscan supervision daemon
- Orchestrating service startup order
- Running oneshot initialization scripts

## Key Concepts

**ServiceManager**: Orchestrates service lifecycle by communicating with svscan
daemon. Handles longrun services (via socket commands) and oneshot services (via
direct execution).

**Service types**: Longrun services run continuously under svscan supervision.
Oneshot services execute up/down commands for initialization and teardown.

**Socket protocol**: JSON commands sent over Unix domain socket to control the
svscan daemon.

## Usage Patterns

### Pattern 1: Service management

```javascript
import { ServiceManager } from "@forwardimpact/librc";

const manager = new ServiceManager(config, logger);
await manager.start();         // Start all services
await manager.start("trace");  // Start up to 'trace' service
await manager.stop();          // Stop all services
await manager.status();        // Show service status
```

### Pattern 2: Socket communication

```javascript
import { sendCommand, waitForSocket } from "@forwardimpact/librc";

await waitForSocket("/tmp/svscan.sock", 5000);
const response = await sendCommand("/tmp/svscan.sock", { command: "status" });
```

## Integration

Depends on libconfig for configuration and libsupervise for process supervision.
CLI available as `fit-rc` for command-line service management.
