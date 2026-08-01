---
title: librepl Internals
description: "Interactive REPL library — Repl class, custom commands, state persistence, and dual-mode (interactive/piped) CLI interfaces."
---

## Overview

`@forwardimpact/librepl` provides a single `Repl` class that powers interactive
and non-interactive CLI tools. It handles readline management, command dispatch,
state persistence, and output formatting. CLI entry points then only need to
define their application-specific behaviour.

`fit-guide` (conversational agent) and `fit-visualize` (trace visualizer) use
it.

---

## Repl Class

The `Repl` class follows the standard OO+DI pattern. You inject all external
dependencies through the constructor. The defaults suit production use.

```js
import { Repl } from "@forwardimpact/librepl";

const repl = new Repl(app, formatterFn, readlineModule, processModule, osModule);
```

| Parameter        | Default                   | Purpose                          |
| ---------------- | ------------------------- | -------------------------------- |
| `app`            | `{}`                      | Application configuration object |
| `formatterFn`    | `createTerminalFormatter` | Factory that returns a formatter |
| `readlineModule` | Node `readline`           | Readline module                  |
| `processModule`  | `global.process`          | Process object (stdin/stdout)    |
| `osModule`       | Node `os`                 | OS module (user info for UID)    |

In production, you provide only `app`. The remaining parameters exist for tests.
Inject mocks to verify behaviour without real I/O.

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

| Property        | Type                                     | Purpose                                         |
| --------------- | ---------------------------------------- | ----------------------------------------------- |
| `prompt`        | `string`                                 | Prompt string (default `"> "`)                  |
| `usage`         | `string`                                 | Static help text shown before command list      |
| `documentation` | `Array<{title, url, description?}>`      | External doc links rendered after the command list (mirrors the matching SKILL.md `## Documentation` section) |
| `state`         | `object`                                 | Initial state values                            |
| `storage`       | `StorageInterface`                       | Optional storage for state persistence          |
| `commands`      | `object`                                 | Custom command definitions                      |
| `setup`         | `(state) => Promise<void>`               | Runs once before the REPL accepts input         |
| `onLine`        | `(line, state, output) => Promise<void>` | Handles non-command input (line is trimmed)     |
| `beforeLine`    | `(state) => Promise<void>`               | Hook before each non-empty line is processed    |
| `afterLine`     | `(state) => Promise<void>`               | Hook called after each line is processed        |
| `indent`        | `string`                                 | Prefix prepended to each output line (default `""`) |

---

## Lifecycle

`repl.start()` executes the following sequence:

```text
Load state from storage
  → Parse CLI arguments (override state, run CLI commands)
    → Run setup(state)
      → Enter interactive or non-interactive loop
        → For each line: beforeLine → dispatch → afterLine → save state
```

**Interactive mode** (TTY stdin) creates a readline interface that prompts and
waits for input. The REPL dispatches lines that start with `/` as commands. All
other input goes to `onLine`. The REPL silently ignores empty lines. Ctrl+C
exits cleanly.

**Non-interactive mode** (piped stdin) reads all input. It splits the input by
newline. It processes each line in sequence. It echoes each line with the prompt
before it processes the line. It exits when it consumes all the input.

**Errors:** the REPL silently catches errors that `onLine` or command handlers
throw. The REPL continues and `afterLine` still runs. Handlers should log their
own errors (typically through `libtelemetry`).

---

## Writing Custom Commands

You define commands as entries in `app.commands`. Each command has a name (the
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

| Mode          | Syntax                                         | Example                         |
| ------------- | ---------------------------------------------- | ------------------------------- |
| Interactive   | `/<command> [args...]`                         | `/name Alice`                   |
| CLI arguments | `--<command> <value>` or `--<command>=<value>` | `--name Alice` / `--name=Alice` |
| Piped input   | `/<command> [args...]`                         | `echo "/name Alice" \| bunx …`  |

`/`-prefixed commands work in both interactive and piped input. The REPL parses
`--` flags from CLI arguments before it starts. Non-boolean commands accept both
the `--key value` form (next argv entry) and the `--key=value` form (inline).
The two forms are equivalent. In CLI mode, the REPL converts dashes in flag
names to underscores for lookup (e.g. `--resource-id` maps to the `resource_id`
command). Boolean commands consume no argument. All others receive the value as
`args[0]`.

In interactive mode, the REPL lowercases command names before lookup. CLI mode
does not lowercase. It only converts dashes to underscores.

If you enter an unrecognized command interactively, the REPL shows the help
output.

### Built-in Commands

The REPL always registers three commands (user commands can override them):

| Command | Type    | Behaviour                                                                      |
| ------- | ------- | ------------------------------------------------------------------------------ |
| `clear` | boolean | Resets state to initial values and saves. Returns `false` (exits in CLI mode). |
| `help`  | boolean | Displays usage text and all commands. Returns `false` (exits in CLI mode).     |
| `exit`  | boolean | Exits the process. Hidden from CLI help via `cli: false`.                      |

---

## State Persistence

When you provide `app.storage` (any `StorageInterface` implementation), the REPL
automatically loads state on startup and saves it after every line.

The REPL keys state by the system UID (`os.userInfo().uid`) and stores it as
`{uid}.json`. So each OS user gets independent state.

```js
import { createStorage } from "@forwardimpact/libstorage";

const repl = new Repl({
  storage: createStorage("cli"),
  state: { resource_id: null },
  onLine: handlePrompt,
});
```

The `/clear` command resets all state keys to the initial values that
`app.state` defines. It then writes the reset state to storage.

---

## Output Formatting

All output flows through a formatter (from `@forwardimpact/libformat`). The
`onLine` handler receives a writable `output` stream. Write to the stream. The
REPL then formats the output and flushes it to stdout.

```js
onLine: async (line, state, output) => {
  const result = await computeResult(line);
  output.write(result);
},
```

Command handlers that return a `Readable` stream get the same treatment. The
REPL consumes the stream, formats it, and writes it to stdout.

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
`createMockStorage` from `libmock` for storage.

```js
import { Repl } from "@forwardimpact/librepl";
import { createMockStorage } from "@forwardimpact/libmock";

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

| File                   | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `src/index.js`         | `Repl` class — constructor, lifecycle, I/O |
| `test/librepl.test.js` | Unit tests with fully mocked dependencies  |

---

## What's next

<div class="grid">

<!-- part:card:../operations -->

</div>
