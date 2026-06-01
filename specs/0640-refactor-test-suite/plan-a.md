# Plan 0640 — Test-Side Hygiene

## Approach

The [design](design-a.md) frames test-side hygiene as three independent
slices on top of the seams 1370 and 0650 already delivered: close the three
named libmock fixture holes (§ A), migrate residual real-I/O unit tests
onto the existing `runtime` seam (§ B), and tame oversized files plus
combinatorial matrices (§ C). The plan decomposes those slices into five
parts that can execute in parallel — each part lands one self-contained
change a single engineering agent can verify. Per [design Decision 2], a
fixture, its inline-shape lint rule in
`scripts/check-libmock-rules.mjs`, and its line in
`libraries/libmock/README.md` ship in the same change; per [design
Decision 7] no wall-clock target is gated.

## Parts index

| # | Part | Scope | Depends on | Parallelizable with |
|---|---|---|---|---|
| 01 | [libmock-fixtures](plan-a-01-libmock-fixtures.md) | Add `createGraphIndexFixture`, `createMockGrpcHealthDefinition`, `createReplEnvironment` to libmock with matching shape detectors in `check-libmock-rules.mjs` and README lines; collapse the named libgraph (×5), `products/guide/test/status.test.js`, and `libraries/librepl/test/librepl.test.js` inline shapes onto them. | — | 02, 03, 04, 05 |
| 02 | [loader-mocks](plan-a-02-loader-mocks.md) | Migrate `libraries/libprompt/test/loader.test.js` and `libraries/libtemplate/test/loader.test.js` from `mkdtempSync` to `createMockFs` injected through the loaders' existing `runtime` parameter; declare libmock in both libraries' `package.json` devDependencies. | — | 01, 03, 04, 05 |
| 03 | [io-sweep](plan-a-03-io-sweep.md) | Audit the remaining non-`integration` `mkdtemp` test files and the non-`integration` subprocess test files (including the 2 entries in `check-subprocess-in-tests.deny.json`); migrate pure-logic assertions on the existing `runtime` seam onto `createMockFs` / `createMockSubprocess`, rename real-I/O cases (including the audit's "no runtime seam in src" rows) to `*.integration.test.js`; declare libmock in any newly-importing library's `package.json`. The audit excludes the two files part 02 names by path so the parts can run concurrently. | — | 01, 02, 04, 05 |
| 04 | [file-splits](plan-a-04-file-splits.md) | Add a regression detector (`scripts/check-oversized-tests.mjs`) plus an allow-list seeded at implementation time from `find … -name "*.test.js" -exec wc -l {} \;` against `origin/main`; split the libeval cluster (`tee-writer`, `trace-collector`, `redaction-pipeline`) and `libraries/libcli/test/cli.test.js` by behaviour family. | — | 01, 02, 03, 05 |
| 05 | [matrix-collapse](plan-a-05-matrix-collapse.md) | Audit the three files the spec names (`libraries/libskill/test/modifiers.test.js`, `libraries/libskill/test/policies-predicates.test.js`, `tests/model-types.test.js`) for collapsible combinatorial matrices; collapse only matrices the audit confirms exercise a single implementation path. The audit may find no genuine matrices (the files use flat per-function `describe` blocks) — in that case the part lands the audit table as the SC4 evidence and no test changes. | — | 01, 02, 03, 04 |

A sub-row per part is recorded in `wiki/STATUS.md` as
`0640/<descriptive-slug>` matching spec 1370's precedent
(`1370/teardown`, `1370/part-07-reconciliation`): `0640/libmock-fixtures`,
`0640/loader-mocks`, `0640/io-sweep`, `0640/file-splits`,
`0640/matrix-collapse`. The master `0640` row advances to `plan
implemented` only when every sub-row is implemented.

## Execution

All five parts are independently executable on their own branches off
`origin/main`. Part 03's audit list excludes part 02's two named files
by path, so the parts may run concurrently without re-touching the same
test. Route every part to the standard engineering agent
([`kata-implement`](../../.claude/skills/kata-implement/SKILL.md)); no
documentation routing.

## Cross-cutting concerns

### Lint-rule contract

Per [design Decision 3], each new shape detector in
`scripts/check-libmock-rules.mjs` is a regex over the inline triple /
definition / bundle the fixture replaces, not a `createMock*` name match.
Each rule lands together with its fixture (part 01) and is exercised by
the existing regression test at `tests/check-libmock-rules.test.js` —
that test grows three new corpus cases, one per added rule.

Suppression precedent already in `check-libmock-rules.mjs` uses
`!c.imports` — the rule fires only when the file imports nothing from
`@forwardimpact/libmock`. The three new rules add a narrower
fixture-import check (the file imports the specific fixture name the
rule references); this lets a file freely use other libmock surfaces
without suppressing every new rule, and lets a test file that legitimately
constructs a bare `new GraphIndex(null, ...)` for error-path assertions
keep doing so as long as it also imports `createGraphIndexFixture` for
its mainline cases. The script-level `LIBMOCK_IMPORT_RE` regex is
extended with one named import detector per new fixture; the existing
`!c.imports` semantics remain for all prior rules. libmock's own source
files under `libraries/libmock/src/` are excluded from the script's
`find` glob (already excluded — `check-libmock.mjs` skips files that
start with `./libraries/libmock/`).

### Unit / integration boundary

Per [design Decision 4], the `*.integration.test.js` suffix is the seam.
Parts 02 and 03 apply one of three dispositions to every flagged file:
**migrate** (assertion inspects pure logic *and* the production code
has a `runtime` seam — inject `createMockFs` / `createMockSubprocess`
through it), **rename** (real collaborator is part of the assertion,
*or* the production code has no `runtime` seam — `git mv` to
`.integration.test.js`), or **leave** (file is already `.integration.`,
is explicitly allow-listed in `check-subprocess-in-tests.allow.json`,
or is a guard-test itself). The audit table in
[plan-a-03-io-sweep.md](plan-a-03-io-sweep.md) records the disposition
per file before any migration touches the tree.

### File-shape policy

Per [design Decision 5], the ≤400 LOC ceiling is **judgement, not lint**.
Part 04 writes a one-line policy entry in `CONTRIBUTING.md` and seeds an
allow-list at `scripts/check-oversized-tests.allow.json` consumed by the
existing `bun run check` chain through a thin one-file detector
(`scripts/check-oversized-tests.mjs`) that only flags regressions against
the allow-list — it does not enforce a hard cap on every file. The
detector script is deliberately narrow: a `wc -l` over the test glob
plus an allow-list set difference. Splits are by **behaviour family**,
not by data type, per design.

### Matrix-collapse contract

Per [design Decision 6], part 05 audits each of the three spec-named
files first to confirm whether any genuine combinatorial matrix
exists. Where the audit finds matrix-shaped parametrization that
exercises a single implementation path, the block collapses to one
boundary case per axis plus one deterministic property check (a fixed
input list iterated against a production-canonical set — no
`Math.random()`, no `fast-check` dependency, per [design Open Question 2
default]). Where the audit finds real branches, that block is kept as
per-branch representative cases. Where the audit finds no matrix at
all — the files use flat per-function `describe` blocks with the
parametric loop already inside a single `test()` — the audit table is
the SC4 evidence and no test changes ship.

### Test count

The suite is 440 files entering this plan. Splits in part 04 increase
the file count (a `~500 LOC` file becomes two `~250 LOC` files);
migrations in parts 02–03 may decrease it (an inline `createGraphIndex`
disappears) but most preserve it. Total file count drifts upward by a
small bounded amount. Per [design Decision 7], wall time is **not a
target** and is not measured by this plan; the `bun test` runner does
not fork per file so file count does not drive wall time.

### Spec § A vs design § Components — librpc carve-out

Spec § A names two consumers for the gRPC health fixture
(`libraries/librpc/test/health.test.js` *and*
`products/guide/test/status.test.js`), but
[design § Components](design-a.md#components) carves out the librpc
file because its assertions exercise librpc's **real** `healthDefinition`
(the source of truth) and must not migrate to a fake. The plan follows
the design — only `products/guide/test/status.test.js` collapses in
part 01 Step 6; librpc's `health.test.js` stays untouched. The grpc
shape detector in part 01 Step 4 is precise enough that librpc's
real-definition assertions do not trigger it (`check.path === "/grpc…"`
matches no rule).

## Risks

- **Sweep audit no-ops.** Part 03 classifies every audited file as
  **migrate**, **rename**, or **leave**. The disposition rules accept
  **rename** as the default when the production code under test has no
  `runtime` seam (so real I/O is part of the production posture, not
  test-side incidental scaffolding) — this avoids the trap of marking
  the file **leave** and shipping a no-op part. The audit table commits
  with the PR so reviewers can spot a no-op or a misclassified file.
- **Sweep classification drift.** A misclassification (calling a
  real-I/O test "pure logic" and migrating it) silently weakens
  coverage of the collaborator. Part 03 mitigates by requiring each
  migrated file's PR diff to leave assertion text and `assert.*` call
  count unchanged, and by comparing covered lines on the target source
  module against `origin/main` (see part 03 Step 4).
- **libmock dependency surface.** Adding `createGraphIndexFixture` that
  imports `libgraph` or `n3` directly would re-couple libmock to a
  domain library. [Design Decision 1] avoids this by taking
  `GraphIndex` and `Store` as **injected parameters**; the fixture
  contains no `import` for either, and `libraries/libmock/package.json`
  `dependencies` remains empty. Part 01 Step 1 records this in the
  fixture's JSDoc; reviewers verify the manifest stays clean on the
  PR diff.
- **Spec-vs-reality mismatch on § C.2 matrices.** The spec named three
  files as combinatorial matrices, but the files use flat per-function
  `describe` blocks. Part 05's Step 1 audit produces the SC4 evidence
  whether or not actual matrices are found; if no genuine matrices
  exist, the audit row stands as the spec-criterion evidence and no
  test changes ship in part 05.

## Verification

Each part enumerates the spec § Success Criteria rows it covers.
Aggregated:

| Spec criterion | Verified by part |
|---|---|
| 1 — Three fixtures exist and are documented | 01 |
| 2 — Inline consumers import the fixtures; new rules in `check-libmock` | 01 |
| 3 — Non-`integration` unit tests do no real I/O | 02 + 03 |
| 4 — Three matrices collapsed without coverage loss | 05 |
| 5 — Test files ≤400 LOC or allow-listed | 04 |
| 6 — Full suite green under `bun test` | 01 + 02 + 03 + 04 + 05 |

## Libraries used

`libmock` (additive exports), `libgraph` (`GraphIndex` / `Store`
injected into the new fixture but not imported by libmock), `librpc`
(unchanged — its `healthDefinition` tests exercise the real definition
directly per design § Components), `librepl` (unchanged), `libprompt`,
`libtemplate`, `libskill`, `libeval`, `libcli`. No new monorepo-level
dependency.

— Staff Engineer 🛠️
