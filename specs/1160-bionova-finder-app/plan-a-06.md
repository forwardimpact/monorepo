# Plan 1160-a-06 — CLI surface

Build the `bionova-finder` CLI under `products/finder/cli/` using
`@forwardimpact/libcli`. Every subcommand dispatches into the
corresponding handler from part 05.

All paths are inside `bionova-apps/`.

## Step 1 — Scaffold `products/finder/cli/`

Created:

| File | Purpose |
| --- | --- |
| `products/finder/cli/package.json` | `bionova-finder`, `bin: { "bionova-finder": "bin/bionova-finder.js" }`, deps on libcli, librepl, libformat, libtemplate, handlers workspace |
| `products/finder/cli/bin/bionova-finder.js` | `#!/usr/bin/env node` entry, parses argv, dispatches |
| `products/finder/cli/src/definition.js` | libcli definition object: commands, args, options, handlers, documentation |
| `products/finder/cli/src/repl.js` | librepl session wiring for `bionova-finder repl` |
| `products/finder/cli/test/cli.test.js` | end-to-end argv parsing tests |
| `products/finder/cli/README.md` | Usage examples (search, eligibility, admin) |

`package.json`:

```json
{
  "name": "bionova-finder",
  "version": "0.0.0",
  "type": "module",
  "bin": { "bionova-finder": "bin/bionova-finder.js" },
  "dependencies": {
    "@forwardimpact/libcli": "0.1.9",
    "@forwardimpact/librepl": "0.1.12",
    "@forwardimpact/libformat": "0.1.15",
    "@forwardimpact/libtemplate": "0.2.10",
    "@bionova/finder-handlers": "workspace:*"
  }
}
```

Verify: `bun install` resolves workspace dep; `bunx bionova-finder --help`
prints CLI help (after step 2 lands).

## Step 2 — Author libcli definition

Created: `products/finder/cli/src/definition.js`

```js
import { createCli } from "@forwardimpact/libcli";
import { createTemplateLoader } from "@forwardimpact/libtemplate";
import { createTerminalFormatter } from "@forwardimpact/libformat";
import * as handlers from "@bionova/finder-handlers";

const docs = [
  {
    title: "BioNova Finder Guide",
    url: "https://github.com/forwardimpact/bionova-apps/blob/main/products/finder/README.md",
    description: "How to use bionova-finder to discover trials.",
  },
];

import { TEMPLATES_DIR } from "@bionova/finder-handlers/templates";

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
    name: "bionova-finder",
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

Verify: `bunx bionova-finder --help` lists all 7 commands; `bunx bionova-finder
search --help` shows the four options.

## Step 3 — Author bin entry

Created: `products/finder/cli/bin/bionova-finder.js`

```js
#!/usr/bin/env node
import { createBionovaCli } from "../src/definition.js";
import { createDataContext } from "@bionova/finder-handlers/context";

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

Make executable: `chmod +x products/finder/cli/bin/bionova-finder.js`.

Verify: `./products/finder/cli/bin/bionova-finder.js search --condition=diabetes`
(against running stack) prints a list of diabetes trials in ANSI-formatted
output.

## Step 4 — Implement REPL

Created: `products/finder/cli/src/repl.js`

Per librepl's real API (verified against
`libraries/librepl/src/index.js`), commands are objects with
`{ usage, handler, type? }` shape; the handler signature is
`(args: string[], state) => Promise<string|false>`. `start()` is the
entry; `help`, `clear`, `exit` are built-in.

```js
import { Repl } from "@forwardimpact/librepl";
import * as handlers from "@bionova/finder-handlers";

export async function startRepl(ctx) {
  const repl = new Repl({
    prompt: "bionova> ",
    state: { lastResults: null },
    documentation: [{
      title: "REPL Guide",
      url: "https://github.com/forwardimpact/bionova-apps/blob/main/products/finder/cli/README.md#repl",
    }],
    commands: {
      search: {
        usage: "search --condition=<text> — find trials by condition",
        handler: async (args, state) => {
          const result = await handlers.searchTrials({ ...ctx, options: parseKvArgs(args) });
          state.lastResults = result.trials;
          return formatTrials(result.trials);
        },
      },
      trial: {
        usage: "trial <idx|id> — show details for one trial (idx into last search)",
        handler: async (args, state) => {
          const arg = args[0] ?? "";
          const idx = Number.parseInt(arg, 10);
          const id = Number.isInteger(idx) && state.lastResults?.[idx]
            ? state.lastResults[idx].id
            : arg;
          return formatTrialDetail(await handlers.showTrial({ ...ctx, args: { id } }));
        },
      },
      sites: {
        usage: "sites [--specialty=<name>] — list enrollment sites",
        handler: async (args) => formatSites(await handlers.listSites({ ...ctx, options: parseKvArgs(args) })),
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
function formatSites(sites) { /* ANSI table */ }
```

Verify: `bunx bionova-finder repl` opens an interactive prompt; `search
--condition=diabetes` then `trial 0` shows the first trial's details.

## Step 5 — Tests

Created: `products/finder/cli/test/cli.test.js`

Tests:

- `cli.parse(["search","--condition=diabetes"])` returns expected parsed shape
- `cli.parse(["admin","trial","abc-123"])` resolves nested subcommand
- `cli.parse(["--help"])` returns null with help message
- handler dispatch goes through frozen InvocationContext (asserts `Object.isFrozen`)
- output formatting uses ANSI (assert ESC sequences present in result)

Verify: `bun test products/finder/cli/` exits 0; mocked handler context
asserts work.

## Step 6 — End-to-end smoke against running stack

Created: `products/finder/cli/test/e2e.sh`

```sh
#!/usr/bin/env bash
set -euo pipefail
# Requires docker compose up && ./setup.sh
NODE="$(dirname "${BASH_SOURCE[0]}")/../bin/bionova-finder.js"

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

Verify: `bash products/finder/cli/test/e2e.sh` exits 0 against a freshly
seeded stack.

## Step 7 — Open part-06 PR

```sh
git checkout -b products/finder-cli
git add products/finder/cli/
git commit -m "products: bionova-finder CLI"
git push -u origin products/finder-cli
gh pr create --title "products: bionova-finder CLI" --body "Implements plan-a-06 of spec 1160. CLI dispatches into shared handlers; REPL subcommand wired via librepl."
```

Verify: PR CI green (lint + bun test); manual smoke against local stack
documented in PR description.

## Verification (end of part 06)

- [ ] `bunx bionova-finder --help` lists all 7 commands.
- [ ] `bionova-finder search --condition=diabetes` returns trials matching diabetes (success criterion #4 partial — matches web search result; full match deferred to part 08).
- [ ] `bionova-finder repl` opens librepl-based session.
- [ ] `bionova-finder admin trial <id>` fails without `--token` or `SUPABASE_SERVICE_ROLE_KEY` env.
- [ ] `bionova-finder admin trial <id>` with service role succeeds and shows interest signal aggregates (success criterion #5 partial — verified end-to-end in part 08).
- [ ] `bun test products/finder/cli/` exits 0.
- [ ] `bash products/finder/cli/test/e2e.sh` exits 0 against running stack.

— Staff Engineer 🛠️
