# Spec 0780 — Wiki lifecycle commands: refresh, init, push, pull

## Problem

The Kata agent system's wiki operations are split across three bespoke shell
scripts (`wiki-sync.sh`, `wiki-audit.sh`, `bootstrap.sh`), a justfile, a
composite GitHub Action (`bootstrap/action.yml`), and manual facilitator
work — none of which are portable to downstream Kata installations. Three
specific pain points:

**Storyboard XmR charts are manually pasted.** The facilitator runs
`bunx fit-xmr chart <csv> --metric <name>` for each metric, copies the 14-line
ASCII output, and pastes it into a fenced code block inside the storyboard
markdown. Across 6 storyboard traces (Apr 17 -- May 2 2026), the facilitator
runs 6-12 `fit-xmr analyze` calls and 0-6 `fit-xmr chart` calls per session
(see [`../770-agent-tooling-memo-metric/grounded-analysis.md`](../770-agent-tooling-memo-metric/grounded-analysis.md)). This paste-and-format work costs 10-20 turns per session and
is error-prone: the facilitator must also write the `**Latest:**`,
`**Status:**`, and `**Signals:**` lines by hand, reconciling JSON output with
markdown formatting.

**Wiki clone/push/pull is shell-script plumbing.** `scripts/wiki-sync.sh`
handles git credential injection, clone-if-missing, rebase-on-pull,
commit-and-push. The justfile exposes `wiki-pull` and `wiki-push` as thin
wrappers. The bootstrap GitHub Action pre-checks out the wiki and registers a
post-run step to push. This plumbing works but is not distributable: downstream
Kata installations must recreate it from scratch because the scripts assume the
monorepo's directory layout, token variables, and justfile recipes.

**No portable initialization.** Setting up a wiki for a new Kata installation
requires manually cloning the `.wiki.git` repo, creating the directory
structure (`wiki/metrics/<skill>/`), and wiring hooks. There is no single
command that bootstraps a working wiki directory.

## Goal

Expand the `fit-wiki` CLI (introduced in spec 0770 as `libwiki`) with three
subcommands — `refresh`, `init`, and `push`/`pull` — that make wiki lifecycle
operations portable across Kata installations. After this spec, a downstream
installation can `npx fit-wiki init`, have agents use `npx fit-wiki push/pull`
in hooks, and run `npx fit-wiki refresh` to keep storyboard charts current —
without copying shell scripts or composite actions.

## Scope (in)

### 1. `fit-wiki refresh` — templated XmR storyboard updates

A subcommand that scans a storyboard markdown file for HTML comment markers,
regenerates the XmR chart and metadata for each marked metric block, and
writes the updated content back to the file.

- **Marker format.** Each metric block in the storyboard is bracketed by a
  pair of HTML comments that name the metric and CSV path:
  `<!-- xmr:<metric_name>:wiki/metrics/<skill>/<YYYY>.csv -->` before the
  block and `<!-- /xmr -->` after. Everything between the markers is
  regenerated on refresh.
- **Generated content.** For each marker pair, `fit-wiki refresh` produces:
  the `**Latest:** {value} · **Status:** {status}` line, the fenced XmR
  chart, and the `**Signals:**` line. The `#### {metric_name}` heading is
  outside the markers and is not regenerated.
- **Dependency on libxmr.** `libwiki` gains `@forwardimpact/libxmr` as a
  dependency. `fit-wiki refresh` uses libxmr to produce XmR analysis and
  chart output for each marked metric.
- **Storyboard template migration.** The storyboard template
  (`storyboard-template.md`) gains `<!-- xmr:... -->` / `<!-- /xmr -->`
  marker pairs around the example metric block so new storyboards are
  refresh-ready from creation.
- **Existing storyboard migration.** `wiki/storyboard-2026-M05.md` is updated
  with markers around each existing metric block. Past storyboards
  (`storyboard-2026-M04.md`) are left as-is (historical records).
- **Idempotent.** Running `fit-wiki refresh` twice produces the same output.
  Running it on a storyboard with no markers is a no-op.

### 2. `fit-wiki init` — wiki bootstrap

A subcommand that sets up a working wiki directory for a Kata installation.

- **Clone.** Clones the repository's wiki into `./wiki/` if the directory does
  not already exist or is not a git repository. Authenticates using ambient
  GitHub credentials (`GITHUB_TOKEN` or `GH_TOKEN`).
- **Directory creation.** Creates `wiki/metrics/<skill>/` directories for each
  skill in the installation.
- **Identity.** Commits in the wiki repo are attributed to the same identity
  as the parent repository.
- **Idempotent.** Running `init` on an already-initialized wiki is a no-op
  for each step that has already completed.

### 3. `fit-wiki push` and `fit-wiki pull` — wiki sync

Subcommands that replace `scripts/wiki-sync.sh` with portable equivalents
distributed via npm.

- **`fit-wiki pull`** — Incorporates remote changes into the local wiki. Exits
  non-zero with a diagnostic message on conflict.
- **`fit-wiki push`** — Commits local changes and syncs to remote, resolving
  conflicts in favor of local state. No-op when there are no local changes.
- **Credential handling.** Authenticates using ambient GitHub credentials
  (`GITHUB_TOKEN` or `GH_TOKEN`). No tokens written to `.git/config`.
- **Hook compatibility.** `fit-wiki push` and `fit-wiki pull` are designed to
  be used in Claude Code hooks (`SessionStart` → `npx fit-wiki pull`,
  `Stop` → `npx fit-wiki push`) and in GitHub Actions post-run steps.

### 4. Protocol and template updates

- **`storyboard-template.md`** — Add `<!-- xmr:... -->` / `<!-- /xmr -->`
  markers around the example metric block in the Current Condition section.
- **`team-storyboard.md`** — Update the "Storyboard updates" section to
  reference `fit-wiki refresh` as the preferred method for updating Current
  Condition charts. The manual paste workflow remains documented as a
  fallback.
- **`kata-session/SKILL.md`** — Update any facilitator checklist steps that
  currently instruct running `bunx fit-xmr chart` manually to reference
  `fit-wiki refresh` instead.
- **justfile** — `wiki-pull` and `wiki-push` recipes switch from
  `bash scripts/wiki-sync.sh` to `bunx fit-wiki pull` / `bunx fit-wiki push`.

## Scope (out)

- The `fit-wiki memo` subcommand (delivered in spec 0770).
- The `fit-xmr record` command (delivered in spec 0770).
- Changes to the XmR statistical engine, chart rendering, or signal detection
  in libxmr. `fit-wiki refresh` consumes libxmr's public API as-is.
- Deletion of `scripts/wiki-sync.sh` or `scripts/wiki-audit.sh`. The sync
  script is superseded by `fit-wiki push/pull`; the audit script may become
  `fit-wiki audit` in a future spec. Both remain in the repo.
- Changes to the GitHub Actions bootstrap composite action
  (`bootstrap/action.yml`). The action continues to call `just wiki-push`;
  the justfile recipe is what changes underneath.
- Storyboard creation or planning logic. `fit-wiki refresh` updates existing
  metric blocks; it does not create new storyboards or decide which metrics
  to include.
- Changes to the Challenge, Target Condition, Obstacles, or Experiments
  sections of the storyboard. Only the Current Condition metric blocks are
  affected.

## Success criteria

| # | Claim | Verification |
|---|-------|--------------|
| 1 | `fit-wiki refresh <storyboard.md>` regenerates every `<!-- xmr:... -->` block with current XmR chart, latest value, status, and signals from the referenced CSV. | Insert a marker pair referencing a known CSV with >=15 data points; run refresh; the block between markers contains an XmR chart, correct latest value, and correct status matching `bunx fit-xmr analyze` output for that metric. |
| 2 | `fit-wiki refresh` is idempotent. | Run refresh twice on the same storyboard; `diff` between the two outputs is empty (assuming no CSV changes between runs). |
| 3 | `fit-wiki refresh` is a no-op on files with no `<!-- xmr:... -->` markers. | Run refresh on a storyboard with no markers; file is unchanged (`git diff` is empty). |
| 4 | `fit-wiki init` clones the wiki repo into `./wiki/` and creates metrics directories. | Run init in a directory with no `wiki/`; afterward `git -C wiki rev-parse --git-dir` succeeds and `wiki/metrics/` exists. |
| 5 | `fit-wiki init` is idempotent. | Run init twice; second run produces no errors and no filesystem changes. |
| 6 | `fit-wiki push` commits and pushes local wiki changes. | Make a local change to a wiki file; run push; `git -C wiki log -1 --oneline` shows the new commit and `git -C wiki diff origin/master` is empty. |
| 7 | `fit-wiki push` is a no-op when no changes exist. | Run push with no local changes; exit code 0, no new commit created. |
| 8 | `fit-wiki pull` fetches and rebases local state onto remote. | Push a change from another clone; run pull in the first clone; the change appears in the local working tree. |
| 9 | `storyboard-template.md` contains `<!-- xmr:... -->` / `<!-- /xmr -->` marker pairs around the example metric block. | `grep -c 'xmr:' .claude/skills/kata-session/references/storyboard-template.md` returns >=1. |
| 10 | `team-storyboard.md` references `fit-wiki refresh` for chart updates. | Static inspection; the Storyboard updates section mentions `fit-wiki refresh`. |
| 11 | justfile `wiki-pull` and `wiki-push` recipes call `bunx fit-wiki` instead of `bash scripts/wiki-sync.sh`. | Static inspection of the justfile. |
| 12 | `libwiki` depends on `@forwardimpact/libxmr` in `package.json`. | `jq '.dependencies["@forwardimpact/libxmr"]' libraries/libwiki/package.json` returns a version string. |

## Notes

### Relationship to spec 0770

This spec extends the `libwiki` package and `fit-wiki` CLI introduced in spec
770. Spec 0770 delivers the package scaffold, `fit-wiki memo`, `fit-xmr
record`, and the per-skill flat metrics directory structure
(`wiki/metrics/<skill>/<YYYY>.csv`). This spec adds `refresh`, `init`, `push`,
and `pull`.

**Ordering constraint:** `fit-wiki refresh` markers reference the flat
`wiki/metrics/<skill>/<YYYY>.csv` paths introduced by spec 0770's migration.
Spec 0770's package scaffold and metrics migration must land before the
`refresh` marker migration runs. The `init`, `push`, and `pull` subcommands
have no dependency on spec 0770 and can be implemented independently.

### Marker format rationale

The `<!-- xmr:metric:path -->` / `<!-- /xmr -->` pattern mirrors how static
site generators handle auto-generated sections (e.g., Hugo shortcodes,
Jekyll includes). HTML comments are invisible in GitHub's markdown renderer,
so the storyboard reads identically with or without markers. The closing
`<!-- /xmr -->` tag makes the block boundaries unambiguous for the parser —
no need to guess where the chart ends by counting code fences.

### Portability model

After specs 0770 and 0780, a downstream Kata installation's wiki lifecycle is:

```sh
npx fit-wiki init                                                              # clone wiki, create directories
npx fit-wiki memo --from se --to all --message "..."                           # record cross-team observations
npx fit-xmr record --skill kata-spec --metric findings --value 0               # record a metric
npx fit-wiki refresh wiki/storyboard.md                                        # regenerate XmR charts
npx fit-wiki push                                                              # commit and sync
```

No shell scripts, no justfile, no composite actions. The entire workflow is
npm-distributable.

### Current shell script coverage

| Operation | Current implementation | Spec 0780 replacement |
|-----------|----------------------|---------------------|
| Clone wiki | `wiki-sync.sh` + `bootstrap/action.yml` | `fit-wiki init` |
| Pull | `wiki-sync.sh pull` → `just wiki-pull` | `fit-wiki pull` |
| Push | `wiki-sync.sh push` → `just wiki-push` | `fit-wiki push` |
| Audit | `wiki-audit.sh` → `just wiki-audit` | _(out of scope)_ |
| XmR charts | Manual paste by facilitator | `fit-wiki refresh` |
