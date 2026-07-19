# Plan 2250-a Part 1: CLI axis — the Gemba package and the command rename

One part because the `public-cli-set` invariant couples bins, launchers, and
doc/skill invocations: any split leaves a computed launcher without its bin or
its invocation and fails CI. Sub-steps below are verification units, not
commit boundaries.

## Step 1.1 — Scaffold `products/gemba/package.json`

Create the consumer package: `bin` + `dependencies`, no `exports`, no `main`,
no `src/`.

**Created:** `products/gemba/package.json`, `products/gemba/CHANGELOG.md`.

```json
{
  "name": "@forwardimpact/gemba",
  "version": "0.1.0",
  "description": "Stand up and operate an agent team — the runtime platform's command family (harness, trace, benchmark, selfedit, wiki, xmr) and CI actions, consuming the runtime libraries.",
  "keywords": ["agent", "harness", "trace", "wiki", "xmr", "runtime", "platform"],
  "homepage": "https://www.forwardimpact.team",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/forwardimpact/monorepo.git",
    "directory": "products/gemba"
  },
  "license": "Apache-2.0",
  "author": "D. Olsson <hi@senzilla.io>",
  "jobs": [
    {
      "user": "Teams Using Agents",
      "goal": "Stand Up and Operate an Agent Team",
      "trigger": "The team wants to run coding agents continuously, but the runtime — bootstrap, session harness, traces, memory, metrics — has no product to hire and must be reverse-engineered from CI plumbing.",
      "bigHire": "stand up and operate an agent team on one platform: bootstrap the environment, run sessions, inspect traces, persist memory, and measure outcomes.",
      "littleHire": "run one agent session, read one trace, or chart one metric with a single command from the platform's family.",
      "competesWith": "hand-rolled CI pipelines around raw agent CLIs; reverse-engineering another team's setup; running agents ad hoc with no memory or measurement",
      "forces": {
        "push": "Every team that wants to run agents rebuilds the same bootstrap-run-remember-measure loop from CI plumbing.",
        "pull": "One installable platform whose CLIs and CI actions are the same loop, proven daily by a reference tenant.",
        "habit": "Wiring raw agent CLIs into bespoke pipelines and losing the session evidence.",
        "anxiety": "Adopting a platform might couple the team to one vendor's agent workflow."
      },
      "firedWhen": "the platform's loop constrains a team more than the plumbing it replaced; or the team stops running agents in CI."
    }
  ],
  "type": "module",
  "bin": {
    "gemba-harness": "./bin/gemba-harness.js",
    "gemba-trace": "./bin/gemba-trace.js",
    "gemba-benchmark": "./bin/gemba-benchmark.js",
    "gemba-selfedit": "./bin/gemba-selfedit.js",
    "gemba-wiki": "./bin/gemba-wiki.js",
    "gemba-xmr": "./bin/gemba-xmr.js"
  },
  "files": ["bin/**/*.js"],
  "scripts": { "test": "bun test test/*.test.js" },
  "dependencies": {
    "@forwardimpact/libharness": "^2.0.0",
    "@forwardimpact/libwiki": "^0.2.0",
    "@forwardimpact/libxmr": "^2.0.0",
    "@forwardimpact/libcli": "^0.1.0",
    "@forwardimpact/libconfig": "^0.1.0",
    "@forwardimpact/libpreflight": "^0.1.0",
    "@forwardimpact/libtelemetry": "^0.1.22",
    "@forwardimpact/libutil": "^0.1.0"
  },
  "engines": { "bun": ">=1.2.0", "node": ">=22.0.0" },
  "publishConfig": { "access": "public" }
}
```

Ranges track the workspace versions at implementation time; Part 4's release
cuts bump them. `devDependencies` gains whatever the moved tests import (Step
1.6) — expected `@forwardimpact/libmock` only if a moved test uses it. Like
Gear, no hand-authored `README.md`.

**Verify:** `bun install` resolves; `bun run context:check-jtbd` passes the new
jobs entry.

## Step 1.2 — Move and rename the six bins

`git mv` each bin into `products/gemba/bin/` under its new name; repoint every
`../src/…` import to a library subpath export (added in Step 1.3); rename
in-file command tokens (definition `name`, help/usage strings, `mkdtemp`
prefixes). `packageJsonUrl: new URL("../package.json", import.meta.url)` now
resolves the gemba package — correct, leave as is.

| From | To |
| --- | --- |
| `libraries/libharness/bin/fit-harness.js` | `products/gemba/bin/gemba-harness.js` |
| `libraries/libharness/bin/fit-trace.js` | `products/gemba/bin/gemba-trace.js` |
| `libraries/libharness/bin/fit-benchmark.js` | `products/gemba/bin/gemba-benchmark.js` |
| `libraries/libharness/bin/fit-selfedit.js` | `products/gemba/bin/gemba-selfedit.js` |
| `libraries/libwiki/bin/fit-wiki.js` | `products/gemba/bin/gemba-wiki.js` |
| `libraries/libxmr/bin/fit-xmr.js` | `products/gemba/bin/gemba-xmr.js` |

`fit-selfedit.js` is the one bin that contains implementation, not wiring.
Extract its safeguard-and-write logic into
`libraries/libharness/src/commands/selfedit.js` (created, exported per Step
1.3); the product bin keeps only the help text, stdin/argv handling, and
dispatch. The extraction takes the `minimatch` import with it (libharness
already depends on minimatch; the gemba package therefore does not). Its
README pointer (`libraries/libharness/README.md § fit-selfedit`) renames with
the prose pass in Step 1.7.

**Verify:** `node products/gemba/bin/gemba-<cli>.js --help` exits 0 for all
six.

## Step 1.3 — Purify the three runtime libraries

Drop the interface surface; export the command modules the bins import. The
declarative definition modules (`benchmark-definition.js`,
`cli-definition.js`) stay library-side with the handlers: the design's
Components table (bins keep "definition-and-dispatch wiring" via package
imports) governs over its Interfaces shorthand ("a product bin owns … the CLI
definition") — argv parsing and dispatch live in the bin, the definition data
is implementation.

| File | Change |
| --- | --- |
| `libraries/libharness/package.json` | Delete `bin` field and the four `./bin/fit-*.js` exports. Add subpath exports for the modules the moved bins import: `./commands/output.js`, `./commands/tee.js`, `./commands/run.js`, `./commands/supervise.js`, `./commands/facilitate.js`, `./commands/discuss.js`, `./commands/callback.js`, `./commands/scan-logs.js`, `./commands/trace.js`, `./commands/assert.js`, `./commands/by-discussion.js`, `./commands/benchmark-definition.js`, `./commands/selfedit.js` (new), each mapping to its `./src/commands/*.js` file. Drop `bin/**/*.js` from `files`. |
| `libraries/libwiki/package.json` | Delete `bin` field and the `./bin/fit-wiki.js` export. Add `./wiki-sync.js` → `./src/wiki-sync.js`, `./util/wiki-dir.js` → `./src/util/wiki-dir.js`, `./cli-definition.js` → `./src/cli-definition.js`. Drop `bin/**/*.js` from `files`. |
| `libraries/libxmr/package.json` | Delete `bin` field and the `./bin/fit-xmr.js` export. Add `./commands/{analyze,list,validate,chart,summarize,record}.js` → `./src/commands/*.js`. Drop `bin/**/*.js` from `files`. |
| `libraries/{libharness,libwiki,libxmr}/bin/` | Directories removed by the Step 1.2 `git mv` — confirm none remains. |

**Verify:** `test ! -d libraries/libharness/bin -a ! -d libraries/libwiki/bin
-a ! -d libraries/libxmr/bin`; `rg '"bin"'
libraries/{libharness,libwiki,libxmr}/package.json` returns nothing; `bun run
test` green for the three libraries (handler tests unmoved).

## Step 1.4 — Launchers

`git mv` the five launcher dirs and rewrite each to the canonical two-line
shape importing the gemba package.

| From | To | Bin content |
| --- | --- | --- |
| `launchers/fit-harness/` | `launchers/gemba-harness/` | `import "@forwardimpact/gemba/bin/gemba-harness.js";` |
| `launchers/fit-trace/` | `launchers/gemba-trace/` | `import "@forwardimpact/gemba/bin/gemba-trace.js";` |
| `launchers/fit-benchmark/` | `launchers/gemba-benchmark/` | `import "@forwardimpact/gemba/bin/gemba-benchmark.js";` |
| `launchers/fit-wiki/` | `launchers/gemba-wiki/` | `import "@forwardimpact/gemba/bin/gemba-wiki.js";` |
| `launchers/fit-xmr/` | `launchers/gemba-xmr/` | `import "@forwardimpact/gemba/bin/gemba-xmr.js";` |

The "Bin content" column shows each file's import line; the full canonical
file is byte-exact two lines — `#!/usr/bin/env node` then the import, LF,
single trailing newline. Each `package.json`: `name` = the new invoked name,
description "Run gemba-<cli> from the npm registry — launcher for
@forwardimpact/gemba", `repository.directory`, `bin` key/path, single
dependency `"@forwardimpact/gemba": "0.0.0"` (placeholder kept). No
`fit-selfedit` launcher exists and no `gemba-selfedit` launcher is created:
no doc or published skill invokes selfedit via `npx`/`bunx` (root CLAUDE.md's
`bunx fit-selfedit` is outside the invariant's scanned surfaces), so the
invariant does not compute one. `launchers/README.md`: worked examples and the
"npm name = invoked name" prose move to the gemba names; the `coaligned`
exception paragraph is unchanged.

**Verify:** covered by the Step 1.5 invariant run.

## Step 1.5 — `public-cli-set` invariant

**Modified:** `.coaligned/invariants/public-cli-set.rules.mjs`.

- `INVOKE_RE` →
  `/\b(?:npx|bunx)\s+(?:-y\s+|--yes\s+)?((?:fit|gemba)-[a-z][a-z-]*)/g`.
- `SIBLING_ACTION_CLIS` →
  `["gemba-benchmark", "gemba-harness", "gemba-trace", "gemba-wiki"]`.
- `collectInvokedNames` skill-dir filter `/^(fit|kata)-/` →
  `/^(fit|kata|gemba)(-|$)/` (the `gemba` product skill dir, Part 3, has no
  dash).
- `computePublicCliSet` `exportsOk`: a source package with **no `exports`
  field** resolves every subpath by Node's legacy rules, so
  `exportsOk: !pkg.exports || \`./bin/${cli}.js\` in pkg.exports` — this is
  what lets the gemba package satisfy the launcher import while declaring no
  `exports` (spec SC1). Update the `checkLauncherShape` message and the header
  comment to state both accepted shapes.
- JSDoc examples (`fit-trace` / `@forwardimpact/libharness`) → gemba
  equivalents.

**Verify:** after Step 1.7's doc flip, `bun run invariants` is green and
`ls launchers/` = `README.md coaligned gemba-benchmark gemba-harness
gemba-trace gemba-wiki gemba-xmr` plus the untouched non-runtime `fit-*`
launchers — no `fit-harness`/`fit-trace`/`fit-benchmark`/`fit-wiki`/`fit-xmr`
dirs remain.

## Step 1.6 — Bin-surface tests and goldens

Predicate: a test that exercises a bin entry point (by spawn or by rendering
its CLI surface) moves to `products/gemba/test/`; handler and component tests
stay in their libraries.

| From | To |
| --- | --- |
| `libraries/libharness/test/bin-smoke.integration.test.js` | `products/gemba/test/` (its `BINS` list → the gemba names) |
| `libraries/libharness/test/selfedit.integration.test.js` | `products/gemba/test/` (spawns the bin; the extracted `selfedit.js` logic may additionally gain a lib-side unit test) |
| `libraries/libwiki/test/fit-wiki-smoke.integration.test.js` | `products/gemba/test/gemba-wiki-smoke.integration.test.js` |
| `libraries/libwiki/test/golden.test.js`, `libraries/libwiki/test/golden-functional.integration.test.js`, and `libraries/libwiki/test/golden/fit-wiki/` | `products/gemba/test/` + `products/gemba/test/golden/gemba-wiki/` — the two tests share the golden dir (golden-functional roots its fixture inside it), so they move **together**; splitting them would orphan the shared fixtures |
| `libraries/libharness/test/golden/{fit-harness,fit-trace,fit-benchmark,fit-selfedit}/` | `products/gemba/test/golden/gemba-*/` |
| `libraries/libxmr/test/golden/fit-xmr/` (with its `cases.json`) | `products/gemba/test/golden/gemba-xmr/` |

The libharness and libxmr golden dirs have no in-library runner test — they
are consumed by `scripts/capture-cli-golden.mjs` via its path/CLI
conventions; repoint any documented paths and CLI names there (the root
`tests/capture-cli-golden*` tests are stub-based with tmpdir goldens and need
no repoint). Regenerate every moved golden dir from actual output, e.g.:

```sh
node scripts/capture-cli-golden.mjs --bin gemba-harness \
  --exec products/gemba/bin/gemba-harness.js \
  --golden-dir products/gemba/test/golden/gemba-harness
```

Root `package.json` `test` already finds `./products` tests; no runner change
in this part.

**Verify:** `bun run test` green; `rg -n 'bin/(fit|gemba)-' libraries/*/test`
returns nothing; `ls libraries/{libharness,libwiki,libxmr}/test/golden` errors
(dirs gone).

## Step 1.7 — Repo-wide command rename (prose, skills, agents, scripts)

Blanket-replace the six families across every remaining surface **except** the
keep-list (plan-a.md) and the four action-source dirs +
`fit-install.sh`, which Part 2 owns with the move. Inventory of non-obvious
sites:

| Surface | Notes |
| --- | --- |
| `.claude/skills/fit-{harness,trace,benchmark,wiki,xmr}/` → `.claude/skills/gemba-*/` | `git mv` dirs; frontmatter `name`, body, `references/*`, `## Documentation` links. Library paths (`libraries/libharness/...`) and `LIBHARNESS_*` tokens inside stay. |
| Other `.claude/skills/**` (kata-\*, fit-\*, monorepo-setup, …) | bare invocations (`fit-wiki boot` → `gemba-wiki boot`), cross-links to the renamed skill dirs |
| `.claude/agents/*.md` | `fit-wiki`/`fit-trace`/`fit-xmr` invocations in profiles and `x-*` references |
| `.claude/settings.json` | Stop hook `bunx fit-wiki push` → `bunx gemba-wiki push`; any `Edit()`/`Bash()` permission rules naming the six |
| `.coaligned/invariants/skill-genericity.rules.mjs` | npx-prefix pattern `\bnpx (fit-|coaligned|kata-)` gains `gemba-`; cross-pack link pattern `\]\(((\.\./)+)fit-` gains `gemba-` (gemba skills ship in the fit-skills pack, Part 3, so relative links from kata skills stay banned) |
| `CLAUDE.md` | `bunx fit-selfedit` line; `fit-harness`/`fit-trace`/`fit-wiki`/`fit-xmr` product-description mentions (framing prose additions are Part 3) |
| `KATA.md` | command tokens only (tenant framing is Part 3) |
| `websites/fit/**/*.md` | the ~14 docs pages invoking the six, incl. `docs/internals/release/index.md`'s `fit-gear` catalog row and the operations reference |
| `.github/workflows/*.yml` | every `bunx`/workspace-resolved invocation of the six → gemba names. **Keep unchanged until Part 4:** `clis:` values, `uses:` pins, and the bare-PATH invocations of pinned-installed binaries (`fit-trace cost` and `fit-harness callback` in `kata-dispatch.yml`, `fit-wiki curate` in `curate-wiki.yml`) — they execute whatever `clis:` installed. **Keep permanently:** path references into `benchmarks/**` (`family: ./benchmarks/fit-wiki` in `eval-wiki.yml` — the eval family dir keeps its name). |
| `package.json` (root) | `"wiki": "bunx fit-wiki audit"`, `"wiki:fix": "bunx fit-wiki fix"` → gemba-wiki |
| `justfile` | `bunx fit-wiki {pull,push,audit}`, `bunx --workspace=@forwardimpact/libxmr fit-xmr` → `bunx --workspace=@forwardimpact/gemba gemba-xmr` |
| `scripts/bootstrap.sh` | `bunx fit-wiki init` / `pull` |
| `scripts/*.mjs` | `capture-cli-golden` docs, `staff-engineer-record-prior-trace.mjs`, `exp-1738-gate-runtime.mjs`, `spec-1060-migrate-wiki.mjs` comments/tokens |
| `CONTRIBUTING.md`, `.gitignore` | `bunx fit-selfedit` mentions; any six-family token in ignore comments/patterns |
| `.coaligned/invariants/shared-workspace-staging.{rules.mjs,allow.json}` | six-family tokens in rules/allowlist entries |
| `libraries/*/test/fixtures/**` (e.g. `libharness/test/fixtures/divergence-run481.ndjson`, `test/fixtures/trace-query-1220/`) | deliberate fixture edit of the six-family tokens, per the spec-2110 precedent — the consuming tests compare event structure and cost, not these strings |
| `build/cli-manifest.json` | the five entries `fit-{harness,trace,wiki,xmr,benchmark}` → gemba names; `bundle` stays `"gear"` — the binary distribution vehicle (gear bundle, `fit-gear` cask) is out of the spec's boundary and unchanged |
| `libraries/{libharness,libwiki,libxmr}/src/**` | help/usage strings, JSDoc, stderr text naming the six commands (`libharness:`-style prefixes stay) |
| `libraries/{libharness,libwiki,libxmr}/README.md` + `libraries/CLAUDE.md` | catalog rows, worked examples |
| `libraries/{libharness,libwiki,libxmr}/CHANGELOG.md` | append an entry: bins moved to `@forwardimpact/gemba` under gemba names, `bin` field removed (breaking); historical entries untouched |
| `products/guide/**` and any other non-kata product docs | stray command mentions |

**Verify:**
`rg --hidden -n 'fit-(harness|trace|benchmark|selfedit|wiki|xmr)\b' --glob '!specs/**' --glob '!wiki/**' --glob '!benchmarks/**' --glob '!**/CHANGELOG.md' --glob '!node_modules/**' --glob '!.git/**' --glob '!products/kata/**'`
— inspect every returned **line**; the only allowed remainders are (a)
`.github/workflows/*.yml` lines that are `clis:` values or the three bare-PATH
invocations held for Part 4 (workflow **comments** rename with the family in
this part — a comment briefly describing the post-Part-4 state is harmless;
executable names are what the hold protects), (b) the `benchmarks/fit-wiki` path
reference in `eval-wiki.yml`, and (c) the Part-2-owned action sources. Confirm
the keep-listed path references are byte-unchanged
(`git diff -- .github/workflows/eval-wiki.yml` shows no `family:` change). Then
`bun run context:fix`, `bun run check`, and `bun run test` green.
