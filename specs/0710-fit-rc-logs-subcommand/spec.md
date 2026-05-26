---
id: 710
title: fit-rc logs subcommand
status: spec draft
issue: 479
---

## Problem

`fit-rc logs <service>` returns `unknown command "logs"` (issue #479, observed
2026-04-22 in user testing of Guide's first-time external user install
scenario).

The current troubleshooting flow for a service in `fit-rc status` backoff is
documented as a manual filesystem step at
`websites/fit/docs/getting-started/engineers/guide/index.md:146-156` — the user
is told to `cat data/logs/{service}/current`. This breaks the diagnostic flow
that begins inside `fit-rc` (status check) by forcing a context switch to a
path-aware shell command. Other service managers (Docker Compose, supervisord,
systemd) surface logs from the manager itself; the absence on `fit-rc` violates
user expectation imported from those tools.

## Scope (in)

| Component                                                                               | Change                                                                                                                                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libraries/librc/bin/fit-rc.js` (CLI definition)                                        | A `logs` command that takes a single positional service-name argument, registered next to the existing `start` / `stop` / `status` / `restart` commands |
| `libraries/librc/src/manager.js` (ServiceManager)                                       | Behaviour that emits the contents of the named service's current log file on stdout                                                                     |
| `websites/fit/docs/getting-started/engineers/guide/index.md` § Service startup failures | Replace the `cat data/logs/{service}/current` snippet with a `npx fit-rc logs <service>` example                                                        |
| `logs` operates against the log file alone                                              | Must work whether or not `fit-rc status` reports svscan as running — the source of truth is the log file, not the daemon                                |

## Scope (out)

- A `--follow` / `-f` tail-mode flag.
- Access to rotated archive log files (the `@<timestamp>` siblings of `current`)
  — the subcommand reads `current` only.
- Multi-service log interleaving or simultaneous output from more than one
  service.
- JSON output, line-count limits, byte ranges, or grep-style filters on the
  emitted contents.
- Changes to log writer format, rotation policy, or the contract of
  `libraries/libsupervise/src/logger.js`.

## Success criteria

| #   | Claim                                                                                                                    | Verification                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `fit-rc --help` lists `logs` as a command                                                                                | `fit-rc --help` stdout contains a line matching the regex `^\s+logs\b` whose remainder is non-empty                                                                                                                                           |
| 2   | `fit-rc logs <service>` emits the contents of that service's current log file to stdout                                  | In a fixture where the service's `current` log file holds the line `spec-0710-canary` and is not being rotated or written during the read, `fit-rc logs <service>` stdout contains the substring `spec-0710-canary`                             |
| 3   | `fit-rc logs <unknown>` exits non-zero with an "Unknown service" message                                                 | Exit code ≥ 1; stderr matches the regex `Unknown service:\s*<unknown>` (substring, anywhere in stderr)                                                                                                                                        |
| 4   | `fit-rc logs` with no positional argument exits non-zero with a usage error                                              | Exit code ≥ 1; stderr matches both regexes `/service/i` and `/(missing\|required)/i`                                                                                                                                                          |
| 5   | `fit-rc logs <service>` does not error when the service has not yet produced any log output                              | Exit code 0; stderr does not match `/error/i`. This holds whether the service log directory or the `current` file is missing or empty. Stdout content is design's choice                                                                      |
| 6   | The "Service startup failures" section of the getting-started page no longer instructs `cat data/logs/{service}/current` | The fenced shell block under "### Service startup failures" in `websites/fit/docs/getting-started/engineers/guide/index.md` contains a `npx fit-rc logs <service>` invocation, and does not contain a `cat data/logs/<anything>/current` line |

## Notes

- **Why `current` only.** Rotated archives (`@<timestamp>` files) are
  infrequently needed and the rotation cadence is per-service-configurable. A
  user diagnosing a service that just entered backoff almost always wants what
  was just written, which lives in `current`. Treating archives as a separate
  concern keeps the subcommand small.
- **Why no `--follow` in this spec.** The reported user need (issue #479) is
  "what just happened to make this service crash" — past-tense, not live-tail.
  Adding follow-mode brings signal-handling and stream-lifecycle decisions that
  are out of proportion to the diagnostic gap.
- **No-arg behaviour.** `fit-rc status` accepts no argument as "all services";
  `fit-rc start`/`stop` accept no argument as "all in dependency order". The
  diagnostic value of a `logs` command without a service is low (interleaved
  output is hard to read under failure conditions), and forcing the user to name
  the service matches the issue's expected use (`fit-rc logs pathway`). Spec
  criterion #4 commits to "service argument required".
- **Why no centralized CLI reference surface.** The cross-cutting
  `websites/fit/docs/reference/cli/index.md` page was removed by
  [PR #659](https://github.com/forwardimpact/monorepo/pull/659) (commit
  `3ddb9c49`) because each CLI is already covered by `--help` and (where
  applicable) task-shaped guides under
  `websites/fit/docs/libraries/<task-slug>/index.md`. `librc` ships no
  task-shaped guide today, so this spec relies on `--help` (criterion #1) for
  in-CLI discovery and on the getting-started repair (criterion #6) for the
  external-user failure scenario from issue #479. Introducing a new task-shaped
  guide for `librc` is a separate spec — `librc`'s missing task guide is a
  pre-existing gap, not one this spec waives.
