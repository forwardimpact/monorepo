---
title: "Add a Capability to Both Surfaces"
description: "Ship a feature to terminal and browser at once — one presenter, one registration, both surfaces."
---

You need to add a new capability to an application that already shares a
presenter between its CLI and web surfaces. Here's how to make it appear in
both places from a single implementation.

## Prerequisites

Complete the [Agent-Friendly Surfaces](/docs/libraries/every-surface/) guide
first -- this page assumes a working `createCli` definition, a
`createBoundRouter`, and the shared presenter pattern.

- Node.js 22+
- The three surface libraries installed:

```sh
npm install @forwardimpact/libcli @forwardimpact/libui @forwardimpact/libformat
```

## Overview

Adding a capability follows four steps, each producing a testable artifact:

| Step | Artifact        | What it does                                          |
| ---- | --------------- | ----------------------------------------------------- |
| 1    | Presenter       | Transforms context into a plain view object           |
| 2    | Format function | Renders the view through a surface-agnostic formatter |
| 3    | CLI command     | Registers the presenter as a subcommand               |
| 4    | Web route       | Registers the presenter as a hash route               |

## Step 1: Write the presenter

The presenter receives an `InvocationContext` and returns a plain object. It
must not reference the DOM, stdout, or any surface-specific API.

```js
// src/present-status.js
export function presentStatus(ctx) {
  const service = ctx.data.services.find((s) => s.id === ctx.args.service);
  if (!service) throw new Error(`Unknown service: ${ctx.args.service}`);
  return {
    name: service.name,
    healthy: service.healthy,
    uptime: service.uptime,
    version: service.version,
  };
}
```

Test the presenter with `freezeInvocationContext` -- the same helper both
surfaces use internally:

```js
// test/present-status.test.js
import { freezeInvocationContext } from "@forwardimpact/libcli";
import { presentStatus } from "../src/present-status.js";
import assert from "node:assert";

const ctx = freezeInvocationContext({
  data: {
    services: [{
      id: "api", name: "API Gateway",
      healthy: true, uptime: "14d 3h", version: "2.1.0",
    }],
  },
  args: { service: "api" },
  options: {},
});

const view = presentStatus(ctx);
assert.strictEqual(view.name, "API Gateway");
assert.strictEqual(view.healthy, true);
```

Because the context is frozen and surface-neutral, a passing test here covers
the core logic for both CLI and web.

## Step 2: Write the format function

Write markdown and call `formatter.format(md)` -- both
`createTerminalFormatter` and `createHtmlFormatter` share that interface.

```js
// src/format-status.js
export function formatStatus(view, formatter) {
  const status = view.healthy ? "healthy" : "degraded";
  const md = [
    `## ${view.name}`,
    "",
    `| Field   | Value        |`,
    `| ------- | ------------ |`,
    `| Status  | ${status}    |`,
    `| Uptime  | ${view.uptime} |`,
    `| Version | ${view.version} |`,
  ].join("\n");
  return formatter.format(md);
}
```

The formatter is injected at the surface boundary -- this function does not
decide whether output becomes ANSI or HTML.

## Step 3: Register the CLI command

Add a command entry to your existing `createCli` definition. Declare the
positional in `args` and call the presenter inside the handler:

```js
// In your CLI definition file (e.g. bin/myapp.js)
import { presentStatus } from "../src/present-status.js";
import { formatStatus } from "../src/format-status.js";

// Add this entry to the commands array:
{
  name: "status",
  args: ["service"],
  argsUsage: "<service>",
  description: "Show service health status",
  handler: (ctx) => {
    const view = presentStatus(ctx);
    if (ctx.options.json) {
      console.log(JSON.stringify(view, null, 2));
    } else {
      console.log(formatStatus(view, formatter));
    }
  },
}
```

Running `myapp status api` produces formatted terminal output. Running
`myapp status api --json` produces:

```json
{
  "name": "API Gateway",
  "healthy": true,
  "uptime": "14d 3h",
  "version": "2.1.0"
}
```

Agents pass `--json` to get structured output without parsing formatted text.

## Step 4: Register the web route

Register a `defineRoute` with the existing `createBoundRouter`. The `page`
function calls the same presenter:

```js
// In your web entry point (e.g. src/main.js)
import { defineRoute } from "@forwardimpact/libui";
import { createHtmlFormatter } from "@forwardimpact/libformat";
import { presentStatus } from "./present-status.js";
import { formatStatus } from "./format-status.js";

const formatter = createHtmlFormatter();

// Register with the existing router:
router.register(defineRoute({
  pattern: "/status/:service",
  page: (ctx) => {
    const view = presentStatus(ctx);
    document.getElementById("app").innerHTML = formatStatus(view, formatter);
  },
  cli: (ctx) => `myapp status ${ctx.args.service}`,
}));
```

Navigating to `#/status/api` extracts `{ service: "api" }` as `args`, parses
any query string into `options`, freezes everything into an InvocationContext,
and calls `page(ctx)`.

The `cli` function is optional. When present, the command bar displays the
equivalent terminal command with a copy button.

## Verify

The Step 1 presenter test already covers this -- both surfaces build the same
`{ data, args, options }` shape, so the presenter returns identical output
regardless of which surface produced the context.

## Checklist

- [ ] Presenter depends only on `InvocationContext` -- no DOM, no stdout, no
      surface-specific imports
- [ ] Format function accepts a formatter argument -- does not create its own
- [ ] CLI command declares `args` with named positionals and supports `--json`
- [ ] Web route `pattern` uses the same parameter names as the CLI `args`
- [ ] Route descriptor includes a `cli` function so the command bar displays the
      terminal equivalent
- [ ] Presenter test passes with a `freezeInvocationContext` fixture
- [ ] `--json` output matches the view object returned by the presenter

## What's next

<div class="grid">

<!-- part:card:.. -->

</div>
