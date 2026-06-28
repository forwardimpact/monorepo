# Plan 2090-b, Part 01: The tracker matrix reference

Create `.claude/agents/references/work-trackers.md` — the single home for the
work-item model and every tracker command. This part has no dependencies and is
the citation target for Parts 02, 03, and 05. Conventions and the scope boundary
are in [plan-b.md](plan-b.md).

Libraries used: none.

## Step 1 — Skeleton, model, and selection rule

Intent: stand up the file with the work-item model and how a tracker is chosen.

Files: create `.claude/agents/references/work-trackers.md`.

Change: front-matter (`# Work Trackers`) and an intro stating the file is the
only place tracker-specific commands appear; agents read the active column from
`$LIBEVAL_WORK_TRACKER` (default `github`) and never branch on it elsewhere.
Then the envelope table (carried as YAML front-matter on each item):

| Field | Meaning | github | filesystem |
| --- | --- | --- | --- |
| `id` | stable identity | issue/PR number + URL | caller-supplied slug; the file path is the id |
| `kind` | issue or change | issue or pull request | file under `issues/` or `changes/` |
| `state` | lifecycle: open, closed, or merged | issue/PR state | front-matter value |
| `labels` | classification, including `agent:*` | issue/PR labels | front-matter list |
| `links` | related work-item ids | issue references | front-matter list |
| `discussion` | comment thread | native issue/PR thread | appended `## Comments` section |
| `approval` | change-only trusted gate | PR label or review by a trusted human | front-matter value |

Then the selection rule: one input, `LIBEVAL_WORK_TRACKER`, default `github`;
set by the harness (`--work-tracker`), documented here, read by the agent to
pick the column.

Verification: file exists; contains the envelope table and the selection rule.

## Step 2 — Abstract operation vocabulary

Intent: enumerate the fixed operation set every tracker realizes.

Files: modify `work-trackers.md`.

Change: a list defining `create-issue`, `list`, `read`, `comment`, `label`,
`link`, `open-change`, `update-change`, `gate`, `merge-change`, `close`,
`create-discussion`, `comment-discussion`. State that `triage` (label + comment

+ close) and `patch` (open-change + merge-change) are compositions, not
operations. One line each on intent, so a skill citing the name needs no other
doc.

Verification: every operation Parts 02/03 cite (per plan-b.md § Operation
vocabulary) is present.

## Step 3 — The operations matrix (both columns)

Intent: give every operation its concrete `github` shape and its `filesystem`
realization in one table, so a reader compares the two side by side. This is the
matrix proper.

Files: modify `work-trackers.md`.

Change: one operation × `{github, filesystem}` table. The github cells carry the
concrete `gh` / remote-git shapes relocated from the source files (populate from
the criterion-2 in-scope set in plan-b.md § Scope boundary across the
coordination references, `issue-lifecycle.md`, and the kata-* skills); the
filesystem cells carry the file-write realization over the `.tracker/` layout
(Step 4). Cover at least:

| Operation | github (genericized to `repos/{owner}/{repo}`) | filesystem |
| --- | --- | --- |
| `create-issue` | `gh issue create …` | write `issues/{id}.md` from the envelope template |
| `list` | `gh issue list …` / `gh pr list …` (incl. `--json` metric fields) | glob `issues/` or `changes/` and filter front-matter (reduced field set) |
| `read` | `gh issue view …` / `gh pr view …` / `gh pr diff …` / `gh pr checks …` | return the file (CI-status reads are github-only) |
| `comment` | `gh issue comment …` / `gh pr comment …` | append to `## Comments` |
| `label` | `gh issue edit --add-label …` / `gh label …` | edit the `labels` front-matter |
| `link` | issue/PR cross-references | edit the `links` front-matter |
| `open-change` | `git switch -c <branch>` + `git push -u origin <branch>` + `gh pr create …` | write `changes/{id}.md`; remote-git steps are no-ops |
| `update-change` | `git push --force-with-lease origin <branch>` | re-write `changes/{id}.md`; push is a no-op |
| `gate` | `gh pr review --approve` / approval label read | set the `approval` field |
| `merge-change` | `gh pr merge …` | set `state: merged` |
| `close` | `gh issue close …` / `gh pr close …` | set `state: closed` |
| `create-discussion` / `comment-discussion` | `gh api graphql … addDiscussion* …` | write or append `discussions/{id}.md` |

Name (do not inline) the `kata-dispatch` reactor bridge that `kata-setup`
generates as the github realization of discussion-event handling, per the scope
boundary.

Verification: every operation from Step 2 has both a github and a filesystem
cell; each github shape uses placeholder repo forms; no
`repos/forwardimpact/monorepo`.

## Step 4 — `.tracker/` layout, envelope templates, degradation note

Intent: define the on-disk layout the filesystem column writes to, the templates
`create-*` writes from, and where capabilities degrade.

Files: modify `work-trackers.md`.

Change: the `.tracker/` layout —

```text
.tracker/
  issues/{id}.md       # envelope front-matter + body; ## Comments appended
  changes/{id}.md      # envelope (kind: change) + links to its issue(s)
  discussions/{id}.md  # RFC threads
```

— plus the issue and change envelope templates the `create-*` cells write from,
and a degradation note collecting what the filesystem column's cells abbreviate:
filesystem `read`/`list` return a reduced field set; CI-status reads
(`gh pr checks`) are github-only; the `open-change` / `update-change` remote-git
steps have no remote and are no-ops (the changeset is the working tree at merge
time); trust that a `gate` setter is authorized is out-of-band (the actor is
trusted by construction).

Verification: the layout, both envelope templates, and the degradation note are
present; `bun run check` (genericity gate) and `bun run check-skill-refs` pass.
