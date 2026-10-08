# Spec 2400: Setup creates every surface the packs read, and the packs name only those surfaces

**Classification:** product. It lands on the kata, gemba, and jidoka packs, on
`@forwardimpact/libwiki` behind `gemba-wiki`, on the `gemba-bootstrap` action,
and on the `www.kata.team` and `www.gemba.team` pages
([team protocol § Classify Every Finding](../../.claude/agents/x-team-protocol.md#classify-every-finding)).
It retires the fourth pack.

**Persona and job:** Teams Using Agents. The primary job is Kata's
[Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team),
whose Little Hire is "onboard a Kata installation that runs the
Plan-Do-Study-Act loop without per-team prompt engineering". The wiki and
bootstrap changes serve Gemba's
[Stand Up and Operate an Agent Team](../../JTBD.md#teams-using-agents-stand-up-and-operate-an-agent-team).
The check-home change serves Jidoka's
[Build Quality Into Agent Instructions](../../JTBD.md#teams-using-agents-build-quality-into-agent-instructions).

## Problem

The packs assume surfaces that exist in this repository and that no setup skill
creates. The three left columns of the table verify on disk, and every row
recurs in a fresh installation. The right column is the operator's reading of
one field installation's private tracker. It illustrates the rows. It is not the
evidence the proposal rests on.

### The packs name surfaces the setup never creates

| Surface the packs assume                           | Who creates it in an installation                                                           | What reads it                                                                                                                                                                                                                   | Field effect                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `KATA.md`                                          | Nobody. No pack ships it.                                                                   | 14 metrics references, 14 skills, and 2 further references cite it. Its § Metrics holds the CSV path and the run field, both of which `record` applies itself. The "recording-eligibility rule" the skills cite exists nowhere. | 30 pack files cite a file that exists nowhere.                              |
| `websites/<site>/…`                                | Nobody.                                                                                     | The documentation skill draws 8 of 10 review topics from it and builds it with `fit-doc`.                                                                                                                                       | The rotation pool is empty. Its freshness metric reads zero of zero.        |
| `wiki/<agent>.md` summaries                        | Nobody.                                                                                     | `memo` delivery, log retirement, the coverage maps, the boot digest. The roster also lists the reference files, so a broadcast reads `wiki/x-*.md`.                                                                             | Most agents cannot receive a memo. A missing summary passes retirement.     |
| The approval ledger                                | The retiring skill's prose.                                                                 | The merge gate, every phase skill, the audit.                                                                                                                                                                                   | No spec could reach `spec approved` on the first day.                       |
| `wiki/MEMORY.md`                                   | The retiring skill's prose.                                                                 | Boot, claims, priorities.                                                                                                                                                                                                       | `init` skips its Active Claims scaffold when the file is absent, at exit 0. |
| `product` and `internal` labels                    | Nobody.                                                                                     | The merge gate's classification step, the product-mix metric, every phase PR.                                                                                                                                                   | The metric emitted no row. Labels arrived as backfill only.                 |
| The other labels                                   | Nobody.                                                                                     | `obstacle`, `experiment`, `triaged`, `retention`, `wontfix`, `needs-spec`, `agent:<name>`, `<phase>:approved`.                                                                                                                  | Routing and approval labels are typed by hand per installation.             |
| GitHub Discussions                                 | Nobody.                                                                                     | The team protocol routes every Unsettled finding there.                                                                                                                                                                         | Discussions were off. Agents filed labeled issues as a fallback.            |
| A storyboard section per agent                     | Nobody. Participants seed metric blocks, and the audit checks a literal list of five names. | `storyboard.agent-h3-required`.                                                                                                                                                                                                 | Two participants' sections were missing and the audit passed.               |
| `wiki/.gitattributes`, `wiki/secret-overrides.log` | The library itself.                                                                         | The admission grammar rejects every non-markdown root name.                                                                                                                                                                     | The audit told the agent to rename the file that makes CSV appends safe.    |
| `wiki/metrics/<skill>/`                            | `init`, for `kata-*` skills only.                                                           | Nothing. Git publishes no empty directory, and `record` creates the directory it writes.                                                                                                                                        | The seeding is dead work with a tenant filter.                              |
| `scripts/bootstrap.sh`                             | The retiring skill's prose.                                                                 | The `gemba-bootstrap` action runs it with no guard.                                                                                                                                                                             | Every agent run died with exit 127 until a human added the file.            |
| Local session hooks                                | The retiring skill's prose.                                                                 | Two phase skills and the merge gate say "the Stop hook pushes" the wiki.                                                                                                                                                        | No pack surface wires the hooks after the retirement.                       |
| Agent profiles under `.claude/agents/`             | The pack install, confirmed by the retiring skill's prose.                                  | The roster of every wiki command.                                                                                                                                                                                               | A bare install can drop the profiles, and no command then notices.          |
| The root instruction layers                        | `jidoka-setup`, ordered before `kata-setup` by the retiring skill's prose.                  | Every pack skill.                                                                                                                                                                                                               | Nothing names the order after the retirement.                               |

The genericity contract is the root. The skills CLAUDE.md names `KATA.md` and
`websites/` among "the surfaces every installation carries" and prescribes
`websites/<site>` as a placeholder form. Among `websites/` paths, the genericity
invariant rejects this repository's site names and nothing else. Both files are
this repository's own. The contract let every citation above pass review.

### Setup is split across three skills, and one is retiring

| Seam                                                                                     | Home today                          | Problem                                                                                                            |
| ---------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Wiki scaffold, `.gitignore`, session hooks, bootstrap script, profile check, skill order | `monorepo-setup` prose              | The skill is retiring. `kata-setup` writes workflows and the Dependabot config only. It seeds nothing in the wiki. |
| Check command home and check CI workflow                                                 | `monorepo-setup` and `jidoka-setup` | The retiring skill writes the manifest and the workflow that `jidoka-setup` wires the check into.                  |
| Directory tree, remote creation, runbook, killswitch pre-engagement                      | `monorepo-setup`                    | None is a precondition of either pack. The tree is this repository's shape.                                        |

The three-skill split is also the reason `monorepo-skills` exists as a pack. It
carries one skill. The Monorepo Structure Standard stays a document. Its
directory shape is not a pack precondition.

## Proposal

The principle has two halves. The two setup skills create every surface a pack
reads, or confirm that the pack install placed it. A pack names a surface only
when a setup skill creates or confirms it, or when the pack's own first write
creates it (`specs/`).

### A: The guaranteed surfaces are the ones setup creates

1. The guaranteed-surface list in the skills CLAUDE.md holds `CLAUDE.md`,
   `CONTRIBUTING.md`, `JTBD.md`, `specs/`, and `wiki/`. It is the set a relative
   link in a pack may target. `KATA.md`, `websites/`, and the `websites/<site>`
   placeholder leave the contract. The genericity invariant rejects `KATA.md`
   and any `websites/` path in a `kata-*` skill or agent reference.
2. The metrics recording rule lives with the tool that records. A metrics
   reference says to record with `gemba-xmr record`, at the cadence the
   reference already states. No pack file cites `KATA.md`.
3. The documentation skill draws its topic pool from the surfaces the repository
   has. The root instruction layers are always present. Every other topic joins
   the pool when its surface exists: READMEs, further root markdown, a docs
   directory. The skill runs the repository's check command, and a site build is
   the repository's own concern. The skill and its references name kinds of
   source and kinds of page, not this repository's products, sites, or paths.

### B: The library scaffolds the wiki

4. The library scaffolds every absent named ledger it defines (the index page,
   the memory ledger, the approval ledger) and one absent summary per agent on
   the roster, in one operation that setup runs. It creates absent files and
   appends the absent blocks it owns. It never changes a line it did not write,
   and a second run writes nothing. Each written file passes the audit as
   written and can receive a memo.
5. The library seeds no metrics directory. `record` creates the directory it
   writes.
6. The agent roster is the set of profiles the runtime loads from
   `.claude/agents/`. Reference files are not on it. One roster serves the
   scaffold, `memo`, the storyboard skeleton that `refresh` writes, and the
   storyboard audit rule. The literal name list goes, and with it the
   facilitator's exemption: every profile has a section on every board. The
   skeleton seeds the sections, and a seeded section with no metric block is
   valid. An empty roster requires no section, and the audit says so.
7. The admission grammar admits every file name the library writes.

### C: `kata-setup` provisions the installation it generates

8. Setup requires the root instruction layers and names `jidoka-setup` as the
   way to get them. It turns on the repository features the packs use: the wiki
   and Discussions. It creates the label vocabulary the packs rely on, listed in
   its own reference. It adds the wiki checkout to `.gitignore`. It wires the
   session-start, worktree-creation, and stop hooks that put the toolchain on
   the path and keep the wiki cloned, pulled, and pushed, with the bootstrap
   script run when present. It confirms every agent on its sheet has a profile
   installed where the runtime loads it. It leaves the wiki scaffold and the
   current board on the wiki remote, and never an empty ledger beside an
   unconverted one. Each item is a sheet row, and a second run proposes no
   change. When the repository has no remote, setup lists each wiki item as
   pending in its report, as it lists missing credentials today. When a remote
   exists and the wiki git repository does not, setup stops at that item and
   tells the operator to create the first page, titled `Home`.
9. The `gemba-bootstrap` action runs `scripts/bootstrap.sh` only when the file
   exists. The action's documentation and MONOREPO.md name the script as the
   optional home of the repository's own install command, run by CI and by the
   session hook alike. A repository without it installs nothing in CI.
10. `jidoka-setup` writes the manifest of the repository's package manager when
    the repository has none, with the check task in it, and writes the workflow
    that runs the check task when none does, with its action pins kept current.
    Today the manifest is npm's, the only ecosystem the skill names. The
    directory tree, remote creation, the runbook, and the killswitch
    pre-engagement retire with `monorepo-setup`. Setup settles credentials
    before it writes a workflow, and its report names the killswitch as the way
    to keep the schedule silent until they exist.
11. `monorepo-setup` and the `monorepo-skills` pack retire. Archiving the
    sibling repository is a post-merge step.

## Scope

| In                                                                                                                                                                                                                             | Out                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kata-setup`, `jidoka-setup`, `kata-documentation`, every `kata-*` skill and reference that cites `KATA.md`, the `kata-session` storyboard references                                                                          | The default read slice (`kata-shift`) and the record/read contract, including the `gemba-xmr` skill and the pages that describe `record`. Spec 2370 owns them.               |
| `gemba-wiki init`, `memo`, `refresh`, the scaffold operation, the audit's storyboard and admission rules, the `gemba-wiki` skill and library README, and the profile test the publisher, the invariants, and the library share | The approval ledger's shape and name. Spec 2390 owns them. The scaffold seeds the file the library names.                                                                    |
| The `gemba-bootstrap` action's bootstrap step, its README, and the `kata-agent` action comment that describes it; MONOREPO.md                                                                                                  | Shared-checkout isolation in facilitated sessions. Spec 2380 owns it.                                                                                                        |
| The skills CLAUDE.md; the genericity, skill-template, and instruction-scripts invariants, their allowlist, and their test fixtures; the publish matrix and its path trigger                                                    | The bionova-apps record under `references/`. It is a historical record and keeps its text.                                                                                   |
| The `www.kata.team` getting-started page; the `www.gemba.team` overview, predictable-team, wiki-operations, and wiki-integrity pages                                                                                           | APM's own target layout and lockfile behaviour, including its `apm_modules/` tree. The tree-keyed coverage areas of the security-audit skill, a follow-up of the same class. |

## Compatibility

Clean break. `monorepo-setup`, its references, and its pack entry go. The
library's per-skill metrics seeding, its option, and its Active Claims append go
into the scaffold. The literal storyboard roster and the facilitator's exemption
go. Every `KATA.md` citation and every `websites/` path in a `kata-*` skill
goes. The check CI template's one-workflow-per-concern rule goes with the
retiring skill; the check workflow is one file. MONOREPO.md's mandatory
bootstrap script becomes optional. An installation's current board gains its
missing sections through the setup update procedure of spec 2390.

## Success criteria

| #   | Claim                                                                              | Verification                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | No published pack file cites `KATA.md`.                                            | `rg -l 'KATA\.md' .claude/skills/kata-* .claude/skills/gemba* .claude/skills/jidoka-* .claude/agents` returns nothing.                                                                                                                                                                                                                                                                                                                    |
| S2  | The documentation skill names none of this repository's sites, products, or paths. | `rg -l 'websites/' .claude/skills/kata-* .claude/skills/CLAUDE.md` returns nothing, and `rg -n -i -e libdoc -e fit-map -e 'levels\.yaml' -e 'contributors/' -e 'products/\{' -e 'data/pathway' -e 'docs\(website\)' .claude/skills/kata-documentation` returns nothing.                                                                                                                                                                   |
| S3  | The genericity contract names five surfaces, and the invariant enforces it.        | The skills CLAUDE.md list reads `CLAUDE.md`, `CONTRIBUTING.md`, `JTBD.md`, `specs/`, `wiki/`, and a planted `KATA.md` name and a planted `websites/docs` path, once in a `kata-*` skill and once in an agent reference, each fail the repository's invariants command.                                                                                                                                                                    |
| S4  | The scaffold yields a wiki that passes the audit.                                  | On a wiki clone that holds only the first page GitHub created, the scaffold operation, `gemba-wiki refresh`, and `gemba-wiki push`, then `gemba-wiki audit`, exit 0, with the three ledgers, the current month's storyboard, and one summary per profile in `wiki/`.                                                                                                                                                                      |
| S5  | The scaffold writes only what is absent.                                           | A second scaffold run on the result of S4 reports nothing written, and `git -C wiki status --porcelain` is byte-identical before and after it.                                                                                                                                                                                                                                                                                            |
| S6  | The library seeds no metrics directory.                                            | After S4, `test ! -e wiki/metrics` passes, and `rg -n 'skills-dir' libraries/libwiki/src libraries/libwiki/README.md .claude/skills/gemba-wiki products/gemba/test/golden` returns nothing.                                                                                                                                                                                                                                               |
| S7  | The storyboard audit derives its roster from the profiles.                         | A storyboard missing the H3 of any profile fails the audit, a reference file under `.claude/agents/` adds no requirement, and `rg -n -e '"product-manager"' -e '"release-engineer"' -e '"security-engineer"' -e '"staff-engineer"' -e '"technical-writer"' libraries/libwiki/src/audit` returns nothing.                                                                                                                                  |
| S8  | A broadcast memo reaches every other profile.                                      | After S4, `gemba-wiki memo --from <a> --to all --message m` exits 0 and every summary except the sender's carries the memo.                                                                                                                                                                                                                                                                                                               |
| S9  | Setup provisions features, labels, ignores, hooks, and the scaffold.               | On a repository with the wiki and Discussions off and none of the vocabulary labels, `kata-setup`, rerun once after the operator creates the first page, leaves both on (`gh repo view --json hasWikiEnabled,hasDiscussionsEnabled`), every vocabulary label present (`gh label list`), `wiki/` in `.gitignore`, the session-start, worktree-creation, and stop hooks in `.claude/settings.json`, and the S4 file set on the wiki remote. |
| S10 | Setup is idempotent on provisioning.                                               | A second `kata-setup` run on the result of S9 shows the same sheet and proposes no change.                                                                                                                                                                                                                                                                                                                                                |
| S11 | The bootstrap script is optional.                                                  | The `gemba-bootstrap` action's bootstrap step carries a presence condition on the script, `rg -n 'mandatory' MONOREPO.md` returns nothing, and `rg -n -i 'optional' products/gemba/actions/gemba-bootstrap/README.md` matches a line about the script.                                                                                                                                                                                    |
| S12 | The documentation pool follows the repository.                                     | The documentation skill's topic table names, for every topic, the surface whose presence admits it, and the site topics' surface is a docs directory that this repository's own sites satisfy.                                                                                                                                                                                                                                            |
| S13 | `jidoka-setup` creates the check command's homes.                                  | On a repository with no manifest and no workflows, after `jidoka-setup` the manifest's check task runs `jidoka` from a clean checkout, and one workflow under `.github/workflows/` runs that task on push and pull request with SHA-pinned actions.                                                                                                                                                                                       |
| S14 | `monorepo-setup` and its pack are gone from this repository.                       | `test ! -e .claude/skills/monorepo-setup` passes, and `rg --hidden -e 'monorepo-setup' -e 'monorepo-skills' -e 'monorepo-\*' --glob '!specs/**' --glob '!references/**' --glob '!.git/**' --glob '!.claude/worktrees/**' --glob '!**/CHANGELOG.md'` returns nothing.                                                                                                                                                                      |
| S15 | The instruction layers stay within their caps.                                     | `jidoka` passes.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| S16 | An installation's board gains its missing sections through the update path.        | The setup changelog carries one entry whose detection is a board that lacks a profile's section and whose action appends it.                                                                                                                                                                                                                                                                                                              |
| S17 | The pages describe the scaffold's owner and drop the seeding.                      | `rg -l 'npx gemba-wiki init' websites/kata` returns nothing, `rg -n 'pre-creates' websites/gemba` returns nothing, and `rg -n 'creates a metrics directory' websites/gemba/index.md` returns nothing.                                                                                                                                                                                                                                     |
| S18 | Post-merge: this repository's wiki and the sibling repository follow.              | After the release engineer runs the scaffold and the board-sections entry on this wiki, `gemba-wiki audit --format json` reports no `storyboard.agent-h3-required` finding, and `gh repo view forwardimpact/monorepo-skills --json isArchived` reads true.                                                                                                                                                                                |

## Relation to open specs

| Spec  | Relation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2390  | Both of its merges land first, as designed, with its scaffold in the wiki-init reference of `monorepo-setup`. This spec then deletes that reference, which makes 2390's S15 moot, and re-homes the scaffold to the library as its own change. Design 2390-a's ledger-creation rule holds: the scaffold and the first changelog entry stay the only creators. On an installation only setup runs the scaffold; this repository's cutover runs it by hand once. Provisioning runs on every setup run, the update included, so labels, hooks, and summaries reach an existing installation without an entry. This spec adds one entry, for the board sections. |
| 2370  | Its scope excludes the `kata-*` metrics-directory rule. Item 5 removes that rule. The `gemba-xmr` skill is 2370's. Both specs edit the gemba pages, the `gemba-wiki` skill, and the `kata-session` storyboard references. The later merge rebases.                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2380  | Independent. Both specs edit the `kata-session` references, the `gemba-wiki` skill, the library README, and the wiki-operations page. The later merge rebases.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| #2202 | The issue reports `monorepo-setup` running the `kata-setup` interview before a remote exists and asks for a no-remote rule. Items 8 and 11 close it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
