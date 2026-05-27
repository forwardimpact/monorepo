# Plan 1020-a — Node.js runtime floor alignment

Execution plan for [design 1020-a](./design-a.md). Spec: [spec.md](./spec.md).

## Approach

Land one PR that introduces `@forwardimpact/libpreflight` (the new published
library with a `./node22` side-effect subpath and a `./check.js` testable
helper), wires every published bin entry script through the side-effect import
as its first import, normalises the lone bun shebang to node, bumps every
`engines.node` to `>=22.0.0`, rewrites the ten getting-started doc pages, and
adds `scripts/check-node-floor.mjs` (chained into the existing `bun run
invariants` umbrella that `check-quality.yml`'s `invariants` job runs — per
design Decision 5). Step ordering is bottom-up so each step's verification
can run before the next begins.

Libraries used: `@forwardimpact/libpreflight` (newly authored in this plan;
no other workspace libraries imported by libpreflight — Decision 1's
zero-dep invariant).

## Steps

### Step 1 — Scaffold `libraries/libpreflight/`

**Intent.** Stand up the new published library so subsequent steps can import
it locally via the bun workspace hoist.

**Files created.**

```
libraries/libpreflight/package.json
libraries/libpreflight/README.md
libraries/libpreflight/src/check.js
libraries/libpreflight/src/node22.js
libraries/libpreflight/test/check.test.js
```

**`package.json` shape.** Mirror an existing peer (`libraries/libmock/package.json`
is the simplest match — zero `dependencies`, ESM, `engines` block, no `bin`)
and substitute the libpreflight-specific values below. The implementer
opens `libraries/libmock/package.json` and changes the listed fields,
leaving the rest of the manifest shape (license, homepage, repository, author,
publishConfig.access) identical:

| Field | Value |
|---|---|
| `name` | `@forwardimpact/libpreflight` |
| `version` | `0.1.0` (initial publish) |
| `description` | `Runtime-floor preflight — fail fast with a product-authored error when the host Node is below a package's declared floor.` |
| `keywords` | `["preflight", "runtime", "node", "engines", "agent"]` (5 tokens, last is `agent` per libraries/CLAUDE.md) |
| `jobs` | One Little-Hire entry, audience `Platform Builders`, goal `Ship Predictable CLIs`, trigger `User runs an npx CLI on an unsupported Node and sees an upstream-authored error.`, bigHire `enforce a runtime floor before any heavy import evaluates.`, littleHire `surface a product-authored Node-version error instead of an upstream library's.`, competesWith `inline checks in each bin; engines-strict; install-time hooks` |
| `main` | `./src/check.js` |
| `exports` | `{ "./node22": "./src/node22.js", "./check.js": "./src/check.js" }` |
| `files` | `["src/**/*.js", "README.md"]` |
| `scripts.test` | `bun test test/*.test.js` (matches the libmock/libcli/libdoc convention) |
| `engines.node` | `>=22.0.0` (libpreflight bootstrap note in design) |
| `engines.bun` | `>=1.2.0` (matches every peer library) |
| `dependencies` | _(omit the block entirely — Decision 1 zero-dep invariant)_ |
| `peerDependencies` | _(none)_ |
| `publishConfig.access` | `public` |

No `bin` field — libpreflight has no CLI of its own, so it is not subject to
assertion (b)'s preflight-import requirement (the check applies to every
file targeted by a published `package.json#bin` field).

**`src/check.js`.** Exported function exactly per design § Interfaces:

```js
export function check(requiredMajor, processObj = process) {
  const detected = processObj.versions.node;
  const major = Number.parseInt(detected.split(".", 1)[0], 10);
  if (major >= requiredMajor) return;
  processObj.stderr.write(
    `Error: This command requires Node.js ${requiredMajor} or later (running ${detected}).\n`,
  );
  processObj.stderr.write(
    `Install Node.js ${requiredMajor} (LTS) from https://nodejs.org/ and re-run.\n`,
  );
  processObj.exit(1);
}
```

**`src/node22.js`.** Two lines:

```js
import { check } from "./check.js";
check(22);
```

**`test/check.test.js`.** Node-runner test (node:test compatible per
`libmock` conventions) with three cases against a mock process object:
(i) `versions.node: "22.0.0"` → no stderr writes, no exit; (ii)
`versions.node: "20.11.0"` → both lines written verbatim, exit called with
`1`; (iii) `versions.node: "18.20.0"` → same as (ii) with `18.20.0` echoed
in the first line. Mock process exposes `versions`, `stderr.write` (captures
calls), and `exit` (captures argument). No reliance on real `process`.

**Verification.** `cd libraries/libpreflight && bun test` passes. `bun run
context:fix` regenerates the catalog row in `libraries/README.md` without
diff churn outside the new row.

### Step 2 — Add libpreflight to the 35+ entry scripts

**Intent.** Make `import "@forwardimpact/libpreflight/node22"` the first
`import` statement in every file targeted by a published `package.json#bin`
field, and declare `@forwardimpact/libpreflight` in each owning package's
`dependencies` so `npm install` of the published package resolves it.

**Discovery.** The set is "every file referenced by any `package.json#bin`
value under `products/`, `libraries/`, `services/`" — the same discovery
rule assertion (b) uses. As of plan authoring this resolves to 37 files:

- `products/<name>/bin/fit-<name>.js` × 6 (outpost, summit, map, guide,
  landmark, pathway — `products/gear` has no `bin`, so is not in scope).
- `libraries/lib<name>/bin/*.js` × 23 (libwiki, librc, libxmr, libcodegen,
  librpc, libresource, libeval × 3, libdoc, libstorage, libsupervise × 2,
  libtelemetry, libterrain, libcoaligned, libgraph × 3, libutil × 2,
  libvector × 2).
- `services/<name>/server.js` × 8 (vector, map, trace, embedding, graph,
  mcp, msteams, pathway).

The implementer enumerates the set at run time by reading every
`package.json#bin` value rather than hand-typing the list — the count drifts
as bins are added; the design's "35 today" snapshot already became 37
because `services/embedding` and `services/msteams` gained `bin` fields
after design authoring. Assertion (b) catches any miss.

**Per-file change.** Above all other static imports (the very first
`import` in the module body, after the shebang and any leading
comment-only lines), insert:

```js
import "@forwardimpact/libpreflight/node22";
```

No blank line between the shebang and the import is required, but a blank
line after the side-effect import improves readability — match each file's
existing surrounding style.

**Per-`package.json` change.** Add `"@forwardimpact/libpreflight": "^0.1.0"`
to the `dependencies` block of each owning package (the package whose `bin`
field targets the edited file). For packages with no `dependencies` block,
create one. The caret range on a `0.x.y` initial version resolves
`>=0.1.0 <0.2.0` per npm semver (caret on a `0.x` version locks to the
`0.x` minor); when libpreflight next bumps a minor — `0.2.0`, `0.3.0`,
etc. — the consumer manifests fan out in the same release wave alongside
the libpreflight bump. Do not pin exact (`0.1.0`) and do not widen to
`*` or `>=0.1.0`.

**Owning packages whose `package.json` gains the dependency declaration**
(37 entries today; the implementer enumerates from `package.json#bin` rather
than this list because the set drifts):

| Tree | Packages with `bin` (count) |
|---|---|
| `products/` | `outpost`, `summit`, `map`, `guide`, `landmark`, `pathway` (6) |
| `libraries/` | `libwiki`, `librc`, `libxmr`, `libcodegen`, `librpc`, `libresource`, `libeval`, `libdoc`, `libstorage`, `libsupervise`, `libtelemetry`, `libterrain`, `libcoaligned`, `libgraph`, `libutil`, `libvector` (16 packages → 23 bin files) |
| `services/` | `vector`, `map`, `trace`, `embedding`, `graph`, `mcp`, `msteams`, `pathway` (8) |

**Verification.** `bun install` resolves all new declarations via the
workspace hoist (no fetch). `bun run invariants:check-workspace-imports`
(an existing invariant) passes — confirming the new declarations are
declared, not transitive. For one entry script per category, run the
binary manually under the current Node (≥22) and confirm normal output
unchanged; under `nvm use 20 && node products/landmark/bin/fit-landmark.js
--help` confirm the failure message renders verbatim and exit code is 1.

### Step 3 — Normalise outpost shebang

**Intent.** Bring `products/outpost/bin/fit-outpost.js` under the published
`#!/usr/bin/env node` contract (design Decision 6).

**File modified.** `products/outpost/bin/fit-outpost.js`.

**Change.** Replace the first line from `#!/usr/bin/env bun` to
`#!/usr/bin/env node`. The libpreflight side-effect import from Step 2 is
the second line (or third, separated by a blank line).

**Verification.** `head -1 products/outpost/bin/fit-outpost.js` reports
`#!/usr/bin/env node`. `rg 'Bun\\.' products/outpost/src/` still returns no
matches (design-time verification of the no-Bun-API claim — re-run as a
freshness check).

### Step 4 — Bump `engines.node` to `>=22.0.0`

**Intent.** Every `package.json` in the workspace that declares
`engines.node` carries `>=22.0.0` as its lower bound (design Decision 3
single-floor rule, assertion (a)).

**Discovery.** Every `package.json` under `products/`, `libraries/`,
`services/`, plus the workspace root that carries an `engines.node` field.
At plan authoring time the grep `'"engines"' --include="package.json"`
resolves to 51 manifests (8 services + 35 libraries + 7 products + 1
workspace root); 52 after Step 1's new `libraries/libpreflight/package.json`
lands. The design's "49 today; 50 after" wording was a snapshot — the
discovery rule prevails, the implementer enumerates from the current tree.

**Per-file change.** In the `engines` block, replace
`"node": ">=18.0.0"` with `"node": ">=22.0.0"`. Leave any sibling
`"bun"` entry unchanged. Do not touch `engines.npm` (out-of-scope per
design § Out of scope).

**Verification.** `rg '"node":\\s*">=(1[0-9]|20|21)' --type json` returns
no matches (catches every sub-22 lower bound — `>=18.x`, `>=19.x`, `>=20.x`,
`>=21.x`). Complementary positive check:
`rg '"node":\\s*">=22' --type json -l | wc -l` reports a count equal to
the total number of manifests that carry `engines.node` (52 after Step 1's
libpreflight manifest lands). Step 6's assertion (a) is the authoritative
gate and additionally covers the range-syntax variants (`^22`, `22.x`)
that the line-grep would not match; the line-grep is an implementer-side
sanity check, not the gate.

### Step 5 — Rewrite the ten getting-started doc pages

**Intent.** Every page under `websites/fit/docs/getting-started/{leaders,
engineers}/**/index.md` that names a Node version advertises `Node.js 22+`
(assertion (c) per design § Components, exact text per spec § Success
Criteria).

**Files modified.**

```
websites/fit/docs/getting-started/leaders/index.md
websites/fit/docs/getting-started/leaders/landmark/index.md
websites/fit/docs/getting-started/leaders/map/index.md
websites/fit/docs/getting-started/leaders/pathway/index.md
websites/fit/docs/getting-started/leaders/summit/index.md
websites/fit/docs/getting-started/engineers/index.md
websites/fit/docs/getting-started/engineers/guide/index.md
websites/fit/docs/getting-started/engineers/landmark/index.md
websites/fit/docs/getting-started/engineers/outpost/index.md
websites/fit/docs/getting-started/engineers/pathway/index.md
```

`websites/fit/docs/getting-started/contributors/index.md` is intentionally
**not** in scope (advertises Bun, not Node — per spec § Scope and design
§ Architecture).

**Per-file change.** Replace the literal string `Node.js 18+` with `Node.js
22+` in place. The string occurs once per page (verified by grep at plan
authoring time). No other prose changes; the page's surrounding text
already reads correctly under the new floor.

**Verification.** Inverted check (anything not `22+`):
`rg 'Node\.js (\d+)\+' --no-line-number -o -r '$1' websites/fit/docs/getting-started/ | sort -u`
returns a single line `22` and nothing else. (This finds every
`Node.js <N>+` token across the doc set and lists the distinct majors; a
clean result is the single line `22`. Any other line — `18`, `20`, `25`,
etc. — is a regression.) The discovery-rule check is preferred over an
enumerated denylist because it survives a future Node bump to `25+`
without plan amendment. `rg 'Node\.js 22\+' websites/fit/docs/getting-started/{leaders,engineers}/ -l`
should list every page in the in-scope set (the count drifts as
getting-started pages are added; the implementer reads the list from
the rg output rather than asserting a hard-coded "10"). Assertion (c)
in Step 6 is the authoritative gate. Local `bunx fit-doc build` (run
inside `websites/fit/`) emits no doc-build error on the changed pages.

### Step 6 — Add `scripts/check-node-floor.mjs` and wire it into invariants

**Intent.** Land the four-assertion invariant script (per design Decision 5)
and chain it into the existing `invariants` umbrella so `check-quality.yml`'s
`invariants` job runs it on every push and
PR.

**Files created.** `scripts/check-node-floor.mjs`.

**Files modified.** Root `package.json` (npm scripts block).

**Script shape.** Match the style of the existing
`scripts/check-workspace-imports.mjs` and `scripts/check-libmock.mjs`:
plain `node`-runnable ESM with `#!/usr/bin/env node` shebang as the first
line (the two existing siblings both carry this shebang — verified at
plan authoring), ROOT computed from `import.meta.url`, status-code
accumulator, `console.error("error: …")` per failure, `process.exit(1)`
at end if any failure. The script is invoked through `bun` in the npm
script wiring below — the shebang exists for direct `node scripts/check-node-floor.mjs`
runs in case a contributor reaches the file outside `bun run invariants`.
Four assertions in one script:

| # | Assertion | Mechanism |
|---|---|---|
| a | Every `package.json#engines.node` lower bound resolves to a major ≥ 22 | Glob `**/package.json` excluding `node_modules`/`dist`/`generated`/`tmp`; parse the lower bound of each `engines.node` range with a 5-line regex helper (`/^(?:[>~^]=?)?(\\d+)/`); reject parses below 22; accepts `>=22`, `>=22.0.0`, `^22`, `22.x` |
| b | Every file targeted by any `package.json#bin` field includes `import "@forwardimpact/libpreflight/nodeNN"` as its first import statement, with `NN` matching the owning manifest's `engines.node` lower bound major | Reuse the glob + manifest-parse from (a); for each bin target, read the file, locate the first `import` statement, assert it matches the regex `/^import\\s+["']@forwardimpact\\/libpreflight\\/node(\\d+)["']/m` with the captured major equal to the owning manifest's lower-bound major |
| c | Every `getting-started/{leaders,engineers}/**/index.md` that names "Node.js" names `Node.js 22+` and no other Node version | Glob the doc set; for each file, find every `/Node\\.js\\s+(\\d+\\+?)/` match; fail if any match's captured group is not `22+` (zero matches per page is allowed only if the page never says "Node.js" — assertion (c) is "if it says Node.js it says Node.js 22+", both directions) |
| d | The floor literal at one doc page, one manifest, and the `check.js` body agree | Read one canonical doc page (`leaders/landmark/index.md`), one canonical manifest (workspace root `package.json`), and `libraries/libpreflight/src/check.js`; extract the major-version integer from each (regex against `Node.js (\\d+)\\+`, `engines.node` lower bound, the `check(22)` arg in `node22.js` or the `requiredMajor` literal in `check.js`); fail if not all equal |

**`package.json` script wiring.** In the root `package.json` npm scripts
block, add `"invariants:check-node-floor": "bun scripts/check-node-floor.mjs"`
and extend the existing `"invariants"` script to chain the new check:

```json
"invariants": "bun run invariants:check-workspace-imports && bun run invariants:check-libmock && bun run invariants:check-node-floor",
"invariants:check-node-floor": "bun scripts/check-node-floor.mjs",
```

No edits to `.github/workflows/check-quality.yml` — the existing
`invariants` job (`bun run invariants`) picks up the new chained script
without manifest change.

**Verification.** `bun run invariants` exits 0 locally (after Steps 1–5
land). Introduce a temporary regression in a scratch branch (e.g. revert
one `engines.node` to `>=18.0.0`) and confirm `bun run invariants` exits
non-zero with the assertion-specific failure message; revert. Same for a
missing preflight import in one entry script and a `Node.js 20+` lingering
in one doc page.

## Risks

- **Publish-order coupling at release-cut.** libpreflight is a new package;
  every package whose `dependencies` block names `@forwardimpact/libpreflight`
  after this PR lands will, at its next published version bump,
  fail `npm install <consumer>` unless libpreflight is already on the
  registry. Mitigation: libpreflight@0.1.0 must publish first in the
  release-cut sequence that follows this PR's merge, before any consumer's
  next version publishes. The `kata-release-cut` skill's release-graph
  resolver already orders by `dependencies` — verify the order is
  libpreflight first, then alphabetical across consumers. If
  `kata-release-cut` enumerates from a curated list rather than from the
  dependency graph, the implementer flags this to the release engineer
  before merge so the next release wave is ordered correctly.
- **`bun install` vs `npm install` resolution divergence.** During
  contributor work the workspace hoist resolves `@forwardimpact/libpreflight`
  by name; the existing `bun run invariants:check-workspace-imports` already
  catches the "imported but not declared" failure mode at PR time. The
  cross-runtime failure mode (consumer installed from npm without
  libpreflight on the registry) is the same shape as the publish-order risk
  above and is mitigated by the same release-ordering step.
- **`engines.node` enforcement under `npm install`.** npm emits an
  `EBADENGINE` warning by default; the install does not fail unless the
  user sets `engine-strict=true` (spec § Success Criteria explicitly
  accepts this). The runtime preflight is the spec's fail-closed gate, not
  the manifest. No mitigation needed — calling it out so the implementer
  does not over-strengthen the manifest behaviour.
- **Outpost downstream-clone divergence.** The downstream
  `forwardimpact/outpost` installation carries its own `engines.node`
  outside the workspace (spec § Out of scope explicitly defers). This PR
  changes the in-workspace `products/outpost/package.json` but does not
  touch the downstream clone; any follow-up PR opened against that repo is
  a separate change. Calling it out so the implementer does not chase the
  drift into the sibling repo and balloon PR scope.
- **Outpost shebang change affects `bunx fit-outpost` users.** Switching
  the published shebang from `bun` to `node` means a downstream user who
  has node ≥22 but no bun on PATH can now run `npx fit-outpost`, which is
  the spec's intent. The reverse direction — a user who has bun but no
  node — would have worked before and stops working after. This audience
  is contributor-shaped (bun-on-PATH is the contributor toolchain) and
  external Outpost users install via the published `npx` flow, so the
  change is net-positive; calling it out so the implementer doesn't add a
  compatibility shim.

## Execution recommendation

Single PR, sequential steps, single `kata-implement` agent. The plan does
not decompose into parts — every step touches files under a single
architectural change (the floor decision) and the verification at each
step is local (no cross-step parallelism would help).

— Staff Engineer 🛠️
