# librepl

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Agent-friendly interactive REPL — exploratory interfaces that humans and agents
navigate the same way.

<!-- END:description -->

## Getting Started

```js
import { Repl } from '@forwardimpact/librepl';

const repl = new Repl({
  prompt: '> ',
  onLine: async (line, state, output) => { output.end(line); },
});
await repl.start();
```

## Input contract

One line of input produces one `onLine` call, whichever way it arrives.
Three equivalent input sources:

- **Positional argv (one-shot)** — `mycli "hello world"` joins the
  positional args into a single line, echoes `prompt + line`, runs
  `onLine` once, and exits 0.
- **Piped stdin** — `echo "hello world" | mycli` delivers one `onLine`
  call per line, then exits 0.
- **Interactive readline** — a TTY session delivers one `onLine` call
  per entered line.

**Flags win.** `--flag` args run their command handlers before any
positional is processed; a handler returning `false` exits without
touching the positionals (`mycli --status "hello"` never reaches
`onLine`).

**Positionals are prompt text, never commands.** `mycli status` sends
the word "status" to `onLine`; operations are always flags
(`--status`). Consumers document their own usage; the mechanism lives
here.
