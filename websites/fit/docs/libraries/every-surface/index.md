---
title: Give Agents and Humans the Same Interface
description: Capabilities that work on every surface — one presenter, one contract, and one formatter shared between CLI and web, with no separate integrations.
---

When a capability exists as a CLI command but not as a web page (or vice versa),
someone eventually rewrites the logic for the second surface. The two
implementations drift apart, and agents that learned one interface cannot reach
the other. `@forwardimpact/libcli`, `@forwardimpact/libui`, and
`@forwardimpact/libformat` let you write a capability once and surface it on
both the terminal and the browser through a shared contract.

## Prerequisites

- Node.js 18+
- Install all three libraries:

```sh
npm install @forwardimpact/libcli @forwardimpact/libui @forwardimpact/libformat
```

## How the shared contract works

Both surfaces produce the same frozen object, an **InvocationContext**, from
their native inputs. The CLI builds it from `argv`; the web router builds it
from the URL hash. Handlers receive this object and never know which surface
called them.

```js
{
  data,     // Object -- your application data (passed in by the host)
  args,     // { city: "london" } -- named positional arguments
  options,  // { units: "metric" } -- flags or query parameters
}
```

**Value types are uniform across surfaces.** `args` values are always strings.
`options` values are `string`, `boolean` (`true` for presence-only flags or
empty query params), or `string[]` (repeated keys). No nulls, no numbers -- if
you need a number, parse it in the handler.

The context is frozen at every level. Handlers can rely on immutability without
checking.

## 1. Write the shared presenter

The presenter takes an InvocationContext, looks up data, and returns a plain
view object. No DOM, no stdout -- data in, data out.

```js
// src/present-forecast.js
export function presentForecast(ctx) {
  const city = ctx.data.cities.find((c) => c.id === ctx.args.city);
  if (!city) throw new Error(`Unknown city: ${ctx.args.city}`);
  const forecast = city.forecast;
  return {
    city: city.name,
    temp: forecast.temp,
    units: ctx.options.units || "metric",
    condition: forecast.condition,
    wind: forecast.wind,
  };
}
```

Because the presenter depends only on a plain frozen object, you can test it
without a browser or a running process:

```js
// test/present-forecast.test.js
import { freezeInvocationContext } from "@forwardimpact/libcli";
import { presentForecast } from "../src/present-forecast.js";
import assert from "node:assert";

const ctx = freezeInvocationContext({
  data: {
    cities: [{
      id: "london",
      name: "London",
      forecast: { temp: 14, condition: "Cloudy", wind: "12 km/h" },
    }],
  },
  args: { city: "london" },
  options: { units: "metric" },
});

const view = presentForecast(ctx);
assert.strictEqual(view.city, "London");
assert.strictEqual(view.temp, 14);
assert.strictEqual(view.units, "metric");
```

Both surfaces call the same function, so a passing presenter test covers the
core logic for the CLI and the web UI at once.

## 2. Format the output for each surface

`@forwardimpact/libformat` provides two formatters that render the same markdown
content to different targets. The terminal formatter produces ANSI-styled text;
the HTML formatter produces sanitized HTML. Both implement the same
`{ format(markdown) }` interface, so you can write one formatting function and
swap the formatter at the surface boundary.

```js
// src/format-forecast.js
export function formatForecast(view, formatter) {
  const md = [
    `## ${view.city}`,
    "",
    `| Metric    | Value          |`,
    `| --------- | -------------- |`,
    `| Temp      | ${view.temp} (${view.units}) |`,
    `| Condition | ${view.condition} |`,
    `| Wind      | ${view.wind}   |`,
  ].join("\n");
  return formatter.format(md);
}
```

The CLI surface uses `createTerminalFormatter`; the web surface uses
`createHtmlFormatter`. The presenter stays the same either way.

## 3. Build the CLI surface

The CLI definition declares named positionals with `args: string[]` and a
`handler` that calls the shared presenter and formatter:

```js
#!/usr/bin/env node
// bin/weather.js
import { createCli } from "@forwardimpact/libcli";
import { createTerminalFormatter } from "@forwardimpact/libformat";
import { presentForecast } from "../src/present-forecast.js";
import { formatForecast } from "../src/format-forecast.js";
import { loadCities } from "../src/data.js";

const formatter = createTerminalFormatter();

const cli = createCli({
  name: "weather",
  version: "0.1.0",
  description: "Weather forecasts from the terminal",
  commands: [
    {
      name: "forecast",
      args: ["city"],
      argsUsage: "<city>",
      description: "Show forecast for a city",
      handler: (ctx) => {
        const view = presentForecast(ctx);
        if (ctx.options.json) {
          console.log(JSON.stringify(view, null, 2));
        } else {
          console.log(formatForecast(view, formatter));
        }
      },
    },
  ],
  globalOptions: {
    units: { type: "string", description: "Temperature units (metric|imperial)" },
    json: { type: "boolean", description: "JSON output" },
    help: { type: "boolean", short: "h", description: "Show help" },
    version: { type: "boolean", description: "Show version" },
  },
});

const parsed = cli.parse(process.argv.slice(2));
if (!parsed) process.exit(0);

const data = { cities: loadCities() };
cli.dispatch(parsed, { data });
```

`cli.dispatch` builds the InvocationContext internally -- it maps the positional
argv values to the names declared in `args: ["city"]`, merges the parsed flags
into `options`, folds in the `data` you provide, freezes everything, and calls
the handler.

Running `weather forecast london` produces ANSI-formatted output. Running
`weather forecast london --json` produces:

```json
{
  "city": "London",
  "temp": 14,
  "units": "metric",
  "condition": "Cloudy",
  "wind": "12 km/h"
}
```

Agents can always pass `--json` to get structured output. The `--help` flag
renders a grep-friendly synopsis, and `--help --json` returns the full
definition as JSON so agents can discover the interface programmatically.

## 4. Build the web surface

The web side uses `defineRoute` to declare a route and `createBoundRouter` to
dispatch it. The route descriptor's `page` function calls the same presenter:

```js
// src/main.js
import {
  createBoundRouter,
  defineRoute,
  createCommandBar,
} from "@forwardimpact/libui";
import { createHtmlFormatter } from "@forwardimpact/libformat";
import { presentForecast } from "./present-forecast.js";

const data = await fetch("/api/cities.json").then((r) => r.json());
const formatter = createHtmlFormatter();

const router = createBoundRouter({
  data,
  onNotFound: () => document.body.textContent = "City not found",
});

router.register(defineRoute({
  pattern: "/forecast/:city",
  page: (ctx) => {
    const view = presentForecast(ctx);
    document.getElementById("app").innerHTML = formatter.format(
      `## ${view.city}\n\n${view.temp} ${view.units}, ${view.condition}`
    );
  },
  cli: (ctx) => `weather forecast ${ctx.args.city}`,
}));

createCommandBar(router, {
  mountInto: document.getElementById("command-bar"),
});

router.start();
```

When the user navigates to `#/forecast/london`, the bound router:

1. Matches the pattern and extracts `{ city: "london" }` as `args`
2. Parses the query string (if any) into `options`
3. Freezes everything into an InvocationContext
4. Calls `page(ctx)`

The command bar displays `weather forecast london` with a copy button. An agent
or a person reading the web page can paste that command into a terminal to get
the same result through the CLI.

The `cli` function on the descriptor is optional. When present, the command bar
displays the equivalent CLI command. Routes without `cli` render the bar empty.

## 5. Verify both surfaces reach the same result

The simplest way to confirm both surfaces produce equivalent output is to check
that both call the same presenter with the same context shape:

```js
import { freezeInvocationContext } from "@forwardimpact/libcli";
import { presentForecast } from "../src/present-forecast.js";
import assert from "node:assert";

// Simulate what the CLI surface builds from: weather forecast london --units=imperial
const cliCtx = freezeInvocationContext({
  data: { cities: [{ id: "london", name: "London", forecast: { temp: 57, condition: "Rain", wind: "8 mph" } }] },
  args: { city: "london" },
  options: { units: "imperial" },
});

// Simulate what the web surface builds from: #/forecast/london?units=imperial
const webCtx = freezeInvocationContext({
  data: { cities: [{ id: "london", name: "London", forecast: { temp: 57, condition: "Rain", wind: "8 mph" } }] },
  args: { city: "london" },
  options: { units: "imperial" },
});

const cliView = presentForecast(cliCtx);
const webView = presentForecast(webCtx);
assert.deepStrictEqual(cliView, webView);
```

Both contexts are structurally identical because both surfaces follow the same
contract. The presenter does not branch on which surface produced the context --
it cannot tell.

## Query string parsing

The web surface parses the query string after `?` in the URL hash using
`URLSearchParams`:

| Input                    | Result                       |
| ------------------------ | ---------------------------- |
| `?json`                  | `{ json: true }`             |
| `?units=imperial`        | `{ units: "imperial" }`      |
| `?tag=rain&tag=wind`     | `{ tag: ["rain", "wind"] }`  |
| (no query)               | `{}`                         |

Empty values become `true`; repeated keys become arrays; everything else is a
string. This matches the CLI's flag parsing: `--json` produces `{ json: true }`,
`--units=imperial` produces `{ units: "imperial" }`, and `--tag=rain --tag=wind`
produces `{ tag: ["rain", "wind"] }`.

## What's next

<div class="grid">

<!-- part:card:add-capability -->

<!-- part:card:build-web-surface -->

</div>
