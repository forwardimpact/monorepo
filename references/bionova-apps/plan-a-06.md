# Plan 1160-a-06 — CLI surface

Build the `bionova-polaris` CLI under `products/polaris/cli/` using
`@forwardimpact/libcli`. Every subcommand dispatches into the
corresponding handler from part 05.

All paths are inside `bionova-apps/`.

## Step 1 — Scaffold `products/polaris/cli/`

Created:

| File | Purpose |
| --- | --- |
| `products/polaris/cli/package.json` | `bionova-polaris`, `bin: { "bionova-polaris": "bin/bionova-polaris.js" }`, deps on libcli, librepl, libformat, libtemplate, handlers workspace |
| `products/polaris/cli/bin/bionova-polaris.js` | `#!/usr/bin/env node` entry, parses argv, dispatches |
| `products/polaris/cli/src/definition.js` | libcli definition object: commands, args, options, handlers, documentation |
| `products/polaris/cli/src/repl.js` | librepl session wiring for `bionova-polaris repl` |
| `products/polaris/cli/test/cli.test.js` | end-to-end argv parsing tests |
| `products/polaris/cli/README.md` | Usage examples (search, eligibility, admin) |

`package.json`:

```json
{
  "name": "bionova-polaris",
  "version": "0.0.0",
  "type": "module",
  "bin": { "bionova-polaris": "bin/bionova-polaris.js" },
  "dependencies": {
    "@forwardimpact/libcli": "0.1.17",
    "@forwardimpact/librepl": "0.1.16",
    "@forwardimpact/libformat": "0.1.21",
    "@forwardimpact/libtemplate": "0.2.14",
    "@bionova/polaris-handlers": "workspace:*"
  }
}
```

Verify: `bun install` resolves workspace dep; `bunx bionova-polaris --help`
prints CLI help (after step 2 lands).

## Step 2 — Author libcli definition

Created: `products/polaris/cli/src/definition.js`

```js
import { createCli } from "@forwardimpact/libcli";
import { createTemplateLoader } from "@forwardimpact/libtemplate";
import { createTerminalFormatter } from "@forwardimpact/libformat";
import * as handlers from "@bionova/polaris-handlers";

const docs = [
  {
    title: "BioNova Polaris Guide",
    url: "https://github.com/forwardimpact/bionova-apps/blob/main/products/polaris/README.md",
    description: "How to use bionova-polaris to discover trials.",
  },
];

import { TEMPLATES_DIR } from "@bionova/polaris-handlers/templates";

export function createBionovaCli({ data }) {
  const templates = createTemplateLoader(TEMPLATES_DIR);
  const term = createTerminalFormatter();

  const render = (templateName) => (result) => {
    const md = templates.render(`${templateName}.md`, result);
    return term.format(md);
  };

  // All read commands accept `--json` to emit raw handler data instead of
  // templated ANSI output. The smoke script (plan-a-08) uses this for SC4.
  const jsonOption = { json: { type: "boolean", description: "Emit raw JSON instead of formatted output" } };

  const renderOrJson = (templateName) => (result, ctx) => {
    if (ctx.options.json) return JSON.stringify(result, null, 2);
    return render(templateName)(result);
  };

  return createCli({
    name: "bionova-polaris",
    description: "Find clinical trials for which you may be eligible.",
    documentation: docs,
    commands: [
      {
        name: "search",
        description: "Search trials by condition, phase, location.",
        options: {
          condition: { type: "string", description: "Plain-language condition or catalog id" },
          phase: { type: "string", description: "Trial phase (1|2|3|4)" },
          status: { type: "string", description: "Enrollment status (recruiting|active|completed)" },
          location: { type: "string", description: "City or state filter" },
          ...jsonOption,
        },
        handler: async (ctx) => renderOrJson("search-trials")(await handlers.searchTrials(ctx), ctx),
      },
      {
        name: "trial",
        description: "Show details for a single trial.",
        args: ["id"],
        handler: async (ctx) => renderOrJson("show-trial")(await handlers.showTrial(ctx), ctx),
      },
      {
        name: "condition",
        description: "Show a condition and its plain-language explainer.",
        args: ["id"],
        handler: async (ctx) => renderOrJson("show-condition")(await handlers.showCondition(ctx), ctx),
      },
      {
        name: "eligibility",
        description: "Run the eligibility screener for a trial.",
        args: ["id"],
        options: {
          age: { type: "string" },
          conditions: { type: "string" },
          ecog: { type: "string" },
        },
        handler: async (ctx) => renderOrJson("check-eligibility")(await handlers.checkEligibility(ctx), ctx),
      },
      {
        name: "sites",
        description: "List enrollment sites.",
        options: { specialty: { type: "string" } },
        handler: async (ctx) => renderOrJson("list-sites")(await handlers.listSites(ctx), ctx),
      },
      {
        name: "stories",
        description: "List patient stories, optionally by condition.",
        options: { condition: { type: "string" } },
        handler: async (ctx) => renderOrJson("list-stories")(await handlers.listStories(ctx), ctx),
      },
      {
        name: "about",
        description: "Show information about BioNova.",
        handler: async (ctx) => renderOrJson("show-about")(await handlers.showAbout(ctx), ctx),
      },
      {
        name: "admin trial",
        description: "Manage a single trial (staff only).",
        args: ["id"],
        options: {
          token: { type: "string", description: "Staff JWT; defaults to $SUPABASE_SERVICE_ROLE_KEY" },
          update: { type: "string", description: "JSON patch (allowed keys: status, current_enrollment, estimated_end_date, arms)" },
          ...jsonOption,
        },
        handler: async (ctx) => {
          const token = ctx.options.token || data.env.SUPABASE_SERVICE_ROLE_KEY;
          return renderOrJson("manage-trial")(await handlers.manageTrial({ ...ctx, data: { ...ctx.data, token } }), ctx);
        },
      },
      {
        name: "repl",
        description: "Open a REPL for interactive trial exploration.",
        handler: (ctx) => import("./repl.js").then((m) => m.startRepl(ctx)),
      },
    ],
  });
}
```

Verify: `bunx bionova-polaris --help` lists all 9 commands;
`bunx bionova-polaris search --help` shows the four options.

## Step 3 — Author bin entry

Created: `products/polaris/cli/bin/bionova-polaris.js`

```js
#!/usr/bin/env node
import { createBionovaCli } from "../src/definition.js";
import { createDataContext } from "@bionova/polaris-handlers/context";

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? "http://localhost:8000",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  TEI_URL: process.env.TEI_URL ?? "http://localhost:8080",
};

const data = { env, ...createDataContext(env) };
const cli = createBionovaCli({ data });
const parsed = cli.parse(process.argv.slice(2));

if (parsed) {
  const result = await cli.dispatch(parsed, { data });
  if (typeof result === "string" && result.length > 0) {
    process.stdout.write(result + "\n");
  }
  // handlers that own their own output (e.g. `repl`) return undefined; do nothing
} else {
  // libcli returned null after handling --help/--version; exit 0
  process.exit(0);
}
```

Make executable: `chmod +x products/polaris/cli/bin/bionova-polaris.js`.

Verify:
`./products/polaris/cli/bin/bionova-polaris.js search --condition=diabetes`
(against running stack) prints a list of diabetes trials in ANSI-formatted
output.

## Step 4 — Implement REPL

Created: `products/polaris/cli/src/repl.js`

Per librepl's real API (verified against
`libraries/librepl/src/index.js:268,316`):

- Commands are invoked by typing `/<command>` (leading slash required);
  bare input falls through to the `onLine` handler.
- Commands are objects shaped `{ usage, handler, type? }`. The handler
  signature is `(args: string[], state) => Promise<string|false>`.
- librepl only writes output to the readline stream if the handler
  returns a value with `.on()` (a Readable stream). Returning a plain
  string is ignored — the handler must write to the REPL's output
  itself OR return a Readable.
- Built-ins: `/help`, `/clear`, `/exit`.

The handler pattern: take `args + state`, do the work, write the
formatted result to `state.output` (a writable stream librepl injects),
return `false` (signal "I handled output").

```js
import { Readable } from "stream";
import { Repl } from "@forwardimpact/librepl";
import * as handlers from "@bionova/polaris-handlers";

const out = (text) => Readable.from([text.endsWith("\n") ? text : text + "\n"]);

export async function startRepl(ctx) {
  const repl = new Repl({
    prompt: "bionova> ",
    state: { lastResults: null },
    documentation: [{
      title: "REPL Guide",
      url: "https://github.com/forwardimpact/bionova-apps/blob/main/products/polaris/cli/README.md#repl",
    }],
    commands: {
      search: {
        usage: "/search --condition=<text> — find trials by condition",
        handler: async (args, state) => {
          const result = await handlers.searchTrials({ ...ctx, options: parseKvArgs(args) });
          state.lastResults = result.trials;
          return out(formatTrials(result.trials));
        },
      },
      trial: {
        usage: "/trial <idx|id> — show details for one trial (idx into last search)",
        handler: async (args, state) => {
          const arg = args[0] ?? "";
          const idx = Number.parseInt(arg, 10);
          const id = Number.isInteger(idx) && state.lastResults?.[idx]
            ? state.lastResults[idx].id
            : arg;
          return out(formatTrialDetail(await handlers.showTrial({ ...ctx, args: { id } })));
        },
      },
      condition: {
        usage: "/condition <id> — show a condition and its explainer",
        handler: async (args) => out(formatCondition(await handlers.showCondition({ ...ctx, args: { id: args[0] ?? "" } }))),
      },
      sites: {
        usage: "/sites [--specialty=<name>] — list enrollment sites",
        handler: async (args) => out(formatSites(await handlers.listSites({ ...ctx, options: parseKvArgs(args) }))),
      },
      stories: {
        usage: "/stories [--condition=<id>] — list patient stories",
        handler: async (args) => out(formatStories(await handlers.listStories({ ...ctx, options: parseKvArgs(args) }))),
      },
    },
  });
  await repl.start();
}

function parseKvArgs(args) {
  const out = {};
  for (const a of args) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
function formatTrials(trials) { /* ANSI table */ }
function formatTrialDetail(detail) { /* ANSI formatted block */ }
function formatCondition(detail) { /* ANSI block: condition + explainer */ }
function formatSites(sites) { /* ANSI table */ }
function formatStories(result) { /* ANSI list of patient stories */ }
```

REPL session usage (note the leading slash):

```text
bionova> /search --condition=diabetes
[...table of trials...]
bionova> /trial 0
[...detail of first hit...]
bionova> /help
bionova> /exit
```

Verify: `bunx bionova-polaris repl` opens an interactive prompt; `search
--condition=diabetes` then `trial 0` shows the first trial's details.

## Step 5 — Tests

Created: `products/polaris/cli/test/cli.test.js`

Tests:

- `cli.parse(["search","--condition=diabetes"])` returns expected parsed shape
- `cli.parse(["admin","trial","abc-123"])` resolves nested subcommand
- `cli.parse(["--help"])` returns null with help message
- handler dispatch goes through frozen InvocationContext (asserts
  `Object.isFrozen`)
- output formatting uses ANSI (assert ESC sequences present in result)

Verify: `bun test products/polaris/cli/` exits 0; mocked handler context
asserts work.

## Step 6 — End-to-end smoke against running stack

Created: `products/polaris/cli/test/e2e.sh`

```sh
#!/usr/bin/env bash
set -euo pipefail
# Requires docker compose up && ./setup.sh
NODE="$(dirname "${BASH_SOURCE[0]}")/../bin/bionova-polaris.js"

echo "Test 1: search diabetes"
output=$("$NODE" search --condition=diabetes)
echo "$output" | grep -qi "diabetes" || { echo "FAIL: no diabetes match"; exit 1; }

echo "Test 2: trial detail"
trial_id=$(curl -s http://localhost:8000/rest/v1/trials?limit=1 -H "apikey:$ANON_KEY" | jq -r '.[0].id')
"$NODE" trial "$trial_id" | grep -q "$trial_id" || { echo "FAIL"; exit 1; }

echo "Test 3: sites"
"$NODE" sites | grep -qE "[A-Z][a-z]+, [A-Z]{2}" || { echo "FAIL: no city,state"; exit 1; }

echo "All CLI smoke tests pass."
```

Verify: `bash products/polaris/cli/test/e2e.sh` exits 0 against a freshly
seeded stack.

## Step 7 — Open part-06 PR

```sh
git checkout -b products/polaris-cli
git add products/polaris/cli/
git commit -m "products: bionova-polaris CLI"
git push -u origin products/polaris-cli
gh pr create --title "products: bionova-polaris CLI" --body "Implements plan-a-06 of spec 1160. CLI dispatches into shared handlers; REPL subcommand wired via librepl."
```

Verify: PR CI green (lint + bun test); manual smoke against local stack
documented in PR description.

## Verification (end of part 06)

- [ ] `bunx bionova-polaris --help` lists all 9 commands.
- [ ] `bionova-polaris search --condition=diabetes` returns trials matching
      diabetes (success criterion #4 partial — matches web search result; full
      match deferred to part 08).
- [ ] `bionova-polaris condition <id>` shows the condition and its explainer;
      `bionova-polaris stories --condition=<id>` lists that condition's patient
      stories.
- [ ] `bionova-polaris repl` opens librepl-based session. Typing
      `/search --condition=diabetes` then `/trial 0` shows trial detail. (Bare
      `search` without slash prefix triggers `/help` per librepl convention.)
- [ ] `bionova-polaris admin trial <id>` fails without `--token` or
      `SUPABASE_SERVICE_ROLE_KEY` env.
- [ ] `bionova-polaris admin trial <id>` with service role succeeds and shows
      interest signal aggregates (success criterion #5 partial — verified
      end-to-end in part 08).
- [ ] `bun test products/polaris/cli/` exits 0.
- [ ] `bash products/polaris/cli/test/e2e.sh` exits 0 against running stack.

— Staff Engineer 🛠️
