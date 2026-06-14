# fit-eval CLI Reference

Install and run via npm:

```sh
npx fit-eval <command> [options]
```

## Execution Commands

| Command      | Purpose                                                              |
| ------------ | -------------------------------------------------------------------- |
| `run`        | Run a single agent via the Agent SDK                                 |
| `supervise`  | Run a supervised agent–supervisor loop                               |
| `facilitate` | Run a facilitated multi-agent session                                |
| `discuss`    | Run an async, suspendable Chair-led discussion with bridge callbacks |

## Shared Options (run, supervise, facilitate, discuss)

| Flag            | Purpose                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `--task-file`   | Path to a markdown task file                                                |
| `--task-text`   | Inline task text (alternative to `--task-file`)                             |
| `--task-amend`  | Additional text appended to the task                                        |
| `--agent-model` | Claude model for agents (default: `claude-opus-4-8[1m]`)                    |
| `--max-turns`   | Max agentic turns per runner invocation (default: 50 run, 200 supervise, 20 facilitate, 40 discuss; 0 = unlimited) |
| `--output`      | Write the NDJSON trace to a file                                            |

## Run-Only Options

| Flag              | Purpose                         |
| ----------------- | ------------------------------- |
| `--cwd`           | Working directory for the agent |
| `--agent-profile` | Agent profile name to load      |
| `--allowed-tools` | Comma-separated tool allowlist  |

## Lead Role Options (supervise, facilitate, discuss)

| Flag             | Purpose                                                          |
| ---------------- | ---------------------------------------------------------------- |
| `--lead-profile` | Lead role profile name (supervisor / facilitator / chair)        |
| `--lead-model`   | Claude model for the lead role (default: `claude-opus-4-8[1m]`)  |

## Supervise-Only Options

| Flag                         | Purpose                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| `--agent-profile`            | Agent profile name                                           |
| `--allowed-tools`            | Agent tool allowlist                                         |
| `--supervisor-cwd`           | Supervisor working directory                                 |
| `--agent-cwd`                | Agent working directory                                      |
| `--supervisor-allowed-tools` | Supervisor tool allowlist                                    |

## Facilitate-Only Options

| Flag                    | Purpose                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| `--facilitator-cwd`     | Facilitator working directory                                            |
| `--agent-profiles`      | Comma-separated list of agent profile names (required)                   |
| `--agent-cwd`           | Working directory shared by participating agents (default: `.`)          |

## Discuss-Only Options

| Flag               | Purpose                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `--agent-profiles` | Comma-separated participant profile names (optional; lead can run solo)  |
| `--agent-cwd`      | Working directory shared by participants (default: `.`)                  |
| `--discussion-id`  | Stable id for the threaded conversation; carried through traces          |
| `--resume-context` | JSON-serialized prior state for a resumed run                            |

## Output Commands

| Command                        | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `output --format={json\|text}` | Read NDJSON from stdin, emit a structured or readable form |
| `tee [output.ndjson]`          | Stream readable text to stdout, save raw NDJSON to a file  |

## Global Options

| Flag        | Purpose                          |
| ----------- | -------------------------------- |
| `--format`  | Output format (`json` or `text`) |
| `--help`    | Show help                        |
| `--version` | Show version                     |
| `--json`    | Emit help as JSON                |
