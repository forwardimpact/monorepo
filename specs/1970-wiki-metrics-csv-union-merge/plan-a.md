# Plan 1970 — Wiki metrics CSV appends survive concurrent sync-merges

Executes [design-a.md](./design-a.md) for [spec.md](./spec.md).

## Approach

Add a shared helper that owns the canonical `.gitattributes` declaration
(`metrics/**/*.csv merge=union`) and its present-and-correct check. Wire that
helper into the two provisioning owners — `runInitCommand` (fresh clones) and
`WikiSync.commitAndPush` (existing clones, ensure-before-gate, forcing
`.gitattributes` into the commit pathspec). Add a `metrics-csv` audit scope and
a `metrics-csv.duplicate-row` rule reporting exact-duplicate data rows. Tests
reproduce the incident (two clones, distinct appends, both survive) on both the
rebase and `merge -X ours` paths and guard the non-CSV boundary. The merge
itself is git's built-in `union` driver — no code chooses it, the attribute
does. Docs route to `technical-writer`.

Libraries used: libwiki (wiki-sync, audit/scopes, audit/rules, commands/init,
constants), libutil (GitClient.commitPaths/commitAll).

## Step 1: Declaration helper and constant

Single source for the attribute text and the ensure logic.

Files: create `libraries/libwiki/src/gitattributes.js`; modify
`libraries/libwiki/src/constants.js`.

- `constants.js`: add `export const METRICS_CSV_MERGE_ATTRIBUTE =
  "metrics/**/*.csv merge=union";` and `export const GITATTRIBUTES_FILE =
  ".gitattributes";` (Steps 2–3 and 6 use `GITATTRIBUTES_FILE` rather than the
  bare literal so the path has one home).
- `gitattributes.js`: export `ensureMetricsCsvMergeAttribute(wikiDir, fsSync)`
  returning `{ changed: boolean }`. Read `<wikiDir>/.gitattributes` if present;
  if the exact `METRICS_CSV_MERGE_ATTRIBUTE` line is already present, return
  `{ changed: false }` and write nothing. Otherwise append the line (preserving
  any existing lines and trailing newline discipline) or create the file with
  just that line, and return `{ changed: true }`.

Verification: unit test `gitattributes.test.js` — absent file → created + line
present + `changed:true`; present-and-correct → `changed:false` + bytes
unchanged; file with unrelated lines → line appended, unrelated lines intact.

## Step 2: Fresh-clone provisioning in init

Files: modify `libraries/libwiki/src/commands/init.js`.

After the existing `if (runtime.fsSync.existsSync(wikiDir))` block (where Active
Claims is scaffolded), call `ensureMetricsCsvMergeAttribute(wikiDir,
runtime.fsSync)`; when it returns `changed:true`, write a one-line stdout
notice (mirroring the existing `scaffolded` notice). The init command does not
commit — the file lands in the working tree and the next publish commits it,
consistent with init's current local-only behavior.

Verification: extend `cli-init.integration.test.js` — after init,
`<wikiDir>/.gitattributes` contains the line; a second init leaves it unchanged
(no duplicate line).

## Step 3: Existing-clone provisioning in commitAndPush

Wire the ensure before the clean/ahead gates and force `.gitattributes` into
the commit so it cannot be autostashed aside on the pathspec-scoped path or
skipped on a no-payload sync.

Files: modify `libraries/libwiki/src/wiki-sync.js`.

- Inject the ensure helper (import `ensureMetricsCsvMergeAttribute`; call it
  with `this.#runtime.fsSync` and `this.#wikiDir`).
- At the top of `commitAndPush`, before the `isClean` gate, call the ensure and
  capture `changed`.
- Commit logic becomes (the commit gate is `isClean`; the push gate is the
  independent `#hasCommitsAhead`):
  - If `changed`, the commit must include `GITATTRIBUTES_FILE`. When `paths` is
    supplied, commit `commitPaths(message, [...paths, GITATTRIBUTES_FILE], …)`;
    when no `paths`, the existing `commitAll` already sweeps it.
  - When `changed` is true but the tree is otherwise clean (no payload), the
    commit gate is taken against the effective pathspec `[GITATTRIBUTES_FILE]`,
    so the file is committed — producing the single provisioning commit the
    spec requires.
  - When `changed` is false, behavior is byte-identical to today: both gates
    short-circuit unchanged.

Concretely, replace the `isClean`/commit block so the effective commit pathspec
is `paths` plus `GITATTRIBUTES_FILE` iff `changed`, and the clean check is taken
against that effective pathspec. The push gate (`#hasCommitsAhead`) is left
untouched.

Verification: covered by Step 6 integration tests. Note for the implementer:
`#hasCommitsAhead` is independent of tree cleanliness, so the "second sync =
zero commits" assertion must be made from true steady state — the first sync's
push must have landed (origin/master == HEAD) before re-syncing, otherwise a
fire-and-forget push that did not land would leave a commit ahead and the second
sync would push it. Add two `wiki-sync.integration.test.js` cases: (a) a
no-payload sync on a clone lacking the attribute produces exactly one commit
touching only `.gitattributes` and a follow-up sync (after the first push lands)
produces zero commits; (b) a scoped-payload sync (`paths` supplied) on a clone
lacking the attribute commits **both** the payload and `.gitattributes` in one
commit — guarding against the file being autostashed aside on the
pathspec-scoped path.

## Step 4: Audit scope `metrics-csv`

Files: modify `libraries/libwiki/src/audit/scopes.js`.

- Add a `listCsvFiles(wikiRoot, fs)` recursive walk over
  `<wikiRoot>/metrics/`, collecting every `*.csv` (the real layout is
  `metrics/<skill>/<year>.csv` — two levels — so the walk must recurse, not
  assume one level). For each, load a subject `{ path, rows }` where `rows` is
  the array of line strings from `text.split("\n")` (so the rule indexes
  `rows[i]` as a string and `i + 1` is the line number).
- In `buildContext`, add `"metrics-csv": []` to the initial `subjects` object
  (alongside `summary`, `weekly-log-main`, `weekly-log-part`) and populate it
  from `listCsvFiles`, so `resolveScope("metrics-csv", …)` never returns
  `undefined` on a wiki with no CSVs. Add `SCOPE_RESOLVERS["metrics-csv"] =
  (ctx) => ctx.subjects["metrics-csv"]`.

Verification: covered by Step 5 rule tests (the rule only fires when the scope
yields the CSV subjects).

## Step 5: Audit rule `metrics-csv.duplicate-row`

Files: modify `libraries/libwiki/src/audit/rules.js`.

Add to `RULES`:

```js
{
  id: "metrics-csv.duplicate-row",
  scope: "metrics-csv",
  severity: "fail",
  check: (s) => {
    const seen = new Map(); // data line text -> first lineNo
    const findings = [];
    s.rows.forEach((text, i) => {
      const lineNo = i + 1;
      if (lineNo === 1 || text.trim() === "") return; // header is line 1; skip blanks
      if (seen.has(text)) findings.push({ lineNo });
      else seen.set(text, lineNo);
    });
    return findings.length === 0 ? null : findings;
  },
  message: (s, r) =>
    `Duplicate metrics row at line ${r.lineNo} (exact match of an earlier row)`,
  hint: "remove the surplus row, or differentiate a genuinely-distinct measurement by editing its run id or note so the rows are no longer identical",
}
```

Note for the implementer: two genuine same-day, same-value measurements written
with empty `run`/`note` columns are byte-identical and will fire this finding.
That is the spec's intended fail-visible behavior, not a bug — the exit path is
the owner differentiating the rows, not the rule being loosened. Do not add a
"genuine pair" exception.

Verification: `audit-rules.test.js` — a CSV subject with a repeated data line
yields one finding at the duplicate's line; differentiating one row (any column
edit) yields zero findings; the header row repeated as a true data duplicate is
out of test scope (header is line 1 only). Add a `metrics-csv` fixture under the
audit test's wiki root with an exact-duplicate row and assert the finding names
the file and line; edit the row and assert it clears.

## Step 6: Erasure-reproduction and boundary integration tests

Files: modify `libraries/libwiki/test/wiki-sync.integration.test.js`.

`seedBareRepo(bare)` seeds only a fixed README and takes no extra-file
argument, so per-test seeding (the `.gitattributes` line and a
`metrics/coach/2026.csv` header) is done by a local helper that clones the bare
repo, writes the desired files, and `git add`/`commit`/`push origin master` —
the same clone+commit+push shape `seedBareRepo` already uses internally. Then:

- **Concurrent distinct appends survive (rebase path).** Seed the bare wiki
  with the `.gitattributes` line and the CSV header. Two clones each append a
  distinct row to `metrics/coach/2026.csv` and publish via `commitAndPush`;
  clone B publishes second, forcing a rebase against A's tip. Assert the final
  bare tip's CSV contains both rows. (Fails against current `main` — union not
  declared.)
- **Merge-fallback path preserves appends.** Same seed. Each clone also makes a
  **conflicting** edit to the **same line** of a markdown file so the rebase
  genuinely fails (distinct lines would auto-merge and never reach the
  fallback) and `mergeOursStrategy` runs; assert both CSV rows are present at
  the tip. This is the spec's "concurrent non-CSV conflict" criterion.
- **Non-CSV boundary holds.** Same conflicting same-line markdown edit, with no
  CSV change; assert the fallback resolves the markdown to the local ("ours")
  side exactly as today.
- **Existing-clone idempotent provisioning.** Seed the bare wiki **without** the
  attribute. A clone's first `commitAndPush` (no payload) introduces it in
  exactly one commit touching only `.gitattributes` and pushes; after that push
  lands, a second `commitAndPush` produces zero commits. (Per Step 3, assert
  from pushed steady state.)
- **Fresh-clone protection from creation.** Seed a clone carrying the attribute
  as init would (or run init against the bare wiki), then run the two-clone
  append test with no further setup; both rows survive.

Verification: `bun test libraries/libwiki/` green; the survival assertions fail
on current `main`.

## Step 7: Documentation (route to technical-writer)

Files: modify
`websites/fit/docs/libraries/predictable-team/wiki-operations/index.md`.

State the metrics-CSV keep-both-sides merge behavior, the duplicate-visibility
trade (keep-both can leave an identical row twice; the audit surfaces it; the
owner removes or differentiates it), and the `metrics-csv.duplicate-row` audit
finding. Mind the page's instruction budget.

Verification: `bunx coaligned instructions` passes (within budget); page
renders.

## Risks

- **Union driver availability.** The built-in `union` driver requires no
  registration but is a git feature; the integration tests run real git and
  fail loudly if the host git lacks it (none in support range does).
- **`commitPaths` newline staging.** Appending `.gitattributes` to a CSV-scoped
  pathspec means the commit carries two unrelated paths; the spec accepts this
  (the provisioning commit and the metric write coincide on first rollout sync).
- **CSV walk vs. `.md`-only assumption.** `buildContext` currently loads only
  `.md`; the new CSV walk is additive and must not perturb existing scopes —
  tests assert existing audit findings are unchanged.

## Execution

Steps 1–6 are one cohesive code change for an engineering agent
(`staff-engineer`), executed in order (Step 3 depends on Step 1; Steps 4–5 are
independent of 1–3 but share the test run). Step 7 (docs) routes to
`technical-writer` and can run in parallel once Steps 4–5 fix the audit
finding's name and behavior.

— Staff Engineer 🛠️
