# Spec 0510 — Worktree-Based Agent Isolation

## Problem

Kata agents mutate the shared working tree when they create feature branches.
Every `git checkout -b` changes the `HEAD` of the single working directory — if
two agents run on the same filesystem, one agent's branch switch invalidates the
other's file state. The system works today only because agents are scheduled
sequentially (04:07–08:43 UTC), and each workflow uses a concurrency group that
cancels overlapping runs. This is a scheduling workaround, not isolation.

### Evidence

**Sequential scheduling is load-bearing.** The five individual agent workflows
are staggered across a 4.5-hour window to avoid overlap. The daily meeting
workflow runs at 03:00 UTC (before all individuals) because it facilitates all
five agents simultaneously. These scheduling constraints exist solely because
agents share a working tree.

**Branch mutations span 8 skills and 5 agent profiles.** Branch operations
(`git checkout -b`, `git checkout <branch>`, `git rebase`) appear in:

| Location                             | Operation                                                        |
| ------------------------------------ | ---------------------------------------------------------------- |
| `kata-ship/SKILL.md:73`              | Guard: `git branch --show-current`                               |
| `kata-release-readiness/SKILL.md:73` | `git checkout <pr-branch>` per PR                                |
| `kata-security-update/SKILL.md:108`  | `git checkout -b fix/dependabot-N`                               |
| `kata-product-issue/SKILL.md:107`    | Hand-off to `fix/` branch                                        |
| `staff-engineer.md:50,54,58`         | "push on existing `spec/` branch", "implement on `feat/` branch" |
| `security-engineer.md:50–52`         | `fix/` and `spec/` branches from `main`                          |
| `product-manager.md:49`              | "trivial fix — `fix/` branch"                                    |
| `technical-writer.md:52–54`          | `fix/` and `spec/` branches from `main`                          |

**Release readiness is the worst case.** The release engineer iterates over
every open PR, checking out each branch in the main working tree to rebase it.
If the agent crashes mid-rebase of PR #3, the working tree is left on PR #3's
branch in a dirty rebase state. The next agent run must detect and recover from
this stale state.

**`bootstrap.sh` carries defensive logic for stale branches.** Lines 13–27
detect whether the working tree is on `main` or a feature branch and handle each
case differently. This complexity exists because a prior agent run may have left
the tree on a non-main branch — a failure mode that should not be possible.

**Facilitated meetings cannot do branch work.** During the daily storyboard
meeting, five agents share the same filesystem via the `facilitate` mode. They
currently only read wiki files and share observations. If the meeting or
coaching sessions ever need to produce fix PRs or specs with branch work, the
shared filesystem blocks it.

## Proposal

Replace in-place branch switching with git worktrees. Every branch operation
creates an isolated worktree directory — a separate working tree with its own
`HEAD` backed by the same `.git/objects` store. The main working tree stays on
`main` permanently.

### Worktree isolation

Each skill that currently runs `git checkout -b <branch>` or
`git checkout <branch>` instead creates a worktree for that branch in a
dedicated directory. The agent works inside the worktree, ships the work, then
removes the worktree. The main working tree is never mutated.

### Shared worktree lifecycle

A new utility skill (`kata-worktree`) encapsulates worktree creation,
bootstrapping, and cleanup. Skills that need branch isolation reference this
shared procedure rather than each implementing their own git worktree commands.

### Bootstrap simplification

With the main working tree always on `main`, `bootstrap.sh` no longer needs
feature-branch detection and rebase logic. It adds `git worktree prune` to clean
up stale worktrees from crashed prior runs.

## Scope

### Affected

- **New skill:** `kata-worktree` — worktree lifecycle procedures and scripts
- **Skills with branch operations:** `kata-ship`, `kata-implement`,
  `kata-release-readiness`, `kata-security-update`, `kata-product-issue`
- **Agent profiles with branch instructions:** `staff-engineer.md`,
  `security-engineer.md`, `product-manager.md`, `technical-writer.md`,
  `release-engineer.md`
- **Infrastructure:** `scripts/bootstrap.sh`, root `justfile`
- **Documentation:** `KATA.md`, `CONTRIBUTING.md`

### Excluded

- **Branch naming conventions** — `feat/`, `fix/`, `spec/` prefixes are
  unchanged. Worktrees change where work happens, not how branches are named.
- **Merge strategy** — squash-merge to `main` is unchanged.
- **Study-phase skills** — `kata-trace`, `kata-storyboard`, `kata-metrics`,
  `kata-review`, `kata-wiki-curate` never create branches and need no changes.
- **CI workflow files** — workflows still check out `main` and run bootstrap;
  agents create worktrees at runtime. No workflow YAML changes.
- **Release engineer direct-to-main** — pushing trivial CI fixes to `main` is
  inherently non-conflicting and needs no worktree.
- **Wiki management** — `wiki/` is a separate git clone, not part of the main
  repo's worktree mechanism.
- **Concurrent scheduling** — enabling overlapping agent schedules is a
  follow-up concern. This spec makes it possible; a future spec can make it
  happen.

## Dependencies

None. All affected files are current on `main`. The spec does not depend on
pending specs 0260 or 0480.

## Success Criteria

1. No skill or agent profile contains `git checkout -b` or `git checkout`
   commands for branch switching (sparse file extraction via
   `git checkout <ref> -- <path>` is excluded from this criterion).
2. `kata-worktree` skill exists with documented procedures for create,
   bootstrap, and cleanup.
3. `kata-ship` guards against shipping from the main worktree (not just from the
   `main` branch) and cleans up the worktree after merge.
4. `kata-release-readiness` processes each PR in its own worktree without
   mutating the main working tree.
5. `scripts/bootstrap.sh` no longer contains feature-branch detection or rebase
   logic; it runs `git worktree prune` to clean stale worktrees.
6. `git worktree list` shows only the main worktree after any agent completes a
   full run (no orphaned worktrees).
7. `bun run check` and `bun run test` pass.
