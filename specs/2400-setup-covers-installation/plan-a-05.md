# Plan 2400-a Part 05: The genericity sweep

The guaranteed-surface list shrinks to five names, the invariant enforces it,
every `KATA.md` sentence in the packs goes, and the documentation skill draws
its pool from the surfaces a repository has. Branch `feat/2400-genericity`.
Route: `staff-engineer`, because the sweep carries an invariant edit and a new
invariant test; `.claude/` writes go through `gemba-selfedit`. Depends on part
03 and on spec 2390's second merge, which folds two sections of the skills
CLAUDE.md.

## Step 1: The contract names five surfaces

Modified: `.claude/skills/CLAUDE.md`,
`.jidoka/invariants/skill-genericity.rules.mjs`

| File                              | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` § No monorepo leakage | The surfaces sentence reads `Name the surfaces every installation carries: CLAUDE.md, CONTRIBUTING.md, JTBD.md, specs/, wiki/.` The placeholder list drops `websites/<site>`. The links bullet keeps `and the guaranteed surfaces above`, which now names five.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `skill-genericity.rules.mjs`      | Group 2 gains `{ pattern: "\\bKATA\\.md\\b", reason: "not a guaranteed surface — the metrics rule lives with gemba-xmr record" }`. The site pattern becomes `{ pattern: "websites/", reason: "no site surface — name a docs directory or a kind of source" }`. The header comment's group 2 paragraph drops `internal site names under websites/` and the `websites/<site>` placeholder, the paragraph that begins `This rule deliberately does NOT scan the six agent profiles` becomes one line (the globs leave the profiles to the `agent-naming` guard, because profiles carry contributor tooling), and group 3's comment reads `Guaranteed surfaces (CLAUDE.md, CONTRIBUTING.md, JTBD.md, specs/, wiki/) stay relative.` |

Created: `tests/skill-genericity-invariant.test.js`, on the harness of
`tests/kata-settings-invariant.test.js` (`runRuleModules` against a `withRepo`
scratch root), with two differences the module forces: the runtime takes
`createDefaultSubprocess()` from libutil, because the kit's `grep` shells out to
`rg` and the mock subprocess returns nothing, and every scratch root holds both
`.claude/skills/` and `.claude/agents/`, because `rg` exits 2 on an absent path.
Four cases: a `KATA.md` citation in a `kata-*` skill, one in an `x-*.md`
reference, a `websites/docs` path in each, every plant with distinct text
because the grep dedupes identical lines, each yielding one
`skills.monorepo-specific` finding; and one clean case with the five surfaces
linked relatively.

Verify: `bun test tests/skill-genericity-invariant.test.js` passes, and
`bunx jidoka invariants` passes on the branch (S3).

## Step 2: Every metrics reference records with the command

Modified: the 14 `.claude/skills/kata-*/references/metrics.md` files (`archive`,
`design`, `devex-audit`, `documentation`, `implement`, `interview`, `plan`,
`product-issue`, `release-cut`, `release-merge`, `security-audit`,
`security-update`, `spec`, `wiki-curate`)

The header sentence `Record per KATA.md § Metrics. Append one row per run.`
becomes `Record with gemba-xmr record, one row per run.` A reference whose
header already states a cadence keeps it in place of `one row per run`.

Verify: `rg -l 'KATA\.md' .claude/skills/kata-*/references/metrics.md` prints
nothing.

## Step 3: Every `## Memory` section drops the citation

Modified: the 14 `.claude/skills/kata-*/SKILL.md` files of step 2, and
`.claude/skills/kata-session/references/team-storyboard.md`

In each `## Memory` section the sentence that begins `See KATA.md § Metrics`
goes, in each of its wordings (`for the recording-eligibility rule`,
`for eligibility`, `for the eligibility rule`, `for recording eligibility`, and
the parenthetical form in `kata-implement`). The clause before it stays, such as
`kata-release-merge`'s `which includes the collection recipe`. In
`team-storyboard.md` § Metrics the sentence
`KATA.md § Metrics has the recording-eligibility rule.` goes and nothing
replaces it. Part 06 owns every other line of that file.

Verify:
`rg -l 'KATA\.md' .claude/skills/kata-* .claude/skills/gemba* .claude/skills/jidoka-* .claude/agents`
prints nothing (S1).

## Step 4: The documentation skill follows the repository

Modified: `.claude/skills/kata-documentation/SKILL.md`

| Section                | Change                                                                                                                                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontmatter            | `Write and review documentation in the websites/ folder.` becomes `Write and review the repository's documentation.`                                                                                                                                                       |
| When to Use            | `New or updated pages in websites/` becomes `New or updated documentation pages`.                                                                                                                                                                                          |
| DO-CONFIRM             | The `fit-doc build` item becomes `The repository's check command passes.`                                                                                                                                                                                                  |
| Topic areas            | The table below replaces the current one. A paragraph above it defines `<docs>`: a directory named `docs` at the repository root or up to two levels below it; each match is one site.                                                                                     |
| Review process         | Step 8 reads `Run the repository's check command.` Step 6 reads `Check configuration examples against the schema the repository publishes, when it publishes one.`                                                                                                         |
| Cross-page-consistency | `re-run each <sh prompt> block against starter data or the local CLI. Diff its output against the adjacent <text> block.` becomes `re-run each shell example block the pages carry. Diff its output against the output block beside it.` The tag stays.                    |
| Interactive Writing    | Step 2 names page kinds by audience: `New to the product → onboarding page. A job to finish → task guide. Looking something up → reference. Understanding the code → internals.` Step 7 and the update list's `Build and check` read `Run the repository's check command.` |
| Output                 | `Commit format: docs: {verb} {topic} documentation`. The Coordination Channels bullet reads `documented in the pool`.                                                                                                                                                      |

| Topic                    | Surface                                                     | In the pool when                 |
| ------------------------ | ----------------------------------------------------------- | -------------------------------- |
| `root-layers`            | `CLAUDE.md`, `CONTRIBUTING.md`, `JTBD.md`                   | always                           |
| `readmes`                | every `README.md` below the root                            | one exists                       |
| `root-docs`              | other root markdown, such as `SECURITY.md` and standards    | one exists                       |
| `getting-started`        | `<docs>/getting-started/`                                   | the directory exists             |
| `guides`                 | the task guides under `<docs>/`                             | `<docs>` exists                  |
| `reference`              | `<docs>/reference/`                                         | the directory exists             |
| `internals`              | `<docs>/internals/`                                         | the directory exists             |
| `overview-pages`         | the pages beside `<docs>`, with `llms.txt` and `robots.txt` | `<docs>` exists                  |
| `cross-page-consistency` | every page in the pool                                      | the pool holds two or more pages |

The body sits at 185 of 192 lines. The `<docs>` paragraph takes two lines and a
blank, the table drops one row, and the rewritten steps keep their line counts,
so the body lands at 187.

Verify: the S2 `rg` lines print nothing for `SKILL.md`, and
`bunx jidoka instructions` passes.

## Step 5: The three references name kinds, not this repository

Modified: `.claude/skills/kata-documentation/references/standards.md`,
`.claude/skills/kata-documentation/references/source-of-truth.md`,
`.claude/skills/kata-documentation/references/metrics.md`

`standards.md` keeps § Audience Rules, § Writing Principles, § Formatting
Consistency, § Repository Documentation, and § Content Framing. It drops §
Information Architecture, § Layouts, the field-names table, the `libdoc`
sentence, the schema-directory sentence's product paths, the
`getting-started/contributors/` and `internals/operations/` sentence, and the
two product examples in § Content Framing, which become
`"The tool generates coverage reports"` → `"See which areas the team covers"`
and `"The assistant answers questions"` →
`"Get specifics when a review ends with 'not yet'"`. The audience table's rows
name kinds of page: onboarding and task guides for users, reference for
everyone, internals for contributors.

`source-of-truth.md` names kinds of source:

| Documentation topic | Verify against                                        |
| ------------------- | ----------------------------------------------------- |
| Entity definitions  | the data directory the product reads                  |
| Library behaviour   | the library's source                                  |
| CLI synopsis        | the CLI's own `--help`                                |
| Templates           | the product's template directory                      |
| Schema              | the schema files the product publishes                |
| LLM and SEO outputs | `llms.txt` and `robots.txt` beside the docs directory |
| The agent team      | the installed agent profiles and skills               |

`metrics.md`: step 2 rewrote its header. Here every `wiki/technical-writer.md`
becomes `the running agent's summary`.

Verify: the S2 `rg` line over `.claude/skills/kata-documentation` prints
nothing, and `bunx jidoka instructions` passes (S12, S15).

— Staff Engineer 🛠️
