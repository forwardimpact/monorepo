# Plan 2330-a Part 01: `libwatchdog`

The guardrail engine, the four GitHub activity probes, the Actions-variable
latch, the latch policy, the reason grammar, and the tests. No consumer imports
it yet.

Depends on: nothing. Route: `staff-engineer`.

## Step 1: Create the package manifest

Declare the library so the workspace links it and the catalog generator sees it.

Created: `libraries/libwatchdog/package.json`

```json
{
  "name": "@forwardimpact/libwatchdog",
  "version": "0.1.0",
  "description": "Guardrail engine for agent teams — count repository activity over a window, compare it against thresholds, and engage an operator latch when the activity breaches them.",
  "keywords": ["guardrail", "watchdog", "killswitch", "threshold", "agent"],
  "homepage": "https://www.forwardimpact.team",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/forwardimpact/monorepo.git",
    "directory": "libraries/libwatchdog"
  },
  "license": "Apache-2.0",
  "author": "D. Olsson <hi@senzilla.io>",
  "jobs": [
    {
      "user": "Teams Using Agents",
      "goal": "Stand Up and Operate an Agent Team",
      "trigger": "An agent event chain creates artifacts faster than a human can read them, and no deterministic brake bounds the volume.",
      "bigHire": "bound an agent team's output volume with a deterministic brake that a human clears.",
      "littleHire": "count one activity signal over a window and engage a latch when it crosses a threshold.",
      "competesWith": "a prose recursion guard inside an agent task; a spend cap on the LLM platform; a human who notices the sprawl"
    }
  ],
  "type": "module",
  "main": "./src/index.js",
  "exports": {
    ".": "./src/index.js",
    "./commands/assess.js": "./src/commands/assess.js",
    "./commands/engage.js": "./src/commands/engage.js"
  },
  "files": ["src/**/*.js", "README.md"],
  "scripts": { "test": "bun test test/*.test.js" },
  "dependencies": { "@forwardimpact/libutil": "^0.1.100" },
  "devDependencies": { "@forwardimpact/libmock": "^0.1.15" },
  "engines": { "bun": ">=1.2.0", "node": ">=22.0.0" },
  "publishConfig": { "access": "public" }
}
```

`homepage` is `www.forwardimpact.team`, not the guide host.
`scripts/check-metadata.mjs` maps only `products/gemba/`, `launchers/gemba-`,
`products/kata/`, and `products/jidoka/` to per-product hosts, so every
`libraries/*` package canonicalizes to the default, as `libharness`, `libwiki`,
and `libxmr` all do. The library declares no `libcli` dependency. It exports the
two handlers, and the CLI bin supplies the `InvocationContext`.

Verify: `bun install` links the workspace and `bun run context:check-metadata`
passes.

## Step 2: Write the truthy predicate and the reason grammar

Give the killswitch value one JavaScript home and one encoder.

Created: `libraries/libwatchdog/src/truthy.js`,
`libraries/libwatchdog/src/reason.js`

| Export | Signature | Contract |
| ------ | --------- | -------- |
| `isTruthy` | `(value) => boolean` | `false` for `null`, `undefined`, and, after `String(value).trim().toLowerCase()`, for `""`, `0`, `false`, `no`, `off`. `true` otherwise. It agrees with the four shell readers. |
| `encodeReason` | `({ name, breaches, at }) => string` | Pipe-separated: `watchdog\|issues=47/32\|comments=38/32\|2026-09-02T16:49:00Z`. `name` leads, the ISO timestamp closes. |
| `decodeReason` | `(value) => { name, breaches, at } \| null` | `null` when the value does not start with the name segment. |

`encodeReason` orders breaches with `unreadable` and `uncovered` first, then
`threshold`, each group in rule order. A `threshold` breach renders
`${id}=${count}/${threshold}`. The other two render `${id}=unreadable` and
`${id}=uncovered`.

Verify: a unit test asserts `isTruthy` over the five falsy strings in both
cases, and round-trips a two-breach reason through `encodeReason` and
`decodeReason`.

## Step 3: Write the retrying transport

Give the probes and the latch one request helper with no `gh` binary in the
path.

Created: `libraries/libwatchdog/src/request.js`

- `createRequest({ token, clock, fetchImpl = fetch, retries = 4 })` returns
  `async (path, init) => object`.
- It builds `https://api.github.com${path}` and sets `Authorization: Bearer`,
  `Accept: application/vnd.github+json`, and
  `X-GitHub-Api-Version: 2022-11-28`.
- It wraps the call in
  `createRetry({ retries, sleep: (ms) => clock.sleep(ms) })` from
  `@forwardimpact/libutil`, which gives five attempts with exponential backoff
  and jitter and already retries 429, 499, and 5xx.
- Inside the retried function, a `403` whose body or `x-ratelimit-remaining: 0`
  header marks a rate limit throws `new Error("HTTP 429: rate limited")`, so
  `Retry`'s retryable-error path covers it.
- A non-2xx response after the retries throws
  `new Error(\`GitHub \${status} on \${path}\`)`. A 404 throws the same way, and
  the latch catches it.
- It returns `{ body, headers }` where `body` is the parsed JSON and `headers`
  carries `link` for the organization paging.

Verify: a unit test drives a stub `fetchImpl` through a 403 rate-limit response
followed by a 200, asserts one retry with an injected `clock`, and asserts a
throw after five 500 responses.

## Step 4: Write the four activity probes

Count each signal against one cutoff and report whether the response covers the
window.

Created: `libraries/libwatchdog/src/sources/github-activity.js`

Every probe has the signature
`async ({ request, repo, defaultBranch, cutoff }) => { count, covered }` and
throws when it cannot read.

| Export | Request | Counted item | Timestamp field |
| ------ | ------- | ------------ | --------------- |
| `commitsProbe` | `GET /repos/{repo}/commits?sha={defaultBranch}&since={cutoff}&per_page=100` | every item | `item.commit.committer.date` |
| `pullsProbe` | `GET /repos/{repo}/pulls?state=all&sort=created&direction=desc&per_page=100` | item at or after the cutoff | `item.created_at` |
| `issuesProbe` | `GET /repos/{repo}/issues?state=all&sort=created&direction=desc&per_page=100` | item at or after the cutoff, with no `pull_request` key | `item.created_at` |
| `commentsProbe` | `GET /repos/{repo}/issues/comments?since={cutoff}&sort=created&direction=desc&per_page=100` | item at or after the cutoff | `item.created_at` |

One coverage rule serves all four:
`covered = page.length < 100 || oldest(page) < cutoff`, where `page` is the raw
response array and `oldest` reads that probe's timestamp field. Coverage is
computed over the raw page, never over the filtered set, so `issuesProbe`
discarding `pull_request` entries cannot turn an uncovered page into a covered
one. No probe pages.

`commentsProbe` is the one probe whose server-side filter (`since`) reads
`updated_at` while its count reads `created_at`. A comment created before the
cutoff and edited inside it therefore occupies a slot on the page without being
counted, which can only push a full page toward `covered: false`. The direction
is fail-safe, and the probe needs no compensation.

Verify: unit tests drive each probe against a fixture page and assert the count,
plus a 100-item page held inside the window that reports `covered: false`.

## Step 5: Write the rule shape and the engine

Turn thresholds plus probes into one verdict.

Created: `libraries/libwatchdog/src/rule.js`,
`libraries/libwatchdog/src/evaluate.js`

- `createRule({ id, threshold, probe })` freezes and returns the triple.
- `activityRules(threshold)` returns the four rules `commits`, `pulls`,
  `issues`, `comments`, each carrying the same threshold.
- `evaluate(rules, { request, repo, defaultBranch, clock, windowMs })` derives
  `cutoff = isoTimestamp(clock.now() - windowMs)` with `isoTimestamp` imported
  from `@forwardimpact/libutil`, awaits every probe, and catches each throw. No
  `libwatchdog` module constructs a `Date`.
  `.jidoka/invariants/ambient-deps.rules.mjs` flags every `NewExpression` on
  `Date`, whatever its arguments, and `libraries/libwatchdog/src/**` sits on no
  allow-list.

```js
// verdict
{
  cutoff,                                        // ISO string
  windowMs,
  counts:   [{ id, count, covered, error }],     // one per rule, in rule order
  breaches: [{ id, kind, count, threshold }],    // kind: threshold | unreadable | uncovered
  engage:   breaches.length > 0,
}
```

A probe that throws yields `kind: "unreadable"` and `count: null`. A probe that
returns `covered: false` yields `kind: "uncovered"`. A count at or above the
threshold yields `kind: "threshold"`. One probe can raise at most one breach,
and `unreadable` and `uncovered` outrank `threshold`.

Verify: unit tests assert an engage verdict for each counter over threshold in
turn, for a thrown probe, for an uncovered probe, and a quiet verdict when every
count sits below the threshold.

## Step 6: Write the latch and the latch policy

Read both variable scopes, then decide whether to write.

Created: `libraries/libwatchdog/src/latches/actions-variable.js`,
`libraries/libwatchdog/src/latch.js`

`createActionsVariableLatch({ request, repo, name })` returns `read` and
`write`.

```js
await latch.read();
// {
//   repository:   { value, updatedAt } | null,   // GET /repos/{repo}/actions/variables/{name}, 404 reads as null
//   organization: { value, updatedAt } | null,   // GET /repos/{repo}/actions/organization-variables?per_page=30, paged to the end
//   scope: "repository" | "organization" | null, // repository wins when present
//   value: string | null,                        // the effective value
//   updatedAt: string | null,                    // the effective record's updated_at
// }
await latch.write(value);
// PATCH /repos/{repo}/actions/variables/{name}, or POST /repos/{repo}/actions/variables when repository is null
```

`decide(state, { windowMs, now })` returns `"engage"` or `"skip"`. The engage
command runs only after a breach, so the policy takes no verdict:

| Order | Condition | Result |
| ----- | --------- | ------ |
| 1 | `isTruthy(state.value)` | `skip` (already stopped) |
| 2 | `state.repository` exists, its value is falsy, and `now - toEpoch(state.repository.updatedAt) < windowMs` | `skip` (resume window) |
| 3 | otherwise | `engage` |

Rule 1 reads the effective value, so a truthy organization variable under a
falsy repository variable falls through to rule 2 and then engages.
`toEpoch` is a module-local helper over `Date.parse`. The invariant flags
`new Date(...)` and `Date.now()` only, so `Date.parse` on an explicit timestamp
is permitted and reads no wall clock.

Verify: unit tests cover already engaged, cleared inside the window, cleared
outside the window, a truthy organization variable under a falsy repository
variable, and an absent repository variable.

## Step 7: Write the run-summary renderer

Render one markdown block that carries the counts, the current value, and the
verdict.

Created: `libraries/libwatchdog/src/summary.js`

`renderSummary({ verdict, state, killswitchValue, decision, dryRun })` returns a
markdown string with an `### Watchdog` heading, one table row per counter (`id`,
count or `unreadable`, `covered`, threshold), a line for the killswitch's
current value and scope, and a verdict line. `verdict` and `state` are both
optional: an assess run renders counts with `killswitchValue` alone, and an
engage run renders the two scopes and the decision with no counts.

Verify: a unit test asserts the block names all four counters and both the
verdict and the current value.

## Step 8: Write the two command handlers

Wire argv to the engine and to the latch, and emit the CI side effects.

Created: `libraries/libwatchdog/src/commands/assess.js`,
`libraries/libwatchdog/src/commands/engage.js`

Both handlers take the libcli `InvocationContext` and read `ctx.deps.runtime`.
Both resolve `--repo` from `runtime.proc.env.GITHUB_REPOSITORY` when the option
is absent. The two option sets are disjoint, and each handler reads only its
own. libcli merges globals plus the matched subcommand's options and calls
`node:util` `parseArgs` in strict mode (`libraries/libcli/src/cli.js:75-100`),
so an option one subcommand does not declare aborts the run.

| Handler | Options it declares | Missing-option failure |
| ------- | ------------------- | ---------------------- |
| `runAssessCommand` | `repo`, `default-branch`, `threshold`, `window-hours`, `killswitch-value` | `threshold` or `window-hours` absent or not a positive number |
| `runEngageCommand` | `repo`, `variable`, `reason`, `window-hours`, `dry-run` | `variable` absent, or `reason` empty |

A failure returns `{ ok: false, error }`, which the bin turns into a usage
error. libcli options carry no `required` field, so each handler validates its
own.

`runAssessCommand`:

1. Build `activityRules(Number(options.threshold))`.
2. `evaluate(...)` with `windowMs = Number(options["window-hours"]) * 3600000`.
3. Append `renderSummary({ verdict, killswitchValue })` to
   `runtime.proc.env.GITHUB_STEP_SUMMARY` when the variable is set.
4. Append `verdict=engage|quiet` and `reason=<encodeReason(...)>` to
   `runtime.proc.env.GITHUB_OUTPUT` when the variable is set. The reason is one
   line, so no heredoc delimiter is needed. A quiet run writes an empty
   `reason=`.
5. Print the text report, or the verdict as JSON when `--format json`.
6. Return `{ ok: true }`. Assess exits 0 on every outcome.

`runEngageCommand`:

1. **Refuse an empty reason before anything else.** A blank or whitespace-only
   `--reason` returns `{ ok: false, code: 1 }` and touches no variable. The
   latch's only writer must never produce a falsy value, and every killswitch
   reader treats a falsy value as "not stopped", so an unguarded write would
   clear the switch rather than set it. Success criterion 6 forbids exactly
   this.
2. `latch.read()`. A read failure returns `{ ok: false, code: 1 }` with no
   write.
3. `--dry-run` renders the summary and returns `{ ok: true }`.
4. `decide(state, { windowMs, now: runtime.clock.now() })`. On `skip`, render
   the summary and return `{ ok: true }`.
5. On `engage`, assert `isTruthy(options.reason)`, then
   `latch.write(options.reason)`, render the summary, and return
   `{ ok: false, code: 1 }`. A write failure returns the same.

Both handlers append with `runtime.fs.appendFile(path, chunk)`.
`createDefaultRuntime` spreads `node:fs/promises`, which exports `appendFile`,
and `libraries/libmock/src/mock/fs.js` defines an `appendFile` spy. Do not use
`writeFile(path, chunk, { flag: "a" })`: the libmock spy takes `(path, content)`
and drops its third argument, so the flag would truncate under
`createTestRuntime()` and the append contract would go untested.

Verify: unit tests drive both handlers with `createTestRuntime()` and a stub
request, then assert the two env-file contents accumulate across calls, the
returned envelope, and that no skip path and no empty-reason path calls `write`.

## Step 9: Write the barrel and the README

Give importers one entry point and give the catalog its description.

Created: `libraries/libwatchdog/src/index.js`,
`libraries/libwatchdog/README.md`

`src/index.js` re-exports `activityRules`, `createRule`, `evaluate`, `decide`,
`createActionsVariableLatch`, `createRequest`, `encodeReason`, `decodeReason`,
`isTruthy`, `renderSummary`, and the four probes.

`README.md` carries the generated `BEGIN:description` block, a composition
example that builds rules, evaluates them, and decides, and the seam table
(rule, probe, latch, policy). It links
`https://www.gemba.team/docs/guard-activity/index.md`.

Write the `BEGIN:description` and `BEGIN:catalog` markers as empty blocks and
let `bun run context:fix` fill them. `jidoka jtbd --fix` owns that content.

Verify: `bun run context:fix` writes the blocks, a second run is a no-op, and
`bun run lint:md` passes.

## Step 10: Write the test suite

Drive the engine against fixture payloads so the component that must not fail
is verified by more than review.

Created: `libraries/libwatchdog/test/truthy.test.js`,
`test/reason.test.js`, `test/request.test.js`, `test/probes.test.js`,
`test/evaluate.test.js`, `test/latch.test.js`, `test/summary.test.js`,
`test/commands.test.js`, `test/helpers.js`

Tests import from `node:test` and `node:assert`, and take the runtime from
`createTestRuntime()` in `@forwardimpact/libmock`. `test/helpers.js` builds
fixture pages of commits, pull requests, issues, and comments at chosen offsets
from a fixed `now`, plus a stub `request` that maps a path prefix to a response.

The suite covers the six spec cases plus the four ordering cases:

| Case | Assertion |
| ---- | --------- |
| Each counter over threshold | Engage verdict naming that counter, once per counter |
| Probe throws after retries | Engage verdict, reason `unreadable` |
| Response cannot cover the window | Engage verdict, reason `uncovered` |
| Every count under threshold | Quiet verdict, no engage |
| Effective value truthy | `decide` returns `skip`, `write` uncalled |
| Repository value cleared inside the window | `decide` returns `skip`, `write` uncalled |
| Repository value cleared outside the window | `decide` returns `engage` |
| Truthy organization under falsy repository | `decide` returns `engage` |
| Two counters breach | The reason names both, in rule order |
| Empty `--reason` | `runEngageCommand` returns exit 1, and `read` and `write` are both uncalled |
| Every write path | Every `write` call receives a non-empty reason, and no path produces a falsy value |
| Two appends to one env file | The second `appendFile` call adds to the first, so `$GITHUB_OUTPUT` carries both keys |

Verify: `bun test libraries/libwatchdog/test/` passes and
`bun run context:check-bun-test` reports no finding.

## Step 11: Regenerate the catalog

Let the generated library count and catalog row match the tree.

Modified: `libraries/README.md`, `websites/fit/gear/index.md`

Run `bun run context:fix`, then
`bunx jidoka invariants --seed enumeration-drift` and reconcile the
`libraries-list` count fence in `websites/fit/gear/index.md` against the printed
set.

Verify: `bun run check` and `bunx jidoka invariants` pass.
