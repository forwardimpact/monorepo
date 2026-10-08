# Plan 2400-a Part 02: Scaffold, `init`, admitted names, and the bootstrap guard

The library gains a `scaffold` command that creates every absent ledger and
summary, `init` shrinks to the clone, one constant set names the root files the
library writes, and the `gemba-bootstrap` action guards on the bootstrap script.
Branch `feat/2400-scaffold`. Route: `staff-engineer`. Depends on part 01 merged
and on spec 2390's first merge, which lands the approval ledger's name constant
(`STATUS_FILE` below names whatever the merged `constants.js` exports).

## Step 1: One constant set for the root files

The grammar and the scopes module read one set.

Modified:

- `libraries/libwiki/src/constants.js`
- `libraries/libwiki/src/audit/grammar.js`
- `libraries/libwiki/src/audit/scopes.js`
- `libraries/libwiki/src/audit/rule-builders.js`
- `libraries/libwiki/src/audit/rules.js`
- `libraries/libwiki/src/secret-gate.js`
- `libraries/libwiki/test/audit-grammar.test.js`
- `libraries/libwiki/test/audit-engine-admission.test.js`

```js
// constants.js
export const HOME_FILE = "Home.md";
export const SECRET_OVERRIDES_FILE = "secret-overrides.log";
// Root names the library writes outside the summary class. The admission
// grammar admits them, and the scopes module excludes the markdown members
// from summary classification.
export const WIKI_ROOT_FILES = new Set([
  HOME_FILE,
  MEMORY_FILE,
  STATUS_FILE,
  GITATTRIBUTES_FILE,
  SECRET_OVERRIDES_FILE,
]);
export const PRIORITY_INDEX_TABLE_SEPARATOR = "| --- | --- | --- | --- | --- |";
export const PRIORITY_HEADER_RE = pipeRowRe(PRIORITY_INDEX_TABLE_HEADER, "m");
export const PRIORITY_SEPARATOR_RE = pipeRowRe(
  PRIORITY_INDEX_TABLE_SEPARATOR,
  "m",
);
```

| File               | Change                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `grammar.js`       | `NAMED_LEDGERS` becomes `WIKI_ROOT_FILES`. `rootSummaryStem` and `classifyRootFile` read it. The comment names the set.                          |
| `scopes.js`        | `EXCLUDED_BASES` becomes `new Set([...WIKI_ROOT_FILES].filter((n) => n.endsWith(".md")))`.                                                       |
| `secret-gate.js`   | `export const OVERRIDE_LOG = SECRET_OVERRIDES_FILE;` imports the constant.                                                                       |
| `rule-builders.js` | The hand-written `PRIORITY_SEPARATOR_RE` becomes a re-export of the constant, so the scaffold and the audit share one literal.                   |
| `scopes.js`        | The hand-written `PRIORITY_HEADER_RE` becomes a re-export of the constant.                                                                       |
| `rules.js`         | The two priority hints render `PRIORITY_INDEX_TABLE_HEADER` and `PRIORITY_INDEX_TABLE_SEPARATOR`, as the claims hints render theirs.             |
| Tests              | The named-ledgers case lists the five names, asserts `.gitattributes` and `secret-overrides.log` admitted at the root, and `notes.txt` rejected. |

Verify:
`rg -n -e '"secret-overrides\.log"' -e '"Home\.md"' -e '\| --- \| --- \| --- \| --- \| --- \|' -e 'Item\\s\*\\\|' libraries/libwiki/src`
prints `constants.js` lines only, and
`bun test libraries/libwiki/test/audit-grammar.test.js` passes.

## Step 2: The scaffold module

Pure functions decide each write. The command applies them and reports.

Created: `libraries/libwiki/src/scaffold.js`,
`libraries/libwiki/src/commands/scaffold.js`,
`libraries/libwiki/test/scaffold.test.js`,
`libraries/libwiki/test/cli-scaffold.integration.test.js`

`scaffold.js` exports `planScaffold({ wikiRoot, roster }, fs)` → `writes[]` and
`applyScaffold(writes, fs)`. Each write is
`{ path, kind: "create" | "append", text }`. The rules:

| Target                  | Absent file                                                                                                              | Present file                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Home.md`               | Create `# Wiki`, one sentence (`Persistent memory for the agent team, managed by gemba-wiki.`), then the surfaces block. | Append the surfaces block when no line equals `## Surfaces`.                                                                                                                                        |
| `MEMORY.md`             | Create the priorities block, then the Active Claims block.                                                               | Append the priorities block when `PRIORITY_INDEX_HEADING` is absent. Insert the Active Claims block as `init` did (before `## Storyboard`, else at the end) when `ACTIVE_CLAIMS_HEADING` is absent. |
| `STATUS_FILE`           | Create it empty.                                                                                                         | Nothing.                                                                                                                                                                                            |
| `<agent>.md` per roster | Create the summary template.                                                                                             | Nothing.                                                                                                                                                                                            |

The surfaces block:

```markdown
## Surfaces

- **MEMORY.md** — cross-cutting priorities and active claims
- [STATUS.tsv](STATUS.tsv) — the approval ledger, one row per spec
- `<agent>.md` — one summary and message inbox per agent profile
- `storyboard-<YYYY>-M<NN>.md` — the monthly storyboard
- `metrics/<skill>/<YYYY>.csv` — per-skill run metrics
```

The ledger link text and target come from `STATUS_FILE`. The priorities block is
`PRIORITY_INDEX_HEADING`, a blank line, `PRIORITY_INDEX_TABLE_HEADER`,
`PRIORITY_INDEX_TABLE_SEPARATOR`, and `| *None* | — | — | — | — |`. The Active
Claims block is the one `init.js` builds today, moved here verbatim. The summary
template, with the key `staff-engineer` as the example:

```markdown
# Staff Engineer — Summary

**Last run**: none yet

## Message Inbox

<!-- memo:inbox -->

## Open Blockers

None.
```

The title is the key split on `-`, each word capitalized. An append never
changes a present line: it adds a newline when the file does not end in one,
then the block, which opens with an empty line as the claims block does.
`commands/scaffold.js` resolves the roster with part 01's `listProjectAgents`,
applies the plan, prints `scaffold: created <path>` or
`scaffold: appended <heading> to <path>` per write, or
`scaffold: nothing to write`, and returns `{ ok: true }`.

Tests. Unit: each row of the table, the append on a file without a final
newline, an unchanged present line, and the init warning: a clone that fails
prints `could not clone wiki from <url>:` and exits 0. Integration, with the
real-git helpers: a clone that holds only `Home.md` with operator text, two
profiles under `.claude/agents/`, then `scaffold`, `refresh`, `push`, then
`auditWiki` yields no `fail` finding and the tree holds the three ledgers, the
month's board, and two summaries (S4); a second `scaffold` prints
`scaffold: nothing to write` and `git -C wiki status --porcelain` is
byte-identical before and after (S5); `test ! -e wiki/metrics` (S6);
`memo --from a --to all` writes to every summary but the sender's (S8).

Verify:
`bun test libraries/libwiki/test/scaffold.test.js libraries/libwiki/test/cli-scaffold.integration.test.js`
passes.

## Step 3: `init` clones and nothing else

Modified:

- `libraries/libwiki/src/commands/init.js`
- `libraries/libwiki/src/cli-definition.js`
- `libraries/libwiki/src/index.js`
- `libraries/libwiki/test/cli-init.integration.test.js`
- `libraries/libwiki/test/cli-init.test.js`
- `libraries/libwiki/test/wiki-sync.integration.test.js`

Deleted:

- `libraries/libwiki/src/skill-roster.js`
- `libraries/libwiki/test/skill-roster.test.js`

The changes:

- `runInitCommand` keeps `maybeCloneWiki` and the final `init: wiki ready at`
  line. The metrics loop, `scaffoldActiveClaims`, the
  `ensureMetricsCsvMergeAttribute` call, and the `skills-dir` option go. A
  failed clone exits 0 with a warning that names the cause:
  `could not clone wiki from <url>: <git's message>`; an absent origin warns
  `could not determine wiki URL from origin remote` as today.
- `cli-definition.js`: the `init` description reads
  `Clone the wiki working tree when it is absent`; the `skills-dir` option goes;
  a `scaffold` command joins after `init` with the description
  `Create each absent ledger and one summary per agent profile; write nothing that exists`
  and `wikiRootOpt`; the examples list gains `gemba-wiki scaffold`.
- `index.js` drops the `listSkills` export.
- Tests: the metrics-directory, Active Claims, and `.gitattributes` cases go
  from the init tests. `wiki-sync.integration.test.js` gains one case: `push` on
  a fresh clone without `.gitattributes` writes the union-merge line, which
  `wiki-sync.js` does on every publish.

Verify:
`rg -n 'skills-dir' libraries/libwiki/src libraries/libwiki/README.md .claude/skills/gemba-wiki products/gemba/test/golden`
prints nothing (S6), and
`bun test libraries/libwiki/test/cli-init.integration.test.js` passes.

## Step 4: The goldens

Modified:

- `products/gemba/test/golden/gemba-wiki/cases.json`
- `products/gemba/test/golden/gemba-wiki/help.stdout.txt`
- `products/gemba/test/golden/gemba-wiki/help-flag.stdout.txt`
- `products/gemba/test/golden/gemba-wiki/init-help.stdout.txt`

Created:

- `products/gemba/test/golden/gemba-wiki/scaffold-help.stdout.txt`
- `products/gemba/test/golden/gemba-wiki/scaffold-help.stderr.txt`

The changes:

- `products/gemba/bin/gemba-wiki.js` is unchanged: `scaffold` runs on the local
  tree behind the existing absent-wiki guard and needs no `WikiSync`.
- `cases.json` gains a `scaffold help` case. Regenerate the goldens with the
  repository's golden-capture test in update mode.

Verify: `bun run test` passes and the `help.stdout.txt` command list carries
`scaffold`.

## Step 5: The action guards on the script

Modified: `products/gemba/actions/gemba-bootstrap/action.yml`,
`products/gemba/actions/gemba-bootstrap/README.md`,
`products/kata/actions/kata-agent/action.yml`, `MONOREPO.md`

| File                         | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gemba-bootstrap/action.yml` | The `Bootstrap` step gains `if: hashFiles('scripts/bootstrap.sh') != ''`, as the three pack steps guard on `apm.yml`. The description's sentence `It then runs ./scripts/bootstrap.sh.` reads `It then runs ./scripts/bootstrap.sh when the repository has one.`                                                                                                                                                                                                         |
| `gemba-bootstrap/README.md`  | The intro (line 6) and the § Prerequisites bullet call the script optional: `scripts/bootstrap.sh — optional. When present, the action runs it after the environment is ready, and the SessionStart hook runs the same script in a local session. A repository without it installs nothing in CI.` The § Provisioning, § Caching, and § Wiki sentences that say the script runs gain `when present`.                                                                     |
| `kata-agent/action.yml`      | The comment's first sentence reads `gemba-bootstrap handles Bun + cached deps + cached workspace, and runs ./scripts/bootstrap.sh when the repository has one.` Its sentences on the `token:` input and the wiki push stay.                                                                                                                                                                                                                                              |
| `MONOREPO.md`                | § Environment Bootstrap: layer 2 opens `**Workspace — scripts/bootstrap.sh (optional).**`. The paragraph that begins `scripts/bootstrap.sh is mandatory` becomes: `scripts/bootstrap.sh is optional. It is the home of the repository's own install command. The CI gemba-bootstrap action and the SessionStart hook run it when it exists, and a repository without it installs nothing in CI. Keep it to environment setup. …` with the remaining sentences unchanged. |

A test joins `products/gemba/test/benchmark-action-contract.test.js`'s pattern:
`products/gemba/test/bootstrap-action-contract.test.js` parses `action.yml` and
asserts the `Bootstrap` step's `if`.

Verify: `rg -n 'mandatory' MONOREPO.md` prints nothing,
`rg -n -i 'optional' products/gemba/actions/gemba-bootstrap/README.md` matches a
line about the script, and
`rg -n "hashFiles\('scripts/bootstrap.sh'\)" products/gemba/actions/gemba-bootstrap/action.yml`
matches once (S11).

## Step 6: README and changelog

Modified: `libraries/libwiki/README.md`, `libraries/libwiki/CHANGELOG.md`

- README § `init` / `push` / `pull`: the synopsis drops `--skills-dir`; the
  paragraph reads
  `init clones the wiki repo if it is missing. push and pull are thin wrappers over git that handle conflicts.`
  A new `### scaffold — create the ledgers and summaries` section before it: the
  synopsis `npx gemba-wiki scaffold [--wiki-root wiki]` and the four rules of
  step 2 as one sentence each.
- README § Programmatic API: `listAgents` reads
  `discover the installed agent profiles under .claude/agents/ by frontmatter and derive wiki summary paths`.
- CHANGELOG Unreleased: `scaffold` joins (breaking: `init` loses `--skills-dir`,
  the metrics seeding, and the Active Claims append; `listSkills` is gone); the
  admitted-names set.

Verify: `bun run check` and `bun run test` pass on the branch.

— Staff Engineer 🛠️
