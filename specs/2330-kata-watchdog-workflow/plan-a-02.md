# Plan 2330-a Part 02: `gemba-watchdog` CLI, launcher, and progressive docs

The seventh `gemba-*` command, its launcher package, its compiled binary entry,
its guide, and its skill. The three progressive-documentation artifacts land
together, because `public-cli-set` computes the launcher from the `npx`
invocation the guide and the skill publish.

Depends on: part 01. Route: `staff-engineer`.

## Step 1: Write the CLI

Wire argv to the two library handlers and to the exit codes.

Created: `products/gemba/bin/gemba-watchdog.js`

The file follows `products/gemba/bin/gemba-xmr.js`: the `libpreflight/node22`
import, `createDefaultRuntime()`, a `createCli` definition, and a `main()` that
dispatches and exits on the returned envelope. It holds no counting, no
comparison, and no reason logic.

```js
import { runAssessCommand } from "@forwardimpact/libwatchdog/commands/assess.js";
import { runEngageCommand } from "@forwardimpact/libwatchdog/commands/engage.js";
```

| Command | Options it declares | Handler |
| ------- | ------------------- | ------- |
| `assess` | `repo`, `default-branch`, `threshold`, `window-hours`, `killswitch-value` | `runAssessCommand` |
| `engage` | `repo`, `variable`, `reason`, `window-hours`, `dry-run` | `runEngageCommand` |

The two sets are disjoint by design. libcli merges globals plus the matched
subcommand's options only and calls `parseArgs` in strict mode, so `assess`
rejects `--variable` and `engage` rejects `--threshold`. Part 03 step 1 builds
one command line per mode for this reason.

`globalOptions` carry `format`, `help`, `version`, and `json`. `gemba-xmr` also
carries `ascii`, which renders charts and has no meaning here, so this CLI omits
it. Every option is a `string` except `dry-run`, which is a `boolean`. A libcli
`boolean` is a bare presence flag: `--dry-run false` parses as
`{ "dry-run": true }` with `false` left as a stray positional, so a caller
passes `--dry-run` or passes nothing. No option carries a default that names a
tenant. `--variable` has no default at all.

`examples` show `gemba-watchdog assess --threshold 32 --window-hours 2` and
`gemba-watchdog engage --variable MY_KILLSWITCH --reason "$REASON"
--window-hours 2`.

`documentation` carries one entry:

```js
{
  title: "Guard an Agent Team's Activity",
  url: "https://www.gemba.team/docs/guard-activity/index.md",
  description:
    "The four counters, the threshold and window, the latch contract, the clearing rule, the CI wiring, and the exit codes.",
}
```

Verify: `node products/gemba/bin/gemba-watchdog.js --help` renders both
subcommands and exits 0.

## Step 2: Declare the bin and the dependency

Let the workspace resolve the command and let npm publish it.

Modified: `products/gemba/package.json`

- `bin` gains `"gemba-watchdog": "./bin/gemba-watchdog.js"`.
- `dependencies` gains `"@forwardimpact/libwatchdog": "^0.1.0"`.
- `description` gains `watchdog` in the command family list.
- `keywords` gains `watchdog`.

Modified: `.github/workflows/publish-skills.yml`

The `gemba` matrix entry's `apm-description` at line 59 enumerates the command
family as "the harness, trace, benchmark, wiki, and xmr commands". Add
`watchdog` to that list.

The package declares no `exports` field, so Node's legacy resolution serves the
`./bin/gemba-watchdog.js` subpath the launcher imports. Leave it absent.

Verify: `bun install` resolves the workspace dependency, `bun run context:fix`
reseeds the generated description blocks, and `bun run context:check-metadata`
passes.

## Step 3: Add the launcher package

Make `npx gemba-watchdog` resolve for external users.

Created: `launchers/gemba-watchdog/package.json`,
`launchers/gemba-watchdog/bin/gemba-watchdog.js`

The bin file is the canonical two-line launcher, LF, one trailing newline:

```js
#!/usr/bin/env node
import "@forwardimpact/gemba/bin/gemba-watchdog.js";
```

The manifest copies `launchers/gemba-xmr/package.json` with the name, the
`bin` key, the `repository.directory`, and the description changed. `version`
and the `@forwardimpact/gemba` pin both stay at the `0.0.0` placeholder.
`publish-npm.yml` stamps the real versions.

This directory is valid only once step 6 or step 7 publishes an
`npx gemba-watchdog` invocation. Land all three in the same change.

Verify: `bunx jidoka invariants` reports no `public-cli.*` finding.

## Step 4: Add the binary to the manifest

Compile and ship the binary the composite action installs.

Modified: `build/cli-manifest.json`

Add one entry to `clis`, beside the other `gemba-*` members:

```json
{
  "name": "gemba-watchdog",
  "targets": ["bun-linux-x64", "bun-linux-arm64", "bun-darwin-arm64"],
  "bundle": "gear"
}
```

Verify: `bun run check` passes and the entry sits in the `gear` bundle, which
`build/render-formula.sh` and `fit-install.sh` both read.

## Step 5: Extend the bin smoke list

Cover the new binary with the one sanctioned subprocess test per binary.

Modified: `products/gemba/test/bin-smoke.integration.test.js`

Add `"gemba-watchdog"` to the `BINS` array.

Verify: `bun test products/gemba/test/bin-smoke.integration.test.js` passes.

## Step 6: Write the task guide

Give the external reader the counters, the contract, and the CI wiring on
`www.gemba.team`.

Created: `websites/gemba/docs/guard-activity/index.md`

Front matter carries `title: Guard an Agent Team's Activity` and a description
naming the brake. The body covers, in order:

| Section | Content |
| ------- | ------- |
| Opening | The event chain the brake bounds, in two sentences. |
| Prerequisites | Node.js 22+, the command through `npx gemba-watchdog` or `npm install -g @forwardimpact/gemba`, a token with read access to contents, issues, and pull requests, and a variable the token may write. |
| The four counters | Default-branch commits, pull requests created, issues created, and issue and pull-request conversation comments created, each against the same cutoff. |
| The threshold and the window | One number on every counter. The window is the interval times the run count you accept missing. |
| `assess` | The options, the run summary, the `verdict` and `reason` outputs, and exit 0 on every outcome. |
| `engage` | The options, the two skip rules, the write, and exit 1 on engagement, on a failed read, and on a failed write. |
| The latch contract | The command engages. It never clears. A human clears it by writing a falsy value. Deleting the variable is not clearing it, and it earns no quiet window. |
| Fail safe | An unreadable counter, and a counter that cannot cover the window, both engage. |
| CI wiring | A `forwardimpact/gemba-watchdog@v1` two-job example, read-only measurement and token-minting engagement. |
| Exit codes | A table of the three outcomes. |

Every command example uses `npx`. The page names no tenant variable. It uses
`MY_KILLSWITCH` in examples.

Verify: `bun run lint:md` passes and `bunx fit-doc build` resolves the page.

## Step 7: Write the skill

Give the agent the same content from its own entry point.

Created: `.claude/skills/gemba-watchdog/SKILL.md`

The file follows `.claude/skills/gemba-xmr/SKILL.md`: front matter with `name`
and a `description` that names the job and the triggers, then the command
reference, then a `## Documentation` list whose single entry matches the CLI
`documentation` array in title, URL, and order.

Write it through
`echo … | bunx gemba-selfedit .claude/skills/gemba-watchdog/SKILL.md` when
settings block the direct edit.

Verify: `bunx jidoka instructions` passes, and the skill's `## Documentation`
entry matches the CLI array byte for byte.

## Step 8: Add the guide to the docs index

Give the guide a card so the site navigation reaches it.

Modified: `websites/gemba/docs/index.md`

Add one section **after** `## Operate a Predictable Agent Team`, so the index
keeps the loop's order and the guard step reads last:

```markdown
## Guard an Agent Team (Teams Using Agents)

<div class="grid">

<!-- part:card:guard-activity -->

</div>
```

The page's front-matter `description` and its opening paragraph both enumerate
the five-step loop. Add the stop step to each, matching the wording part 04
step 4 lands on the site.

Verify: `bunx fit-doc build` renders the card and emits no unresolved-partial
warning, and `rg -n 'measure the outcome' websites/gemba/docs/index.md` returns
the updated sentence.

## Step 9: Record the seventh runtime command

Keep the library conventions true as written.

Modified: `libraries/CLAUDE.md`

- The runtime-command sentence moves from six commands to seven and gains
  `gemba-watchdog` in the list.
- The two `www.gemba.team` citation sentences gain `libwatchdog` beside
  `libharness`, `libwiki`, and `libxmr`.

Verify: `bunx jidoka instructions` passes and `bun run lint:md` passes.
