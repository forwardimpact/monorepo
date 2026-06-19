# Plan 2090-b, Part 01: The tracker matrix reference

Create `.claude/agents/references/work-trackers.md` — the single home for the
work-item model and every forge command. This part has no dependencies and is
the citation target for Parts 02, 03, and 05. Conventions and the scope boundary
are in [plan-b.md](plan-b.md).

Libraries used: none.

## Step 1 — Skeleton, model, and selection rule

Intent: stand up the file with the work-item model and how a tracker is chosen.

Files: create `.claude/agents/references/work-trackers.md`.

Change: front-matter (`# Work Trackers`) and an intro stating the file is the
only place forge-specific commands appear; agents read the active column from
`$LIBEVAL_WORK_TRACKER` (default `github`) and never branch on it elsewhere. Then
the envelope table (carried as YAML front-matter on each item):

| Field | Meaning | github | filesystem |
| --- | --- | --- | --- |
| `id` | stable identity | issue/PR number + URL | caller-supplied slug = repo-relative path |
| `kind` | `issue` \| `change` | issue \| pull request | file under `issues/` \| `changes/` |
| `state` | `open` \| `closed` \| `merged` | issue/PR state | front-matter value |
| `labels` | classification incl. `agent:*` | issue/PR labels | front-matter list |
| `links` | related work-item ids | issue refs | front-matter list |
| `discussion` | comment thread | native issue/PR thread | appended `## Comments` section |
| `approval` | change-only trusted gate | PR label/review by trusted human | front-matter value |

Then the selection rule: one input, `LIBEVAL_WORK_TRACKER`, default `github`; set
by the harness (`--work-tracker`), documented here, read by the agent to pick the
column.

Verification: file exists; contains the envelope table and the selection rule.

## Step 2 — Abstract operation vocabulary

Intent: enumerate the fixed operation set every tracker realizes.

Files: modify `work-trackers.md`.

Change: a list defining `create-issue`, `list`, `read`, `comment`, `label`,
`link`, `open-change`, `update-change`, `gate`, `merge-change`, `close`,
`create-discussion`, `comment-discussion`. State that `triage` (label + comment +
close) and `patch` (open-change + merge-change) are compositions, not operations.
One line each on intent, so a skill citing the name needs no other doc.

Verification: every operation Parts 02/03 cite (per plan-b.md § Operation
vocabulary) is present.

## Step 3 — The github column

Intent: absorb every in-scope forge command now living outside the matrix.

Files: modify `work-trackers.md`.

Change: an operation × `github` table whose cells carry the concrete `gh` /
remote-git shapes relocated from the source files. Populate from the criterion-2
in-scope set (plan-b.md § Scope boundary) across the coordination references,
`issue-lifecycle.md`, and the kata-* skills. Cover at least:

| Operation | github realization (shape, genericized to `repos/{owner}/{repo}`) |
| --- | --- |
| `create-issue` | `gh issue create …` |
| `list` | `gh issue list …` / `gh pr list …` (incl. `--json` metric fields) |
| `read` | `gh issue view …` / `gh pr view …` / `gh pr diff …` / `gh pr checks …` |
| `comment` | `gh issue comment …` / `gh pr comment …` |
| `label` | `gh issue edit --add-label …` / `gh label …` |
| `link` | issue/PR cross-references |
| `open-change` | `git switch -c <branch>` + `git push -u origin <branch>` + `gh pr create …` |
| `update-change` | `git push --force-with-lease origin <branch>` |
| `gate` | `gh pr review --approve` / approval label read |
| `merge-change` | `gh pr merge …` |
| `close` | `gh issue close …` / `gh pr close …` |
| `create-discussion` / `comment-discussion` | `gh api graphql … addDiscussion* …` |

Name (do not inline) the `kata-dispatch` reactor bridge that `kata-setup`
generates as the github realization of discussion-event handling, per the scope
boundary.

Verification: each shape uses placeholder repo forms; no `repos/forwardimpact/monorepo`.

## Step 4 — The filesystem column, `.kata/` format, degradation

Intent: give every operation an offline file-write realization and state where
capabilities degrade.

Files: modify `work-trackers.md`.

Change: the `.kata/` layout —

```
.kata/
  issues/{id}.md       # envelope front-matter + body; ## Comments appended
  changes/{id}.md      # envelope (kind: change) + links to its issue(s)
  discussions/{id}.md  # RFC threads
```

— plus the operation × `filesystem` column: `create-*` writes the file from an
envelope template; `list` globs + filters front-matter; `read` returns the file
(reduced field set vs github `--json`); `comment` appends to `## Comments`;
`label`/`link` edit front-matter; `gate` sets `approval`; `merge-change` sets
`state: merged`; `open-change`/`update-change` remote-git steps degrade to no-ops
(the changeset is the working tree at merge time). Include the issue and change
envelope templates. End with a degradation note: filesystem `read`/`list` return
a reduced field set; CI-status reads (`gh pr checks`) are github-only; trust that
a `gate` setter is authorized is out-of-band (the actor is trusted by
construction).

Verification: every operation from Step 2 has both a github and a filesystem
cell; `bun run check` (genericity gate) and `bun run check-skill-refs` pass.
