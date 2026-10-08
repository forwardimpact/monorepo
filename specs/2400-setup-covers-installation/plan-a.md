# Plan 2400-a: one roster, one scaffold, setup provisions, and the packs cite only what exists

Executes [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

The plan follows the design's two stages. Stage one is code: parts 01 and 02
land the profile predicate, the roster, the scaffold, the trimmed `init`, the
admitted-names constant, and the bootstrap guard, then part 03 runs the release
chain that puts the new binaries and actions in front of every installation.
Stage two is instructions: parts 04, 05, and 06 rewrite the two setup skills,
retire `monorepo-setup`, sweep the packs for `KATA.md` and `websites/`, and
update the pages. Part 07 runs the cutover on this repository's wiki and
archives the sibling. Parts 02, 04, 05, and 06 rebase onto spec 2390's merges,
as the design requires, and name `kata-setup` steps by title. Each part is one
pull request with one owner. The plan was drafted against the design on the
lockstep pull request while its STATUS row read `design draft`; a design change
under review re-cuts the affected part before implementation starts.

Libraries used: libutil (`isAgentProfile`, `frontmatterField`,
`AGENT_PROFILES_DIR`, `runRules`), libwiki (roster, scaffold, skeleton, audit
rules), libpack and libinvariant (the predicate import), libharness (the
directory constant).

## Decisions the design leaves open

| Decision              | Detail                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Predicate module      | `libraries/libutil/src/agent-profile.js` exports `isAgentProfile(text)`, `frontmatterField(text, key)`, and `AGENT_PROFILES_DIR = ".claude/agents"`. The package root re-exports all three. The three invariants that need them load the module by a path resolved from their own `import.meta.url`, not from the scanned root, so the invariant tests that run against a temporary root still load it.                    |
| Roster function       | `listAgents({ agentsDir, wikiRoot }, fs, { warn })` keeps its array shape. It reads each `.md` file, keeps the profiles, strips a trailing `.agent` from the stem, and calls `warn` once per profile whose `name` differs from its key. An absent directory returns `[]`, and `memo --to all` on an empty roster warns and exits 0. The broadcast collision still throws.                                                  |
| Audit roster          | `buildContext` takes an optional `projectRoot` and carries `roster` (the keys). The storyboard H3 rule reads `ctx.roster`. The two callers that read `.subjects` only (`budget-gate.js`, the rotation pre-pass in `fix.js`) pass none. The `checked:` line and the JSON `checked` object gain a `storyboard-sections` count equal to the roster size, so an empty roster reads `storyboard-sections 0`.                    |
| Admitted names        | `constants.js` adds `HOME_FILE`, `SECRET_OVERRIDES_FILE`, `WIKI_ROOT_FILES` (a `Set` of the five root names), and `PRIORITY_INDEX_TABLE_SEPARATOR`. The grammar and the scopes module read the set. `secret-gate.js` re-exports its `OVERRIDE_LOG` from the constant. The audit's priority separator regex derives from the new constant through `pipeRowRe`, as the claims pair does.                                     |
| Scaffold command      | `gemba-wiki scaffold [--wiki-root]` runs on the local tree. It prints one `scaffold: <verb> <path>` line per write and `scaffold: nothing to write` when it writes nothing. It exits 0. The bin's existing absent-wiki guard covers a missing clone.                                                                                                                                                                       |
| Summary template      | Part 02 fixes the text. It passes every `summary.*` rule and carries the memo marker.                                                                                                                                                                                                                                                                                                                                      |
| Skeleton              | `renderStoryboardSkeleton(todayIso, roster)` renders `### <key>` per roster entry after `### Headlines`, in roster order. The caller resolves the roster. The two placeholders read `[Set in the planning meeting.]`.                                                                                                                                                                                                      |
| Label vocabulary      | Eleven names plus `agent:<name>` per sheet agent. Part 04 fixes the table. `wiki-curation` stays out, because `gemba-wiki curate` creates it.                                                                                                                                                                                                                                                                              |
| Hooks                 | Four SessionStart commands, one WorktreeCreate command, one Stop command, in the order the design gives. The bootstrap line reads `test ! -f scripts/bootstrap.sh \|\| bash scripts/bootstrap.sh`. The installer URL carries a `{{GEAR_RELEASE}}` placeholder that a section of its own in `action-refs.md` resolves to the newest `gear@v*` release tag.                                                                  |
| Repository sheet rows | Seven rows under `parameters-guard.md § Repository`: Wiki, Discussions, Labels, Wiki checkout, Session hooks, `{{GEAR_RELEASE}}`, and Profiles. The Profiles row has Home `.claude/agents/`.                                                                                                                                                                                                                               |
| Check homes           | `check-ci.md` holds a manifest with `check: jidoka` and the CLI dependency at the published version, the install step that writes the lockfile, one workflow `check.yml` with push and pull request triggers, SHA-pinned `checkout` and `setup-node`, `npm ci`, and `npm run check`, and the `github-actions` Dependabot entry. The jidoka pack cannot cite the kata pack's reference, so the entry has one home per pack. |
| Documentation pool    | Part 05 fixes the topic table. `<docs>` is a directory named `docs` at the root or up to two levels below it, and each match is one site.                                                                                                                                                                                                                                                                                  |
| Release               | Part 03 forces no version. `libwiki` loses an option and an export, so `kata-release-cut` decides the bump and the `gemba` range follows. The four `libutil` consumers take the new floor in the same cut.                                                                                                                                                                                                                 |
| Rehearsal harness     | A throwaway private repository with no commit, dummy secrets, the packs installed uncommitted, and the branch's `kata-setup` and `jidoka-setup` copied over the installed ones. A fresh sub-agent follows the skill. The implementer answers as the operator and holds a human `gh` login with admin rights.                                                                                                               |

Deviations from the design, with reasons:

- **Stage one is two pull requests.** The design counts two merges, one per
  stage. Part 01 has no dependency on spec 2390 and merges first. Part 02 edits
  the grammar and the scopes module that 2390 changes, so it rebases onto 2390's
  first merge. One pull request would hold part 01 hostage to that rebase. The
  release chain still runs once, after both.
- **Stage two is three pull requests.** Parts 04, 05, and 06 own disjoint files
  and two routes. One exception: part 05 deletes the one `KATA.md` sentence in
  `team-storyboard.md`, because its invariant deny pattern lands with the sweep.
  Part 06 then edits that file from part 05's merged text.
- **The cutover splits.** This wiki's scaffold and board sections need the
  workspace `gemba-wiki` from part 02 and spec 2390's cutover of this wiki,
  which converts the ledger. Part 07 step 1 runs as soon as both hold. The
  archive waits for part 04's merge.
- **The verify bullet is dropped.** The design's room ledger adds one verify
  bullet. The sheet's Repository table and the checklist item verify the same
  objects, and the word cap has no room for a third home.

Out of scope, by decision: `team-storyboard.md` keeps `### product-manager` and
the product-mix seed, a tenant literal the design does not name; it goes to the
same follow-up issue. The marker migrator and its one-off script stay. The
design names the migrator as a roster reader. Its retirement is a
developer-experience follow-up, filed as an issue with part 01's pull request.

## In-flight specs

| Spec | State         | Shared surfaces                                                                                                                                                                                                                                                                                                                    | Rule                                                                                                                                                                                                           |
| ---- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2390 | plan approved | `libwiki` constants, grammar, and scopes; `gemba-wiki` skill and help golden; `kata-setup` SKILL.md, `changelog.md`, and the update step; the skills CLAUDE.md; the getting-started page; the wiki-init reference; this wiki's ledger.                                                                                             | 2390 lands first, every part here rebases onto it. The scaffold and 2390's first changelog entry stay the only ledger creators. Part 07 step 1 waits for 2390's cutover.                                       |
| 2370 | design draft  | `libwiki` marker scanner, `renderBlock`, `product-mix`, `cli-definition.js`; the storyboard template and team-storyboard reference at their caps; the `gemba-wiki` skill; the gemba overview, predictable-team, and wiki-operations pages; the `kata-setup` changelog; this repository's `kata-*.yml`, which become `agent-*.yml`. | No shared hunk. The later merge rebases. Part 03 tier 4 repins whichever file names exist. The tenant-defaults sentence on the gemba overview loses one half per spec, and the second merge rewrites it whole. |
| 2380 | design draft  | `libwiki` push command and `cli-definition.js`; the `kata-agent` action steps; the `gemba-wiki` skill at its cap; `libwiki` README; the wiki-operations page; `scripts/bootstrap.sh` here; `libutil` and `libharness` versions.                                                                                                    | No shared hunk. Part 02 edits one comment in the action and part 03 moves one pin; 2380 adds inputs and steps. Each release train runs whole before the next.                                                  |
| 1272 | plan approved | `kata-setup` hosted workflow templates.                                                                                                                                                                                                                                                                                            | Dormant on the hosted bot blocker. No shared file with part 04's references or the provisioning step.                                                                                                          |
| 1950 | spec draft    | `libwiki` `renderBlock` and `refresh`.                                                                                                                                                                                                                                                                                             | No shared hunk with the skeleton or the roster.                                                                                                                                                                |

Open pull request #2052 edits `kata-setup` SKILL.md and two templates and has
not moved since September. It rebases onto part 04 or closes before it.

## Parts

| Part               | Title                                                       | Depends on                                                         |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| [01](plan-a-01.md) | The profile predicate and the roster                        | nothing                                                            |
| [02](plan-a-02.md) | Scaffold, `init`, admitted names, and the bootstrap guard   | part 01 merged, spec 2390's first merge                            |
| [03](plan-a-03.md) | Release chain and repin                                     | parts 01 and 02 merged                                             |
| [04](plan-a-04.md) | Setup provisions, Jidoka writes the check homes, retirement | part 03 done, spec 2390's second merge                             |
| [05](plan-a-05.md) | The genericity sweep                                        | part 03 done, spec 2390's second merge                             |
| [06](plan-a-06.md) | The wiki skill, the storyboard references, and the pages    | part 03 done, part 05 merged, spec 2390's second merge             |
| [07](plan-a-07.md) | Cutover                                                     | step 1: part 02 merged and 2390's cutover; 2 and 3: part 04 merged |

## Execution

- **Agent route.** Parts 01, 02, 04, and 05 go to `staff-engineer`. Part 04 runs
  in a session that holds a human operator's own `gh` login, because the
  rehearsal turns on repository features and creates labels. Part 05 carries an
  invariant edit beside its prose sweep, so it is engineering work. Part 06 goes
  to `technical-writer`. Parts 03 and 07 go to `release-engineer`. Writes under
  `.claude/` go through `echo … | bunx gemba-selfedit <path>` on the branch when
  the harness blocks them.
- **Order.** Draft parts 01, 02, 04, 05, and 06 in parallel. Merge 01 on review.
  Rebase 02 onto spec 2390's first merge, then merge. Run 03. Run part 07 step 1
  once spec 2390's cutover has converted this wiki's ledger. Rebase 04, 05, and
  06 onto spec 2390's second merge and onto 03's repin. Merge 05, then 06, with
  04 in either slot. Run part 07 steps 2 and 3 last.
- **Before parts 02, 04, 05, and 06 start,** diff the merged 2390 files against
  [plan 2390-a](../2390-status-ledger-tsv/plan-a.md) and its parts: the ledger
  constant and grammar edit, `kata-setup`'s update step and `changelog.md`, the
  skills CLAUDE.md fold, the `gemba-wiki` skill and its help golden, the
  getting-started and wiki-operations pages, and the wiki-init reference. Edit
  the merged text, not the design's.
- **No part starts before the design merges.** The design is on an open lockstep
  pull request. STATUS cannot reach `plan approved` and no part's branch opens a
  pull request until `design approved` is on `origin/main`.
- **Source ownership.** Each file has one owner, with these exceptions, each
  sequential. Part 01 owns `buildContext` in `audit/scopes.js` and part 02 owns
  the names in it. Part 01 owns the predicate import and the directory lines of
  `skill-genericity.rules.mjs` and part 05 owns its patterns and header. Parts
  01 and 02 each append their own Unreleased entries to `libwiki/CHANGELOG.md`.
  Part 02 turns the two priority regexes in part 01's `rule-builders.js` and
  `scopes.js` into re-exports and renders two hints in `rules.js` from
  constants. Part 06 edits `team-storyboard.md` after part 05 deleted its
  `KATA.md` sentence. Part 02 edits the comment above the `gemba-bootstrap` step
  in `kata-agent/action.yml`, and part 03 then moves that step's pin. Part 03's
  `fit-install.sh` edit is one line inside part 02's action directory, after
  part 02 merged.

  | Part | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
  | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 01   | `libraries/libutil/`, `libraries/libpack/src/skill-pack.js`, `libraries/libinvariant/src/instructions.js`, `libraries/libharness/src/`, `libraries/libharness/CHANGELOG.md`, `.jidoka/invariants/skill-genericity.rules.mjs` (predicate load and directory lines), `.jidoka/invariants/instruction-links.rules.mjs`, `.jidoka/invariants/kata-settings.rules.mjs`, `scripts/migrate-memo-markers.mjs` (untouched, named in the follow-up issue), and in `libraries/libwiki/`: `agent-roster.js`, `storyboard-skeleton.js`, `audit/rule-builders.js`, `audit/rules.js`, `audit/scopes.js` (`buildContext`), `commands/audit.js`, `commands/fix.js`, `commands/memo.js`, `commands/refresh.js`, their tests, `test/helpers.js`, and the `audit-json` golden |
  | 02   | The rest of `libraries/libwiki/` (`constants.js`, `audit/grammar.js`, `audit/scopes.js` names, `secret-gate.js`, `commands/init.js`, `commands/scaffold.js`, `scaffold.js`, `cli-definition.js`, `index.js`, `README.md`, `CHANGELOG.md`, tests), the `gemba-wiki` goldens except `audit-json`, `products/gemba/actions/gemba-bootstrap/`, `products/gemba/test/bootstrap-action-contract.test.js`, the `kata-agent` action comment, `MONOREPO.md`                                                                                                                                                                                                                                                                                                        |
  | 03   | `products/gemba/actions/gemba-bootstrap/fit-install.sh`, the `gemba-bootstrap` pin in `kata-agent/action.yml`, `.github/workflows/kata-*.yml`, the `version` fields and ranges the cut names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
  | 04   | `.claude/skills/kata-setup/`, `.claude/skills/jidoka-setup/`, `.claude/skills/monorepo-setup/` (deleted), `.github/workflows/publish-skills.yml`, `.jidoka/invariants/skill-template.rules.mjs`, `.jidoka/invariants/instruction-scripts.allow.yml`, `tests/instruction-scripts-invariant.test.js`, `websites/kata/docs/getting-started/index.md`                                                                                                                                                                                                                                                                                                                                                                                                         |
  | 05   | `.claude/skills/CLAUDE.md`, `.jidoka/invariants/skill-genericity.rules.mjs` (patterns and header), `tests/skill-genericity-invariant.test.js`, `.claude/skills/kata-documentation/`, every `kata-*/references/metrics.md`, every `kata-*/SKILL.md` § Memory, the `KATA.md` sentence of `kata-session/references/team-storyboard.md`                                                                                                                                                                                                                                                                                                                                                                                                                       |
  | 06   | `.claude/skills/gemba-wiki/SKILL.md`, `.claude/skills/kata-session/references/team-storyboard.md` (after part 05), `.claude/skills/kata-session/references/storyboard-template.md`, `websites/gemba/index.md`, `websites/gemba/docs/predictable-team/index.md`, `websites/gemba/docs/predictable-team/wiki-operations/index.md`, `websites/gemba/docs/predictable-team/wiki-integrity/index.md`, `CONTRIBUTING.md`                                                                                                                                                                                                                                                                                                                                        |
  | 07   | Nothing in this repository. The wiki and the sibling repository                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

- **Verify before each merge.** `bun run check`, `bun run test`, and
  `bunx jidoka` pass on each part's branch. Every `rg` verification in the parts
  with more than one pattern uses `-e <a> -e <b>`; `\|` is a literal pipe to
  ripgrep.
- **Success criteria.**

  | Criterion      | Verifies at                                                                          |
  | -------------- | ------------------------------------------------------------------------------------ |
  | 7              | Part 01's branch: unit tests and the `rg` line                                       |
  | 4, 5, 6, 8, 11 | Part 02's branch: the scaffold integration test, the action diff, and the `rg` lines |
  | 9, 10, 13, 14  | Part 04's branch and its rehearsal transcripts                                       |
  | 16             | Part 04's changelog entry                                                            |
  | 17             | Part 04 step 7 for `websites/kata`; part 06 for `websites/gemba`                     |
  | 1, 2, 3, 12    | Part 05's branch                                                                     |
  | 15             | Every part                                                                           |
  | 18             | Part 07                                                                              |

## Risks

| Risk                                                                                                                                                                                           | Mitigation                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spec 2390's plan is approved and not yet implemented. Its merged text can differ from plan 2390-a, and parts 02, 04, 05, and 06 edit the files it changes.                                     | The pre-start diff in § Execution. Part 04 edits `kata-setup` by step title and sentence, not by line. Part 02 reads the ledger constant's name from the merged `constants.js`.                                          |
| `kata-setup` `SKILL.md` sits at its word cap after 2390. The design caps the additions at the removals.                                                                                        | Part 04 carries a word ledger that balances at two words under the cap, with the design's verify bullet already left out. The sheet's Repository table and the checklist item cover what that bullet would have checked. |
| The `gemba-wiki` skill sits at 192 of 192 lines, `team-storyboard.md` at 767 of 768 words, and `storyboard-template.md` at 128 of 128 lines, and the formatter reflows prose at 80 columns.    | Part 06 gives each edit as counted lines or words after reflow and names the lines and words each removal frees.                                                                                                         |
| `listAgents` now filters by frontmatter, so a test fixture profile written as `# SE` drops off the roster and a broadcast reaches nobody.                                                      | Part 01 rewrites every fixture profile with `name:` and `description:` frontmatter. The in-process memo test asserts the broadcast count, and an empty roster warns.                                                     |
| The storyboard rule now requires a section per profile. This repository has eight profiles and a board with five sections, so a local audit fails here from part 01's merge until the cutover. | Part 07 step 1 runs as soon as part 02 and spec 2390's cutover hold. Until then the push budget gate does not block, because it reads budget rules only, and the curation run routes the finding to the curation issue.  |
| Two `init` calls can run in one session start when the hooks reference and `scripts/bootstrap.sh` both call it.                                                                                | `init` is idempotent and prints one line. The hooks reference says so, and the bootstrap guard leaves a repository without the script with one call.                                                                     |
| A `libutil` export added in part 01 is absent from a consumer's installed `libutil` until its range floor moves.                                                                               | Part 03 tier 1 bumps the floor in `libwiki`, `libpack`, `libinvariant`, and `libharness` to the version the cut assigns, in the same commit as the versions.                                                             |
| `gh repo edit --enable-wiki` and `--enable-discussions` need admin or maintain rights, and an App token in a hosted rehearsal lacks them.                                                      | Part 04 runs with a human login. The step reports each refusal and continues, as the design says, and rehearsal R2 exercises the refusal path once with a read-only token.                                               |
| Specs 2370 and 2380 both edit `team-storyboard.md` next, and part 06 leaves it two words under its cap.                                                                                        | Part 06 names the example clause it deletes for room. The next edit to the file starts by moving the Participant Briefing Template to its own reference.                                                                 |

— Staff Engineer 🛠️
