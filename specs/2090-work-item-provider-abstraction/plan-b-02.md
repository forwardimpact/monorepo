# Plan 2090-b, Part 02: Re-point the coordination references

Re-express the three shared coordination references and the session
issue-lifecycle recipes over the abstract operations, moving their tracker
shapes into the matrix. Depends on Part 01. Conventions: [plan-b.md](plan-b.md).

Libraries used: none.

## Step 1 — `work-definition.md`

Intent: name operations instead of GitHub actions in each work-type's "Created
via".

Files: modify `.claude/agents/references/work-definition.md`.

Change: replace each "Created via" GitHub action (labeled issue, `gh`
Discussion, direct git ops) with the operation that creates it (`create-issue` +
label / `create-discussion` / `open-change`) and a link to `work-trackers.md`.
No `gh` shape remains.

Verification: no GitHub-noun routing in the file; the matrix link resolves.

## Step 2 — `coordination-protocol.md`

Intent: route outputs to operations and delete the inline `gh` CLI section.

Files: modify `.claude/agents/references/coordination-protocol.md`.

Change: re-express the routing (Issue, PR/issue comment, Discussion) as
operations (`create-issue`, `comment`, `create-discussion`/`comment-discussion`,
`open-change`); remove the `gh` CLI section, replacing it with one pointer to
`work-trackers.md` as the home for concrete commands. Keep the named-receiver +
addressable-artifact rule, expressed over work items.

Verification: no `gh` shape remains in the file; criterion-3 grep finds zero
GitHub primitives named directly.

## Step 3 — `approval-signals.md`

Intent: generalize the approval vocabulary; keep STATUS.md canonical and the
human-trust rule.

Files: modify `.claude/agents/references/approval-signals.md`.

Change: re-express the signal table as work-item signals — "a trusted approval
marker on a change" (`gate`) and "a change reaches `merged`" (`merge-change`) —
and point each realization to the matrix (github: PR label/review/merge event,
the `kata-dispatch` bridge unchanged; filesystem: `approval` field + `state:
merged`). Move the one `gh pr review --approve` shape to the matrix github
column. Keep STATUS.md as the canonical record and the human-originated trust
rule for spec/design.

Verification: no `gh` shape remains; STATUS.md mechanics and the trust rule are
unchanged in substance.

## Step 4 — `issue-lifecycle.md`

Intent: turn the obstacle/experiment recipes into operation recipes.

Files: modify `.claude/skills/kata-session/references/issue-lifecycle.md`.

Change: replace the six `gh issue` shapes (list/create/comment/close) with
`list` / `create-issue` (label `obstacle`/`experiment`) / `comment` / `close`
recipes that point at `work-trackers.md`. Obstacle and experiment stay issues
distinguished by label.

Verification: no `gh` shape remains; the recipes name only matrix operations.
