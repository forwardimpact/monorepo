---
name: fit-rc
description: >
  Start, stop, restart, check status, and read logs for configured services
  through one interface. Use when you need to manage a set of services without
  remembering each one's specific command, port, and flags.
---

# Start, Stop, or Check a Service

`fit-rc` is a service manager. It reads the services declared under the `init`
key of `config/config.json` and starts, stops, restarts, checks, or tails them
through one command, talking to a supervision daemon over a Unix socket.

## When to Use

- Start all configured services — `npx fit-rc start`
- Stop or restart one service — `npx fit-rc stop agent`
- Check what is running — `npx fit-rc status`
- Read a service's current log — `npx fit-rc logs trace`

## Usage

```sh
# Start everything in declared order
npx fit-rc start

# Act on one service by name
npx fit-rc stop agent
npx fit-rc restart agent

# Inspect
npx fit-rc status
npx fit-rc logs trace
```

`start`, `stop`, `status`, and `restart` take an optional service name (omit it
to act on all). `logs` requires a service name. Pass `--silent` to suppress
info-level output.

Services are defined under the `init` key of `config/config.json`. See the guide
for the configuration format and the supervision and observability setup around
it.

## Documentation

- [Start, Stop, or Check a Service](https://www.forwardimpact.team/docs/libraries/service-lifecycle/manage-service/index.md)
  — Start, stop, restart, check status, and read logs through one interface.
- [Manage Service Lifecycle from One Interface](https://www.forwardimpact.team/docs/libraries/service-lifecycle/index.md)
  — The full lifecycle setup, including supervision and observability.
