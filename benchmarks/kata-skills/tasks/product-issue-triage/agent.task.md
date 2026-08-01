Read `product-brief.md`. It states the product's scope and its non-goals. Then
triage the open issues in the tracker. Follow the `kata-product-issue` skill
(staged under `.claude/skills/kata-product-issue/`).

This run sets `LIBEVAL_WORK_TRACKER=filesystem`. The tracker's issues then live
as files under `.tracker/issues/`. They follow the model in
`.claude/agents/references/work-trackers.md`. **The network is unavailable.** Do
not call `gh` or any remote command. Resolve every work-item operation through
the filesystem column.

For each open issue, `read` it. Classify it against the product brief
(mechanical fix / product-aligned spec / out of scope). Then act through the
work-item operations. When an issue is **out of scope**, `comment` a brief
rationale grounded in the brief. Then `label` it `wontfix`. Then `close` it. Do
not open a change or spec for an out-of-scope issue.
