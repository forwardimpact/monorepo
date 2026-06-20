Read `product-brief.md` — what this product is and is not — then triage the open
issues in the tracker, following the `kata-product-issue` skill (staged under
`.claude/skills/kata-product-issue/`).

This run sets `LIBEVAL_WORK_TRACKER=filesystem`, so the tracker's issues live as
files under `.tracker/issues/` per the model in
`.claude/agents/references/work-trackers.md`. **Networking is unavailable** — do
not call `gh` or any remote command; resolve every work-item operation through
the filesystem column.

For each open issue: `read` it, classify it against the product brief
(mechanical fix / product-aligned spec / out of scope), and act through the
work-item operations. When an issue is **out of scope**, `comment` a brief
rationale grounded in the brief, `label` it `wontfix`, and `close` it. Do not
open a change or spec for an out-of-scope issue.
