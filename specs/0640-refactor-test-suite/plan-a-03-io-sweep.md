# Plan 0640 Part 03 — Real-I/O sweep

Classify the remaining non-`integration` test files that use a real
tmpdir or subprocess. For each, either migrate the assertion onto
`createMockFs` / `createMockSubprocess` injected through the existing
`runtime` seam, or rename the file to `*.integration.test.js`. Verifies
spec § Success Criterion 3 for all files outside parts 02's named pair.

Excludes the two files part 02 names by path
(`libraries/libprompt/test/loader.test.js`,
`libraries/libtemplate/test/loader.test.js`) and excludes any file
whose name already ends `.integration.test.js`. The audit list is
**regenerated at implementation time** against `origin/main` HEAD —
counts in this plan are reference snapshots from the planner's machine
and may drift before the part lands.

## Disposition rules

Every file in scope receives exactly one disposition:

| Disposition | Trigger | Action |
|---|---|---|
| **migrate** | Assertion inspects pure logic *and* the production code reads from a `runtime` field that can accept `createMockFs` / `createMockSubprocess`. | Inject the mock through the existing `runtime` parameter. Assertion text and `assert.*` call count are unchanged. |
| **rename** | The assertion observes a real collaborator's behaviour (binary exit code, real-filesystem semantics, real network/DB call) **or** the production code under test has no `runtime` seam to inject through. | `git mv` to `*.integration.test.js`. Content unchanged. Drop matching entries from `scripts/check-subprocess-in-tests.deny.json`. |
| **leave** | File is already `.integration.`, is explicitly allow-listed in `check-subprocess-in-tests.allow.json`, or is a guard-test itself (e.g. `tests/check-ambient-deps.test.js`, `tests/check-subprocess-in-tests.test.js` — these exercise the guard against a real fixture tree by design). | Record reason in the audit table; no file change. |

**No "no runtime seam" → leave.** The disposition rules above route
no-seam files to **rename**, not **leave**. This avoids the no-op risk
the planner flagged: if a file legitimately needs real I/O because its
production code is fs-or-subprocess-shaped (and never grew a `runtime`
parameter through 1370's source-side work), the spec's
"`*.integration.test.js` for legitimate real-I/O" rule covers it. The
audit row records "no `runtime` seam in src" as the rename reason.

## Step 1 — Audit table

Created: `specs/0640-refactor-test-suite/plan-a-03-audit.md` (a working
note that lands with the implementation PR for reviewer auditability).

Re-run the enumeration against `origin/main`:

```sh
find libraries products services tests -name "*.test.js" \
  -not -name "*.integration.test.js" -not -path "*/node_modules/*" \
  -exec grep -lE "mkdtempSync|mkdtemp\(" {} \;

find libraries products services tests -name "*.test.js" \
  -not -name "*.integration.test.js" -not -path "*/node_modules/*" \
  -exec grep -lE "execFileSync|spawnSync|execSync\(" {} \;
```

Exclude `libraries/libprompt/test/loader.test.js` and
`libraries/libtemplate/test/loader.test.js` (part 02 owns them). The
remaining union of the two lists is the audit set.

Audit-table shape — one row per file:

```
| file | disposition | reason | seam (if migrate) |
|---|---|---|---|
| libraries/libwiki/test/cli-refresh.test.js | rename | Exercises the `fit-wiki refresh` CLI via subprocess; the binary side has no in-process seam in src. | — |
| libraries/libterrain/test/pipeline.test.js | migrate | Pipeline class takes runtime; the mkdtempSync only sets fixture path. | runtime.fsSync |
| tests/check-subprocess-in-tests.test.js | leave | Guard-test exercises the script against a real fixture tree — listed reason: "guard test". | — |
```

A representative worked row per category lands in the audit file so
later rows compose against the example, not blank space. Initial
reference snapshot (counts may drift):

- mkdtemp candidates excluding part 02: **~44 files** spanning
  `libraries/libwiki` (largest cluster — 16 CLI/audit test files),
  `libraries/libeval` (11 files, mostly benchmark fixtures),
  `libraries/libconfig`, `libraries/libcoaligned`, `libraries/libterrain`,
  `libraries/libxmr`, `libraries/libsyntheticprose`,
  `products/landmark` (2), `products/map`, `products/outpost`, and
  `tests/` (2).
- Subprocess candidates: **5 files** in
  `libraries/libwiki`, `products/landmark` (2), `services/oauth`, plus
  2 guard-test files in `tests/` that are presumptively **leave**
  (`check-ambient-deps`, `check-subprocess-in-tests`); the audit
  confirms file-by-file. `scripts/check-subprocess-in-tests.mjs` scopes
  itself to `libraries`/`products`/`services` only, so the two `tests/`
  rows are not enforceable by that guard and only show up because the
  audit enumerates `tests/` too.

Verification: the audit file lists every file from the two
implementation-time `find` enumerations above (minus part 02's two)
with a disposition, a reason, and (for migrate rows) the `runtime`
field the production code reads from. Reviewers can compare the audit
list against the enumeration by re-running the two commands above.

## Step 2 — Apply migrations

Modified: each file marked **migrate** in Step 1's table. Also modified
where required: each migrating library's `package.json` to add
`@forwardimpact/libmock` to `devDependencies` (mirroring part 02 Step 1).

The migration shape mirrors part 02: replace `mkdtempSync` / subprocess
calls with `createMockFs` / `createMockSubprocess` injected through the
existing `runtime` parameter. No assertion text changes; no new test
cases. The implementer commits each library's migration as a separate
commit on the branch so per-library blast radius is reviewable.

A migration that would require changing the production constructor
signature is **out of scope**: revisit the audit row, mark **rename**,
and proceed.

Verification: `bun test <each touched library>` passes after each
commit; `bun run invariants:check-workspace-imports` exits zero;
post-PR `rg -l "mkdtempSync|mkdtemp\("` and `rg -l "execFileSync|
spawnSync|execSync\("` exclude every **migrate** row's file; assertion
text and `assert.*` call counts are unchanged.

## Step 3 — Apply renames

Renamed (via `git mv`): each file marked **rename** in Step 1's table;
new name ends `.integration.test.js`. Content unchanged.

Modified: `scripts/check-subprocess-in-tests.deny.json` — remove the
entries for `products/landmark/test/dispatcher.test.js` and
`products/landmark/test/lib/commands-verb.test.js` if those two are
renamed (the deny-list is monotone-shrinking per the script header).
If the audit marks either file **migrate** instead (the landmark CLI
took an injected runtime through 1370), the deny-list entry is
removed in Step 2's commit, not here.

Verification: every file marked **rename** in Step 1 ends
`.integration.test.js` on the branch; `bun run
invariants:check-subprocess-in-tests` exits zero; `bun test` reports
`0 fail`.

## Step 4 — Diff-shape gate on migrated files

For each **migrate** disposition, the PR diff must satisfy three
mechanical invariants the reviewer can check without running coverage
tools:

1. The migrated file's count of `assert.*` calls is unchanged between
   `origin/main` and the branch (`git diff --stat origin/main HEAD --
   <file>` shape plus `rg -c "\\bassert\\." <file>` on both sides).
2. No assertion's expected-value literal changes (the diff hunks
   touch fixture setup and imports, not the right-hand side of
   `assert.equal(...)` / `assert.deepEqual(...)`).
3. Pass count of `bun test <file>` is identical on `origin/main` and
   branch (the test count rows in `bun test`'s output match).

If a migration cannot meet all three — typically because the inlined
fixture pinned an opaque value (a tmpdir-shaped path string) that
appeared in an assertion — re-classify the file as **rename**. This is
mechanical, reproducible, and doesn't require coverage tooling.

`bun test --coverage` is **not** required for this gate. The intent of
the original "function coverage" formulation was to catch silent loss
of branch coverage; the three diff-shape invariants above are stronger
in practice because they catch every silent assertion change, not only
those that happen to drop a branch.

Verification: PR description includes, per migrated file, one row
showing `before assert: N | after assert: N | before tests: M | after
tests: M` and a one-line confirmation that "no expected-value
literals were changed by this PR". Reviewers can re-derive each number
from `git diff` and `bun test`.

## Step 5 — Audit file commits with the PR

The audit table from Step 1
(`specs/0640-refactor-test-suite/plan-a-03-audit.md`) commits alongside
the migrations / renames in the same PR. No script change is required —
the audit is the durable record of which files are **leave** and why,
and reviewers can compare its entries against a fresh `find` enumeration.

Verification: `git diff --name-only origin/main...HEAD` shows
`specs/0640-refactor-test-suite/plan-a-03-audit.md` among the changed
files.

## Verification — spec § Success Criteria covered

| # | Criterion | This part |
|---|---|---|
| 3 | Non-integration unit tests do no real I/O for pure-logic assertions; legitimate real-I/O files carry `.integration.test.js` | Steps 1–3 |
| 6 | Full suite green; coverage preserved on migrated source modules | Steps 2–4 |

— Staff Engineer 🛠️
