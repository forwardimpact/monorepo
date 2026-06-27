---
title: "Build an Interactive REPL"
description: "Give humans and agents the same exploratory loop — one command set that works at the prompt and as one-shot flags, with state that survives between sessions."
---

A CLI answers one question per invocation. Some work is exploratory: a person or
an agent issues a command, reads the result, and issues the next command with the
previous one in mind. `@forwardimpact/librepl` provides a `Repl` that runs that
loop. The same command set works two ways — typed at an interactive prompt and
passed as one-shot flags — so an agent that learned the flags can drive the tool
non-interactively, and a person can explore the same commands by hand.

## Prerequisites

- Node.js 18+
- Install librepl:

```sh
npm install @forwardimpact/librepl
```

The terminal formatter ships as a dependency, so REPL output is rendered the same
way as the rest of the [shared-surface stack](/docs/libraries/every-surface/).

## 1. Define the application

A `Repl` is constructed from an application object. The two fields you will almost
always set are `commands` (the named operations) and `onLine` (what to do with a
plain line of input that is not a command).

```js
#!/usr/bin/env node
// bin/notes.js
import { Repl } from "@forwardimpact/librepl";
import { Readable } from "node:stream";

const repl = new Repl({
  prompt: "notes> ",
  state: { entries: [] },
  onLine: async (line, state, output) => {
    state.entries.push(line);
    output.end(`Saved. ${state.entries.length} note(s) total.`);
  },
  commands: {
    list: {
      usage: "Show all saved notes",
      type: "boolean",
      handler: async (_args, state) => {
        const body = state.entries.length
          ? state.entries.map((e, i) => `${i + 1}. ${e}`).join("\n")
          : "No notes yet.";
        return Readable.from([body]);
      },
    },
  },
});

await repl.start();
```

Three things are happening here:

- `state` declares the application's data and its initial values. The same object
  is passed to every handler, so commands read and write shared state.
- `onLine` receives a plain input line, the live `state`, and an `output` stream.
  Write the result to `output` and call `output.end()` when done.
- Each entry in `commands` has a `usage` string and a `handler`. A command marked
  `type: "boolean"` takes no arguments. A handler may return a `Readable` stream
  to print output, or return `false` to exit early.

## 2. Run it both ways

The same definition drives two modes, chosen automatically by whether input is a
terminal.

**Interactive** — run the binary with a terminal attached:

```sh
notes
```

```text
notes> Buy milk
Saved. 1 note(s) total.
notes> /list
1. Buy milk
notes>
```

Commands are typed with a leading `/`; anything else is a line for `onLine`.

**Non-interactive** — every command is also a `--flag`, so an agent can invoke
the same operations without a prompt:

```sh
notes --list
```

The `--list` flag maps to the `list` command. A command whose name has
underscores maps to a dashed flag (`clear_cache` becomes `--clear-cache`). Piping
input on stdin runs each line through the same handler the interactive prompt
uses, so a recorded session replays exactly.

## 3. Persist state between sessions

By default, state lives only for the duration of the process. Pass a `storage`
object and the REPL loads state on start and saves it after every line. The
storage object implements a small interface — `exists(key)`, `get(key)`, and
`put(key, value)` — so you choose where state lives.

```js
import { Repl } from "@forwardimpact/librepl";

const memory = new Map();
const storage = {
  async exists(key) {
    return memory.has(key);
  },
  async get(key) {
    return memory.get(key);
  },
  async put(key, value) {
    memory.set(key, value);
  },
};

const repl = new Repl({
  prompt: "notes> ",
  state: { entries: [] },
  storage,
  onLine: async (line, state, output) => {
    state.entries.push(line);
    output.end(`Saved. ${state.entries.length} note(s) total.`);
  },
});

await repl.start();
```

State is keyed per user, so two people on the same machine keep separate
histories. `@forwardimpact/libstorage` provides ready-made backends (local files,
S3, Supabase) that satisfy this interface — see
[Ground Agents in Context](/docs/libraries/ground-agents/) — but any object with
the three methods works, which keeps tests free of real I/O.

## Built-in commands

Three commands exist on every REPL without being declared:

| Command  | Flag      | Effect                                       |
| -------- | --------- | -------------------------------------------- |
| `/help`  | `--help`  | Print usage, the command list, and doc links |
| `/clear` | `--clear` | Reset state to its declared initial values   |
| `/exit`  | (none)    | Leave the interactive prompt                 |

`/exit` is interactive-only; it does not appear in the flag list because exiting
has no meaning in one-shot mode. Your own commands are merged with these and the
combined list is sorted alphabetically in the help output.

## Discovery links for agents

The help output can carry a `documentation` array — the same external links an
agent finds in a matching skill. An agent reaching the REPL through `--help` gets
the same progressive-disclosure links it would get anywhere else:

```js
const repl = new Repl({
  prompt: "notes> ",
  documentation: [
    {
      title: "Build an Interactive REPL",
      url: "https://www.forwardimpact.team/docs/libraries/every-surface/interactive-repl/index.md",
      description: "Command definitions, state persistence, and storage",
    },
  ],
  // ...commands, onLine, state
});
```

## Verify

- [ ] `notes --help` lists every command in both the flag form and the `/` form.
- [ ] A plain line at the prompt reaches `onLine` and updates `state`.
- [ ] `/list` (and `notes --list`) return the same output for the same state.
- [ ] With a `storage` object set, a value saved in one session is present after
      restarting the process.
- [ ] `/clear` resets `state` to the initial values declared on the app.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../render-templates -->

</div>
