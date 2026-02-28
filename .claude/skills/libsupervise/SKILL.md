---
name: libsupervise
description: >
  libsupervise - Process supervision for Forward Impact services. LongrunProcess
  supervises long-running daemons with automatic restart and exponential backoff.
  OneshotProcess runs one-time initialization scripts. SupervisionTree manages
  multiple processes with log routing. ProcessState tracks lifecycle states. Use
  for process management, service supervision, and log rotation.
---

# libsupervise Skill

## When to Use

- Supervising long-running daemon processes
- Managing process lifecycle with automatic restarts
- Running one-time setup/teardown scripts
- Building supervision trees for multiple services
- Rotating and managing service log files

## Key Concepts

**ProcessState**: State machine tracking process lifecycle through down,
starting, up, stopping, and backoff states.

**LongrunProcess**: Supervised daemon with exponential backoff restart. Uses
detached process groups for clean shutdown of entire process trees.

**SupervisionTree**: Manages multiple LongrunProcess instances with dedicated
log writers per process. Inspired by s6-svscan.

**LogWriter**: Reliable log writer with automatic file rotation and archive
pruning. Inspired by s6-log.

## Usage Patterns

### Pattern 1: Supervise a long-running process

```javascript
import { LongrunProcess } from "@forwardimpact/libsupervise";

const proc = new LongrunProcess("api", "node server.js", {
  stdout: process.stdout,
  stderr: process.stderr,
});
proc.on("up", ({ name, pid }) => console.log(`${name} started: ${pid}`));
proc.on("backoff", ({ name, delay }) => console.log(`${name} restarting in ${delay}ms`));
await proc.start();
```

### Pattern 2: Supervision tree

```javascript
import { SupervisionTree } from "@forwardimpact/libsupervise";

const tree = new SupervisionTree("/var/log/services");
await tree.start();
await tree.add("db", "node db-service.js");
await tree.add("api", "node api-service.js");
const status = tree.getStatus();
await tree.stop();
```

### Pattern 3: Log rotation

```javascript
import { LogWriter } from "@forwardimpact/libsupervise";

const writer = new LogWriter("/var/log/api", { maxFileSize: 1_000_000, maxFiles: 10 });
await writer.init();
await writer.write("Server started on port 3000");
```

## Integration

Used by librc ServiceManager for process supervision. CLI binaries fit-svscan
and fit-logger provide daemon and log management.
