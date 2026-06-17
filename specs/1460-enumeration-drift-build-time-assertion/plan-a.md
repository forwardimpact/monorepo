# Plan 1460-a — Build-time enumeration-drift assertion

Spec: [`spec.md`](spec.md) · Design: [`design-a.md`](design-a.md).

## Approach

Ship one declarative rule module plus one adjacent registry data file
into the `.coaligned/invariants/` substrate, then add the consumer
fences in the same atomic diff, seeded from `--seed` output so the
gate is green on its own merge. The module follows the libcoaligned
host contract (`{ name, build, rules, seed }`); `build()` runs the
source probes and consumer parser and returns one subject per
assertion; `rules[]` emit findings the host's `writeFindings` prints
and converts to exit 1. No new build step, no new CI wiring — host
auto-discovery makes landing the `.rules.mjs` file the wiring.

Libraries used: libutil (`runRules` via host), libcoaligned (host
`bunx coaligned invariants`, `--seed`), yaml (root devDependency, for
registry parse). No new dependencies (Security C2).

## Affected paths

```
.coaligned/invariants/enumeration-drift.topics.yml      (new — registry)
.coaligned/invariants/enumeration-drift.rules.mjs        (new — rule module: build/seed/rules + re-exports)
.coaligned/invariants/lib/enum-drift.mjs                 (new — pure helpers: probes, parser, grammar, extracted from the module to stay under the per-file size/complexity ceilings)
libraries/libcoaligned/test/enumeration-drift.test.js    (new — unit tests, in the test-glob roots)
CONTRIBUTING.md                                          (fences: products-tree)
CLAUDE.md                                                (fences: sibling-composite-actions)
KATA.md                                                  (fences + kata-interview reword)
.github/CLAUDE.md                                        (fence: sibling-composite-actions count)
websites/fit/gear/index.md                               (fences: services count, libraries count)
websites/fit/docs/getting-started/contributors/index.md (fences: services list, products both)
websites/fit/docs/internals/kata/index.md               (fences + front-matter reword)
websites/fit/docs/products/index.md                      (no enumeration at HEAD — not touched)
websites/kata/index.md                                   (fences: two published-skills counts)
websites/kata/llms.txt                                   (fences: two published-skills counts)
.claude/skills/kata-documentation/references/metrics.md  (metric-writeback tagging convention)
```

The implementation PR description quotes this list verbatim; the
verifier confirms `git diff --name-only main HEAD` equals the union of
this list and `specs/1460-*/*`.

## Registry schema (resolves the #1524 plan-phase carry)

Shape: a **typed selector**, narrowed to the two kinds the six topics
need today, with the `type` discriminator present so a future
non-glob kind (the #1524 `cli-help` class) is a one-row + one-probe
edit, **not** a spec round-trip. This is design-b-of-the-thread "Shape
B, minimal": typed dispatch from day one, only `fs-glob` and
`md-table` implemented.

```yaml
# .coaligned/invariants/enumeration-drift.topics.yml
topics:
  - id: services-tree
    source: { type: fs-glob, pattern: "services/*/package.json", id: dirname }
    consumers:
      - { path: "websites/fit/docs/getting-started/contributors/index.md", property: list }
      - { path: "websites/fit/gear/index.md", property: count }
  - id: libraries-list
    source: { type: fs-glob, pattern: "libraries/lib*/package.json", id: dirname }
    consumers:
      - { path: "websites/fit/gear/index.md", property: count }
  - id: sibling-composite-actions
    source: { type: md-table, file: ".github/CLAUDE.md", section: "Third-party actions", column: "Action", filter: "^forwardimpact/" }
    consumers:
      - { path: "CLAUDE.md", property: list }
      - { path: "KATA.md", property: both }
      - { path: ".github/CLAUDE.md", property: count }
  - id: published-skills
    source: { type: fs-glob, pattern: ".claude/skills/kata-*/SKILL.md", id: dirname }
    consumers:
      - { path: "KATA.md", property: list }
      - { path: "websites/kata/index.md", property: count }
      - { path: "websites/kata/llms.txt", property: count }
      - { path: "websites/fit/docs/internals/kata/index.md", property: count }
  - id: products-tree
    source: { type: fs-glob, pattern: "products/*", id: basename, exclude: ["README.md", "CLAUDE.md"] }
    consumers:
      - { path: "CONTRIBUTING.md", property: list }
      - { path: "websites/fit/docs/getting-started/contributors/index.md", property: both }
  - id: kata-workflows
    source: { type: fs-glob, pattern: ".github/workflows/kata-*.yml", id: basename-noext, exclude: ["kata-interview.yml"] }
    consumers:
      - { path: "websites/fit/docs/internals/kata/index.md", property: both }
      - { path: "KATA.md", property: list }
```

`id` ∈ {`dirname`, `basename`, `basename-noext`} selects identifier
derivation from a matched path. `exclude` is exact-basename match.
This is the single registry file the spec's single-source criterion
checks; a 7th topic of an existing kind edits only this file.

Deliberate asymmetry — do not "fix" it: `published-skills` has **no**
`exclude` (the whole `kata-*` SKILL pack is the catalog, per spec
Topic 4), so `kata-interview` is included there; `kata-workflows`
**does** exclude `kata-interview.yml` (spec Topic 6, PDSA-only). Two
different sources, two different intents.

## Steps

### Step 1 — Registry data file

Intent: declare all six topics in one data file.
Files: create `.coaligned/invariants/enumeration-drift.topics.yml`.
Change: the YAML above, verbatim.
Verify: the Step 2 module loader parses it (`yaml` package, the root
devDependency — no new dep, Security C2) without a `registry-invalid`
finding; until the module exists, `node -e "require('yaml')"` round-trips the file.

### Step 2 — Rule module: loader, probes, parser, subjects, rules, seed

Intent: the whole gate in one auto-discovered module.
Files: create `.coaligned/invariants/enumeration-drift.rules.mjs`.
Change — default export `{ name: "enumeration-drift", build, rules, seed }`,
plus **named exports** for the pure helpers (`loadRegistry`,
`probeFsGlob`, `probeMdTable`, `parseConsumer`, and the grammar
extractors) so Step 5's relocated test imports and exercises them
directly:

- `loadRegistry(root)`: read the YAML beside the module via
  `import.meta.dirname`; `parse` with `yaml`. On parse/IO error,
  return `{ error }` rather than throw.
- **Glob containment (Security C1):** before any walk, reject a
  `pattern`/`file` that is absolute or contains a `..` segment when
  resolved against `root`; surface as a `registry-invalid` subject.
- `probeFsGlob({ pattern, id, exclude }, root)`: the lib
  `collectFiles(dir, {skip, match})` helper walks a single root dir
  with a **basename** predicate — it does not interpret multi-segment
  globs, and `ambient-deps`'s `globToRegExp` is a private local, not
  exported. So this probe hand-rolls the translation: split `pattern`
  into a fixed root prefix (the leading non-glob segments, e.g.
  `services`, `.claude/skills`) and a tail matcher (compile the
  `*`/`kata-*` segments to a line-anchored, backtracking-safe regex —
  no nested quantifiers, Security C3), pass that matcher as
  `collectFiles`'s `match` (or walk via `node:fs` directly — the
  module lives in `.coaligned/invariants/`, outside the `ambient-deps`
  scope `["libraries","products","services"]`, so it is exempt). Drop
  `exclude` basenames, derive identifiers per `id`, return a sorted
  `Set<string>`.
- `probeMdTable({ file, section, column, filter }, root)`: read the
  file, locate the `## <section>` heading, parse the GFM table under
  it, take the `column` cell of each row, strip backticks/`@version`,
  keep rows matching the `filter` regex, return a sorted `Set<string>`.
- `parseConsumer(path, root)`: read the file; scan **line-anchored**
  for `<!-- enum:... -->` open / `<!-- /enum -->` close pairs
  **outside** fenced-code regions (track ```/~~~ fence state); a span
  may enclose a fenced-code block. For each open fence, split the
  space-separated `enum:TOPIC:PROPERTY` claims; return `{ topic,
  property, observed, lineNo }` per claim. `observed` for `count` =
  the first integer or word-number ("Sixteen") in the span; for
  `list` = the sorted set of identifiers extracted from the span's
  bullets/tree/brace-list (grammar in Step 3). Backtracking-safe
  regexes only (Security C3): line-anchored, no nested quantifiers.
- `build({ root, runtime })`: load registry → if error, return one
  `registry` subject carrying the error. Else run each probe once
  (memoize per source), parse each registered consumer, and return:
  - `subjects.assertion[]` — one per (consumer, declared property):
    `{ path, topic, property, expected, observed|fenceAbsent, lineNo }`.
    Subjects carry `path` and `lineNo` so the engine populates the
    finding's `path`/`lineNo` (it reads `item.lineNo ?? subject.lineNo`).
  - `subjects.fence[]` — one per discovered fence in a registered
    consumer: `{ path, topic, property, lineNo, known }` for
    unknown-topic / malformed detection.
  - `subjects.registry[]` — `[]` on success, one error subject otherwise.
- `rules[]` — the seven rules below, scoped to those subject lists.
- `seed({ root })`: **returns** a single string (the host does
  `stdout.write(await mod.seed(...))`, as `ambient-deps.seed` returns
  its YAML — returning nothing would emit an empty seed). The string
  is the canonical fence body per topic (`enum:` open + probe output
  rendered in the property's shape + `/enum` close), grouped by
  consumer.

Verify: `node .coaligned/invariants/enumeration-drift.rules.mjs` imports clean; `bunx coaligned invariants` discovers it (appears in run output).

### Step 3 — Fence-body grammar and rules

Intent: pin the observed-value extraction and the finding shapes.
Files: same module (`enumeration-drift.rules.mjs`).
Change — extraction grammar:

- `list` blocks: identifiers are the leaf tokens of (a) Markdown
  bullets, (b) ASCII-tree leaf names, (c) brace-expansion list
  `forwardimpact/{a,b,c}`, or (d) a comma list inside "(a, b, c)".
  Strip trailing `/`, backticks, links; lowercase-compare. Sorted set.
- **Identifier normalization — the canonical form both sides reduce
  to.** For `sibling-composite-actions`, the source `md-table` cells
  are `` `forwardimpact/fit-bootstrap@v1` `` while consumers spell the
  same entry three ways: `CLAUDE.md` brace-list
  `forwardimpact/{fit-benchmark,…}`, `KATA.md` prose
  `forwardimpact/kata-agent`, `.github/CLAUDE.md` (count only). Both
  the probe and the parser reduce every token to the **bare slug**:
  drop a leading `forwardimpact/` and any trailing `@version`. So the
  source set and every consumer's expanded set are
  `{fit-benchmark, fit-bootstrap, fit-eval, fit-wiki, kata-agent}`,
  and the two list-shaped consumers both equal the one source set
  (closes the only landing `list-drift` risk for this topic). The
  brace-expander emits bare slugs (strips the shared `forwardimpact/`
  prefix); a fully-prefixed prose token strips it too.
- `count` blocks: the first integer **or** English word-number
  (one…twenty, then tens) in the span; a small word→int table covers
  the registry's range. A span with neither is a `malformed-fence`.

Rules (`{ id, scope, severity:"fail", when?, check, message, hint }`):

| id | scope | fires when |
|---|---|---|
| `enum.registry-invalid` | registry | registry subject carries an error (parse, IO, glob-escape) |
| `enum.fence-missing` | assertion | `fenceAbsent` — declared property has no fence on the path |
| `enum.unknown-topic` | fence | `!known` — fence TOPIC not in registry |
| `enum.malformed-fence` | fence | bad PROPERTY token, unclosed span, or count span with no number |
| `enum.list-drift` | assertion | property `list` and `observed !== expected` set |
| `enum.count-drift` | assertion | property `count` and `observed !== expected.size` |

A `both` consumer is decomposed in `build()` into two assertion
subjects — one `list`, one `count` — so the two drift rules above
cover it without a third rule.

Messages match design § Failure modes (e.g. `list-drift`:
`<topic>:list :: missing=[…] extra=[…]`; `count-drift`:
`<topic>:count :: actual=<n> expected=<m>`); `path` is the consumer
path (from `subject.path`), so the host renders `<path> :: <message>`.

Verify: unit tests in Step 5 assert each rule fires on a crafted subject and stays silent on a clean one.

### Step 4 — Consumer fences (seeded, atomic)

Intent: every registered consumer carries its required fence(s),
bodies seeded from HEAD so the gate is green at landing.
Files (modify): `CONTRIBUTING.md`, `CLAUDE.md`, `KATA.md`,
`.github/CLAUDE.md`, `websites/fit/gear/index.md`,
`websites/fit/docs/getting-started/contributors/index.md`,
`websites/fit/docs/internals/kata/index.md`, `websites/kata/index.md`,
`websites/kata/llms.txt`.
Change:

- Run `bunx coaligned invariants --seed enumeration-drift` (after
  Steps 1–3) to get machine-accurate bodies; wrap each consumer's
  existing enumeration in `<!-- enum:TOPIC:PROPERTY -->` … `<!-- /enum -->`,
  placing the seed value as the body. Multi-claim fence on
  `gear/index.md`'s "39 libraries and 15 services" sentence
  (`enum:libraries-list:count enum:services-tree:count`) and on the
  contributors-page structure tree (services list + products line).
- **kata-interview reconciliation:** in `KATA.md` § Workflows and
  `websites/fit/docs/internals/kata/index.md` § The Workflows, move
  the `kata-interview` row **out** of the fenced table into adjacent
  prose so the fenced set is the PDSA-four; the workflow content
  survives, only the fence excludes it.
- **Unfenceable counts reworded:** drop the numerals from the
  internals-page YAML front-matter `description` (line 3, "five
  workflows, sixteen skills" — front matter can't carry an HTML
  comment) and from `KATA.md`'s "15 curated skills (excluding the
  setup utility)" derived count; the fenced body count carries the
  asserted claim instead.
- **Internals body counts fenced to the source values:** the body
  sentence (line 19, "five workflows, sixteen skills") is the
  internals page's `kata-workflows:both` consumer and also restates a
  skills count. The kata-workflows source is the PDSA-four, so the
  workflow count is reworded to four and fenced `enum:kata-workflows:count`
  (the § The Workflows table is the matching `list` fence); the
  skills numeral is fenced `enum:published-skills:count` at its
  seeded value. Leaving the body "five" unchanged would `count-drift`
  at landing against "Existing consumers pass at landing".
- **llms.txt placement (PM note):** the two `published-skills:count`
  fences in `websites/kata/llms.txt` go on their own lines bracketing
  the count sentence; HTML comments are inert in the raw text agents
  fetch, but keep them off the same line as prose so the rendered
  count reads cleanly.

Verify: `bun run invariants` exits 0 on the branch against `main` HEAD (spec "Existing consumers pass at landing").

### Step 5 — Unit tests

Intent: each rule and probe is covered without relying on live repo state.
Files: create `libraries/libcoaligned/test/enumeration-drift.test.js`.
Placement: the root `test` script globs `*.test.js` under
`tests/ libraries/ products/ services/` (and two `.github`/`.claude`
roots) — a `.test.mjs` under `.coaligned/invariants/test/` is matched
by **neither** root nor extension and would silently skip. Co-locate
with the host's own `libraries/libcoaligned/test/invariants.test.js`,
which is how rule modules are exercised today: import the module from
`../../../.coaligned/invariants/enumeration-drift.rules.mjs` (and its
exported pure helpers — Step 2 names probes/parser/grammar as named
exports so they are unit-testable) and assert on `build`/`rules`
output, mirroring that file's `runRuleModules` pattern.
Change: table-driven tests over synthetic fixtures — each probe
(fs-glob id-derivation + exclude, md-table filter + identifier
normalization), the consumer parser (fenced-code-skip, multi-claim,
word-number, tree leaves, brace-list, unclosed→malformed), and each
rule (drift / missing / unknown / malformed / registry-invalid /
glob-escape). Assert clean inputs produce zero findings.
Verify: `bun run test` discovers and passes the new file.

### Step 6 — Metric-writeback tagging convention

Intent: let the post-landing outcome series populate.
Files (modify): `.claude/skills/kata-documentation/references/metrics.md`.
Change: document that enumeration-class findings tag the metrics-row
`note` `enumeration-drift:<topic-id>:`. Keep it **placeholder-shaped**
(`<topic-id>`, no monorepo topic ids) per the skill-genericity
invariant — the skill is published and synced into other repos.
Mechanic: this file is under `.claude/`, where direct Edit/Write are
denied (CONTRIBUTING § `.claude/`); apply it via
`echo … | bunx fit-selfedit .claude/skills/kata-documentation/references/metrics.md`
on this non-`main` branch, per self-improvement.md.
Verify: `bunx coaligned invariants` (the `skill-genericity` rule)
stays green on the edited skill file.

## Risks

- **Word-number coverage.** Consumer counts are spelled ("Sixteen")
  in some places, digits in others. The word→int table must cover the
  full live range or a clean consumer reads as `malformed-fence`;
  Step 3 fixes the range and Step 5 tests both forms.
- **md-table section drift.** `probeMdTable` locates the section by
  heading text; if `.github/CLAUDE.md`'s heading is reworded the probe
  returns empty and every sibling-composite consumer flags. Mitigation:
  the registry names the section string in one place; a heading change
  is itself a registered-consumer edit caught by the same gate.
- **Atomic-landing seed staleness.** If `main` moves between seeding
  and merge (a service/library/skill lands), the seeded bodies go
  stale and the gate flags on the implementation PR. Re-seed and
  re-commit before merge — this is the gate working, not a defect.

## Execution recommendation

Single engineering agent, sequential. Steps 1→3 build the gate;
Step 4 depends on a working `--seed` (Steps 1–3); Step 5 can be
written alongside Steps 2–3; Step 6 is independent and may land last.
No parallelism benefit — one module, one diff, one atomic landing.

— Staff Engineer 🛠️
