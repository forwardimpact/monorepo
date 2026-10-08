# Plan 2400-a Part 01: The profile predicate and the roster

One predicate and one directory constant in `libutil`, imported by every
consumer. One roster function in `libwiki` that lists installed profiles, read
by `memo`, the audit, the marker migrator, and the storyboard skeleton. The
storyboard rule derives its H3 requirement from that roster. Branch
`feat/2400-profile-roster`. Route: `staff-engineer`. Depends on nothing.

## Step 1: Export the predicate and the directory from `libutil`

Give the profile test and the profiles directory one home.

Created:

- `libraries/libutil/src/agent-profile.js`
- `libraries/libutil/test/agent-profile.test.js`

Modified: `libraries/libutil/src/index.js`

```js
// agent-profile.js
export const AGENT_PROFILES_DIR = ".claude/agents";
/** The first `key:` frontmatter value at line start, or "". */
export function frontmatterField(text, key) {
  const m =
    typeof text === "string" &&
    text.match(new RegExp(`^${key}:[ \\t]*(.+)$`, "m"));
  return m ? m[1].trim() : "";
}
/** A markdown file is an agent profile when its frontmatter carries `name` and `description`. */
export function isAgentProfile(text) {
  return (
    frontmatterField(text, "name") !== "" &&
    frontmatterField(text, "description") !== ""
  );
}
```

`index.js` re-exports all three. The test covers a profile, a reference with a
`name:` line in a fenced example only when the line is not at line start, an
empty string, a non-string, and `frontmatterField` on a folded `description: >`
value, which returns `>` and is enough for the predicate.

Verify: `bun test libraries/libutil/test/agent-profile.test.js` passes.

## Step 2: Replace the four private copies

Each consumer imports the predicate. The libraries import from the package root.
The invariants import the module statically by a relative path
(`../../libraries/libutil/src/agent-profile.js`), which resolves from the
invariant file and not from the scanned root, so
`tests/kata-settings-invariant.test.js`, which runs its module against a
temporary root, still loads it.

Modified:

- `libraries/libpack/src/skill-pack.js`
- `libraries/libinvariant/src/instructions.js`
- `.jidoka/invariants/skill-genericity.rules.mjs`
- `.jidoka/invariants/instruction-links.rules.mjs`
- `.jidoka/invariants/kata-settings.rules.mjs`

| File                          | Change                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `skill-pack.js`               | Delete the local `isProfile` and its comment, and the local `frontmatterField`. Import `isAgentProfile` and `frontmatterField` and call them where the locals were. `foldedField` stays, because it reads a folded scalar. Keep the `.claude/agents` spelling in `stager.js`: the install target is libpack's own. |
| `instructions.js`             | Delete the local `isProfile` and its comment. Import `isAgentProfile`.                                                                                                                                                                                                                                             |
| `skill-genericity.rules.mjs`  | Delete the local `isProfile`. Add `import { isAgentProfile, AGENT_PROFILES_DIR } from "../../libraries/libutil/src/agent-profile.js";`. Build the `paths`, `globs`, and `dirs` entries from `AGENT_PROFILES_DIR` (`${AGENT_PROFILES_DIR}/`, `${AGENT_PROFILES_DIR}/x-*.md`, `[AGENT_PROFILES_DIR]`).               |
| `instruction-links.rules.mjs` | Same static import. Delete the local predicate.                                                                                                                                                                                                                                                                    |
| `kata-settings.rules.mjs`     | Same static import of `AGENT_PROFILES_DIR`. The `dirs` list reads `[".claude/skills", AGENT_PROFILES_DIR]`.                                                                                                                                                                                                        |

Verify: `rg -n 'name:\[ \\t\]\*\\S' libraries .jidoka` prints nothing,
`rg -n 'function frontmatterField' libraries` prints `libutil` only, and
`bun run test` and `bunx jidoka invariants` pass, including
`tests/kata-settings-invariant.test.js`.

## Step 3: Replace the directory spellings in `libharness` and `libwiki`

Every default profiles directory resolves from the constant.

Modified:

- `libraries/libharness/src/judge.js`
- `libraries/libharness/src/commands/run.js`
- `libraries/libharness/src/discusser.js`
- `libraries/libharness/src/supervisor.js`
- `libraries/libharness/src/facilitator.js`
- `libraries/libharness/src/benchmark/runner.js`
- `libraries/libharness/CHANGELOG.md`
- `libraries/libwiki/src/commands/memo.js`
- `libraries/libwiki/src/commands/fix.js`

The changes:

- Each `resolve(<cwd>, ".claude/agents")` and
  `path.join(projectRoot, ".claude", "agents")` becomes the same call with
  `AGENT_PROFILES_DIR`. JSDoc that spells the directory names the constant.
  `benchmark/apm-installer.js` keeps `join(stagedClaude, "agents")`: it stages a
  pack into a sandbox, as `libpack`'s target does.
- `libharness/CHANGELOG.md` gains an Unreleased line: the profiles directory
  default comes from `libutil`.

Verify:
`rg -n -e '"\.claude/agents' -e '\.claude/agents"' -e '"\.claude", "agents"' libraries/libharness/src libraries/libwiki/src .jidoka/invariants`
prints nothing, and `bun run test` passes.

## Step 4: The roster function lists profiles

`listAgents` keeps its shape and reads frontmatter. One helper joins the
directory and wires the warning, so no command spells the join.

Modified: `libraries/libwiki/src/agent-roster.js`,
`libraries/libwiki/test/agent-roster.test.js`,
`libraries/libwiki/test/helpers.js`

```js
export function listAgents({ agentsDir, wikiRoot }, fs, { warn } = {}) {
  if (!fs.existsSync(agentsDir)) return [];
  // for each *.md regular file: read; skip unless isAgentProfile(text);
  // key = stem with a trailing ".agent" removed; throw on BROADCAST_TARGET;
  // name = frontmatterField(text, "name"); if (warn && name !== key) warn(`profile ${entry} names '${name}', roster key is '${key}'`);
  // push { agent: key, summaryPath: path.join(wikiRoot, key + ".md") }
}
/** The roster of a project: `listAgents` under `<projectRoot>/AGENT_PROFILES_DIR`. */
export function listProjectAgents(
  { projectRoot, wikiRoot },
  fs,
  { warn } = {},
) {
  return listAgents(
    { agentsDir: path.join(projectRoot, AGENT_PROFILES_DIR), wikiRoot },
    fs,
    { warn },
  );
}
```

`helpers.js`: `seedAgentProfile` writes `description:` beside `name:`, and
`STORYBOARD_AGENTS` stays the fixture roster the seeded boards carry.

Tests: a reference file (`x-team-protocol.md`, no frontmatter) is not on the
roster; `staff-engineer.agent.md` yields the key `staff-engineer`; a `name` that
differs from the key calls `warn` once and stays on the roster; an absent
directory returns `[]`; the broadcast collision still throws;
`listProjectAgents` joins the constant. Every fixture profile carries `name:`
and `description:` frontmatter.

Verify: `bun test libraries/libwiki/test/agent-roster.test.js` passes.

## Step 5: `memo` reads the roster

The broadcast resolves the roster through the helper and surfaces the warning.

Modified: `libraries/libwiki/src/commands/memo.js`,
`libraries/libwiki/test/cli-memo.integration.test.js`

- `memo.js` calls
  `listProjectAgents({ projectRoot, wikiRoot }, runtime.fsSync, { warn })` with
  `warn = (m) => createLogger("wiki", runtime).warn("memo", m)`. When the roster
  is empty, `writeBroadcast` warns `no agent profiles under <dir>` and returns
  `{ ok: true }`. It is otherwise unchanged.
- `marker-migrator.js` is untouched: `listAgents`'s third parameter defaults.
  Its retirement, with `scripts/migrate-memo-markers.mjs`, is a follow-up issue
  filed with this part's pull request.
- The memo test fixtures gain frontmatter. Two new cases: a reference file under
  the agents directory does not receive a broadcast, so two summaries change and
  not three; an empty agents directory warns and exits 0.

Verify: `bun test libraries/libwiki/test/cli-memo.integration.test.js` passes.

## Step 6: The audit context carries the roster

The storyboard rule reads the roster from the context. The literal list goes.

Modified: `libraries/libwiki/src/audit/scopes.js`,
`libraries/libwiki/src/audit/rule-builders.js`,
`libraries/libwiki/src/audit/rules.js`,
`libraries/libwiki/src/commands/audit.js`,
`libraries/libwiki/src/commands/fix.js`,
`libraries/libwiki/test/audit-engine.test.js`,
`libraries/libwiki/test/audit-rules.test.js`,
`products/gemba/test/golden/gemba-wiki/audit-json.stdout.txt`

| Change                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildContext({ wikiRoot, today, fs, subprocess, projectRoot })` adds `roster`: `projectRoot ? listProjectAgents({ projectRoot, wikiRoot }, fs).map((a) => a.agent) : []`. `budget-gate.js` and the rotation pre-pass in `fix.js` read `.subjects` only and pass no `projectRoot`, so they stay as they are.                                                                                                                                                         |
| `rule-builders.js`: delete `STORYBOARD_DOMAIN_AGENTS`, `AGENT_H3_REQUIREMENTS`, and their comment. Add `agentH3Required = (s, ctx) => allRequiredLines(ctx.roster.map((agent) => ({ label: agent, pattern: new RegExp(`^### ${agent}(\\s\|$\|—\|-)`) })))(s)`.                                                                                                                                                                                                       |
| `rules.js`: `storyboard.agent-h3-required` uses `agentH3Required`; its hint reads `every profile under .claude/agents/ gets an H3 under '## Current Condition'; gemba-wiki refresh seeds them on a new board`. `storyboard.current-month-exists` hint reads `run gemba-wiki refresh to create it`. `memory.file-exists` hint reads `run gemba-wiki scaffold to create it`, which part 02 makes true before any binary ships.                                         |
| `commands/audit.js`: `auditWiki` passes `projectRoot`. `countChecked` adds `checked["storyboard-sections"] = auditCtx.roster.length`.                                                                                                                                                                                                                                                                                                                                |
| `commands/fix.js`: the `audit` closure in `runFixCommand` passes `projectRoot` to its `buildContext` call.                                                                                                                                                                                                                                                                                                                                                           |
| Tests: `cleanSeed` gains a profiles directory with frontmatter fixtures. One case: a board that lacks one profile's H3 yields one finding. One case: a reference file under the directory adds no requirement. One case: no profiles directory yields no finding and `storyboard-sections 0`. The `audit-json` golden reads `storyboard-sections 0`, because the capture spawns from `products/gemba`, whose `package.json` is the project root the finder stops at. |

Verify:
`rg -n -e '"product-manager"' -e '"release-engineer"' -e '"security-engineer"' -e '"staff-engineer"' -e '"technical-writer"' libraries/libwiki/src/audit`
prints nothing, and
`bun test libraries/libwiki/test/audit-engine.test.js libraries/libwiki/test/audit-rules.test.js`
passes.

## Step 7: The skeleton seeds one section per profile

`refresh` passes the roster when it creates the month's board.

Modified: `libraries/libwiki/src/storyboard-skeleton.js`,
`libraries/libwiki/src/commands/refresh.js`,
`libraries/libwiki/test/storyboard-skeleton.test.js`,
`libraries/libwiki/test/cli-refresh.integration.test.js`

- `renderStoryboardSkeleton(todayIso, roster = [])` renders, after the
  `### Headlines` block's `None.` line, one `### <agent>` heading per roster
  entry with a blank line after each. The two
  `> [product-manager sets this in the planning meeting.]` lines read
  `> [Set in the planning meeting.]`. The module comment gains one sentence: the
  skeleton renders one section per roster profile, and the sentence on metric
  blocks stays.
- `createStoryboardSkeleton(runtime, storyboardPath, logger, roster)` renders
  the roster it is given. `runRefreshCommand` resolves it once with
  `listProjectAgents({ projectRoot, wikiRoot: path.dirname(storyboardPath) }, runtime.fsSync, { warn })`
  and passes the keys.
- Tests: three roster entries yield three H3s in order; an empty roster yields
  none; the rendered skeleton has no agent name in its placeholders; the refresh
  integration test seeds two profiles and asserts both sections on the created
  board.

Verify: `rg -n 'product-manager' libraries/libwiki/src/storyboard-skeleton.js`
prints nothing, and
`bun test libraries/libwiki/test/storyboard-skeleton.test.js libraries/libwiki/test/cli-refresh.integration.test.js`
passes.

## Step 8: Record the change

Modified: `libraries/libwiki/CHANGELOG.md`

Four Unreleased entries: the roster is the installed profiles; the storyboard
rule derives from the roster and the facilitator exemption is gone; `refresh`
seeds the agent sections; the `checked` line carries one count per rule scope
plus `storyboard-sections`, the sections the roster requires. The last entry
amends the existing `audit reports what it checked` entry's sentence.

Verify: `bun run check` and `bun run test` pass on the branch.

— Staff Engineer 🛠️
