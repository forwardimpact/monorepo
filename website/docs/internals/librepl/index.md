---
title: librepl Internals
description: "Interactive REPL framework — Repl class, custom commands, state persistence, and dual-mode (interactive/piped) CLI interfaces."
---

## Overview

`@forwardimpact/librepl` provides a single `Repl` class that powers interactive
and non-interactive CLI tools. It handles readline management, command dispatch,
state persistence, and output formatting so that CLI entry points only need to
define their application-specific behaviour.

Used by `fit-guide` (conversational agent) and `fit-visualize` (trace
visualizer).

---

## Repl Class

The `Repl` class follows the standard OO+DI pattern. All external dependencies
are injected through the constructor with sensible defaults for production use.

```js
import { Repl } from "@forwardimpact/librepl";

const repl = new Repl(app, formatterFn, readlineModule, processModule, osModule);
```

| Parameter        | Default                    | Purpose                          |
| ---------------- | -------------------------- | -------------------------------- |
| `app`            | `{}`                       | Application configuration object |
| `formatterFn`    | `createTerminalFormatter`  | Factory that returns a formatter |
| `readlineModule` | Node `readline`            | Readline module                  |
| `processModule`  | `global.process`           | Process object (stdin/stdout)    |
| `osModule`       | Node `os`                  | OS module (user info for UID)    |

In production, only `app` is provided. The remaining parameters exist for
testing — inject mocks to verify behaviour without real I/O.

### Public API

- **`repl.start()`** — Starts the REPL lifecycle (see below).
- **`repl.state`** — The mutable state object, initialized from `app.state`.

---

## Application Configuration

The `app` object passed to the constructor defines all application behaviour.

```js
const repl = new Repl({
  prompt: "guide> ",
  usage: "**Usage:** <message>\n\nSend a message to the agent.",
  state: { resource_id: null },
  storage: createStorage("cli"),
  commands: { /* see Writing Custom Commands */ },
  setup: async (state) => { /* one-time initialization */ },
  onLine: async (line, state, output) => { /* handle user input */ },
  beforeLine: async (state) => { /* called before each line */ },
  afterLine: async (state) => { /* called after each line */ },
});
```

| Property     | Type                                              | Purpose                                      |
| ------------ | ------------------------------------------------- | -------------------------------------------- |
| `prompt`     | `string`                                          | Prompt string (default `"> "`)               |
| `usage`      | `string`                                          | Static help text shown before command list    |
| `state`      | `object`                                          | Initial state values                         |
| `storage`    | `StorageInterface`                                | Optional storage for state persistence       |
| `commands`   | `object`                                          | Custom command definitions                   |
| `setup`      | `(state) => Promise<void>`                        | Runs once before the REPL accepts input      |
| `onLine`     | `(line, state, output) => Promise<void>`          | Handles non-command input (line is trimmed)  |
| `beforeLine` | `(state) => Promise<void>`                        | Hook before each non-empty line is processed |
| `afterLine`  | `(state) => Promise<void>`                        | Hook called after each line is processed     |

---

## Lifecycle

`repl.start()` executes the following sequence:

```
Load state from storage
  → Parse CLI arguments (override state, run CLI commands)
    → Run setup(state)
      → Enter interactive or non-interactive loop
        → For each line: beforeLine → dispatch → afterLine → save state
```

**Interactive mode** (TTY stdin): creates a readline interface that prompts and
waits for input. Lines starting with `/` are dispatched as commands; all other
input goes to `onLine`. Empty lines are silently ignored. Ctrl+C exits cleanly.

**Non-interactive mode** (piped stdin): reads all input, splits by newline, and
processes each line sequentially. Each line is echoed with the prompt before
processing. Exits when input is consumed.

**Error handling:** errors thrown by `onLine` or command handlers are caught
silently — the REPL continues and `afterLine` still runs. Handlers are expected
to log their own errors (typically via `libtelemetry`).

---

## Writing Custom Commands

Commands are defined as entries in `app.commands`. Each command has a name (the
object key), a `usage` string, and a `handler` function.

```js
commands: {
  name: {
    usage: "Set your name",
    handler: (args, state) => {
      state.name = args[0];
    },
  },
  shout: {
    usage: "Toggle uppercase output",
    type: "boolean",
    handler: (args, state) => {
      state.shout = !state.shout;
    },
  },
},
```

### Command Definition

| Field     | Type       | Required | Purpose                                                     |
| --------- | ---------- | -------- | ----------------------------------------------------------- |
| `usage`   | `string`   | Yes      | Help text shown in `/help` output                           |
| `handler` | `function` | Yes      | `(args: string[], state: object) => Promise<result>`        |
| `type`    | `string`   | No       | Set to `"boolean"` if the command takes no arguments        |
| `cli`     | `boolean`  | No       | Set to `false` to hide from non-interactive `--help` output |

### Handler Return Values

| Return value | Behaviour                                                          |
| ------------ | ------------------------------------------------------------------ |
| `undefined`  | Normal completion, REPL continues                                  |
| `false`      | In CLI arg parsing: stops processing remaining args and exits.     |
|              | In interactive mode: no special effect (treated like `undefined`). |
| A `Readable` | Stream is piped through the formatter to stdout (interactive only; |
|              | ignored during CLI arg parsing).                                   |

### How Commands are Invoked

Commands work in both modes with different syntax:

| Mode            | Syntax                    | Example                       |
| --------------- | ------------------------- | ----------------------------- |
| Interactive     | `/<command> [args...]`    | `/name Alice`                 |
| CLI arguments   | `--<command> [args...]`   | `--name Alice`                |
| Piped input     | `/<command> [args...]`    | `echo "/name Alice" \| bunx …` |

`/`-prefixed commands work in both interactive and piped input. `--` flags are
parsed from CLI arguments before the REPL starts. In CLI mode, dashes in flag
names are converted to underscores for lookup (e.g. `--resource-id` maps to the
`resource_id` command). Boolean commands consume no argument; all others consume
the next CLI argument as `args[0]`.

In interactive mode, command names are lowercased before lookup. CLI mode does
not lowercase — it only converts dashes to underscores.

If an unrecognized command is entered interactively, the help output is shown.

### Built-in Commands

Three commands are always registered (user commands can override them):

| Command  | Type    | Behaviour                                                         |
| -------- | ------- | ----------------------------------------------------------------- |
| `clear`  | boolean | Resets state to initial values and saves. Returns `false` (exits in CLI mode). |
| `help`   | boolean | Displays usage text and all commands. Returns `false` (exits in CLI mode).     |
| `exit`   | boolean | Exits the process. Hidden from CLI help via `cli: false`.         |

---

## State Persistence

When `app.storage` is provided (any `StorageInterface` implementation), the REPL
automatically loads state on startup and saves it after every line.

State is keyed by the system UID (`os.userInfo().uid`), stored as
`{uid}.json`. This means each OS user gets independent state.

```js
import { createStorage } from "@forwardimpact/libstorage";

const repl = new Repl({
  storage: createStorage("cli"),
  state: { resource_id: null },
  onLine: handlePrompt,
});
```

The `/clear` command resets all state keys to their initial values defined in
`app.state` and writes the reset state to storage.

---

## Output Formatting

All output flows through a formatter (from `@forwardimpact/libformat`). The
`onLine` handler receives a writable `output` stream — write to it and the REPL
handles formatting and flushing to stdout.

```js
onLine: async (line, state, output) => {
  const result = await computeResult(line);
  output.write(result);
},
```

Command handlers that return a `Readable` stream get the same treatment — the
stream is consumed, formatted, and written to stdout.

---

## Example: Minimal REPL

```js
import { Repl } from "@forwardimpact/librepl";

const repl = new Repl({
  prompt: "echo> ",
  onLine: async (line, state, output) => {
    output.write(`You said: ${line}`);
  },
});

repl.start();
```

## Example: REPL with Commands and State

```js
import { Repl } from "@forwardimpact/librepl";
import { createStorage } from "@forwardimpact/libstorage";

const repl = new Repl({
  prompt: "greeter> ",
  usage: "**Usage:** <message>\n\nType a message. Use /name to set who you are.",
  storage: createStorage("greeter"),

  state: {
    name: "world",
    shout: false,
  },

  commands: {
    name: {
      usage: "Set your name",
      handler: (args, state) => {
        state.name = args[0];
      },
    },
    shout: {
      usage: "Toggle uppercase output",
      type: "boolean",
      handler: (args, state) => {
        state.shout = !state.shout;
      },
    },
  },

  onLine: async (line, state, output) => {
    let greeting = `Hello, ${state.name}! You said: ${line}`;
    if (state.shout) greeting = greeting.toUpperCase();
    output.write(greeting);
  },
});

repl.start();
```

---

## Testing

Inject mocks for all dependencies to test without real I/O. Use
`createMockStorage` from `libharness` for storage.

```js
import { Repl } from "@forwardimpact/librepl";
import { createMockStorage } from "@forwardimpact/libharness";

const mockFormatter = () => ({ format: (text) => text });
const mockReadline = { createInterface: () => ({ on() {}, prompt() {} }) };
const mockProcess = {
  argv: ["node", "script.js"],
  stdin: { isTTY: true },
  stdout: { write() {} },
  exit() {},
};
const mockOs = { userInfo: () => ({ uid: 1000 }) };

const repl = new Repl(
  { state: { key: "value" }, storage: createMockStorage() },
  mockFormatter,
  mockReadline,
  mockProcess,
  mockOs,
);
```

---

## Module Index

| File                | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `index.js`          | `Repl` class — constructor, lifecycle, I/O    |
| `test/librepl.test.js` | Unit tests with fully mocked dependencies |

---

## Related Documentation

- [Guide Internals](/docs/internals/guide/) — Primary consumer of librepl
- [Operations Reference](/docs/internals/operations/) — Service management and
  environment setup
