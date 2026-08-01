---
name: fit-logger
description: >
  Capture a command's stdout into rotated log files. Use when you need to persist
  a long-running process's output with size-based rotation and a bounded archive
  count. You do not configure a logging framework.
---

# Write Rotated Logs

`fit-logger` reads lines from stdin. It appends them to a `current` log file in
a directory. Once the file grows past a size limit, `fit-logger` rotates it to
a timestamped archive. It then prunes the oldest archives beyond a retention
count. `fit-rc` pipes each long-running service through it. You can also run it
directly to capture any command's output.

## When to Use

- Persist a process's output —
  `my-service | npx fit-logger --dir data/logs/my-service`
- Tune rotation size and retention — `-s <bytes>` / `-n <count>`
- Test rotation settings before you wire a service through it

## Usage

```sh
# Capture a command's output to a log directory
my-service | npx fit-logger --dir data/logs/my-service

# Tune rotation: 1 MiB files, keep 5 archives
my-service | npx fit-logger -d data/logs/my-service -s 1048576 -n 5
```

| Option          | Short | Default   | Effect                                          |
| --------------- | ----- | --------- | ----------------------------------------------- |
| `--dir`         | `-d`  | required  | Log directory.                                  |
| `--maxFileSize` | `-s`  | `1000000` | Bytes before `current` rotates to an archive.   |
| `--maxFiles`    | `-n`  | `10`      | Archives to keep. `fit-logger` prunes the rest. |

`fit-logger` timestamps the archives. It prunes them oldest-first once the
count exceeds `--maxFiles`.

## Documentation

- [Start, Stop, or Check a Service](https://www.forwardimpact.team/docs/libraries/service-lifecycle/manage-service/index.md)
  — Manage services through one interface, including tuning log rotation with
  `fit-logger`.
- [Manage Service Lifecycle from One Interface](https://www.forwardimpact.team/docs/libraries/service-lifecycle/index.md)
  — The full lifecycle setup, including supervision and observability.
