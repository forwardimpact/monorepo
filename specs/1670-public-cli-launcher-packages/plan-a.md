# Plan 1670-a — Public CLI Launcher Packages

Implements [design-a.md](design-a.md) for [spec.md](spec.md). One PR, eight
steps, sequential.

## Approach

Land the repo-side mechanism in dependency order: first make every public bin
importable and import-executable (the launcher mechanism's two preconditions),
then create the 22 static launcher dirs, then the invariant that keeps them
honest, then the publish-workflow gate and publish steps that ship them. The
one deviation surfaced by pre-draft source reads: `fit-benchmark`'s bin has a
main-module guard (`libraries/libeval/bin/fit-benchmark.js:183`) that makes a
launcher `import` a silent no-op, so Step 1 restructures that bin to the
execute-on-import shape every other public bin already has. The first
coordinated release itself is release-engineer work after merge (design
§ Publish flow, Rollout) — this plan ends at a repo where that release is a
normal `kata-release-cut` pass. Two flagged deviations from the design's
letter, both with rationale in their steps: the `fit-benchmark` bin
restructure (Step 1), and smoke invocation by package path instead of
`node_modules/.bin` (Step 5) — approving this plan accepts both as the
record.

Libraries used: none.

## Step 1 — Make `fit-benchmark` execute on import

Move the CLI `definition` into `src/` and drop the bin's main-module guard so
a launcher `import` runs the CLI like every other public bin.

- Created: `libraries/libeval/src/commands/benchmark-definition.js`
- Modified: `libraries/libeval/bin/fit-benchmark.js`,
  `libraries/libeval/test/benchmark-parity.test.js`

Changes:

- Move the `definition` object (`bin/fit-benchmark.js:18-150`) verbatim into
  `src/commands/benchmark-definition.js`, exported as `definition`; its
  handler imports (`./benchmark-run.js`, `./benchmark-invariants.js`,
  `./benchmark-report.js`) become same-directory relative imports; keep the
  `@forwardimpact/libutil/models` import.
- Bin: import `definition` from the new module, delete the `realpathSync`
  import, delete the guard at line 183, and call `main().catch(…)`
  unconditionally (clean break — no compat shim for importing the bin).
- Test: `benchmark-parity.test.js:11` imports `definition` from
  `../src/commands/benchmark-definition.js`.

Verify: `bun test libraries/libeval` passes, and a temp launcher-shaped file
(`tmp/l.mjs` containing only
`import "@forwardimpact/libeval/bin/fit-benchmark.js";`) run as
`node tmp/l.mjs --help` exits 0 printing a banner containing `fit-benchmark`.

## Step 2 — Export the 15 missing bin subpaths

Add the `./bin/<cli>.js` subpath to `exports` so launchers can import each
bin (design Decision 5). Every source bin entry already follows
`<cli>: ./bin/<cli>.js`, so each added entry maps
`"./bin/<cli>.js": "./bin/<cli>.js"`.

- Modified (12 `package.json` files): `libraries/libdoc` (fit-doc),
  `libraries/libgraph` (fit-process-graphs, fit-subjects, fit-query),
  `libraries/libresource` (fit-process-resources), `libraries/libvector`
  (fit-process-vectors, fit-search), `libraries/librpc` (fit-unary),
  `libraries/libterrain` (fit-terrain), `products/map` (fit-map),
  `products/guide` (fit-guide), `products/landmark` (fit-landmark),
  `products/summit` (fit-summit), `products/pathway` (fit-pathway),
  `products/outpost` (fit-outpost)

Verify: for each of the 22 public CLIs,
`node -e "require.resolve('@forwardimpact/<src>/bin/<cli>.js')"` succeeds
from the repo root (the 7 already-exported subpaths included).

## Step 3 — Create `launchers/` (22 dirs + README)

Hand-write one static launcher per public CLI, per design § Launcher shape.

- Created: `launchers/README.md`, and for each of the 22 CLIs in
  [spec § Public-CLI set](spec.md#public-cli-set-the-unit-of-work):
  `launchers/<cli>/package.json` + `launchers/<cli>/bin/<cli>.js`

Changes:

- `bin/<cli>.js` is exactly two lines:

  ```js
  #!/usr/bin/env node
  import "@forwardimpact/<src>/bin/<cli>.js";
  ```

- `package.json` before canonicalization:

  ```json
  {
    "name": "<cli>",
    "version": "0.0.0",
    "description": "Run <cli> from the npm registry — launcher for @forwardimpact/<src>",
    "type": "module",
    "bin": { "<cli>": "./bin/<cli>.js" },
    "files": ["bin/"],
    "dependencies": { "@forwardimpact/<src>": "0.0.0" }
  }
  ```

  then `node scripts/check-metadata.mjs --fix` stamps homepage, repository
  (with per-dir `directory`), license, author, engines, publishConfig, and
  canonical key order. `launchers/` is deliberately **not** added to root
  `workspaces` (design Decision 7b) and carries no `os` field — a
  platform-restricted source (`products/outpost`, `os: ["darwin"]`) surfaces
  its own `EBADPLATFORM` at install time, which is the correct error.
- `launchers/README.md` states the contract (npm name = invoked name, version
  stamped at publish from the source, exact-pinned dependency), cites spec
  1670, and points to `scripts/check-public-cli-set.mjs` as the enforcement.

Verify: `node scripts/check-metadata.mjs` reports clean and
`ls launchers | wc -l` prints 23.

## Step 4 — Public-set invariant

Add the single alignment check (design § Components, second row) and wire it
into the `invariants` chain.

- Created: `scripts/check-public-cli-set.mjs`,
  `tests/check-public-cli-set.test.js`
- Modified: `package.json` (root)

Changes:

- The script exports a pure `checkPublicCliSet({ invokedNames, packages,
  launchers })` (in-memory inputs, same testable shape as
  `scripts/check-workspace-imports.mjs`) plus a CLI `main()` that collects
  real inputs:
  - **Invoked names**: regex
    `/\b(?:npx|bunx)\s+(?:-y\s+|--yes\s+)?(fit-[a-z][a-z-]*)/g`
    over `websites/fit/docs/**/*.md` and `.claude/skills/{fit,kata}-*/**/*.md`
    (script comment noting the known forward-drift gap: forms like
    `npx --package=…` or `bunx --bun` are not matched and would silently
    under-count if docs ever adopt them; today's tree uses none)
    (references included), unioned with the declared sibling-action list
    `["fit-benchmark", "fit-eval", "fit-trace", "fit-wiki"]` (comment pointing
    at `.github/CLAUDE.md` § Third-party actions; subsumed by docs/skills
    today).
  - **Bins**: every non-private `package.json` under the root `workspaces`
    globs (`libraries/*`, `products/*`, `services/*`), per bin entry.
  - **Rule output**: invoked ∩ bins, per bin name.
  - Failure conditions, each with a message naming the offending dir/file:
    | # | Condition |
    |---|---|
    | a | the set of `launchers/` **subdirectories** (non-directories like `README.md` excluded) ≠ rule output (either direction) |
    | b | launcher `bin` key ≠ its dir/package name; or `bin/` does not contain exactly one file; or that file is not **byte-exact** equal to the canonical two-line shape (shebang line + the rule-mapped `@forwardimpact/<src>/bin/<cli>.js` import line, LF line endings, single trailing newline — Step 3's code block is the canonical byte sequence) — content equality, not import parsing, because `files: ["bin/"]` ships the whole dir and pinning `package.json` alone stops neither appended code nor a second file (PR #1543 carry 2, [issuecomment-4678620460](https://github.com/forwardimpact/monorepo/pull/1543#issuecomment-4678620460)); or the source `exports` lacks that subpath |
    | c | launcher `version` ≠ `"0.0.0"` or its dependency pin ≠ `"0.0.0"` |
    | d | launcher `package.json` has a key outside the allowed set {name, version, description, homepage, repository, license, author, type, bin, files, dependencies, engines, publishConfig} (subset semantics, per design: "no keys beyond the canonical metadata set"); or is missing any of {name, version, type, bin, files, dependencies}; or `dependencies` ≠ exactly one entry equal to the rule's mapped source; or `files` ≠ `["bin/"]`; or `bin` has ≠ 1 key |
- Tests (in-memory fixtures): missing launcher, stale launcher, bin file
  content deviating from the canonical two-line shape (wrong source import;
  appended third line), a second file in `bin/`, missing source export
  subpath, real version checked in, smuggled
  second dependency / `scripts.postinstall` / extra `files` entry, and two
  negative-membership cases — `fit-svcmap` (bin exists, never invoked) and
  `fit-graph` (a literal `npx fit-graph` sits in the docs at
  `websites/fit/docs/libraries/service-lifecycle/index.md:92`, but no bin
  backs the name) both stay out of the rule output.
- Root `package.json`: append
  `"invariants:check-public-cli-set": "bun scripts/check-public-cli-set.mjs"`
  and add it to the `invariants` chain.

Verify: `bun test tests/check-public-cli-set.test.js` passes and
`bun run invariants:check-public-cli-set` exits 0 on the real tree reporting
exactly 22 members.

## Step 5 — Publish workflow: stamp + tarball smoke gate

Add the additive launcher gate to `publish-npm.yml` (design § Publish flow);
tags whose package has no launchers take today's path unchanged.

- Modified: `.github/workflows/publish-npm.yml`

Changes (new steps after the existing `Smoke test npm package`, which stays
untouched):

- **Run public-set invariant**: `bun scripts/check-public-cli-set.mjs` —
  in-job so a tag cut from a commit that skipped CI still gets the guarantee.
- **Resolve matching launchers** (id: `launchers`): node snippet globs
  `launchers/*/package.json`, keeps those whose single dependency name equals
  `$NPM_NAME`, and writes the dirs as a **space-separated list** to a step
  output — later steps consume it directly as the word-split `$LAUNCHER_DIRS`
  (launcher dir names match `fit-[a-z-]+`, so word-splitting is safe). Empty
  list → all later launcher steps no-op.
- **Stamp + pack + smoke** (skipped when `dirs` is empty):

  ```bash
  SRC_VERSION=$(node -p "require('./$DIR_NAME/package.json').version")
  for L in $LAUNCHER_DIRS; do
    (cd "$L" && npm pkg set "version=$SRC_VERSION" "dependencies.$NPM_NAME=$SRC_VERSION")
  done
  PACK_DIR=$(mktemp -d)
  npm pack --workspace="$NPM_NAME" --pack-destination="$PACK_DIR"
  for L in $LAUNCHER_DIRS; do npm pack "./$L" --pack-destination="$PACK_DIR"; done
  cd "$PACK_DIR" && npm init -y && npm install ./*.tgz --force
  ```

  Then per launcher `<cli>`:
  - `OUT=$(node node_modules/<cli>/bin/<cli>.js --help)` exits 0 and `$OUT`
    contains the bare string `<cli>` (per-bin banner identity, design
    Decision 6b). Invoke by package path, **not** `node_modules/.bin/<cli>` —
    the source tarball ships the same bin names, so the shared install's
    `.bin` shims are a source-vs-launcher collision that `--force` resolves
    arbitrarily; the package path is unambiguous and still resolves from the
    launcher's own context (flagged deviation from the design's `.bin`
    wording, same intent). Skip only this bullet — with a `::notice` — when
    the source's `os` field excludes the runner platform (same predicate as
    the existing smoke); the two assertions below are pure resolution checks
    and always run.
  - Resolved-version assertion **from the launcher's context**: node snippet
    using `createRequire(resolve('node_modules/<cli>/bin/<cli>.js'))`
    `.resolve('@forwardimpact/<src>/bin/<cli>.js')`, reads
    `../package.json` relative to the resolved bin dir, asserts `version ===
    SRC_VERSION` (resolve the bin subpath, not `<src>/package.json` — most
    sources do not export `./package.json`, and the implementer must not
    "fix" a resulting `ERR_PACKAGE_PATH_NOT_EXPORTED` by reverting to the
    top-level read, which is vacuous for the exact case this assertion
    exists to catch; PR #1543 carry 1).
  - Dedupe assertion: `npm ls @forwardimpact/<src> --json` reports exactly
    one copy at the stamped version and `node_modules/<cli>/node_modules`
    does not exist (design Decision 6b's single-deduped-copy / zero-nesting
    claim, both halves checked).

Verify: no local command executes workflow YAML — this step's body is proven
by the Step 8 rehearsal; the PR diff is the review surface.

## Step 6 — Publish workflow: ownership-checked idempotent publish

Replace the publish step with the skip-or-fail-loud sequence (design
Decision 6a) and provenance.

- Modified: `.github/workflows/publish-npm.yml`

Changes:

- Extend `Copy LICENSE to package` to also copy `LICENSE` into each matching
  launcher dir.
- Publish step, keeping the existing step's
  `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` env, with
  `NPM_PUBLISHER: dickolsson` as a step env constant (verified live:
  `npm owner ls @forwardimpact/libxmr` → `dickolsson <hi.npm@senzilla.io>`;
  leave a YAML comment saying to re-check with that command if the ownership
  guard ever fails loud); per package — source first, then each launcher:

  ```bash
  # decide(pkg, ver): publish | skip | fail
  set +e; OUT=$(npm view "$PKG@$VER" version 2>&1); CODE=$?; set -e
  if [ $CODE -eq 0 ]; then
    npm owner ls "$PKG" | grep -q "^$NPM_PUBLISHER " \
      || { echo "::error::$PKG exists on the registry but is not ours"; exit 1; }
    echo "::notice::$PKG@$VER already published — skipping"
  elif echo "$OUT" | grep -q "E404"; then
    npm publish $SPEC --access=public --provenance
  else
    echo "$OUT"; exit 1
  fi
  ```

  where `$SPEC` is `--workspace="$NPM_NAME"` for the source and
  `./launchers/<cli>` for each launcher. A transient failure mid-loop is
  recovered by re-running the tag: already-published artifacts skip, the
  rest complete (design § Failure modes).

Verify: no local command executes this step either — Step 8.4 rehearses the
`decide` branch logic against the live registry
(`@forwardimpact/libxmr@2.0.0` → skip path; `fit-xmr` → E404/publish path,
without publishing).

## Step 7 — Traceability pointer

Make the documented contract trace to the mechanism (design § Boundaries,
`CLAUDE.md` row).

- Modified: `CLAUDE.md` (root)

Change: one sentence appended to the **Distribution Model** npm-packages
bullet: bare `fit-*` names are published launchers delegating to the scoped
implementation packages — see `launchers/README.md` (spec 1670).

Verify: `bun run context` passes (instructions line/word budgets included).

## Step 8 — Full verification + gate rehearsal

Prove the workflow-step bodies against the live tree before the PR lands,
since CI never executes `publish-npm.yml` on PRs.

- Created/Modified: none (rehearsal only)

Rehearse, from the repo root:

1. **Sibling-tarball proof at an unpublished version**: in the working tree
   (not committed), bump `libraries/libeval/package.json` and
   `libraries/libxmr/package.json` to versions that do **not** exist on the
   registry (e.g. next patch + `-rehearsal.0`), then run Step 5's
   stamp/pack/install/smoke body for `@forwardimpact/libeval` (multi-bin:
   3 launchers) and `@forwardimpact/libxmr` (single-bin). The
   resolved-version assertion passing at an unpublished version is the real
   proof of the design's load-bearing registry-equivalence claim — at a
   published version the registry could satisfy the pin and the assertion
   passes vacuously. The sources' own scoped deps still come from the
   registry, the same precondition the live workflow has. Revert the bumps
   after.
2. **Induced gate failure** (spec § Success Criteria row 6): repeat with one
   launcher's pin deliberately stamped to an already-published version
   (e.g. `fit-xmr` pinned to a registry `libxmr` while the source tarball
   carries the unpublished bump) and observe the resolved-version/dedupe
   assertions fail the gate; then — with the pin reverted to the unpublished
   rehearsal version — drop the source tarball from the install and observe
   the install itself fail (an unpublished pin with no sibling tarball
   resolves nowhere; with a published pin it would quietly resolve from the
   registry instead). Nothing publishes in either case.
3. **All-22 banner coverage**: pack all 17 source packages and all 22
   stamped launchers into one clean dir, install together, run the
   `--help` + banner assertion for every launcher (`fit-outpost` runs too —
   the os-skip keys on the field, not behavior; if it fails on linux, note
   it and rely on the skip predicate). This is the first registry-resolved
   execution for 18 of the 22 bins, so failures here are gate blockers found
   before, not during, the first coordinated release.
4. Step 6's decide logic (skip / E404 / fail branches) with publish replaced
   by `echo`.
5. `bun run check` and `bun run test` green at the branch tip (`bun run
   test`, not bare `bun test` — the root script's scoped `find` excludes
   `benchmarks/` fixture tests by design).

Verify: rehearsal transcript attached to the PR description.

## Risks

- **npm sibling-tarball resolution** — the gate's atomicity rests on
  `npm install ./*.tgz` resolving each launcher's exact pin against the
  sibling source tarball, not the registry. If a future npm changes this, the
  resolved-version assertion fails the gate loudly (no silent wrong-artifact
  path); Step 8.1's unpublished-version rehearsal proves current behavior
  before merge.
- **First gate run per package is a new execution surface** — the existing
  smoke never executes bins ("workspace deps missing in isolation",
  `publish-npm.yml:95`); the gate runs every launcher's `--help` from a
  registry-resolved install, so a bin that works in the workspace but not in
  a clean install (e.g. an undeclared dependency on generated artifacts)
  would fail its source's first post-merge release mid-gate. Step 8.3's
  all-22 rehearsal pulls those failures forward to the PR.
- **`fit-outpost` banner run may be skipped on linux runners** — its source
  is darwin-only, so the gate's `--help` bullet skips by the `os` predicate
  while the resolution and dedupe assertions still run; its smoke-execution
  coverage equals today's coverage for `@forwardimpact/outpost` (its `--help`
  does run on linux, verified in pre-draft reads and re-checked in Step 8.3).
  The gate's install only proceeds because `--force` downgrades
  `EBADPLATFORM` to a warning — the existing workflow comment at
  `publish-npm.yml:67-70` ("npm install would fail") predates that npm
  behavior and describes the un-forced path; verified on npm 10.9.8 and
  re-proven by Step 8.3's all-source linux install.
- **`--provenance` is new for source publishes too** — needs the public repo
  + `id-token: write` (both present). A sigstore outage fails the publish;
  re-running the tag is safe because of the idempotent skip.
- **First-publish window** — until the first coordinated release, the 22
  unscoped names remain squattable; ownership check turns a pre-claimed name
  into a loud failure, not a wrong publish. Release-engineer cuts the
  coordinated release promptly after merge; confirming `NPM_TOKEN` can
  create new unscoped packages — including any 2FA-for-publish interaction,
  an unexercised path for the current token — is **human-owned
  (@dickolsson)**, same shape as the #1577/#1548 prerequisites (design
  § Publish flow, Rollout; PR #1543 carry 4).

## Execution

Single agent, sequential, one PR: `staff-engineer` via `kata-implement`
(steps 1–8 in order; 3 depends on 2, 5–6 depend on 3–4). The post-merge
coordinated release is `release-engineer` work under `kata-release-cut`,
not part of this plan's PR, with three bindings from the PR #1543 carries
([issuecomment-4678655633](https://github.com/forwardimpact/monorepo/pull/1543#issuecomment-4678655633)):

- **Coverage (carry 3)**: the first cut covers **all 17 source packages**
  backing the 22 names — sources with no unreleased delta at implementation
  time (e.g. `libwiki`, `libxmr`, `libcodegen`, `librc` — not `libeval`,
  whose Step 1 restructure is a real delta by then) get
  explicit chore version bumps so `publish-npm.yml` triggers and claims
  their launcher names. The typosquat window closes per-package as each tag
  publishes, not atomically — foundational deps first per `kata-release-cut`
  § Dependency chain, no stragglers.
- **Token precondition (carry 4)**: human-owned (@dickolsson) — see § Risks.
- **Expansion (carry 5)**: once the preferred granular token (22 names +
  `@forwardimpact`) is in place, every future public-set expansion re-opens
  the unscoped-create problem — a 23rd launcher needs a temporary
  broaden-or-rotate token step before its first publish; recorded here so
  the first expansion doesn't rediscover it as a publish failure.

`release-engineer` also re-runs spec § Success Criteria rows 1–3 and 7 (the
clean-dir `npx --yes <cli>` checks, only observable against the live
registry) after that release and records the result on it. No
documentation-agent routing — Step 7's single sentence and
`launchers/README.md` ride the implementation PR.

— Staff Engineer 🛠️
