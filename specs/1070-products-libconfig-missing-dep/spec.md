# Spec 1070 — Declare `@forwardimpact/libconfig` as a dependency in three published products

## Problem

A fresh adopter running `npx fit-map`, `npx fit-landmark`, or `npx
fit-summit` against a clean machine hits `Cannot find package
'@forwardimpact/libconfig'` (the Node ESM resolver's error for the
affected `"type": "module"` products) before any product code runs.
Each of these three products imports from `@forwardimpact/libconfig`
at startup but does not declare it in `dependencies`, so `npm install`
of the product never brings libconfig into the dependency tree.

| Product | Published version | Source files that import libconfig | `dependencies` declares libconfig? |
|---|---|---|---|
| `@forwardimpact/map` | 0.15.46 | [`bin/fit-map.js:17`](../../products/map/bin/fit-map.js), [`src/commands/init.js:10`](../../products/map/src/commands/init.js), [`src/commands/substrate-stage.js:17`](../../products/map/src/commands/substrate-stage.js), [`test/init.test.js:14`](../../products/map/test/init.test.js) | no |
| `@forwardimpact/landmark` | 0.1.17 | [`bin/fit-landmark.js:16`](../../products/landmark/bin/fit-landmark.js) | no |
| `@forwardimpact/summit` | 0.1.20 | [`bin/fit-summit.js:16`](../../products/summit/bin/fit-summit.js) | no |
| `@forwardimpact/guide` | 0.1.40 | [`bin/fit-guide.js:17`](../../products/guide/bin/fit-guide.js), [`src/commands/init.js:4`](../../products/guide/src/commands/init.js), [`src/commands/status.js:42`](../../products/guide/src/commands/status.js) (dynamic), [`src/lib/login.js:74`](../../products/guide/src/lib/login.js) (JSDoc type), [`test/parity/runner.js:39`](../../products/guide/test/parity/runner.js) (dynamic) | yes — `"@forwardimpact/libconfig": "^0.1.58"` |

Because the import is at the CLI entry point (`bin/fit-*.js`) for
map/landmark/summit, the failure surfaces on *any* CLI invocation —
including `fit-map --help`, `fit-landmark --help`, and `fit-summit
--help`. The persona never reaches the subcommand they intended to run.

The three undeclared imports were latent: in the monorepo, libconfig is
hoisted by the workspace, and in development each CLI resolves it via
the workspace's `node_modules`. The hoist masks the gap in `bun
install` and in `bun test`. The publish-time smoke step in
[`.github/workflows/publish-npm.yml`](../../.github/workflows/publish-npm.yml)
runs `npm install <tarball>` in a fresh tmpdir then only `require.resolve`s
the package's `main` and confirms the bin file exists on disk — it
explicitly **does not execute** the bin (the workflow comment on line
92 reads `# Verify CLI entry point file exists (don't execute —
workspace deps missing in isolation)`). The smoke passes because the
failing import path is never exercised, not because anything resolves
the missing dependency. The failure surfaces only on a non-workspace
consumer that actually runs the bin (`npx` on a clean machine, or a
downstream `npm install` of a single product followed by invocation).

### How this surfaced

A `kata-interview` user-testing session was filed as
[issue #983](https://github.com/forwardimpact/monorepo/issues/983). The
reported failure was a *published export gap* in libconfig — `0.1.77`
did not ship the `bootstrapProject` source file — and was resolved by
publishing `libconfig@0.1.79`
([release engineer comment](https://github.com/forwardimpact/monorepo/issues/983#issuecomment-4472173353)).
Verification exposed this separate, latent gap: even with libconfig@0.1.79
on the registry, `npm install @forwardimpact/map@latest` produced a
tree with no libconfig at all, because map's `package.json` never
declared it. The persona's session had libconfig in scope only because
a prior `fit-guide --init` step pulled it transitively through guide's
declared dependency. A fresh adopter who starts with `fit-map`,
`fit-landmark`, or `fit-summit` cannot reach any product behaviour from
a clean install.

### JTBD impact

The three affected products span three of the four [JTBDs](../../JTBD.md)
served by Forward Impact products. Engineering Leaders is the common
persona — every CLI is at the leader's reach, and every CLI is broken:

| Product | Affected persona | Big Hire |
|---|---|---|
| `fit-map` | Engineering Leaders | Define the Engineering Standard |
| `fit-landmark` | Engineering Leaders + Empowered Engineers | Measure Engineering Outcomes / Find Growth Areas |
| `fit-summit` | Engineering Leaders | Staff Teams to Succeed |

The `kata-interview` session that surfaced the gap was running the
Empowered Engineers → Find Growth Areas job (BioNova J070 persona) on
Guide + Landmark; map and summit broke as the persona looked sideways
for what else they could try. The fix restores the documented `npx
fit-<product>` install path for all three personas at once.

### Why the disease can recur

The three latent bugs share one mechanism: a contributor writes
`import { … } from "@forwardimpact/<workspace-package>"` inside a
published product's source, and nothing in the repo's contributor flow
fails when the corresponding `dependencies` entry is missing. The hoist
hides the gap in workspace install and test; the publish-time smoke
step misses it because it does not execute the bin. Any future product
that imports a workspace sibling without declaring it carries the same
latent break until someone runs the bin on a clean machine.

The same disease exists today in `libraries/*` —
`libraries/libresource/bin/fit-process-resources.js`,
`libraries/libutil/bin/fit-download-bundle.js`,
`libraries/libvector/bin/fit-process-vectors.js`, and
`libraries/libvector/bin/fit-search.js` each import libconfig without a
corresponding declaration in their library's `package.json`. Those
sites are out of scope for this spec (see *Out of scope, deferred*) but
shape the design: the contributor-side guard this spec introduces must
either fix or scope around them, since a guard that fires on `main`
prevents the implementation branch from going green.

## Scope

### In scope

| Component | What changes |
|---|---|
| `products/map/package.json` `dependencies` | Adds `"@forwardimpact/libconfig"` with a range whose `semver.minVersion` is exactly `0.1.79` (the version that first ships `bootstrapProject`). |
| `products/landmark/package.json` `dependencies` | Same — adds `"@forwardimpact/libconfig"` with `minVersion` exactly `0.1.79`. |
| `products/summit/package.json` `dependencies` | Same — adds `"@forwardimpact/libconfig"` with `minVersion` exactly `0.1.79`. |
| `products/guide/package.json` `dependencies` | Bumps the existing libconfig pin from `^0.1.58` to a range with `minVersion` exactly `0.1.79`. (`^0.1.58` resolves to `0.1.79` against a fresh registry today; the bump hardens against stale-cache and lockfile-pinned installs.) |
| Test-file imports for map | `products/map/test/init.test.js:14` is the only test-file libconfig import in the four products' source trees. The map manifest declares libconfig in either `dependencies` (already required by the bin/src rows above, so a single `dependencies` entry covers tests too) **or** additionally in `devDependencies` — the spec accepts either, the design picks. |
| Range-expression consistency across the four products | The four products declare libconfig with a `minVersion` of exactly `0.1.79`. The literal range expression (e.g. `0.1.79`, `^0.1.79`, `~0.1.79`, `>=0.1.79`) is a design choice; the spec does not require byte-identical strings — that is a code-review concern, not a correctness one. |
| Releasing the fix | The implementation PR ships the four `package.json` edits. Whether `kata-release-cut` derives patch bumps automatically from these `package.json`-only edits is verified during planning (the plan reads `kata-release-cut`'s actual bump rule and either trusts it or schedules an explicit bump commit). The spec does not commit either way; success on the implementation branch is independent of the release-cut behaviour. |
| Contributor-side guard against recurrence | A check that fails when a file under `products/*` imports a workspace package (`@forwardimpact/*`) that is not declared in any of the importing package's `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies`. The guard runs in CI as part of the standard contributor verification workflow (plan picks the entry-point command and integration point). The guard's scope is limited to `products/*` for this spec — see the libraries deferral below. |
| Guard import-form coverage | The guard catches at minimum static `import` and `export` statements (the failure shape this spec fixes); whether it also catches dynamic `await import(…)` and JSDoc `import("…")` type references is a design choice. |
| Documentation note in `products/CLAUDE.md` | A section added to [`products/CLAUDE.md`](../../products/CLAUDE.md) named "Workspace dependencies" (or similar — heading wording is design-picked) records the rule: any `@forwardimpact/*` import inside a published product must appear in that product's `package.json`. The section references the contributor-side guard by name so a reader who hits the guard's diagnostic can find the rule that justifies it. |

### Out of scope, deferred

- **Pre-publish consumer-import-vs-published-exports check.** A
  forthcoming spec covers the publish-side guard that would have
  caught the *original* #983 export gap. That spec validates what
  the published tarball actually exports against what its declared
  consumers import. This spec's contributor-side guard only checks
  that `dependencies` is declared, not that the pinned version
  provides the imported export.
- **Inter-package publish-race hardening.** A forthcoming spec
  covers the run-56 race between sibling-package publishes (the
  smoke test resolving `^0.1.15` of libsecret while libsecret was
  mid-publish). Independent failure mode, independent fix.
- **Sweeping `libraries/*` for the same disease.** Four library
  sites in `libraries/libresource/`, `libraries/libutil/`, and
  `libraries/libvector/` import libconfig without declaring it
  (enumerated in *Why the disease can recur* above). Fixing them is
  out of scope for this spec because (a) they are workspace-internal
  bins that do not publish broken behaviour for the persona this
  spec serves, and (b) including them would conflate the
  product-side fix with a libraries-wide sweep. A follow-up spec
  carries the libraries-side fix and broadens the guard's scope to
  `libraries/*` once those manifests are corrected.
- **Sweeping `services/*` for the same disease.** Same rationale;
  same deferral.
- **Removing the libconfig hoist from the workspace.** The hoist
  masks the gap during development; removing it would force the
  same resolution path as `npm install`, but it would change
  unrelated workspace behaviour. The contributor-side guard
  achieves the same coverage without touching hoist semantics.
- **Lockfile policy for downstream consumers.** Whether downstream
  installs use `npm install`, `npm ci`, `--prefer-offline`, or a
  pinned lockfile is the downstream's choice. This spec hardens
  the declared range so the *lowest* satisfying version still
  works; it does not prescribe how downstreams pin.

## Preconditions

`@forwardimpact/libconfig@0.1.79` is on npm (verified in
[issue #983 resolution comment](https://github.com/forwardimpact/monorepo/issues/983#issuecomment-4472173353)).
This spec's success criteria depend on a `minVersion` of exactly
`0.1.79`; the precondition is current as of writing and the design
should re-verify against the live registry before merging.

## Success Criteria

Verifiable on the implementation branch:

| Claim | Verification |
|---|---|
| Each of map, landmark, summit, and guide declares `@forwardimpact/libconfig` in `dependencies` at a range whose `semver.minVersion` is exactly `0.1.79`. | A test reads each `products/{map,landmark,summit,guide}/package.json`, asserts `dependencies["@forwardimpact/libconfig"]` is present, and asserts `semver.minVersion(range) === "0.1.79"`. `semver` is declared as a `devDependency` of whichever package the test lives in (closing the same disease loop the spec is fixing). |
| The contributor-side guard rejects an undeclared workspace import. | A unit test invokes the guard's check function against an in-memory representation of a published-product file that statically imports a workspace package not present in the synthetic manifest's four dependency fields; asserts the guard reports a failure that identifies both the importing file path and the missing package name. The unit test does not mutate real product source. |
| The contributor-side guard runs in CI on every PR. | The standard contributor verification workflow invokes the guard. A CI run on the implementation branch exits zero from that workflow step, demonstrating both that the guard runs and that the implementation branch is clean against the guard's scope (`products/*`). |
| `products/CLAUDE.md` documents the "imports declare dependencies" rule and references the guard. | A test reads `products/CLAUDE.md` and asserts that the file contains both (a) a sentence requiring `@forwardimpact/*` imports inside published products to appear in that product's `package.json`, and (b) a reference to the contributor-side guard by name (the name the design picks). |
| Existing in-tree tests stay green. | `bun run test` exits zero on the implementation branch. |

Verifiable post-publish (recorded on issue #983 before it closes):

| Claim | Verification |
|---|---|
| `@forwardimpact/libconfig` is in the installed dependency tree of map, landmark, and summit on a fresh `npm install`. | After release-cut publishes the new versions, a clean tmpdir runs `npm install @forwardimpact/{map,landmark,summit}@<v>` and asserts `require.resolve('@forwardimpact/libconfig', { paths: [<install dir>] })` returns a real path for each. The command transcripts are pasted into a comment on issue #983; the issue then moves to closed. |
| `npx fit-map init` succeeds end-to-end on a fresh install. | The same comment records `npx fit-map init` against a second tmpdir exiting zero and producing the bootstrap files. |
