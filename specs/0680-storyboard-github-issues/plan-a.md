# Plan A — Track Storyboard Experiments and Obstacles as GitHub Issues

Implements [spec.md](spec.md) per [design-a.md](design-a.md).

## Approach

Move experiment and obstacle state out of the storyboard markdown file and into
labeled GitHub issues, leaving one-line references in the storyboard. The
improvement coach is the sole issue owner — creating, commenting, and closing
during facilitated sessions. The PM triage pipeline gains a label-exclusion
filter so experiment/obstacle issues never enter product buckets. Infrastructure
changes (labels, workflow permissions) land first, then skill and process files
update in dependency order.

## Changes

### Step 1 — Create repository labels

Add `experiment` and `obstacle` labels to the repository.

No files created, modified, or deleted.

```sh
gh label create experiment --description "PDSA experiment tracked via storyboard" --color 0E8A16
gh label create obstacle --description "Obstacle blocking target condition" --color D93F0B
```

Verify: `gh label list --search experiment` and
`gh label list --search obstacle` each return one result.

### Step 2 — Add `issues: write` to storyboard workflow

Grant the storyboard workflow permission to create and comment on issues.

Modified: `.github/workflows/kata-storyboard.yml`

```yaml
# before
permissions:
  contents: write

# after
permissions:
  contents: write
  issues: write
```

Verify: workflow file contains both `contents: write` and `issues: write`.

### Step 3 — Update storyboard template

Replace inline experiment/obstacle content with issue-reference format.

Modified: `.claude/skills/kata-session/references/storyboard-template.md`

Replace the Obstacles section (lines 40-57) with:

```markdown
## Obstacles

_What stands between the current condition and the target condition. Discovered
through experiments, not predicted upfront. Each obstacle is a labeled GitHub
issue; the storyboard carries one-line references. Full state lives in the
issue._

### Active

- **Current obstacle -->** Obstacle name (#NNN)
- Other obstacle (#NNN)

### Concluded (last 7 days)

_One line per item: status (RESOLVED/ABANDONED), date closed, one-sentence
verdict. Items older than 7 days are deleted; the closed issue is the permanent
record._

- ~~Obstacle name~~ (#NNN) — RESOLVED YYYY-MM-DD. [one-sentence verdict].
```

Replace the Experiments section (lines 59-82) with:

```markdown
## Experiments

_PDSA cycles run against the current obstacle. Each experiment is a labeled
GitHub issue carrying the full PDSA content; the storyboard carries one-line
references._

### Active

- Exp N (#NNN) — [short name]

### Concluded (last 7 days)

_One line per item: verdict (DELIVERED/PASS/FAIL/ABANDONED), date closed,
one-sentence learning. Items older than 7 days are deleted; the closed issue
is the permanent record._

- **Exp N — [short name]** (#NNN) — DELIVERED YYYY-MM-DD. [one-sentence
  learning].
```

Replace the Retention rule section (lines 84-91) with:

```markdown
## Retention rule

When concluding an obstacle or experiment, post the verdict as a closing comment
on the issue, close the issue, and move the storyboard entry from `Active` to
`Concluded (last 7 days)`. At the start of every storyboard session, scan
`Concluded (last 7 days)` and delete any line whose closed-date is more than 7
days before today. The decision is mechanical — date math, not judgment. The
closed issue is the permanent record.
```

Verify: template has no inline PDSA blocks; all obstacle/experiment entries show
`(#NNN)` placeholders.

### Step 4 — Add issue lifecycle to team storyboard overlay

Add issue lifecycle commands as a separate reference file to stay within the L7
128-line limit, and update the partition section to reference it.

Created: `.claude/skills/kata-session/references/issue-lifecycle.md` Modified:
`.claude/skills/kata-session/references/team-storyboard.md`

**issue-lifecycle.md** — new file with the following content:

````markdown
# Issue Lifecycle

The improvement coach manages experiment and obstacle issues during storyboard
sessions. No other agent creates or comments on these issues.

## New obstacle

```sh
gh issue create --label obstacle \
  --title "Obstacle name" \
  --body "Description.

Blocking dimension: [which gap this blocks]"
```

Add to storyboard Active list: `- Obstacle name (#NNN)`

## New experiment

Each experiment references its parent obstacle issue in the body. GitHub renders
`#NNN` as a bidirectional cross-reference, giving the obstacle a visible list of
its related experiments.

```sh
gh issue create --label experiment \
  --title "Exp N — short name" \
  --body "Obstacle: #NNN
Owner: [agent name]

**What:** description
**Expected outcome:** prediction"
```

Add to storyboard Active list: `- Exp N (#NNN) — short name`

## Progress update

```sh
gh issue comment #NNN --body "**Actual outcome:** what happened
**Learning:** what we learned
**Next step:** continue / pivot / new"
```

## Conclusion

```sh
gh issue comment #NNN --body "**Verdict:** one-sentence learning"
gh issue close #NNN
```

Move storyboard entry from Active to Concluded.

## Migration (one-time)

At the first session after implementation, create labeled issues for every
active experiment and obstacle that lacks a `(#NNN)` suffix. Add the suffix
after creation. Skip entries that already have an issue link. Concluded items
need no action.
````

**team-storyboard.md** — replace the Active / Concluded partition section (lines
68-82) with:

```markdown
## Active / Concluded partition

Obstacles and Experiments are partitioned into `### Active` and
`### Concluded (last 7 days)` subsections. The rule is mechanical:

1. When concluding an obstacle or experiment, post the verdict as a closing
   comment on the issue (see [`issue-lifecycle.md`](issue-lifecycle.md)), close
   the issue, and move the storyboard entry from `Active` to
   `Concluded (last 7 days)`. The Concluded entry is one line: status, date
   closed, one-sentence verdict, with `(#NNN)`.
2. At the start of every storyboard session, scan `Concluded (last 7 days)` and
   delete any line whose closed-date is more than 7 days before today. Date
   math, not judgment.
3. Never mix active and concluded items in the same list.

The closed issue is the permanent record. Full issue lifecycle — creation,
commenting, closing, and one-time migration — is in
[`issue-lifecycle.md`](issue-lifecycle.md).
```

Verify: `issue-lifecycle.md` exists with `gh issue create`, `gh issue comment`,
and `gh issue close` commands; `team-storyboard.md` partition section references
it; both files are under 128 lines.

### Step 5 — Update kata-session checklist

Add issue lifecycle verification to the DO-CONFIRM checklist.

Modified: `.claude/skills/kata-session/SKILL.md`

After the existing team-meeting checklist item (lines 64-67):

```markdown
- [ ] For team meetings: storyboard file updated and committed; Obstacles and
      Experiments split into Active and Concluded (last 7 days) per the
      partition protocol, items closed this session moved to Concluded, lines
      older than 7 days deleted (date math, not judgment).
```

Insert:

```markdown
- [ ] For team meetings: new experiments and obstacles created as labeled GitHub
      issues; progress posted as issue comments; concluded items closed on
      GitHub with verdict comment.
```

Verify: DO-CONFIRM checklist contains issue lifecycle item immediately after the
existing partition item.

### Step 6 — Exclude experiment/obstacle from PM triage

Add label-exclusion filter to the PM issue survey so experiment and obstacle
issues never enter product buckets or the `open_issues` metric.

Modified: `.claude/skills/kata-product-issue/SKILL.md`,
`.claude/skills/kata-product-issue/references/metrics.md`,
`.claude/agents/product-manager.md`

In `kata-product-issue/SKILL.md`, update the `gh issue list` command (lines
80-82):

```sh
# before
gh issue list --state open --limit 50 \
  --json number,title,body,author,labels,createdAt,updatedAt \
  --jq '.[] | {number, title, author: .author.login, labels: [.labels[].name], created: .createdAt}'

# after
gh issue list --state open --limit 50 \
  --search "-label:experiment -label:obstacle" \
  --json number,title,body,author,labels,createdAt,updatedAt \
  --jq '.[] | {number, title, author: .author.login, labels: [.labels[].name], created: .createdAt}'
```

In `references/metrics.md`, update the `open_issues` row:

```markdown
# before
| open_issues           | count | Open issues at run end             | gh issue list |

# after
| open_issues           | count | Open product issues (excludes experiment/obstacle) | gh issue list |
```

In `product-manager.md`, update the survey command (lines 42-45):

```markdown
# before
1. **Survey.** `gh pr list` + `gh issue list`. Buckets: **P1** mergeable PRs
   (fix/bug/spec, CI green, trusted). **P2** issues labeled `needs-spec`. **P3**
   untriaged (no `triaged` label).

# after
1. **Survey.** `gh pr list` + `gh issue list --search "-label:experiment -label:obstacle"`.
   Buckets: **P1** mergeable PRs (fix/bug/spec, CI green, trusted). **P2**
   issues labeled `needs-spec`. **P3** untriaged (no `triaged` label).
```

Verify: all three files contain the label exclusion filter or updated
description.

### Step 7 — Update routing protocol and coordination channels

Register experiment/obstacle issues as a distinct output type and update the
coordination channels description.

Modified: `.claude/agents/references/routing-protocol.md`, `KATA.md`

In `routing-protocol.md`, add a row to the channel-by-output table after the
"Reply tied to one PR or one issue" row (line 15):

```markdown
# before
| Reply tied to one PR or one issue               | PR / issue thread |
| Mechanical fix or vulnerability patch           | `fix/` branch PR  |

# after
| Reply tied to one PR or one issue               | PR / issue thread |
| Experiment or obstacle PDSA state               | Labeled issue     |
| Mechanical fix or vulnerability patch           | `fix/` branch PR  |
```

In `KATA.md`, update the PR / issue thread channel row (line 197):

```markdown
# before
| **PR / issue thread** | Real-time response on a specific artifact                                                               | Lives with the artifact               | `agent-react` workflow |

# after
| **PR / issue thread** | Real-time response on a specific artifact; PDSA state for experiment and obstacle issues                | Lives with the artifact               | `agent-react` workflow |
```

Update the PR/issue thread non-purpose note (lines 207-208):

```markdown
# before
- **PR/issue threads** are scoped to one artifact — cross-cutting questions
  belong in a Discussion.

# after
- **PR/issue threads** are scoped to one artifact — cross-cutting questions
  belong in a Discussion. Experiment and obstacle issues own their PDSA state;
  the storyboard references them as one-liners.
```

Update the Issues permission row (line 244):

```markdown
# before
| Issues        | Triage, label, comment (product-manager)                          |

# after
| Issues        | Triage, label, comment (product-manager); create, comment, close (improvement-coach via kata-storyboard) |
```

Verify: routing table has labeled-issue row; KATA.md channels table, non-purpose
note, and permissions table all updated.

Libraries used: none.

## Risks

| Risk                                                                                                          | Mitigation                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `--search "-label:experiment -label:obstacle"` interacts with other search terms the PM may add in the future | The filter is additive — additional `--search` terms combine with AND, so exclusions compose safely                            |
| First-session migration creates many issues at once, potentially hitting GitHub rate limits                   | The April storyboard has ~9 active experiments and ~13 active obstacles — well within GitHub's 80 req/min secondary rate limit |

## Execution

Single `staff-engineer` agent, sequential steps 1-7. No decomposition needed —
all changes are in skill and process files with no build or test dependencies.
