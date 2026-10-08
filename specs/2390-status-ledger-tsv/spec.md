# Spec 2390: The approval ledger is a rows-only file, and an installation updates itself from the pack

**Classification:** product. It lands on the `kata-skills`, `gemba-skills`, and
`monorepo-skills` packs, on `@forwardimpact/libwiki` behind the `gemba-wiki`
CLI, and on the `www.kata.team` and `www.gemba.team` pages
([team protocol § Classify Every Finding](../../.claude/agents/x-team-protocol.md#classify-every-finding)).
This repository's wiki, the `ship-it` skill, the skills and libraries
CLAUDE.md files, and `references/CLAUDE.md` are internal companions.

**Persona and job:** Teams Using Agents. Part A serves Kata's Big Hire in
[JTBD.md](../../JTBD.md), Run a Continuously Improving Agent Team, and Gemba's
Big Hire, Stand Up and Operate an Agent Team, whose persist-memory job the wiki
carries. The approval record is the one machine-read surface at the trust
boundary. A record a reader can misread is the anxiety that autonomy amplifies
bad patterns faster than humans intervene. Part B serves the same Kata hire on
the day a convention moves. An installation that takes the change in two
commands keeps running without per-team prompt engineering, which is the
Little Hire's promise.

## Problem

### A: The approval record mixes prose and data, so every reader must find the data

The approval ledger is a markdown page. Forty-eight lines of header prose
precede a fenced block of tab-separated rows. The fence is the only boundary
between prose and data, and each reader draws it for itself.

| Gap                                                          | Evidence                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The merge gate reads rows the writing contract calls prose.  | The release-merge gate's read is a line-anchored pattern over the whole file. A row written outside the fence passes the gate. The wiki audit parses the fence and ignores the same row. The two readers give two answers ([kata-skills#24](https://github.com/forwardimpact/kata-skills/issues/24)).                                                                           |
| The row grammar has four homes, and they disagree.           | The ledger's own header allows `NNNN/NN`. The team protocol defines `{id}\t{phase}\t{status}` and no sub-row. The release-merge gate matches `NNNN/<unit>` with any lowercase unit. The library parser accepts the same wide unit. The live ledger carries 19 sub-rows, every one numeric ([kata-skills#25](https://github.com/forwardimpact/kata-skills/issues/25)).         |
| The header prose is stale.                                   | The ledger's merge-gate notes send a reader to a master-plan issue whose tables no longer track state. Nothing reads the notes, and every clone carries them above the data.                                                                                                                                                                                                   |
| The library knows the file by name in four places and by its fence in one. | The fence costs a per-file classifier skip, a publish rule and an audit subject that turn the fence exemption off for this one name, and a fence-aware row loader. The named-ledger admission and the audit's load are what any named ledger needs.                                                                                                              |
| A deliberate wiki file removal has no sanctioned path.       | The publish conservation guard refuses an undeclared whole-file deletion. The library holds a removal declaration that no command calls. The archive skill tells the archivist to remove past-period wiki files with an ordinary write, which the guard refuses.                                                                                                             |
| The patch in flight adds homes instead of removing one.      | PR #2180 tightens the gate's pattern and restates the sub-row grammar in two more prose places. It leaves the parser's wider grammar in place.                                                                                                                                                                                                                                |

### B: An installation has no way to take a convention change

| Gap                                                          | Evidence                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A pack update changes skills, not the installation.          | `apm update` rewrites the agent profiles and skills an operator has not edited. It touches no workflow file, wiki page, setting, secret, variable, or label.                                                                                                                                                          |
| Convention changes have shipped without a path.              | Spec 1910 added a metrics column, and with no way to move an installation's files `libxmr` keeps a legacy-header branch to this day. Specs 2350 and 2360 gave setup a watchdog workflow, which reaches an existing installation only when its operator thinks to run setup again.                                      |
| The setup skill regenerates on request only.                 | The merged setup skill of spec 2360 regenerates a file when the operator names it on the parameter sheet. Nothing runs regeneration because a template changed, and nothing acts outside the generated files.                                                                                                         |
| No surface tells an installation what changed.               | The pack carries no changelog. This repository's changelogs are per package and describe code. The downstream installation that filed kata-skills#24 and #25 would learn of this spec's own ledger change from a blocked merge.                                                                                        |
| Nothing obliges a convention change to carry its migration.  | The skills CLAUDE.md governs genericity, length, and house style. It says nothing about what an installation must do when a convention moves, and the surfaces that move are not all under the skills directory.                                                                                                     |

## Proposal

Two parts. Part A removes the boundary that readers had to find. Part B gives
an installation one procedure for taking a convention change, and this spec's
own change is the procedure's first entry.

### A: The ledger is rows only

1. **The ledger is `wiki/STATUS.tsv`.** It holds rows and nothing else. It has
   no header, no prose, and no fence. A newline ends a row, the final newline
   opens no row, and a final line without a newline is a row. An empty line is
   an empty row, which the audit reports. An empty file is an empty ledger. The
   ledger is a file in the wiki, not a wiki page. The wiki's index page links
   it, the hosted wiki serves it as it serves the metrics CSVs today, and a
   clone holds it. No human edits it by hand. A human's approval is a label, a
   review, a comment, a merge, or a message in an interactive session, and an
   agent writes the row.
2. **Row cells are unchanged, and the sub-row id narrows.** A spec row is
   `{id}\t{phase}\t{status}`. An experiment row is
   `exp:{issue}\t{state}\t{pin}\t{plan-ref}`. The sub-row id is `NNNN/NN`,
   where `NN` is the plan part the row tracks, and no other id form exists.
   The roll-up rule, that the master row reaches its terminal state only after
   every sub-row does, moves to the gate step that writes that transition.
3. **The grammar has one home.** The library that ships the `gemba-wiki` audit
   defines the id forms, the row kinds, and the phase and status vocabularies,
   and the audit enforces them. The library exports the sub-row fragment, and
   its own id grammar composes from it. The team protocol keeps the writers'
   rules: which transition each writer may make, in what order, and that a
   writer replaces the row it finds and appends the row it does not. Each
   writer surface shows the literal row it writes. One instruction surface,
   the merge gate, reads with a pattern that carries a copy of the fragment,
   and the repository's checks fail when the copy differs from the export.
4. **Every reader reads the whole file.** The merge gate reads with no fence
   awareness, which is now correct by construction. The library admits and
   loads the ledger by its new name, as it admits the other named ledgers, and
   drops the special cases that existed for the fence. Writers replace the file
   in place. It is never union-merged.
5. **Clean break.** The markdown ledger is removed. There is no fallback read
   and no dual period. An absent ledger is an absent row to the gate, which
   blocks. A writer never creates the ledger: a writer that finds none stops
   and names the update procedure. Only the scaffold and the
   first changelog entry create the file.
6. **A deliberate removal is declared.** A wiki file removal goes through the
   publish command, which records the intent so the conservation guard lets the
   deletion land. The archivist's direct wiki removals take the same path.
7. **Documentation.** The team protocol, the skills and references that write
   or read the ledger, the setup scaffold, the wiki's own index page, KATA.md,
   and the `www.kata.team` pages name the file and its rows-only shape. The
   `gemba-wiki` skill, its help, and the `www.gemba.team` wiki-operations page
   document the declared removal.

### B: An installation updates itself from the pack

8. **One procedure.** After `apm update`, the operator asks `kata-setup` to
   update the installation (`/kata-setup Update my installation`). The
   procedure reads the installation's parameter values back, regenerates every
   file the skill generates from the current templates under the setup skill's
   diff-and-ask rule, and shows the parameter sheet. A file the operator
   declines keeps its shape, and the report names it. The procedure then runs
   every changelog entry's detection, oldest entry first, shows what each
   firing entry will change, applies the entries the operator accepts,
   verifies, and reports what it changed. A fresh setup runs the same
   detections last, so a repository that predates the pack takes every entry.
   The skill stays within its instruction budget.
9. **The changelog.** The `kata-setup` skill carries a short changelog
   reference. One entry per convention change an installation must take and a
   regeneration does not deliver. An entry states what changed, how to detect
   an installation that has not taken it, and what to do, in at most eighty
   words, and its steps may ask the operator a question. Every entry is safe to
   apply twice: the detection decides, so the procedure keeps no record of what
   was applied before. Entries are listed newest first, with position as the
   order, and the changelog holds at most eight. When the oldest entry's
   detection fires, the procedure tells the operator that retired entries may
   apply too and names the pack's history, where every retired entry stays.
10. **The obligation.** The skills CLAUDE.md states the rule: a change to any
    convention an installation carries ships with a changelog entry in the same
    change, and the change that adds an entry past the cap retires the oldest.
    A convention an installation carries is anything the skills tell an
    installation to hold that neither a pack update nor a regeneration
    delivers: wiki ledger files and their row shapes, settings keys, secret and
    variable names, label names, and a change to a generated file that
    regenerating it cannot deliver, such as a rename. The rule covers the
    agent profiles and references the same packs ship. The libraries CLAUDE.md
    points at the rule, because a library change can move a convention too.
    The rule is a shared policy, and the human approval of this spec is its
    decision record.
11. **The first entry is Part A.** Detect: the markdown ledger exists, or the
    wiki clone exists with no rows-only ledger. Do: the rows-only ledger is
    created when absent, and every fenced row whose id the rows-only ledger
    lacks is appended to it, and an id present in both keeps the rows-only row,
    which is the newer write, and is reported. Empty lines are dropped. For a
    sub-row whose part is not two digits, the procedure asks for a two-digit
    part and whether to cancel the row, and writes the renumbered id with the
    chosen status, so a cancelled row keeps an id the audit accepts. The
    markdown ledger is removed through the publish command. The wiki's index and
    memory pages name the new file, whichever spelling they used for the old
    one. The wiki is published.
12. **The page.** The `www.kata.team` getting-started page documents the two
    commands as the way to keep an installation current, in the page's own
    invocation style, and states the pack manager version that carries
    `update`.

**Compatibility stance.** Part A is a clean break: the markdown ledger is
removed, and no reader falls back to it. Part B is the compatibility mechanism
for installations, and it replaces hand migrations. Old-path removal is a
success criterion.

**Release order.** The change lands as two merges. The first carries the
library, and its release reaches installations through the gear release, the
bootstrap and `kata-agent` repins, and this repository's workflow repin. The
second carries the instructions, the pack, and the gate-pattern check. The
order holds because the old grammar rejects the new file and the old guard
refuses the old file's deletion. The new library is silent on an old ledger it
no longer names, so between an installation's pack update and its update
procedure the gate's block is the one signal, and it names the absent file.
Between the conversion and the merge of the regenerated workflows, the
installation's scheduled audit reports the new file as unknown to its older
pinned binary. Both clear with the operator's pull request. An installation
scaffolded without the Kata pack has no gate and no writer of the ledger, and
its first Kata setup runs the detections.

**Dependency.** Part B builds on the merged generate, sheet, and apply steps
that spec 2360 gave `kata-setup`.

**Cutover in this repository.** The wiki is not tracked by the repository, so
the second merge cannot carry the conversion. That merge's pull request carries
the first entry's steps in its body, and the release engineer that merges it
runs them in the same session, after the merge. Its own merge-time row lands in
the markdown ledger and the conversion carries it over. Between the two, the
gate blocks.

## Scope

| Surface                                                                                                                                                                                       | Change                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wiki/STATUS.tsv` in every wiki, this repository's included                                                                                                                                  | Rows only. Replaces `wiki/STATUS.md`.                                                                                                                                                     |
| `@forwardimpact/libwiki`: the status-row parser, the named-ledger admission, the audit's status-row scope and rules, the publish path, the publish command                                    | One grammar home with an exported sub-row fragment. The ledger admitted and loaded by its new name. The fence special cases removed. A declared-removal option, `--remove`, on publish.    |
| The repository's invariant checks                                                                                                                                                            | A check that the gate's copy of the sub-row fragment equals the library's export.                                                                                                         |
| The `gemba-wiki` skill, the CLI help, the `www.gemba.team` wiki-operations page                                                                                                               | Document the declared removal. The skill sits at its line cap, and the design names what makes room.                                                                                     |
| `kata-release-merge`: the skill throughout, the experiment path, the comment-gate, metrics, and templates references                                                                          | Read the new file. The sub-row pattern is the fragment. The roll-up rule moves to the step that writes the terminal transition.                                                           |
| Team protocol § Approval; the work-trackers reference; `kata-spec`, `kata-design`, `kata-plan`, `kata-archive`, `kata-session`, `ship-it`; the product-manager and archivist profiles        | Name the file. Show the row written. Keep the writers' rules. Drop the restated grammar. `kata-spec` stops on an absent ledger. `kata-archive` names the declared removal.               |
| `monorepo-setup`: the skill, the wiki-init and repo-skeleton references                                                                                                                      | Scaffold an empty `STATUS.tsv`, linked from the index page.                                                                                                                               |
| KATA.md § Shared Memory, § Trust Boundary, § Approval Signal; `www.kata.team` approval-gates, continuous-improvement, spec-to-shipped, findings-to-action, team-memory, getting-started; `references/CLAUDE.md` | Name the file and its shape. Document the update commands.                                                                                                                     |
| `kata-setup`: the skill, the new changelog reference, and the references that take the material the skill body gives up                                                                     | The update procedure, the fresh-setup detections, and the changelog with its first entry. The skill sits a word under its cap, and the design names what makes room.                       |
| `.claude/skills/CLAUDE.md`, `libraries/CLAUDE.md`                                                                                                                                            | The changelog obligation, and a pointer to it. The skills CLAUDE.md sits seven words under its cap, and the design names what makes room.                                                 |
| `scripts/spec-1060-migrate-wiki.mjs`                                                                                                                                                         | Deleted. A one-off migration that names the old file and has no caller.                                                                                                                   |
| The second merge's pull request                                                                                                                                                              | Carries the first entry's steps for this repository's cutover.                                                                                                                            |
| PR #2180, kata-skills#24, kata-skills#25                                                                                                                                                     | Each carries a comment that names this spec. Closing the PR is its author's call.                                                                                                         |

Out of scope: a version marker in the installation; a mechanical check that a
change carries a changelog entry; any change to row cells, to the approval
signals, or to the Active Claims table; a `gemba-wiki` command that reads the
ledger for the gate.

## Success criteria

| #   | Claim                                                                   | Verification                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | The ledger is rows only and the markdown ledger is gone.                | In this repository's wiki: `test ! -e wiki/STATUS.md` passes, and `awk -F'\t' 'NF != 3 && NF != 4 { exit 1 }' wiki/STATUS.tsv` exits 0.                                                                                                                                                                                         |
| S2  | The audit counts every line as a row.                                   | `grep -c '' wiki/STATUS.tsv` equals the `status-row` count under `checked` in `gemba-wiki audit --format json`.                                                                                                                                                                                                                 |
| S3  | The sub-row grammar is `NNNN/NN` and nothing wider.                     | `gemba-wiki audit` on a wiki whose ledger holds `1370/libutil\tplan\tapproved` reports a `status-row.id-format` finding; on `1370/02\tplan\tapproved` it reports none.                                                                                                                                                           |
| S4  | The library admits the new ledger and forgets the old.                  | `gemba-wiki audit` on a wiki whose root holds `STATUS.tsv` reports no `admission` finding for it, and `rg -n 'STATUS\.md' libraries/libwiki --glob '!CHANGELOG.md'` returns no match.                                                                                                                                            |
| S5  | No instruction or page names the old file.                              | `rg -n 'STATUS\.md' .claude KATA.md websites references/CLAUDE.md scripts libraries/CLAUDE.md --glob '!**/kata-setup/references/*changelog*'` returns no match.                                                                                                                                                                 |
| S6  | The gate's copy of the fragment cannot drift from the export.           | The repository's invariant check passes, and it fails on a scratch copy of the repository whose gate pattern in `kata-release-merge` Step 6 is edited.                                                                                                                                                                           |
| S7  | A writer never creates the ledger.                                      | On a wiki with no ledger, the `kata-spec` claim step writes nothing, stops, and names the update procedure. The transcript is attached to the second merge's pull request.                                                                                                                                       |
| S8  | An absent ledger blocks the gate.                                       | `rg -n 'absent' .claude/skills/kata-release-merge/SKILL.md` matches in Step 6, in a sentence that maps a missing file to an absent row.                                                                                                                                                                                           |
| S9  | The experiment row is unchanged.                                        | `gemba-wiki audit` on a ledger that holds `exp:1351\tapproved\t<40-hex>\t#1351` reports no finding, and the experiment path reads that row from the new file.                                                                                                                                                                    |
| S10 | The update procedure converts an installation.                          | On a rehearsal installation set up from the previous pack, with rows in its markdown ledger and one row already in a rows-only ledger, `apm update` and the update prompt regenerate the generated files, show the sheet, and leave `wiki/STATUS.tsv` with the old rows the new ledger lacked and no `wiki/STATUS.md`. The transcript is attached to the second merge's pull request. |
| S11 | The procedure is idempotent.                                            | A second run on the same installation changes no file and reports that no entry applied.                                                                                                                                                                                                                                        |
| S12 | The instruction budgets hold.                                           | `jidoka instructions` passes on the second merge.                                                                                                                                                                                                                                                                               |
| S13 | The changelog is generic.                                               | The repository's invariant check passes with the changelog in place.                                                                                                                                                                                                                                                            |
| S14 | The obligation is stated and pointed at.                                | `rg -n 'changelog' .claude/skills/CLAUDE.md libraries/CLAUDE.md` matches in both, and the skills CLAUDE.md match names the same-change requirement and the cap.                                                                                                                                                                  |
| S15 | The scaffold writes the new file.                                       | `rg -n 'STATUS\.tsv' .claude/skills/monorepo-setup` matches, and S5 covers the old name.                                                                                                                                                                                                                                         |
| S16 | The wiki's index page links the new file and not the old page.          | `rg -n 'STATUS\.tsv' wiki/Home.md` matches, and `rg -n '\]\(STATUS\)' wiki/Home.md wiki/MEMORY.md` returns no match.                                                                                                                                                                                                             |
| S17 | The page documents the update commands.                                 | The getting-started page shows `apm update` followed by the `Update my installation` prompt to `kata-setup`.                                                                                                                                                                                                                    |
| S18 | A declared removal lands and an undeclared one is refused.              | On a clone whose remote holds a file, `gemba-wiki push --remove=<path>` lands the deletion and reports it; the same deletion without the option is refused by the conservation guard.                                                                                                                                           |
| S19 | The library ships before the instructions.                              | `git merge-base --is-ancestor <commit> <instruction commit>` passes for the gear release tag that ships the library change and for this repository's `kata-agent` repin that follows it, where the instruction commit is the second merge.                                                                                        |
| S20 | A human can open the ledger from the hosted wiki.                       | `curl -fsSL -o /dev/null` on the index page's link target for the ledger exits 0 after the conversion.                                                                                                                                                                                                                          |
| S21 | The `gemba-wiki` surfaces document the option.                          | `rg -n -- '--remove' .claude/skills/gemba-wiki/SKILL.md products/gemba/test/golden/gemba-wiki/push-help.stdout.txt websites/gemba/docs/predictable-team/wiki-operations/index.md` matches in all three.                                                                                                                          |
| S22 | No instruction surface defines the id forms except the gate.            | `rg -n -e 'NNNN/' -e 'd\{4\}' -e 'a-z0-9-' .claude/agents .claude/skills --glob '!**/kata-setup/references/*changelog*'` matches only in `kata-release-merge` Step 6.                                                                                                                                                           |
| S23 | The superseded patch and the issues point here.                         | PR #2180, kata-skills#24, and kata-skills#25 each carry a comment that names this spec.                                                                                                                                                                                                                                         |

## Alternatives considered

| Alternative                                                   | Why not                                                                                                                                                                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merge PR #2180.                                               | It fixes one reader and restates the grammar twice more. The parser still accepts a wider grammar. The next reader draws the fence again. Until this spec ships, the fence-agnostic read stays live, and that interim is the PR author's call. |
| Keep `STATUS.md` with the prose removed.                      | A markdown file stays markdown to the publish path and the conflict scan, so the fence special cases stay, and the hosted wiki renders it as a page a human may edit by hand.                                         |
| A version marker in the installation.                         | A second home for state, wrong after a hand edit. A detection reads the installation itself and is right by construction.                                                                                            |
| Release notes on the pack's README.                           | The skill does not load the README. A reference inside the skill is the surface the procedure reads.                                                                                                                 |
| A `gemba-wiki` command for the gate's read.                   | On a rows-only file the whole-file read is the whole reader. A command adds surface and ties the gate to a binary release.                                                                                           |
| A mechanical check for the changelog obligation.              | The trigger set is a judgment: whether a change moves a convention an installation carries. A path-keyed check misses most such changes and flags others. Revisit when entries accumulate.                           |
