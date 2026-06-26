# Work Trackers

This file is the **single place** tracker-specific commands appear. Every kata-*
skill and shared reference names an **abstract operation** (below) and links
here; the concrete command for that operation lives in this matrix, one cell per
tracker. A skill never branches on the tracker — it names the operation and lets
the active column realize it.

The active tracker is one input: the environment variable
`LIBHARNESS_WORK_TRACKER`, default `github`. The harness sets it (`fit-harness` /
`fit-benchmark` `--work-tracker`); the agent reads it and realizes each
operation through that column. Production leaves the default `github`; the
offline coordination benchmark runs `--work-tracker filesystem`.

A **work item** is a tracked unit of coordination. It has two **kinds** — an
**issue** (a tracked unit of work or finding: bug, feature, obstacle,
experiment, RFC) and a **change** (a proposed diff carrying an approval gate, a
GitHub pull request) — that share one **envelope**.

## Envelope

Every work item carries the same capabilities, the envelope, as YAML
front-matter on the filesystem tracker and as native fields on github:

| Field | Meaning | github | filesystem |
| --- | --- | --- | --- |
| `id` | stable identity | issue/PR number + URL | caller-supplied slug; the file path is the id |
| `kind` | issue or change | issue or pull request | file under `issues/` or `changes/` |
| `state` | lifecycle: open, closed, or merged | issue/PR state | front-matter value |
| `labels` | classification, including `agent:*` | issue/PR labels | front-matter list |
| `links` | related work-item ids | issue references | front-matter list |
| `discussion` | comment thread | native issue/PR thread | appended `## Comments` section |
| `approval` | change-only trusted gate | PR label or review by a trusted human | front-matter value |

Where a tracker cannot express a capability, the matrix states how it degrades
(§ Degradation).

## Abstract operations

Every tracker realizes the same fixed set. A skill may use only these names:

- `create-issue` — open a tracked unit of work or finding.
- `list` — enumerate issues or changes, filtered.
- `read` — fetch one item (body, state, metadata; CI status on github).
- `comment` — append to an item's discussion.
- `label` — add or change classification labels.
- `link` — relate one item to another.
- `open-change` — propose a diff carrying an approval gate.
- `update-change` — revise an open change's diff.
- `gate` — record a trusted approval on a change.
- `merge-change` — accept a change into the trunk.
- `close` — close an issue or change without merging.
- `create-discussion` / `comment-discussion` — open or append an RFC thread.

`triage` is a composition (`label` + `comment` + `close`); `patch` is a
composition (`open-change` + `merge-change`). Neither is a first-class
operation.

## The matrix

github cells use the placeholder repo form `repos/{owner}/{repo}`; substitute
the live repo. The shapes are canonical — pass the flags each call site needs.

| Operation | github | filesystem |
| --- | --- | --- |
| `create-issue` | `gh issue create --title "<t>" --body "<b>" [--label <l>]` | write `issues/{id}.md` from the issue template |
| `list` | `gh issue list --state <s> [--label <l>] [--json <fields>]` / `gh pr list --state <s> [--base main] [--head <branch>] [--search "<q>"] [--author <a>] [--json <fields>]` | glob `issues/` or `changes/` and filter on front-matter (reduced field set) |
| `read` | `gh issue view <n> --json <fields>` / `gh pr view <n> --json <fields>` / `gh pr diff <n>` / `gh pr checks <n>` / `gh api repos/{owner}/{repo}/issues/<n>/comments` / approval-event reads `gh api repos/{owner}/{repo}/issues/<n>/timeline` (label-add events) and `gh api repos/{owner}/{repo}/pulls/<n>/reviews` (APPROVED reviews) | return the item file; CI-status and approval-event history are github-only — the filesystem item carries `labels` and `approval` in front-matter, with no separate event log |
| `comment` | `gh issue comment <n> --body "<b>"` / `gh pr comment <n> --body "<b>"` | append to the item's `## Comments` |
| `label` | `gh issue edit <n> --add-label "<l>"` / `gh label <…>` | edit the `labels` front-matter |
| `link` | name the related `#<n>` in the body (github renders a bidirectional cross-reference) | edit the `links` front-matter |
| `open-change` | `git switch -c <branch>` + `git push -u origin <branch>` + `gh pr create --title "<t>" --body "<b>"` | write `changes/{id}.md`; the remote-git steps are no-ops |
| `update-change` | `git push --force-with-lease origin <branch>` | re-write `changes/{id}.md`; the push is a no-op |
| `gate` | `gh pr review <n> --approve`, or a trusted `<phase>:approved` label / approval comment read by `kata-dispatch` | set the `approval` field |
| `merge-change` | `gh pr merge <n> --merge --delete-branch` (or `--squash --auto`) | set `state: merged` |
| `close` | `gh issue close <n> [--reason "not planned"]` / `gh pr close <n> --comment "<b>"` | set `state: closed` |
| `create-discussion` | `gh api graphql -f query='mutation { createDiscussion(input: {…}) { … } }'` | write `discussions/{id}.md` |
| `comment-discussion` | `gh api graphql -f query='mutation { addDiscussionComment(input: {…}) { … } }'` (pass `replyToId` to thread) | append to `discussions/{id}.md` |

**Dispatch bridge (github).** Discussion-event and PR-side approval handling on
github runs through the `kata-dispatch` reactor that `kata-setup` generates and
wires (App, secrets, reactor workflow). That generated wiring is the github
tracker's own provisioning, not portable coordination — see
[`kata-setup`](../../skills/kata-setup/SKILL.md). The matrix names it here; it
does not relocate the generated YAML.

## Filesystem layout

The filesystem tracker keeps one file per item under a coordination root
`.tracker/` in the working tree, tracker-owned and disjoint from app files. The
root is named generically so an agent reading the tree infers the active store
without consulting this file:

```
.tracker/
  issues/{id}.md       # envelope front-matter + body; ## Comments appended
  changes/{id}.md      # envelope (kind: change) + links to its issue(s)
  discussions/{id}.md  # RFC threads
```

`id` is a caller-supplied slug, so the `{id}.md` path is the identity (no
tracker-minted monotonic id, which would be non-deterministic). `create-*`
writes a file from the template below; `list` globs and filters on front-matter;
`read` returns the file; `comment` appends to `## Comments`; `gate` sets
`approval`; `merge-change` sets `state: merged`; `close` sets `state: closed`. A
change file carries only its envelope — the changeset is the working tree at
merge time, not a materialized patch.

### Issue template

```markdown
---
id: <slug>
kind: issue
state: open
labels: []
links: []
---

# <title>

<body>

## Comments
```

### Change template

```markdown
---
id: <slug>
kind: change
state: open
labels: []
links: [<issue-id>]
approval:
---

# <title>

<body>

## Comments
```

## Degradation

Where a tracker cannot express a capability, it degrades as follows:

- **Reduced field set (filesystem).** `read` and `list` return only what the
  front-matter and body carry; rich github `--json` field sets have no
  filesystem analogue.
- **CI status is github-only.** `gh pr checks` / `gh pr diff` have no filesystem
  equivalent; the filesystem `read` returns the file alone.
- **Remote-git steps are no-ops (filesystem).** `open-change` and
  `update-change` have no remote to target; the changeset is the working tree at
  merge time. No network, remote, or git is required — plain file writes.
- **Out-of-band trust (filesystem).** The `approval` field records the granting
  signal; trust that the setter is authorized is out-of-band — the actor that
  runs `gate` is trusted by construction (the benchmark harness or a human).
  Emulating contributor-list trust offline is not attempted.

## See also

- [`work-definition.md`](work-definition.md) — what each work-type is, and how
  to classify a finding into one.
- [`coordination-protocol.md`](coordination-protocol.md) — which operation
  carries each output type.
- [`approval-signals.md`](approval-signals.md) — how a `gate` and a
  `merge-change` feed `wiki/STATUS.md`.
